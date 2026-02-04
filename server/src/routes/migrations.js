const express=require("express");
const router=express.Router();
const tracker=require("../services/tracker");
const manager=require("../services/migration-manager");

router.get("/",async function(req,res){
  try{var runs=await tracker.getAllRuns();res.json({runs:runs});}catch(err){res.status(500).json({error:err.message});}
});

router.post("/start",async function(req,res){
  try{
    var {mappingName,batchSize}=req.body;
    if(!mappingName) return res.status(400).json({error:"mappingName required"});
    var engine=manager.startMigration(mappingName,{batchSize:batchSize||500},req.app.get("io"));
    res.json({message:"Migration started",mappingName:mappingName});
  }catch(err){res.status(500).json({error:err.message});}
});

router.post("/:id/pause",async function(req,res){
  try{
    var ok=manager.pauseMigration(parseInt(req.params.id));
    res.json({paused:ok});
  }catch(err){res.status(500).json({error:err.message});}
});

router.post("/:id/resume",async function(req,res){
  try{
    var engine=await manager.resumeMigration(parseInt(req.params.id),req.app.get("io"));
    res.json({resumed:!!engine});
  }catch(err){res.status(500).json({error:err.message});}
});

router.post("/:id/restart",async function(req,res){
  try{
    var engine=await manager.restartMigration(parseInt(req.params.id),req.app.get("io"));
    res.json({restarted:!!engine});
  }catch(err){res.status(500).json({error:err.message});}
});

router.delete("/history",async function(req,res){
  try{await tracker.clearAllHistory();res.json({cleared:true});}catch(err){res.status(500).json({error:err.message});}
});

router.get("/:id/progress",async function(req,res){
  try{
    var run=await tracker.getRun(parseInt(req.params.id));
    if(!run) return res.status(404).json({error:"Run not found"});
    res.json(run);
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
