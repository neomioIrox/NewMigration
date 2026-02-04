const express=require("express");
const router=express.Router();
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");

router.get("/test",async function(req,res){
  try{
    var results=await Promise.all([mssqlDb.testConnection(),targetDb.testConnection(),trackerDb.testConnection()]);
    res.json({mssql:results[0],mysqlTarget:results[1],mysqlTracker:results[2]});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

module.exports=router;
