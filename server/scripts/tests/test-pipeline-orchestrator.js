const assert=require("assert");
const EventEmitter=require("events");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");
const orch=require("../../src/services/pipeline-orchestrator");

function fakeEngine(behavior,delayMs){
  var e=new EventEmitter();
  setImmediate(function(){
    e.emit("started",{runId:null,mapping:"fake"});
    setTimeout(function(){
      if(behavior==="error") e.emit("error",{runId:null,error:"boom"});
      else if(behavior==="paused") e.emit("paused",{runId:null});
      else e.emit("completed",{runId:null,counters:{processed:1,inserted:1,skipped:0,errors:0}});
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

    console.log("test-pipeline-orchestrator: ALL PASS");
  }finally{
    // Cleanup only — process.exit here would swallow assertion failures
    // (exit(0) in a finally preempts the pending exception and the .catch).
    for(var id of createdRunIds){await pt.deletePipelineRun(id);}
  }
  process.exit(0); // success path only; failures propagate to .catch below
})().catch(function(e){console.error(e);process.exit(1);});
