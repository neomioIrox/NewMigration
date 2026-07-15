const assert=require("assert");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");

const FAKE_STEPS=[
  {name:"TestStepA",label:"a",kind:"standard",dependsOn:[],batchSize:500},
  {name:"TestStepB",label:"b",kind:"standard",dependsOn:["TestStepA"],batchSize:500},
  {name:"TestStepC",label:"c",kind:"donation",dependsOn:["TestStepB"],batchSize:1000}
];

(async function(){
  await initTrackerDb(); // ensures the new tables exist
  var runId=await pt.createPipelineRun("continue",FAKE_STEPS);
  try{
    var data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.run.mode,"continue");
    assert.strictEqual(data.run.status,"running");
    assert.strictEqual(data.steps.length,3);
    assert.strictEqual(data.steps[0].step_name,"TestStepA");
    assert.strictEqual(data.steps[0].order_index,0);
    assert.strictEqual(data.steps[2].status,"pending");

    await pt.updateStepStatus(runId,"TestStepA","running");
    await pt.updateStepStatus(runId,"TestStepA","completed");
    await pt.updateStepStatus(runId,"TestStepB","failed",{error_message:"boom"});
    await pt.updateRunStatus(runId,"failed",{current_step:"TestStepB",error_message:"boom"});

    data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.steps[0].status,"completed");
    assert.ok(data.steps[0].completed_at,"completed_at should be set");
    assert.strictEqual(data.steps[1].status,"failed");
    assert.strictEqual(data.steps[1].error_message,"boom");
    assert.strictEqual(data.run.status,"failed");
    assert.strictEqual(data.run.current_step,"TestStepB");
    assert.ok(data.run.completed_at,"run completed_at should be set");

    // pending revert NULLs timestamps
    await pt.updateStepStatus(runId,"TestStepA","pending");
    data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.steps[0].status,"pending");
    assert.strictEqual(data.steps[0].started_at,null);

    // latest/active lookups
    var latest=await pt.getLatestRun();
    assert.strictEqual(latest.id,runId);
    var active=await pt.getActiveRun();
    assert.ok(!active||active.id!==runId,"failed run must not be active");

    // stale-run recovery
    await pt.updateRunStatus(runId,"running");
    await pt.updateStepStatus(runId,"TestStepB","running");
    var n=await pt.failStaleRunningRuns();
    assert.ok(n>=1,"should fail at least the stale run");
    data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.run.status,"failed");
    assert.strictEqual(data.steps[1].status,"pending","stale running step reverts to pending");

    console.log("test-pipeline-tracker: ALL PASS");
  }finally{
    // Cleanup only — process.exit here would swallow assertion failures
    // (exit(0) in a finally preempts the pending exception and the .catch).
    await pt.deletePipelineRun(runId);
  }
  process.exit(0); // success path only; failures propagate to .catch below
})().catch(function(e){console.error(e);process.exit(1);});
