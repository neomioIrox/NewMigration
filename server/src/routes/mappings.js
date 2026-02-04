const express=require("express");
const router=express.Router();
const manager=require("../services/migration-manager");

router.get("/",function(req,res){
  try{
    var mappings=manager.listMappings();
    res.json({mappings:mappings});
  }catch(err){res.status(500).json({error:err.message});}
});

router.get("/:name",function(req,res){
  try{
    var mapping=manager.loadMapping(req.params.name);
    res.json(mapping);
  }catch(err){res.status(404).json({error:err.message});}
});

module.exports=router;
