const trackerDb=require("../db/mysql-tracker");
const logger=require("../logger");

async function createRun(mappingName,sourceTable,targetTable,totalRows,batchSize){
  var [result]=await trackerDb.query(
    "INSERT INTO migration_runs (mapping_name,source_table,target_table,status,total_source_rows,batch_size,started_at) VALUES (?,?,?,?,?,?,NOW())",
    [mappingName,sourceTable,targetTable,"running",totalRows,batchSize||500]);
  return result.insertId;
}

async function updateRunStatus(runId,status,extra){
  var sets=["status=?"];
  var vals=[status];
  if(status==="paused"){sets.push("paused_at=NOW()");}
  if(status==="completed"||status==="failed"){sets.push("completed_at=NOW()");}
  if(extra){
    for(var k of Object.keys(extra)){sets.push(k+"=?");vals.push(extra[k]);}
  }
  vals.push(runId);
  await trackerDb.query("UPDATE migration_runs SET "+sets.join(",")+" WHERE id=?",vals);
}

async function updateRunCounters(runId,processed,inserted,skipped,errors,lastSourceId){
  await trackerDb.query(
    "UPDATE migration_runs SET processed_rows=?,inserted_rows=?,skipped_rows=?,error_rows=?,last_processed_source_id=? WHERE id=?",
    [processed,inserted,skipped,errors,lastSourceId?String(lastSourceId):null,runId]);
}

async function getRun(runId){
  var [rows]=await trackerDb.query("SELECT * FROM migration_runs WHERE id=?",[runId]);
  return rows[0]||null;
}

async function getAllRuns(){
  var [rows]=await trackerDb.query("SELECT * FROM migration_runs ORDER BY created_at DESC");
  return rows;
}

async function isRowProcessed(runId,sourceId){
  var [rows]=await trackerDb.query("SELECT status FROM row_status WHERE run_id=? AND source_id=?",[runId,String(sourceId)]);
  return rows.length>0&&rows[0].status==="inserted";
}

async function getDashboardStats(){
  var [runs]=await trackerDb.query("SELECT mapping_name,status,total_source_rows,processed_rows,inserted_rows,error_rows FROM migration_runs ORDER BY created_at DESC");
  var [idCount]=await trackerDb.query("SELECT COUNT(*) as cnt FROM id_mappings");
  var [errCount]=await trackerDb.query("SELECT COUNT(*) as cnt FROM migration_errors");
  return {runs:runs,totalIdMappings:idCount[0].cnt,totalErrors:errCount[0].cnt};
}

async function getIdMappings(entityType,page,limit){
  page=page||1;limit=limit||50;
  var offset=(page-1)*limit;
  var where=entityType?" WHERE entity_type=?":"";
  var params=entityType?[entityType]:[];
  var [rows]=await trackerDb.query("SELECT * FROM id_mappings"+where+" ORDER BY id DESC LIMIT ? OFFSET ?",params.concat([limit,offset]));
  var [cnt]=await trackerDb.query("SELECT COUNT(*) as c FROM id_mappings"+where,params);
  return {rows:rows,total:cnt[0].c,page:page,limit:limit};
}

async function getEntityTypes(){
  var [rows]=await trackerDb.query("SELECT DISTINCT entity_type,COUNT(*) as cnt FROM id_mappings GROUP BY entity_type");
  return rows;
}

async function lookupId(entityType,sourceId){
  var [rows]=await trackerDb.query("SELECT * FROM id_mappings WHERE entity_type=? AND source_id=?",[entityType,String(sourceId)]);
  return rows[0]||null;
}

async function getErrors(runId,page,limit){
  page=page||1;limit=limit||50;
  var offset=(page-1)*limit;
  var where=runId?" WHERE run_id=?":"";
  var params=runId?[runId]:[];
  var [rows]=await trackerDb.query("SELECT * FROM migration_errors"+where+" ORDER BY created_at DESC LIMIT ? OFFSET ?",params.concat([limit,offset]));
  var [cnt]=await trackerDb.query("SELECT COUNT(*) as c FROM migration_errors"+where,params);
  return {rows:rows,total:cnt[0].c,page:page,limit:limit};
}

async function cleanupForRestart(runId,entityType){
  await trackerDb.query("DELETE FROM row_status WHERE run_id=?",[runId]);
  await trackerDb.query("DELETE FROM migration_errors WHERE run_id=?",[runId]);
  if(entityType){
    await trackerDb.query("DELETE FROM id_mappings WHERE entity_type=? AND run_id=?",[entityType,runId]);
  }
  await trackerDb.query("UPDATE migration_runs SET status=?,processed_rows=0,inserted_rows=0,skipped_rows=0,error_rows=0,last_processed_source_id=NULL,paused_at=NULL,completed_at=NULL WHERE id=?",["pending",runId]);
  logger.info("Cleanup for restart completed",{runId:runId,entityType:entityType});
}

async function clearAllHistory(){
  // TRUNCATE is much faster than DELETE for clearing entire tables
  await trackerDb.query("SET FOREIGN_KEY_CHECKS=0");
  await trackerDb.query("TRUNCATE TABLE migration_errors");
  await trackerDb.query("TRUNCATE TABLE row_status");
  await trackerDb.query("TRUNCATE TABLE id_mappings");
  await trackerDb.query("TRUNCATE TABLE migration_runs");
  await trackerDb.query("SET FOREIGN_KEY_CHECKS=1");
  logger.info("All migration history cleared");
}

module.exports={createRun,updateRunStatus,updateRunCounters,getRun,getAllRuns,isRowProcessed,getDashboardStats,getIdMappings,getEntityTypes,lookupId,getErrors,cleanupForRestart,clearAllHistory};
