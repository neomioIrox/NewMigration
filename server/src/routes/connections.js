const express=require("express");
const router=express.Router();
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const connectionConfig=require("../services/connection-config");

router.get("/test",async function(req,res){
  try{
    var results=await Promise.all([mssqlDb.testConnection(),targetDb.testConnection(),trackerDb.testConnection()]);
    res.json({mssql:results[0],mysqlTarget:results[1],mysqlTracker:results[2]});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

router.get("/config",function(req,res){
  try{
    res.json(connectionConfig.getRedactedConfig());
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

router.post("/test-config",async function(req,res){
  try{
    var b=req.body||{};
    res.json(await connectionConfig.testCandidate(b.connection,b.values));
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

router.put("/config",async function(req,res){
  try{
    var b=req.body||{};
    var status=await connectionConfig.applyConfig(b.connection,b.values);
    res.json({applied:true,status:status});
  }catch(err){
    var code=err.code===409?409:err.code===400?400:500;
    res.status(code).json({error:err.message});
  }
});

module.exports=router;
