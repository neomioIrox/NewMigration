const express=require("express");
const router=express.Router();
const tracker=require("../services/tracker");

router.get("/dashboard",async function(req,res){
  try{
    var stats=await tracker.getDashboardStats();
    res.json(stats);
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
