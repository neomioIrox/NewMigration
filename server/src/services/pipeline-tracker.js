const trackerDb=require("../db/mysql-tracker");
const logger=require("../logger");

async function createPipelineRun(mode,steps){
  var [result]=await trackerDb.query(
    "INSERT INTO pipeline_runs (mode,status,started_at) VALUES (?,?,NOW())",[mode,"running"]);
  var runId=result.insertId;
  var placeholders=steps.map(function(){return "(?,?,?,?)";}).join(",");
  var vals=[];
  steps.forEach(function(s,i){vals.push(runId,s.name,i,"pending");});
  await trackerDb.query(
    "INSERT INTO pipeline_run_steps (pipeline_run_id,step_name,order_index,status) VALUES "+placeholders,vals);
  return runId;
}

async function getRunWithSteps(runId){
  var [runs]=await trackerDb.query("SELECT * FROM pipeline_runs WHERE id=?",[runId]);
  if(!runs[0]) return null;
  var [steps]=await trackerDb.query(
    "SELECT s.*, m.total_source_rows, m.processed_rows, m.inserted_rows, m.skipped_rows, m.error_rows "+
    "FROM pipeline_run_steps s LEFT JOIN migration_runs m ON m.id=s.migration_run_id "+
    "WHERE s.pipeline_run_id=? ORDER BY s.order_index",[runId]);
  return {run:runs[0],steps:steps};
}

async function getLatestRun(){
  var [rows]=await trackerDb.query("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1");
  return rows[0]||null;
}

async function getActiveRun(){
  var [rows]=await trackerDb.query("SELECT * FROM pipeline_runs WHERE status='running' ORDER BY id DESC LIMIT 1");
  return rows[0]||null;
}

async function getAllRuns(){
  var [rows]=await trackerDb.query("SELECT * FROM pipeline_runs ORDER BY id DESC");
  return rows;
}

async function updateRunStatus(runId,status,extra){
  var sets=["status=?"];
  var vals=[status];
  if(status==="completed"||status==="failed"||status==="stopped") sets.push("completed_at=NOW()");
  if(extra&&extra.current_step!==undefined){sets.push("current_step=?");vals.push(extra.current_step);}
  if(extra&&extra.error_message!==undefined){sets.push("error_message=?");vals.push(extra.error_message);}
  vals.push(runId);
  await trackerDb.query("UPDATE pipeline_runs SET "+sets.join(",")+" WHERE id=?",vals);
}

async function updateStepStatus(runId,stepName,status,extra){
  var sets=["status=?"];
  var vals=[status];
  if(status==="running") sets.push("started_at=NOW()");
  if(status==="completed"||status==="failed") sets.push("completed_at=NOW()");
  if(status==="pending"){sets.push("started_at=NULL");sets.push("completed_at=NULL");}
  if(extra&&extra.migration_run_id!==undefined){sets.push("migration_run_id=?");vals.push(extra.migration_run_id);}
  if(extra&&extra.error_message!==undefined){sets.push("error_message=?");vals.push(extra.error_message);}
  vals.push(runId,stepName);
  await trackerDb.query("UPDATE pipeline_run_steps SET "+sets.join(",")+" WHERE pipeline_run_id=? AND step_name=?",vals);
}

async function failStaleRunningRuns(){
  var [result]=await trackerDb.query(
    "UPDATE pipeline_runs SET status='failed',error_message='Server restarted while pipeline was running',completed_at=NOW() WHERE status='running'");
  if(result.affectedRows>0){
    await trackerDb.query(
      "UPDATE pipeline_run_steps SET status='pending',started_at=NULL,completed_at=NULL WHERE status='running'");
    logger.warn("Marked stale running pipeline runs as failed",{count:result.affectedRows});
  }
  return result.affectedRows;
}

async function deletePipelineRun(runId){
  await trackerDb.query("DELETE FROM pipeline_runs WHERE id=?",[runId]);
}

module.exports={createPipelineRun,getRunWithSteps,getLatestRun,getActiveRun,getAllRuns,updateRunStatus,updateStepStatus,failStaleRunningRuns,deletePipelineRun};
