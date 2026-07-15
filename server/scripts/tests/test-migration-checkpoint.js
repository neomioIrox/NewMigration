const assert=require("assert");
const cp=require("../../src/services/migration-checkpoint");
const targetDb=require("../../src/db/mysql-target");

const NAME="TEST_CP_Alpha";

(async function(){
  try{
    await cp.ensureTable();
    await cp.resetForMapping(NAME); // clean slate

    // upsert creates the row with the delta and cursor
    await cp.upsert(NAME,100,10);
    var row=await cp.get(NAME);
    assert.ok(row,"row created");
    assert.strictEqual(row.LastSourceId,"100");
    assert.strictEqual(row.Status,"in_progress");
    assert.strictEqual(row.RowsMigrated,10);
    assert.ok(row.LastRunAt,"LastRunAt set");
    assert.strictEqual(row.CompletedAt,null);

    // second upsert advances the cursor and ACCUMULATES the delta
    await cp.upsert(NAME,250,5);
    row=await cp.get(NAME);
    assert.strictEqual(row.LastSourceId,"250");
    assert.strictEqual(row.RowsMigrated,15);

    // markCompleted keeps cursor + counter, flips status, stamps CompletedAt
    await cp.markCompleted(NAME);
    row=await cp.get(NAME);
    assert.strictEqual(row.Status,"completed");
    assert.strictEqual(row.LastSourceId,"250");
    assert.strictEqual(row.RowsMigrated,15);
    assert.ok(row.CompletedAt,"CompletedAt set");

    // markCompleted on a mapping with no row creates one (zero-batch completed run)
    await cp.resetForMapping("TEST_CP_Empty");
    await cp.markCompleted("TEST_CP_Empty");
    var empty=await cp.get("TEST_CP_Empty");
    assert.ok(empty,"zero-batch completion creates the row");
    assert.strictEqual(empty.Status,"completed");
    assert.strictEqual(empty.LastSourceId,null);

    // list contains both; reset deletes exactly one
    var all=await cp.list();
    assert.ok(all.some(function(r){return r.MappingName===NAME;}));
    assert.ok(all.some(function(r){return r.MappingName==="TEST_CP_Empty";}));
    assert.strictEqual(await cp.resetForMapping(NAME),1);
    assert.strictEqual(await cp.get(NAME),null);

    // reporter: init baseline -> batch writes only deltas; complete marks
    await cp.resetForMapping(NAME);
    var rep=cp.createReporter(NAME);
    await rep.init(0);
    await rep.batch(50,7);   // delta 7
    await rep.batch(90,12);  // delta 5
    row=await cp.get(NAME);
    assert.strictEqual(row.LastSourceId,"90");
    assert.strictEqual(row.RowsMigrated,12);
    await rep.complete();
    row=await cp.get(NAME);
    assert.strictEqual(row.Status,"completed");

    // reporter with a resume baseline (donation-style restored counters): no double count
    var rep2=cp.createReporter(NAME);
    await rep2.init(12);
    await rep2.batch(120,15); // delta 3 only
    row=await cp.get(NAME);
    assert.strictEqual(row.RowsMigrated,15);

    console.log("test-migration-checkpoint: ALL PASS");
  }finally{
    await cp.resetForMapping(NAME);
    await cp.resetForMapping("TEST_CP_Empty");
    if(targetDb.close) await targetDb.close();
  }
  process.exit(0);
})().catch(function(e){console.error(e);process.exit(1);});
