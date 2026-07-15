const assert=require("assert");
const EventEmitter=require("events");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");
const orch=require("../../src/services/pipeline-orchestrator");
const tracker=require("../../src/services/tracker");
const trackerDb=require("../../src/db/mysql-tracker");

function fakeEngine(behavior,delayMs,runId){
  var rid=runId===undefined?null:runId;
  var e=new EventEmitter();
  setImmediate(function(){
    e.emit("started",{runId:rid,mapping:"fake"});
    setTimeout(function(){
      if(behavior==="error") e.emit("error",{runId:rid,error:"boom"});
      else if(behavior==="paused") e.emit("paused",{runId:rid});
      else e.emit("completed",{runId:rid,counters:{processed:1,inserted:1,skipped:0,errors:0}});
    },delayMs||0);
  });
  return e;
}

function stoppableEngine(){
  var e=new EventEmitter();
  e.requestPause=function(){setImmediate(function(){e.emit("paused",{runId:null});});};
  setImmediate(function(){e.emit("started",{runId:null,mapping:"fake"});});
  return e;
}

var emitted=[];
var fakeIo={emit:function(name,data){emitted.push({name:name,data:data});}};

function waitForIdle(){
  // The loop is fire-and-forget; poll the DB until the run leaves 'running'
  return new Promise(function(resolve,reject){
    var tries=0;
    (function poll(){
      pt.getLatestRun().then(function(run){
        if(run&&run.status!=="running") return resolve(run);
        if(++tries>200) return reject(new Error("pipeline did not finish"));
        setTimeout(poll,50);
      }).catch(reject);
    })();
  });
}

(async function(){
  await initTrackerDb();
  var createdRunIds=[];
  var createdMigrationRunIds=[];
  try{
    // Scenario 1: all engines succeed -> run completed, all 20 steps completed
    orch._dispatchers.standard=function(){return fakeEngine("ok");};
    orch._dispatchers.donation=function(){return fakeEngine("ok");};
    orch._dispatchers.prayname=function(){return fakeEngine("ok");};
    orch._dispatchers.asakim=function(){return fakeEngine("ok");};
    var initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    var data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,20);
    assert.ok(emitted.some(function(e){return e.name==="pipeline:completed";}));

    // Scenario 2: 3rd step errors -> run failed, later steps stay pending
    var count=0;
    orch._dispatchers.standard=function(){count++;return fakeEngine(count===3?"error":"ok");};
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    run=await waitForIdle();
    assert.strictEqual(run.status,"failed");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[2].status,"failed");
    assert.strictEqual(data.steps[2].error_message,"boom");
    assert.strictEqual(data.steps[3].status,"pending");
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,2);
    assert.ok(emitted.some(function(e){return e.name==="pipeline:error";}));

    // Scenario 3: continue mode resumes THE SAME failed run, skips completed steps
    orch._dispatchers.standard=function(){return fakeEngine("ok");};
    var before=data.steps[0].completed_at;
    initial=await orch.startPipeline("continue",fakeIo);
    assert.strictEqual(initial.run.id,run.id,"continue must reuse the failed run");
    run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,20);
    assert.strictEqual(String(data.steps[0].completed_at),String(before),"already-completed step must not re-run");

    // Scenario 4: 409 while running, then manual-stop semantics.
    // The 300ms delay keeps the first step running long enough for the
    // concurrent-start check to be deterministic.
    orch._dispatchers.standard=function(){return fakeEngine("paused",300);};
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var rejected=false;
    try{await orch.startPipeline("fresh",fakeIo);}catch(e){rejected=(e.code===409);}
    run=await waitForIdle();
    assert.ok(rejected,"second concurrent start must be rejected with 409");
    assert.strictEqual(run.status,"stopped","paused engine -> pipeline stopped");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[0].status,"pending","interrupted step reverts to pending");
    assert.ok(emitted.some(function(e){return e.name==="pipeline:stopped";}));

    // Scenario 5: manual stop via stopPipeline() on a pause-capable engine
    orch._dispatchers.standard=function(){return stoppableEngine();};
    orch._dispatchers.donation=function(){return stoppableEngine();};
    orch._dispatchers.prayname=function(){return stoppableEngine();};
    orch._dispatchers.asakim=function(){return stoppableEngine();};
    assert.strictEqual(orch.stopPipeline(),false,"stop with nothing running returns false");
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var stopRunId=initial.run.id;
    // Poll until step 0 is actually running so the stop hits mid-step
    await new Promise(function(resolve,reject){
      var tries=0;
      (function poll(){
        pt.getRunWithSteps(stopRunId).then(function(d){
          if(d&&d.steps[0].status==="running") return resolve();
          if(++tries>80) return reject(new Error("step 0 never reached running"));
          setTimeout(poll,25);
        }).catch(reject);
      })();
    });
    emitted=[];
    assert.strictEqual(orch.stopPipeline(),true,"stop while running returns true");
    run=await waitForIdle();
    assert.strictEqual(run.status,"stopped","manual stop -> pipeline stopped");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[0].status,"pending","stopped step reverts to pending");
    assert.ok(emitted.some(function(e){return e.name==="pipeline:stopped";}));
    var current=await orch.getCurrentRun();
    assert.strictEqual(current.run.id,stopRunId,"getCurrentRun returns the latest run");
    var all=await orch.getAllRuns();
    assert.ok(all.some(function(r){return r.id===stopRunId;}),"getAllRuns includes the run");

    // Scenario 6: genuinely concurrent starts — exactly one wins, the other gets 409
    orch._dispatchers.standard=function(){return fakeEngine("ok");};
    orch._dispatchers.donation=function(){return fakeEngine("ok");};
    orch._dispatchers.prayname=function(){return fakeEngine("ok");};
    orch._dispatchers.asakim=function(){return fakeEngine("ok");};
    var p1=orch.startPipeline("fresh",fakeIo),p2=orch.startPipeline("fresh",fakeIo);
    var settled=await Promise.allSettled([p1,p2]);
    var fulfilled=settled.filter(function(s){return s.status==="fulfilled";});
    var rejectedOnes=settled.filter(function(s){return s.status==="rejected";});
    assert.strictEqual(fulfilled.length,1,"exactly one concurrent start must win");
    assert.strictEqual(rejectedOnes.length,1,"exactly one concurrent start must lose");
    assert.strictEqual(rejectedOnes[0].reason.code,409,"loser must be rejected with 409");
    createdRunIds.push(fulfilled[0].value.run.id);
    run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,20);

    // Scenario 7: continue must RESUME a paused engine run instead of re-dispatching it
    // from scratch (Fix C1). The migration run is real (created via tracker.js) so its
    // status transitions reflect what the actual engine layer would report.
    var resumeMigId=await tracker.createRun("TestResumeMapping","src","tgt",100,500);
    createdMigrationRunIds.push(resumeMigId);
    await tracker.updateRunStatus(resumeMigId,"paused");
    orch._dispatchers.standard=function(){return fakeEngine("paused",0,resumeMigId);};
    orch._dispatchers.donation=function(){return fakeEngine("ok");};
    orch._dispatchers.prayname=function(){return fakeEngine("ok");};
    orch._dispatchers.asakim=function(){return fakeEngine("ok");};
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var resumeRunId=initial.run.id;
    run=await waitForIdle();
    assert.strictEqual(run.status,"stopped","pipeline stops when step 0's engine reports paused");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[0].status,"pending","paused step reverts to pending");
    assert.strictEqual(data.steps[0].migration_run_id,resumeMigId,"migration_run_id must survive the pending revert");

    var resumeCalledWith=null;
    orch._dispatchers.resume=function(mid,io){resumeCalledWith=mid;return Promise.resolve(fakeEngine("ok"));};
    orch._dispatchers.standard=function(){return fakeEngine("ok");};
    initial=await orch.startPipeline("continue",fakeIo);
    assert.strictEqual(initial.run.id,resumeRunId,"continue must reuse the stopped run");
    run=await waitForIdle();
    assert.strictEqual(run.status,"completed","resumed run completes normally");
    assert.strictEqual(resumeCalledWith,resumeMigId,"resume dispatcher must be called with the paused engine run id");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,20);

    // Scenario 8: continue must ABORT (not fresh-dispatch) a step whose previous engine run
    // crashed mid-write — re-dispatching it from scratch would duplicate rows already
    // inserted into the target RDS (Fix C1).
    var abortMigId=await tracker.createRun("TestAbortMapping","src","tgt",100,500);
    createdMigrationRunIds.push(abortMigId);
    var standardCallCount=0;
    orch._dispatchers.standard=function(){standardCallCount++;return fakeEngine("error",0,abortMigId);};
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var abortRunId=initial.run.id;
    run=await waitForIdle();
    assert.strictEqual(run.status,"failed","step 0 errors on the first attempt");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[0].migration_run_id,abortMigId,"migration_run_id recorded from the started event");

    // Simulate the underlying engine run having crashed mid-write, after inserting rows
    await tracker.updateRunStatus(abortMigId,"failed");
    await tracker.updateRunCounters(abortMigId,50,50,0,0,null);

    standardCallCount=0;
    initial=await orch.startPipeline("continue",fakeIo);
    assert.strictEqual(initial.run.id,abortRunId,"continue must reuse the failed run");
    run=await waitForIdle();
    assert.strictEqual(run.status,"failed","continue must abort, not silently succeed");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[0].status,"failed","aborted step is marked failed");
    assert.ok(data.steps[0].error_message.indexOf("כפילויות")!==-1,"error must warn about duplicate rows");
    assert.strictEqual(data.steps[1].status,"pending","later steps are untouched");
    assert.strictEqual(standardCallCount,0,"a partially-written step must not be fresh-dispatched");

    console.log("test-pipeline-orchestrator: ALL PASS");
  }finally{
    // Cleanup only — process.exit here would swallow assertion failures
    // (exit(0) in a finally preempts the pending exception and the .catch).
    // pipeline_run_steps.migration_run_id is ON DELETE SET NULL from migration_runs, and
    // pipeline_run_steps itself cascades from pipeline_runs — delete pipeline runs first.
    for(var id of createdRunIds){await pt.deletePipelineRun(id);}
    for(var mid of createdMigrationRunIds){await trackerDb.query("DELETE FROM migration_runs WHERE id=?",[mid]);}
  }
  process.exit(0); // success path only; failures propagate to .catch below
})().catch(function(e){console.error(e);process.exit(1);});
