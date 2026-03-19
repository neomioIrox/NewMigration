const fs=require("fs");
const path=require("path");
const MigrationEngine=require("../engine/migration-engine");
const DonationEngine=require("../engine/donation-engine");
const PrayNameEngine=require("../engine/prayname-engine");
const AsakimDonationEngine=require("../engine/asakim-donation-engine");
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
  // Use DonationEngine for donation runs
  if(run.mapping_name==="DonationMapping"){
    var dEngine=new DonationEngine({batchSize:run.batch_size});
    dEngine.on("started",function(d){if(io) io.emit("migration:started",d);});
    dEngine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
    dEngine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
    dEngine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
    dEngine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
    activeEngines.set(runId,dEngine);
    dEngine.run(runId).catch(function(e){logger.error("Donation resume failed: "+e.message);});
    return dEngine;
  }
  // Use AsakimDonationEngine for asakim donation runs
  if(run.mapping_name==="AsakimDonationMapping"){
    var aEngine=new AsakimDonationEngine({batchSize:run.batch_size});
    aEngine.on("started",function(d){if(io) io.emit("migration:started",d);});
    aEngine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
    aEngine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
    aEngine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
    aEngine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
    activeEngines.set(runId,aEngine);
    aEngine.run(runId).catch(function(e){logger.error("AsakimDonation resume failed: "+e.message);});
    return aEngine;
  }
  // Use PrayNameEngine for prayname runs
  if(run.mapping_name==="PrayNameMapping"){
    var pEngine=new PrayNameEngine({batchSize:run.batch_size});
    pEngine.on("started",function(d){if(io) io.emit("migration:started",d);});
    pEngine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
    pEngine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
    pEngine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
    pEngine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
    activeEngines.set(runId,pEngine);
    pEngine.run(runId).catch(function(e){logger.error("PrayName resume failed: "+e.message);});
    return pEngine;
  }
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

function startDonationMigration(options,io){
  var engine=new DonationEngine(options);
  engine.on("started",function(data){
    if(io) io.emit("migration:started",data);
    // Register immediately when runId is known
    if(data.runId) activeEngines.set(data.runId,engine);
  });
  engine.on("progress",function(data){if(io) io.emit("migration:progress",data);});
  engine.on("paused",function(data){if(io) io.emit("migration:paused",data);});
  engine.on("completed",function(data){if(io) io.emit("migration:completed",data);activeEngines.delete(data.runId);});
  engine.on("error",function(data){if(io) io.emit("migration:error",data);activeEngines.delete(data.runId);});
  engine.run().catch(function(err){logger.error("Donation migration failed: "+err.message);});
  return engine;
}

function startPrayNameMigration(options,io){
  var engine=new PrayNameEngine(options);
  engine.on("started",function(data){
    if(io) io.emit("migration:started",data);
    if(data.runId) activeEngines.set(data.runId,engine);
  });
  engine.on("progress",function(data){if(io) io.emit("migration:progress",data);});
  engine.on("paused",function(data){if(io) io.emit("migration:paused",data);});
  engine.on("completed",function(data){if(io) io.emit("migration:completed",data);activeEngines.delete(data.runId);});
  engine.on("error",function(data){if(io) io.emit("migration:error",data);activeEngines.delete(data.runId);});
  engine.run().catch(function(err){logger.error("PrayName migration failed: "+err.message);});
  return engine;
}

function startAsakimDonationMigration(options,io){
  var engine=new AsakimDonationEngine(options);
  engine.on("started",function(data){
    if(io) io.emit("migration:started",data);
    if(data.runId) activeEngines.set(data.runId,engine);
  });
  engine.on("progress",function(data){if(io) io.emit("migration:progress",data);});
  engine.on("paused",function(data){if(io) io.emit("migration:paused",data);});
  engine.on("completed",function(data){if(io) io.emit("migration:completed",data);activeEngines.delete(data.runId);});
  engine.on("error",function(data){if(io) io.emit("migration:error",data);activeEngines.delete(data.runId);});
  engine.run().catch(function(err){logger.error("AsakimDonation migration failed: "+err.message);});
  return engine;
}

function getActiveEngine(runId){return activeEngines.get(runId)||null;}

module.exports={loadMapping,listMappings,startMigration,startDonationMigration,startPrayNameMigration,startAsakimDonationMigration,pauseMigration,resumeMigration,restartMigration,getActiveEngine};
