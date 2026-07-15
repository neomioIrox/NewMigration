const assert=require("assert");
const targetDb=require("../../src/db/mysql-target");
const cp=require("../../src/services/migration-checkpoint");

(async function(){
  var realQuery=targetDb.query;
  var calls=0;
  try{
    // 1. ensureTable failure disables the reporter: init must not throw,
    //    and batch/complete must not attempt any further queries
    targetDb.query=async function(){calls++;throw new Error("boom: no connection");};
    var rep=cp.createReporter("TEST_FAIL_Mapping");
    await rep.init(0);                 // ensureTable throws inside -> reporter disabled
    var callsAfterInit=calls;
    await rep.batch(100,5);            // must be a no-op, no throw
    await rep.complete();              // must be a no-op, no throw
    assert.strictEqual(calls,callsAfterInit,"disabled reporter must not query");

    // 2. upsert/markCompleted failures after a HEALTHY init never throw
    //    (write failures must never fail a migration run)
    targetDb.query=async function(sql){calls++;
      if(/CREATE TABLE/.test(sql)) return [[]];   // ensureTable succeeds
      throw new Error("boom: write failed");
    };
    var rep2=cp.createReporter("TEST_FAIL_Mapping");
    await rep2.init(0);
    await rep2.batch(100,5);           // upsert throws inside -> swallowed
    await rep2.complete();             // markCompleted throws inside -> swallowed

    // 3. a failed upsert must NOT advance the reported baseline: once writes
    //    recover, the next batch re-reports the missed delta
    var written=[];
    targetDb.query=async function(sql,params){
      if(/CREATE TABLE/.test(sql)) return [[]];
      if(/INSERT INTO MigrationCheckpoint/.test(sql)&&/in_progress/.test(sql)){
        if(written.length===0&&params[0]==="TEST_DELTA"&&written.failFirst!==true){written.failFirst=true;throw new Error("boom once");}
        written.push(params);return [{}];
      }
      return [{}];
    };
    var rep3=cp.createReporter("TEST_DELTA");
    await rep3.init(0);
    await rep3.batch(50,7);            // fails -> delta 7 NOT counted as reported
    await rep3.batch(90,12);           // succeeds -> must report cumulative delta 12
    assert.strictEqual(written.length,1,"exactly one successful upsert");
    assert.strictEqual(written[0][2],12,"missed delta must be re-reported (7+5)");

    // 4. gapfill don't-move-cursor contract at the reporter boundary: after a healthy
    //    init, batch(null, 5) must pass null through as the LastSourceId SQL param
    //    (the upsert's COALESCE then leaves the stored cursor untouched)
    var captured=null;
    targetDb.query=async function(sql,params){
      if(/CREATE TABLE/.test(sql)) return [[]];
      if(/INSERT INTO MigrationCheckpoint/.test(sql)){captured=params;return [{}];}
      return [{}];
    };
    var rep4=cp.createReporter("TEST_NULL_CURSOR");
    await rep4.init(0);
    await rep4.batch(null,5);
    assert.ok(captured,"upsert must have been attempted");
    assert.strictEqual(captured[1],null,"null cursor must reach the upsert as SQL NULL (don't-move-cursor)");
    assert.strictEqual(captured[2],5,"delta still reported alongside the null cursor");

    console.log("test-checkpoint-failures: ALL PASS");
  }finally{
    targetDb.query=realQuery;
  }
  process.exit(0);
})().catch(function(e){console.error(e);process.exit(1);});
