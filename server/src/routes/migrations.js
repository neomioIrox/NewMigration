const express=require("express");
const router=express.Router();
const tracker=require("../services/tracker");
const manager=require("../services/migration-manager");

router.get("/",async function(req,res){
  try{var runs=await tracker.getAllRuns();res.json({runs:runs});}catch(err){res.status(500).json({error:err.message});}
});

router.post("/start",async function(req,res){
  try{
    var {mappingName,batchSize,totalLimit}=req.body;
    if(!mappingName) return res.status(400).json({error:"mappingName required"});
    var engine=manager.startMigration(mappingName,{batchSize:batchSize||500,totalLimit:totalLimit||0},req.app.get("io"));
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

router.post("/start-donations",async function(req,res){
  try{
    var {batchSize,dryRun}=req.body;
    var engine=manager.startDonationMigration(
      {batchSize:batchSize||1000,dryRun:dryRun||false},
      req.app.get("io")
    );
    res.json({message:"Donation migration started",dryRun:dryRun||false,batchSize:batchSize||1000});
  }catch(err){res.status(500).json({error:err.message});}
});

router.post("/start-asakim-donations",async function(req,res){
  try{
    var {batchSize,dryRun}=req.body;
    var engine=manager.startAsakimDonationMigration(
      {batchSize:batchSize||2000,dryRun:dryRun||false},
      req.app.get("io")
    );
    res.json({message:"AsakimDonation migration started",dryRun:dryRun||false,batchSize:batchSize||2000});
  }catch(err){res.status(500).json({error:err.message});}
});

router.post("/start-praynames",async function(req,res){
  try{
    var {batchSize,dryRun}=req.body;
    var engine=manager.startPrayNameMigration(
      {batchSize:batchSize||2000,dryRun:dryRun||false},
      req.app.get("io")
    );
    res.json({message:"PrayName migration started",dryRun:dryRun||false,batchSize:batchSize||2000});
  }catch(err){res.status(500).json({error:err.message});}
});

// Rebuild id_mappings for CustomerUser from existing target data + clean donation data
router.post("/prepare-donation-rerun",async function(req,res){
  try{
    var targetDb=require("../db/mysql-target");
    var trackerDb=require("../db/mysql-tracker");

    // 1. Rebuild CustomerUser id_mappings (same ID in both DBs)
    var [users]=await targetDb.query("SELECT Id FROM CustomerUser");
    if(users.length>0){
      var mPlaceholders=users.map(function(){return"(?,?,?,?)"}).join(",");
      var mVals=[];
      for(var u of users){mVals.push("CustomerUser",String(u.Id),String(u.Id),null);}
      await trackerDb.query(
        "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES "+mPlaceholders
        +" ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",mVals);
    }

    // 2. Delete old donation data from target (children first — FK to Donation)
    await targetDb.query("DELETE FROM DonationCurrencyValue");
    await targetDb.query("DELETE FROM DonationActionLog");
    var [donCount]=await targetDb.query("SELECT COUNT(*) as c FROM Donation");
    await targetDb.query("DELETE FROM Donation");
    // Delete addresses created by donation migration (those without FK references now)
    // We can't easily identify which addresses were ours, but since donation.ReceiptAddress/ShippingAddress are now deleted,
    // orphaned addresses from the migration are acceptable for now

    // 3. Clear donation-related tracker data
    await trackerDb.query("DELETE FROM row_status WHERE run_id IN (SELECT id FROM migration_runs WHERE mapping_name='DonationMapping')");
    await trackerDb.query("DELETE FROM migration_errors WHERE run_id IN (SELECT id FROM migration_runs WHERE mapping_name='DonationMapping')");
    await trackerDb.query("DELETE FROM id_mappings WHERE entity_type='Donation'");
    await trackerDb.query("DELETE FROM migration_runs WHERE mapping_name='DonationMapping'");
    // Also clean the failed CustomerUser re-run
    await trackerDb.query("DELETE FROM row_status WHERE run_id IN (SELECT id FROM migration_runs WHERE mapping_name='CustomerUserMapping')");
    await trackerDb.query("DELETE FROM migration_errors WHERE run_id IN (SELECT id FROM migration_runs WHERE mapping_name='CustomerUserMapping')");
    await trackerDb.query("DELETE FROM migration_runs WHERE mapping_name='CustomerUserMapping'");

    res.json({
      customerUserMappings:users.length,
      donationsDeleted:donCount[0].c,
      ready:true
    });
  }catch(err){res.status(500).json({error:err.message});}
});

router.post("/update-terminals",async function(req,res){
  try{
    var path=require("path");
    var XLSX=require("xlsx");
    var mssql=require("../db/mssql");
    var dryRun=req.body.dryRun===true;
    var excelPath=path.join(__dirname,"../../../legacy/data/TerminalProducts.xlsx");
    var wb=XLSX.readFile(excelPath);
    var ws=wb.Sheets[wb.SheetNames[0]];
    var rows=XLSX.utils.sheet_to_json(ws);
    var validRows=rows.filter(function(r){return r.Terminal===1||r.Terminal===4;});

    if(dryRun){
      var dist={};
      validRows.forEach(function(r){dist[r.Terminal]=(dist[r.Terminal]||0)+1;});
      return res.json({dryRun:true,totalRows:rows.length,validRows:validRows.length,skipped:rows.length-validRows.length,distribution:dist});
    }

    var pool=await mssql.getPool();
    var updated=0,errors=0,errorDetails=[];
    for(var i=0;i<validRows.length;i++){
      try{
        await pool.request()
          .input("terminal",validRows[i].Terminal)
          .input("pid",validRows[i].productsid)
          .query("UPDATE products SET Terminal = @terminal WHERE productsid = @pid");
        updated++;
      }catch(err){
        errors++;
        errorDetails.push({productsid:validRows[i].productsid,error:err.message});
      }
    }
    res.json({dryRun:false,updated:updated,errors:errors,errorDetails:errorDetails.slice(0,10)});
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
