const express=require("express");
const router=express.Router();
const tracker=require("../services/tracker");

router.get("/",async function(req,res){
  try{
    var {entityType,page,limit}=req.query;
    var result=await tracker.getIdMappings(entityType,parseInt(page)||1,parseInt(limit)||50);
    res.json(result);
  }catch(err){res.status(500).json({error:err.message});}
});

router.get("/entity-types",async function(req,res){
  try{var types=await tracker.getEntityTypes();res.json({entityTypes:types});}catch(err){res.status(500).json({error:err.message});}
});

router.get("/:entity/:sourceId",async function(req,res){
  try{
    var result=await tracker.lookupId(req.params.entity,req.params.sourceId);
    if(!result) return res.status(404).json({error:"Not found"});
    res.json(result);
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
