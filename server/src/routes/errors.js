const express=require("express");
const router=express.Router();
const tracker=require("../services/tracker");

router.get("/",async function(req,res){
  try{
    var {runId,page,limit}=req.query;
    var result=await tracker.getErrors(runId?parseInt(runId):null,parseInt(page)||1,parseInt(limit)||50);
    res.json(result);
  }catch(err){res.status(500).json({error:err.message});}
});

router.get("/:runId",async function(req,res){
  try{
    var result=await tracker.getErrors(parseInt(req.params.runId),parseInt(req.query.page)||1,parseInt(req.query.limit)||50);
    res.json(result);
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
