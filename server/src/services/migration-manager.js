const fs=require("fs");
const path=require("path");
const MigrationEngine=require("../engine/migration-engine");
const tracker=require("./tracker");
const logger=require("../logger");

const MAPPINGS_DIR=path.join(__dirname,"../../mappings");
const activeEngines=new Map();

function loadMapping(name){
  var fp=path.join(MAPPINGS_DIR,name+".json");
  if(!fs.existsSync(fp)) fp=path.join(MAPPINGS_DIR,name);
  if(!fs.existsSync(fp)) throw new Error("Mapping not found: "+name);
  return JSON.parse(fs.readFileSync(fp,"utf8"));
}

function listMappings(){
  if(!fs.existsSync(MAPPINGS_DIR)) return [];
  return fs.readdirSync(MAPPINGS_DIR).filter(function(f){return f.endsWith(".json")&&f!=="_meta.json";}).map(function(f){return f.replace(".json","");});
}

function startMigration(mappingName,options,io){
  var mapping=loadMapping(mappingName);
  var engine=new MigrationEngine(mapping,options);
  // Wire up WebSocket events
  engine.on("started",function(data){if(io) io.emit("migration:started",data);});
  engine.on("progress",function(data){if(io) io.emit("migration:progress",data);});
  engine.on("paused",function(data){if(io) io.emit("migration:paused",data);});
  engine.on("completed",function(data){if(io) io.emit("migration:completed",data);activeEngines.delete(data.runId);});
  engine.on("error",function(data){if(io) io.emit("migration:error",data);activeEngines.delete(data.runId);});

  // Start async
  engine.run().catch(function(err){logger.error("Migration run failed: "+err.message);});
  // We will set the runId once it is available
  setTimeout(function(){if(engine.runId) activeEngines.set(engine.runId,engine);},500);
  return engine;
}

function pauseMigration(runId){
  var engine=activeEngines.get(runId);
  if(!engine) return false;
  engine.requestPause();
  return true;
}

async function resumeMigration(runId,io){
  var run=await tracker.getRun(runId);
  if(!run||run.status!=="paused") return null;
  var mapping=loadMapping(run.mapping_name);
  var engine=new MigrationEngine(mapping,{batchSize:run.batch_size});
  engine.on("started",function(d){if(io) io.emit("migration:started",d);});
  engine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
  engine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
  engine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
  engine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
  activeEngines.set(runId,engine);
  engine.run(runId).catch(function(e){logger.error("Resume failed: "+e.message);});
  return engine;
}

async function restartMigration(runId,io){
  var run=await tracker.getRun(runId);
  if(!run) return null;
  var engine=activeEngines.get(runId);
  if(engine&&engine.isRunning){engine.requestPause();await new Promise(function(r){setTimeout(r,2000);});}
  activeEngines.delete(runId);
  var entityType=run.mapping_name;
  await tracker.cleanupForRestart(runId,entityType);
  return startMigration(run.mapping_name,{batchSize:run.batch_size},io);
}

function getActiveEngine(runId){return activeEngines.get(runId)||null;}

module.exports={loadMapping,listMappings,startMigration,pauseMigration,resumeMigration,restartMigration,getActiveEngine};
