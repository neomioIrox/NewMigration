const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const logger=require("../logger");

async function insertRow(tableName,data){
  var cols=Object.keys(data);
  var placeholders=cols.map(function(){return"?"}).join(",");
  var vals=cols.map(function(c){var v=data[c];return v===undefined?null:v});
  var sql="INSERT INTO `"+tableName+"` ("+cols.map(function(c){return"`"+c+"`"}).join(",")+") VALUES ("+placeholders+")";
  var [result]=await targetDb.query(sql,vals);
  return result.insertId;
}

async function insertRowWithTracking(tableName,data,runId,sourceId,entityType){
  var conn=await targetDb.getConnection();
  try{
    await conn.beginTransaction();
    var cols=Object.keys(data);
    var placeholders=cols.map(function(){return"?"}).join(",");
    var vals=cols.map(function(c){var v=data[c];return v===undefined?null:v});
    var sql="INSERT INTO `"+tableName+"` ("+cols.map(function(c){return"`"+c+"`"}).join(",")+") VALUES ("+placeholders+")";
    var [result]=await conn.execute(sql,vals);
    var newId=result.insertId;
    await conn.commit();
    conn.release();
    // Record in tracker
    await trackerDb.query(
      "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
      [entityType,String(sourceId),String(newId),runId]);
    await trackerDb.query(
      "INSERT INTO row_status (run_id,source_id,status,target_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),target_id=VALUES(target_id)",
      [runId,String(sourceId),"inserted",String(newId)]);
    return newId;
  }catch(err){
    await conn.rollback();
    conn.release();
    throw err;
  }
}

async function recordMapping(entityType,sourceId,targetId,runId){
  await trackerDb.query(
    "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
    [entityType,String(sourceId),String(targetId),runId]);
}

async function updateRow(tableName,setData,whereData){
  var setCols=Object.keys(setData);
  var whereCols=Object.keys(whereData);
  if(setCols.length===0) return;
  var setClause=setCols.map(function(c){return"`"+c+"`=?"}).join(",");
  var setVals=setCols.map(function(c){return setData[c]});
  var whereClause=whereCols.map(function(c){return"`"+c+"`=?"}).join(" AND ");
  var whereVals=whereCols.map(function(c){return whereData[c]});
  var sql="UPDATE `"+tableName+"` SET "+setClause+" WHERE "+whereClause;
  await targetDb.query(sql,setVals.concat(whereVals));
}

async function recordError(runId,sourceId,errorType,errorMessage,sourceData,stackTrace){
  await trackerDb.query(
    "INSERT INTO migration_errors (run_id,source_id,error_type,error_message,source_data,stack_trace) VALUES (?,?,?,?,?,?)",
    [runId,String(sourceId),errorType,errorMessage,JSON.stringify(sourceData),stackTrace]);
  await trackerDb.query(
    "INSERT INTO row_status (run_id,source_id,status,error_message) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),error_message=VALUES(error_message)",
    [runId,String(sourceId),"error",errorMessage]);
}

module.exports={insertRow,insertRowWithTracking,recordMapping,updateRow,recordError};
