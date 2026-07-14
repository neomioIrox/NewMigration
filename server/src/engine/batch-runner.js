const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {toDbValue}=require("./tz");
const logger=require("../logger");

// All target-DB writes funnel through this normalization: source Date objects carry
// Israel wall-clock time and MUST become UTC strings before mysql2 sees them (see ./tz.js).
function dbVal(v){
  if(v===undefined) return null;
  return toDbValue(v);
}

async function insertRow(tableName,data){
  var cols=Object.keys(data);
  var placeholders=cols.map(function(){return"?"}).join(",");
  var vals=cols.map(function(c){return dbVal(data[c])});
  var sql="INSERT INTO `"+tableName+"` ("+cols.map(function(c){return"`"+c+"`"}).join(",")+") VALUES ("+placeholders+")";
  var [result]=await targetDb.query(sql,vals);
  return result.insertId;
}

// Chunked multi-row INSERT into the target DB. Every row MUST share the same keys
// (the column set is taken from rows[0]). Splits the batch into sub-statements so a
// large batch can never exceed MySQL's prepared-statement placeholder limit (~65535)
// or max_allowed_packet. Returns the insertId of the FIRST row of the FIRST chunk —
// useful for AUTO_INCREMENT tables (ids are sequential); ignore it when ids are
// supplied explicitly (preserveSourceId), where you already know the ids.
async function bulkInsert(tableName,rows,options){
  if(!rows||rows.length===0) return {firstId:null,count:0};
  var cols=Object.keys(rows[0]);
  var maxParams=(options&&options.maxParams)||50000;
  var rowsPerStmt=Math.max(1,Math.floor(maxParams/cols.length));
  var colSql="`"+cols.join("`,`")+"`";
  var singlePlaceholder="("+cols.map(function(){return"?"}).join(",")+")";
  var firstId=null,count=0;
  for(var start=0;start<rows.length;start+=rowsPerStmt){
    var chunk=rows.slice(start,start+rowsPerStmt);
    var placeholders=chunk.map(function(){return singlePlaceholder}).join(",");
    var vals=[];
    for(var r of chunk){for(var c of cols){vals.push(dbVal(r[c]));}}
    var sql="INSERT INTO `"+tableName+"` ("+colSql+") VALUES "+placeholders;
    var [result]=await targetDb.query(sql,vals);
    if(firstId===null) firstId=result.insertId;
    count+=chunk.length;
  }
  return {firstId:firstId,count:count};
}

async function insertRowWithTracking(tableName,data,runId,sourceId,entityType,explicitId){
  var conn=await targetDb.getConnection();
  try{
    await conn.beginTransaction();
    var cols=Object.keys(data);
    var placeholders=cols.map(function(){return"?"}).join(",");
    var vals=cols.map(function(c){return dbVal(data[c])});
    var sql="INSERT INTO `"+tableName+"` ("+cols.map(function(c){return"`"+c+"`"}).join(",")+") VALUES ("+placeholders+")";
    var [result]=await conn.execute(sql,vals);
    // preserveSourceId: when an explicit PK is supplied, mysql2's result.insertId is 0
    // (LAST_INSERT_ID() updates only for auto-generated values), so use the explicit value.
    var newId=(explicitId!==undefined&&explicitId!==null)?explicitId:result.insertId;
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

// Mark a source row as processed in row_status WITHOUT inserting a main-table row.
// Used in collapse mode (fixedParentProjectId), where no per-row parent (Project) is
// created but the source row must still be flagged done so isRowProcessed()/resume work.
async function markRowProcessed(runId,sourceId,targetId){
  await trackerDb.query(
    "INSERT INTO row_status (run_id,source_id,status,target_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),target_id=VALUES(target_id)",
    [runId,String(sourceId),"inserted",targetId!=null?String(targetId):null]);
}

async function updateRow(tableName,setData,whereData){
  var setCols=Object.keys(setData);
  var whereCols=Object.keys(whereData);
  if(setCols.length===0) return;
  var setClause=setCols.map(function(c){return"`"+c+"`=?"}).join(",");
  var setVals=setCols.map(function(c){return dbVal(setData[c])});
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

async function findExistingId(tableName,column,value){
  var sql="SELECT `Id` FROM `"+tableName+"` WHERE `"+column+"`=? LIMIT 1";
  var [rows]=await targetDb.query(sql,[value]);
  if(rows&&rows.length>0) return rows[0].Id;
  return null;
}

module.exports={insertRow,bulkInsert,insertRowWithTracking,recordMapping,markRowProcessed,updateRow,recordError,findExistingId};
