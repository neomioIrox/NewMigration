const express=require("express");
const router=express.Router();
const checkpoint=require("../services/migration-checkpoint");

router.get("/",async function(req,res){
  try{
    await checkpoint.ensureTable();
    var rows=await checkpoint.list();
    res.json({checkpoints:rows});
  }catch(err){res.status(500).json({error:err.message});}
});

router.delete("/:mappingName",async function(req,res){
  try{
    await checkpoint.ensureTable();
    var deleted=await checkpoint.resetForMapping(req.params.mappingName);
    res.json({deleted:deleted});
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
