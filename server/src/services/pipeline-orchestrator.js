const manager=require("./migration-manager");
const pipelineTracker=require("./pipeline-tracker");
const {loadPipelineConfig}=require("./pipeline-config");
const tracker=require("./tracker");
const logger=require("../logger");

var running=false;
var currentEngine=null;
var stopRequested=false;

// kind -> function(step, io, startMode) returning an engine EventEmitter.
// startMode ("fresh"|"continue") comes from the pipeline run's stored mode; the ENGINES
// own the checkpoint semantics (fresh deletes the row, continue seeds from it) — the
// orchestrator only forwards the mode. Exported (as _dispatchers) so tests can substitute.
var dispatchers={
  standard:function(step,io,startMode){return manager.startMigration(step.name,{batchSize:step.batchSize||500,startMode:startMode},io);},
  donation:function(step,io,startMode){return manager.startDonationMigration({batchSize:step.batchSize||1000,startMode:startMode},io);},
  prayname:function(step,io,startMode){return manager.startPrayNameMigration({batchSize:step.batchSize||2000,startMode:startMode},io);},
  asakim:function(step,io,startMode){return manager.startAsakimDonationMigration({batchSize:step.batchSize||2000,startMode:startMode},io);},
  resume:function(migrationRunId,io){return manager.resumeMigration(migrationRunId,io);}
};

function _awaitEngine(engine,onStarted){
  return new Promise(function(resolve){
    engine.once("started",function(d){if(onStarted) onStarted(d);});
    engine.once("completed",function(d){resolve({status:"completed",data:d});});
    engine.once("paused",function(d){resolve({status:"paused",data:d});});
    engine.once("error",function(d){resolve({status:"error",data:d});});
  });
}

async function startPipeline(mode,io){
  if(running){var e=new Error("Pipeline is already running");e.code=409;throw e;}
  running=true;stopRequested=false; // claim synchronously — closes the double-call window
  var runId=null,steps=null;
  try{
    var active=await pipelineTracker.getActiveRun();
    if(active){var e2=new Error("Pipeline run #"+active.id+" is already running");e2.code=409;throw e2;}
    steps=loadPipelineConfig(); // throws a clear message on bad config — no run is created
    if(mode!=="fresh"){
      var latest=await pipelineTracker.getLatestRun();
      if(latest&&(latest.status==="failed"||latest.status==="stopped")) runId=latest.id;
    }
    if(runId===null){
      runId=await pipelineTracker.createPipelineRun(mode==="fresh"?"fresh":"continue",steps);
    }else{
      await pipelineTracker.updateRunStatus(runId,"running",{error_message:null});
    }
  }catch(err){running=false;throw err;}
  _runLoop(runId,steps,io); // fire-and-forget; state is read via getCurrentRun/socket events
  return pipelineTracker.getRunWithSteps(runId);
}

async function _runLoop(runId,steps,io){
  var currentStepName=null;
  try{
    var stepByName={};
    steps.forEach(function(s){stepByName[s.name]=s;});
    if(io) io.emit("pipeline:started",{pipelineRunId:runId});
    var data=await pipelineTracker.getRunWithSteps(runId);
    var startMode=data.run&&data.run.mode==="fresh"?"fresh":"continue";
    for(var row of data.steps){
      if(row.status==="completed") continue;
      if(stopRequested){await _markStopped(runId,io);return;}
      var def=stepByName[row.step_name];
      if(!def){await _markFailed(runId,row.step_name,"Step "+row.step_name+" is missing from pipeline.json — cannot continue this run",io);return;}

      // A step that already carries a migration_run_id ran an engine before (either in a
      // previous pipeline attempt or earlier in this same process). Never fresh-dispatch it
      // blindly — the generic engine's skip-existing check is per-run, so re-running from
      // scratch after a partial write would duplicate rows in the target RDS.
      var prevRun=row.migration_run_id?await tracker.getRun(row.migration_run_id):null;
      if(prevRun&&prevRun.status==="completed"){
        // engine finished but the pipeline crashed before recording it — don't re-run
        await pipelineTracker.updateStepStatus(runId,row.step_name,"completed");
        if(io) io.emit("pipeline:step-completed",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
        logger.info("Pipeline step already completed by engine run, skipping",{runId:runId,step:row.step_name,migrationRunId:row.migration_run_id});
        continue;
      }

      currentStepName=row.step_name;
      await pipelineTracker.updateStepStatus(runId,row.step_name,"running");
      await pipelineTracker.updateRunStatus(runId,"running",{current_step:row.step_name});
      if(io) io.emit("pipeline:step-started",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
      logger.info("Pipeline step starting",{runId:runId,step:row.step_name});

      var engine;
      if(prevRun&&prevRun.status==="paused"){
        engine=await dispatchers.resume(row.migration_run_id,io);
        if(!engine){
          await _markFailed(runId,row.step_name,"לא ניתן להמשיך את ריצת המנוע #"+row.migration_run_id+" (סטטוס השתנה) — נדרש טיפול ידני",io);
          currentStepName=null;
          return;
        }
        logger.info("Pipeline step resuming paused engine run",{runId:runId,step:row.step_name,migrationRunId:row.migration_run_id});
      }else if(prevRun&&prevRun.processed_rows>0){
        // failed/stale mid-write run: re-running from scratch would duplicate target rows
        await _markFailed(runId,row.step_name,"השלב נקטע בריצה קודמת (ריצת מנוע #"+row.migration_run_id+", סטטוס "+prevRun.status+", עובדו "+prevRun.processed_rows+" שורות) — נדרש טיפול ידני לפני המשך כדי למנוע כפילויות",io);
        currentStepName=null;
        return;
      }else{
        engine=dispatchers[def.kind](def,io,startMode);
      }

      currentEngine=engine;
      if(stopRequested&&typeof engine.requestPause==="function") engine.requestPause();
      var stepName=row.step_name;
      var result=await _awaitEngine(engine,function(d){
        if(d&&d.runId){
          pipelineTracker.setStepMigrationRunId(runId,stepName,d.runId)
            .catch(function(e){logger.error("Pipeline: failed to record migration_run_id",{error:e.message});});
        }
      });
      currentEngine=null;

      if(result.status==="completed"){
        await pipelineTracker.updateStepStatus(runId,row.step_name,"completed");
        if(io) io.emit("pipeline:step-completed",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
        logger.info("Pipeline step completed",{runId:runId,step:row.step_name});
        currentStepName=null;
        continue;
      }
      if(result.status==="paused"){
        // Manual stop (or engine pause): the step reverts to pending and will resume
        // (or re-run, if it never wrote anything) next time
        await pipelineTracker.updateStepStatus(runId,row.step_name,"pending");
        currentStepName=null;
        await _markStopped(runId,io);
        return;
      }
      var msg=(result.data&&result.data.error)?String(result.data.error):"Unknown engine error";
      await _markFailed(runId,row.step_name,msg,io);
      currentStepName=null;
      return;
    }
    await pipelineTracker.updateRunStatus(runId,"completed",{current_step:null});
    if(io) io.emit("pipeline:completed",{pipelineRunId:runId});
    logger.info("Pipeline completed",{runId:runId});
  }catch(err){
    logger.error("Pipeline loop crashed",{error:err.message,stack:err.stack});
    if(currentStepName){try{await pipelineTracker.updateStepStatus(runId,currentStepName,"failed",{error_message:err.message});}catch(e2){}}
    try{await pipelineTracker.updateRunStatus(runId,"failed",{error_message:err.message});}catch(e){}
    if(io) io.emit("pipeline:error",{pipelineRunId:runId,error:err.message});
  }finally{
    running=false;currentEngine=null;stopRequested=false;
  }
}

async function _markFailed(runId,stepName,message,io){
  await pipelineTracker.updateStepStatus(runId,stepName,"failed",{error_message:message});
  await pipelineTracker.updateRunStatus(runId,"failed",{error_message:message});
  if(io) io.emit("pipeline:error",{pipelineRunId:runId,step:stepName,error:message});
  logger.error("Pipeline failed",{runId:runId,step:stepName,error:message});
}

async function _markStopped(runId,io){
  await pipelineTracker.updateRunStatus(runId,"stopped");
  if(io) io.emit("pipeline:stopped",{pipelineRunId:runId});
  logger.info("Pipeline stopped",{runId:runId});
}

function stopPipeline(){
  if(!running) return false;
  stopRequested=true;
  if(currentEngine&&typeof currentEngine.requestPause==="function") currentEngine.requestPause();
  return true;
}

async function getCurrentRun(){
  var latest=await pipelineTracker.getLatestRun();
  if(!latest) return null;
  return pipelineTracker.getRunWithSteps(latest.id);
}

function getAllRuns(){return pipelineTracker.getAllRuns();}

function recoverStaleRuns(){return pipelineTracker.failStaleRunningRuns();}

function isPipelineRunning(){return running;}

module.exports={startPipeline,stopPipeline,getCurrentRun,getAllRuns,recoverStaleRuns,isPipelineRunning,_dispatchers:dispatchers};
