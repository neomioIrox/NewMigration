const fs=require("fs");
const path=require("path");
const MigrationEngine=require("../engine/migration-engine");
const DonationEngine=require("../engine/donation-engine");
const PrayNameEngine=require("../engine/prayname-engine");
const AsakimDonationEngine=require("../engine/asakim-donation-engine");
const VideoGalleryEngine=require("../engine/videogallery-engine");
const RecruiterEngine=require("../engine/recruiter-engine");
const RecruitersGroupEngine=require("../engine/recruitersgroup-engine");
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
  // Dedicated bulk-insert engines for tables that were slow under the generic row-by-row path.
  // These don't need the mapping JSON (transforms are coded in the engine), but loadMapping is
  // still validated below for the generic path.
  var engine;
  if(mappingName==="VideoGalleryMediaMapping"){
    engine=new VideoGalleryEngine(options);
  }else if(mappingName==="RecruiterMapping"){
    engine=new RecruiterEngine(options);
  }else if(mappingName==="RecruitersGroupMapping"){
    engine=new RecruitersGroupEngine(options);
  }else{
    var mapping=loadMapping(mappingName);
    engine=new MigrationEngine(mapping,options);
  }
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
  // Use VideoGalleryEngine for video gallery runs
  if(run.mapping_name==="VideoGalleryMediaMapping"){
    var vEngine=new VideoGalleryEngine({batchSize:run.batch_size});
    vEngine.on("started",function(d){if(io) io.emit("migration:started",d);});
    vEngine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
    vEngine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
    vEngine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
    vEngine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
    activeEngines.set(runId,vEngine);
    vEngine.run(runId).catch(function(e){logger.error("VideoGallery resume failed: "+e.message);});
    return vEngine;
  }
  // Use RecruiterEngine for recruiter runs
  if(run.mapping_name==="RecruiterMapping"){
    var rEngine=new RecruiterEngine({batchSize:run.batch_size});
    rEngine.on("started",function(d){if(io) io.emit("migration:started",d);});
    rEngine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
    rEngine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
    rEngine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
    rEngine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
    activeEngines.set(runId,rEngine);
    rEngine.run(runId).catch(function(e){logger.error("Recruiter resume failed: "+e.message);});
    return rEngine;
  }
  // Use RecruitersGroupEngine for recruiters-group runs
  if(run.mapping_name==="RecruitersGroupMapping"){
    var rgEngine=new RecruitersGroupEngine({batchSize:run.batch_size});
    rgEngine.on("started",function(d){if(io) io.emit("migration:started",d);});
    rgEngine.on("progress",function(d){if(io) io.emit("migration:progress",d);});
    rgEngine.on("paused",function(d){if(io) io.emit("migration:paused",d);});
    rgEngine.on("completed",function(d){if(io) io.emit("migration:completed",d);activeEngines.delete(d.runId);});
    rgEngine.on("error",function(d){if(io) io.emit("migration:error",d);activeEngines.delete(d.runId);});
    activeEngines.set(runId,rgEngine);
    rgEngine.run(runId).catch(function(e){logger.error("RecruitersGroup resume failed: "+e.message);});
    return rgEngine;
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

// ======= Gallery chain: images galleries -> images media -> videos =======
// One-click orchestrator. Each stage is pre-checked against the tracker so the
// button is idempotent: completed stages are skipped (a synthetic completed
// event is emitted so the UI shows them), and clicking again after a pause
// continues from the first unfinished stage. A partially-migrated stage aborts
// the chain (re-running it through the generic engine would duplicate rows).
var galleryChainRunning=false;

function _awaitEngine(engine){
  return new Promise(function(resolve){
    engine.once("completed",function(d){resolve({status:"completed",data:d});});
    engine.once("paused",function(d){resolve({status:"paused",data:d});});
    engine.once("error",function(d){resolve({status:"error",data:d});});
  });
}

async function _galleryStageState(stageName){
  var mssqlDb=require("../db/mssql");
  var trackerDb=require("../db/mysql-tracker");
  var entityBySage={
    "GalleryMapping_Images":{entity:"Gallery_Images",countSql:"SELECT COUNT(*) AS cnt FROM Galeries"},
    "GalleryMediaMapping_Images":{entity:"Media_GalleryImage",countSql:"SELECT COUNT(*) AS cnt FROM GaleryPics WHERE Pic IS NOT NULL AND Pic != ''"}
  };
  var def=entityBySage[stageName];
  if(!def) return {run:true}; // VideoGalleryMediaMapping — engine is internally idempotent
  var srcResult=await mssqlDb.query(def.countSql);
  var srcCount=srcResult.recordset[0].cnt;
  var [doneRows]=await trackerDb.query(
    "SELECT COUNT(*) AS cnt FROM id_mappings WHERE entity_type=?",[def.entity]);
  var doneCount=doneRows[0].cnt;
  if(doneCount===0) return {run:true,srcCount:srcCount};
  if(doneCount>=srcCount) return {run:false,skip:true,srcCount:srcCount,doneCount:doneCount};
  return {run:false,partial:true,srcCount:srcCount,doneCount:doneCount};
}

function startGalleryMigrationChain(options,io){
  if(galleryChainRunning) throw new Error("Gallery migration chain is already running");
  galleryChainRunning=true;
  var stages=["GalleryMapping_Images","GalleryMediaMapping_Images","VideoGalleryMediaMapping"];

  (async function(){
    try{
      for(var stageName of stages){
        var state=await _galleryStageState(stageName);
        if(state.partial){
          logger.error("Gallery chain aborted — stage partially migrated",{stage:stageName,done:state.doneCount,src:state.srcCount});
          if(io) io.emit("migration:error",{runId:null,mapping:stageName,
            error:"השלב הושלם חלקית ("+state.doneCount+"/"+state.srcCount+") — ריצה חוזרת תיצור כפילויות. יש לנקות או להשלים ידנית."});
          return;
        }
        if(state.skip){
          logger.info("Gallery chain — stage already migrated, skipping",{stage:stageName,done:state.doneCount});
          if(io) io.emit("migration:completed",{runId:null,mapping:stageName,skippedStage:true,
            totalRows:state.srcCount,counters:{processed:state.doneCount,inserted:0,skipped:state.doneCount,errors:0}});
          continue;
        }
        logger.info("Gallery chain — starting stage",{stage:stageName});
        var engine=startMigration(stageName,{batchSize:(options&&options.batchSize)||500},io);
        var result=await _awaitEngine(engine);
        if(result.status!=="completed"){
          logger.warn("Gallery chain stopped",{stage:stageName,status:result.status});
          return; // engine already emitted paused/error to the UI
        }
      }
      logger.info("Gallery chain completed — all stages done");
    }catch(err){
      logger.error("Gallery chain failed",{error:err.message,stack:err.stack});
      if(io) io.emit("migration:error",{runId:null,mapping:"GalleryChain",error:err.message});
    }finally{
      galleryChainRunning=false;
    }
  })();
}

module.exports={loadMapping,listMappings,startMigration,startDonationMigration,startPrayNameMigration,startAsakimDonationMigration,startGalleryMigrationChain,pauseMigration,resumeMigration,restartMigration,getActiveEngine};
