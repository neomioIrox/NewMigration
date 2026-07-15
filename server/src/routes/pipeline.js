const express=require("express");
const router=express.Router();
const orchestrator=require("../services/pipeline-orchestrator");

router.post("/start",async function(req,res){
  try{
    var mode=req.body&&req.body.mode==="fresh"?"fresh":"continue";
    var data=await orchestrator.startPipeline(mode,req.app.get("io"));
    res.json(data);
  }catch(err){
    res.status(err.code===409?409:500).json({error:err.message});
  }
});

router.post("/stop",function(req,res){
  res.json({stopping:orchestrator.stopPipeline()});
});

router.get("/current",async function(req,res){
  try{
    var data=await orchestrator.getCurrentRun();
    res.json(data||{run:null,steps:[]});
  }catch(err){res.status(500).json({error:err.message});}
});

router.get("/runs",async function(req,res){
  try{res.json({runs:await orchestrator.getAllRuns()});}catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
