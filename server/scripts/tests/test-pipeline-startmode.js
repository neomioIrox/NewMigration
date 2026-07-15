const assert=require("assert");
const EventEmitter=require("events");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");
const orch=require("../../src/services/pipeline-orchestrator");

function fakeEngine(){
  var e=new EventEmitter();
  setImmediate(function(){
    e.emit("started",{runId:null,mapping:"fake"});
    setImmediate(function(){e.emit("completed",{runId:null,counters:{processed:1,inserted:1,skipped:0,errors:0}});});
  });
  return e;
}

function waitForIdle(){
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
    // fresh run -> every dispatcher receives startMode "fresh"
    var modes=[];
    var capture=function(step,io,startMode){modes.push(startMode);return fakeEngine();};
    orch._dispatchers.standard=capture;
    orch._dispatchers.donation=capture;
    orch._dispatchers.prayname=capture;
    orch._dispatchers.asakim=capture;
    var initial=await orch.startPipeline("fresh",{emit:function(){}});
    createdRunIds.push(initial.run.id);
    var run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    assert.strictEqual(modes.length,20,"all 20 steps dispatched");
    assert.ok(modes.every(function(m){return m==="fresh";}),"fresh run must dispatch startMode=fresh, got: "+modes.join(","));

    // continue run (previous run completed -> a NEW run is created with mode continue)
    modes=[];
    initial=await orch.startPipeline("continue",{emit:function(){}});
    createdRunIds.push(initial.run.id);
    run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    assert.ok(modes.every(function(m){return m==="continue";}),"continue run must dispatch startMode=continue, got: "+modes.join(","));

    console.log("test-pipeline-startmode: ALL PASS");
  }finally{
    for(var id of createdRunIds){await pt.deletePipelineRun(id);}
  }
  process.exit(0);
})().catch(function(e){console.error(e);process.exit(1);});
