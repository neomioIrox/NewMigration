const manager=require("./migration-manager");
const pipelineTracker=require("./pipeline-tracker");
const {loadPipelineConfig}=require("./pipeline-config");
const logger=require("../logger");

var running=false;
var currentEngine=null;
var stopRequested=false;

// kind -> function(step, io) returning an engine EventEmitter.
// Exported (as _dispatchers) so tests can substitute fake engines.
var dispatchers={
  standard:function(step,io){return manager.startMigration(step.name,{batchSize:step.batchSize||500},io);},
  donation:function(step,io){return manager.startDonationMigration({batchSize:step.batchSize||1000},io);},
  prayname:function(step,io){return manager.startPrayNameMigration({batchSize:step.batchSize||2000},io);},
  asakim:function(step,io){return manager.startAsakimDonationMigration({batchSize:step.batchSize||2000},io);}
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
  running=true; // claim synchronously — closes the double-call window
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
  stopRequested=false;
  _runLoop(runId,steps,io); // fire-and-forget; state is read via getCurrentRun/socket events
  return pipelineTracker.getRunWithSteps(runId);
}

async function _runLoop(runId,steps,io){
  try{
    var stepByName={};
    steps.forEach(function(s){stepByName[s.name]=s;});
    if(io) io.emit("pipeline:started",{pipelineRunId:runId});
    var data=await pipelineTracker.getRunWithSteps(runId);
    for(var row of data.steps){
      if(row.status==="completed") continue;
      if(stopRequested){await _markStopped(runId,io);return;}
      var def=stepByName[row.step_name];
      if(!def){await _markFailed(runId,row.step_name,"Step "+row.step_name+" is missing from pipeline.json — cannot continue this run",io);return;}
      await pipelineTracker.updateStepStatus(runId,row.step_name,"running");
      await pipelineTracker.updateRunStatus(runId,"running",{current_step:row.step_name});
      if(io) io.emit("pipeline:step-started",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
      logger.info("Pipeline step starting",{runId:runId,step:row.step_name});

      var engine=dispatchers[def.kind](def,io);
      currentEngine=engine;
      var stepName=row.step_name;
      var result=await _awaitEngine(engine,function(d){
        if(d&&d.runId){
          pipelineTracker.updateStepStatus(runId,stepName,"running",{migration_run_id:d.runId})
            .catch(function(e){logger.error("Pipeline: failed to record migration_run_id",{error:e.message});});
        }
      });
      currentEngine=null;

      if(result.status==="completed"){
        await pipelineTracker.updateStepStatus(runId,row.step_name,"completed");
        if(io) io.emit("pipeline:step-completed",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
        logger.info("Pipeline step completed",{runId:runId,step:row.step_name});
        continue;
      }
      if(result.status==="paused"){
        // Manual stop (or engine pause): the step will re-run from its start next time
        await pipelineTracker.updateStepStatus(runId,row.step_name,"pending");
        await _markStopped(runId,io);
        return;
      }
      var msg=(result.data&&result.data.error)?String(result.data.error):"Unknown engine error";
      await _markFailed(runId,row.step_name,msg,io);
      return;
    }
    await pipelineTracker.updateRunStatus(runId,"completed",{current_step:null});
    if(io) io.emit("pipeline:completed",{pipelineRunId:runId});
    logger.info("Pipeline completed",{runId:runId});
  }catch(err){
    logger.error("Pipeline loop crashed",{error:err.message,stack:err.stack});
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

module.exports={startPipeline,stopPipeline,getCurrentRun,getAllRuns,recoverStaleRuns,_dispatchers:dispatchers};
