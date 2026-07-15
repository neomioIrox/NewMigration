// Read / test / live-apply DB connection settings. Persistence is the root
// .env (single source of truth for the server AND standalone scripts); apply
// mutates the shared config object IN PLACE (every consumer holds the same
// reference) and resets the affected pool — no restart needed.
// Spec: docs/superpowers/specs/2026-07-15-db-connection-config-ui-design.md
const path=require("path");
const mysql=require("mysql2/promise");
const sql=require("mssql/msnodesqlv8");
const config=require("../config/database");
const envFile=require("./env-file");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const manager=require("./migration-manager");
const orchestrator=require("./pipeline-orchestrator");
const logger=require("../logger");

const ENV_PATH=path.resolve(__dirname,"../../../.env");
const MASK="******";
const DB_MODULES={mssql:mssqlDb,mysqlTarget:targetDb,mysqlTracker:trackerDb};

var applying=false;

// Paused runs also block (approved spec amendment): a run paused mid-table
// must not be resumed against a different DB. Tracker check survives restarts;
// if the tracker itself is unreachable the in-memory guards still apply.
async function hasBlockingTrackerRun(){
  try{
    var [rows]=await trackerDb.query("SELECT COUNT(*) AS cnt FROM migration_runs WHERE status IN ('running','paused')");
    return rows[0].cnt>0;
  }catch(err){
    return false;
  }
}

function maskConnectionString(cs){
  if(!cs) return cs;
  return cs.replace(/(pwd|password)(\s*=\s*)(\{[^}]*\}|[^;]*)/gi,function(_,k,eq){return k+eq+MASK;});
}

function getRedactedConfig(){
  return {
    mssql:{
      connectionString:maskConnectionString(config.mssql.connectionString),
      database:config.mssql.database,
      requestTimeout:config.mssql.requestTimeout
    },
    mysqlTarget:{host:config.mysqlTarget.host,user:config.mysqlTarget.user,database:config.mysqlTarget.database,hasPassword:!!config.mysqlTarget.password},
    mysqlTracker:{host:config.mysqlTracker.host,user:config.mysqlTracker.user,database:config.mysqlTracker.database,hasPassword:!!config.mysqlTracker.password}
  };
}

function validate(connection,values){
  values=values||{};
  if(connection==="mssql"){
    if(!values.connectionString||!String(values.connectionString).trim()) return "connectionString is required";
    if(String(values.connectionString).indexOf(MASK)>=0) return "Connection string contains the mask "+MASK+" — re-enter the full credential";
    if(!values.database||!String(values.database).trim()) return "database is required";
    var t=Number(values.requestTimeout);
    if(!Number.isFinite(t)||t<=0) return "requestTimeout must be a positive number";
    return null;
  }
  if(connection==="mysqlTarget"||connection==="mysqlTracker"){
    if(!values.host||!String(values.host).trim()) return "host is required";
    if(!values.user||!String(values.user).trim()) return "user is required";
    if(!values.database||!String(values.database).trim()) return "database is required";
    if(values.password===MASK) return "Password equals the mask "+MASK+" — re-enter the real password";
    return null;
  }
  return "Unknown connection: "+connection;
}

// Empty/absent password means "keep the stored one" — the UI never sees it.
function buildCandidate(connection,values){
  if(connection==="mssql"){
    return {connectionString:values.connectionString,database:values.database,requestTimeout:parseInt(values.requestTimeout)||300000};
  }
  var base=connection==="mysqlTarget"?config.mysqlTarget:config.mysqlTracker;
  var pw=(values.password===undefined||values.password===null||values.password==="")?base.password:values.password;
  return {host:values.host,user:values.user,password:pw,database:values.database};
}

// Opens an ISOLATED connection with the candidate values — never touches the
// live pools, so a failed test cannot disturb a healthy running system.
async function testCandidate(connection,values){
  var invalid=validate(connection,values);
  if(invalid) return {success:false,message:invalid};
  var candidate=buildCandidate(connection,values);
  if(connection==="mssql"){
    var pool=null;
    try{
      pool=await new sql.ConnectionPool(candidate).connect();
      await pool.request().query("SELECT 1 AS test");
      return {success:true,message:"MSSQL connected",database:candidate.database};
    }catch(err){
      return {success:false,message:mssqlDb.getErrorMessage(err),database:candidate.database};
    }finally{
      if(pool){try{await pool.close();}catch(e){}}
    }
  }
  var conn=null;
  try{
    conn=await mysql.createConnection({host:candidate.host,user:candidate.user,password:candidate.password,database:candidate.database,connectTimeout:10000});
    await conn.ping();
    return {success:true,message:"MySQL connected",database:candidate.database};
  }catch(err){
    return {success:false,message:err.message,database:candidate.database};
  }finally{
    if(conn){try{await conn.end();}catch(e){}}
  }
}

var ENV_KEYS={
  mssql:function(c){return {MSSQL_CONNECTION_STRING:c.connectionString,MSSQL_DATABASE:c.database,MSSQL_REQUEST_TIMEOUT:String(c.requestTimeout)};},
  mysqlTarget:function(c){return {MYSQL_TARGET_HOST:c.host,MYSQL_TARGET_USER:c.user,MYSQL_TARGET_PASSWORD:c.password,MYSQL_TARGET_DATABASE:c.database};},
  mysqlTracker:function(c){return {MYSQL_TRACKER_HOST:c.host,MYSQL_TRACKER_USER:c.user,MYSQL_TRACKER_PASSWORD:c.password,MYSQL_TRACKER_DATABASE:c.database};}
};

// Ordered apply: guard -> test candidate -> persist .env -> mutate config
// in place -> reset pool -> verify. If the .env write throws, nothing has
// been applied. Throws with .code 409 (busy) / 400 (test failed).
async function applyConfig(connection,values){
  if(manager.hasActiveMigration()||orchestrator.isPipelineRunning()){
    var busy=new Error("A migration is currently running — connection settings are locked");
    busy.code=409;throw busy;
  }
  if(applying){
    var dup=new Error("Another connection update is already in progress");
    dup.code=409;throw dup;
  }
  applying=true;
  try{
    if(await hasBlockingTrackerRun()){
      var blocked=new Error("A migration run is active or paused — connection settings are locked");
      blocked.code=409;throw blocked;
    }
    var test=await testCandidate(connection,values);
    if(!test.success){var bad=new Error(test.message);bad.code=400;throw bad;}
    if(manager.hasActiveMigration()||orchestrator.isPipelineRunning()||await hasBlockingTrackerRun()){
      var raced=new Error("A migration started during the connection test — settings not applied");
      raced.code=409;throw raced;
    }
    var candidate=buildCandidate(connection,values);
    var envUpdates=ENV_KEYS[connection](candidate);
    envFile.updateEnvFile(ENV_PATH,envUpdates);
    Object.keys(envUpdates).forEach(function(k){process.env[k]=envUpdates[k];});
    Object.assign(config[connection],candidate);
    await DB_MODULES[connection].resetPool();
    var status=await DB_MODULES[connection].testConnection();
    logger.info("Connection config applied: "+connection+" (database="+candidate.database+")");
    return status;
  }finally{
    applying=false;
  }
}

module.exports={getRedactedConfig,testCandidate,applyConfig,maskConnectionString,validate,buildCandidate,MASK,hasBlockingTrackerRun};
