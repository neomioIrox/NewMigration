const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {recordError}=require("./batch-runner");
const {processGetDate}=require("./expression-eval");
const {ilWallToUtcString}=require("./tz");
const tracker=require("../services/tracker");
const logger=require("../logger");

// Scope: migrate ONLY Asakim records tied to an in-scope migrated donation.
// AsakimDonations.DonationID == Orders.AsakimID, and the order must satisfy the SAME
// predicate the donation engine uses (ChargeStatus='OrderFinished' AND DateCreated >= cutoff).
// Single source of truth for the cutoff: scope-products.json. See project_migration_scope.
const donationScope=require("../../data/scope-products.json");
const SCOPE_CUTOFF=(donationScope&&donationScope.cutoff)?String(donationScope.cutoff):"2025-06-01";
if(!/^\d{4}-\d{2}-\d{2}$/.test(SCOPE_CUTOFF)) throw new Error("Invalid donation scope cutoff: "+SCOPE_CUTOFF);
const SCOPE_EXISTS=" EXISTS (SELECT 1 FROM Orders o WITH (NOLOCK)"
  +" WHERE o.AsakimID = AsakimDonations.DonationID"
  +" AND o.ChargeStatus='OrderFinished' AND o.DateCreated >= '"+SCOPE_CUTOFF+"')";

/**
 * AsakimDonation Migration Engine (Bulk INSERT)
 *
 * Migrates AsakimDonations (MSSQL) -> AsakimDonation (MySQL)
 *
 * Simple table-to-table migration, no FK dependencies.
 * 87,725 rows, 24 column mappings (23 direct + 1 expression).
 */
class AsakimDonationEngine extends EventEmitter{
  constructor(options){
    super();
    this.batchSize=(options&&options.batchSize)||2000;
    this.dryRun=(options&&options.dryRun)||false;
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var sourceTable="AsakimDonations";
    var targetTable="AsakimDonation";
    var sourceIdCol="Id";
    var entityType="AsakimDonation";

    try{
      // Count source rows (scope-filtered)
      var countResult=await mssqlDb.query("SELECT COUNT(*) as cnt FROM AsakimDonations WITH (NOLOCK) WHERE"+SCOPE_EXISTS);
      var totalRows=countResult.recordset[0].cnt;

      // Create or resume run
      var lastId=null;
      if(resumeRunId){
        this.runId=resumeRunId;
        var existingRun=await tracker.getRun(resumeRunId);
        if(existingRun){
          lastId=existingRun.last_processed_source_id;
          this.counters.processed=existingRun.processed_rows||0;
          this.counters.inserted=existingRun.inserted_rows||0;
          this.counters.skipped=existingRun.skipped_rows||0;
          this.counters.errors=existingRun.error_rows||0;
        }
        await tracker.updateRunStatus(resumeRunId,"running");
      }else{
        this.runId=await tracker.createRun("AsakimDonationMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:"AsakimDonationMapping"});
      logger.info("AsakimDonation migration started",{runId:this.runId,total:totalRows,resumeFrom:lastId});

      // Main batch loop
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          this.emit("paused",{runId:this.runId,counters:this.counters,totalRows:totalRows,mapping:"AsakimDonationMapping"});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters};
        }

        // Fetch batch (scope-filtered; keyset on Id)
        var whereSql=" WHERE"+SCOPE_EXISTS+(lastId?" AND Id>"+lastId:"");
        var batchSql="SELECT TOP "+this.batchSize+" * FROM AsakimDonations WITH (NOLOCK)"+whereSql+" ORDER BY Id ASC";
        var batchResult=await mssqlDb.query(batchSql);
        var rows=batchResult.recordset;
        if(!rows||rows.length===0){hasMore=false;break;}

        await this._processBatch(rows);

        lastId=rows[rows.length-1].Id;
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,mapping:"AsakimDonationMapping"});

        if(rows.length<this.batchSize) hasMore=false;
      }

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      this.emit("completed",{runId:this.runId,counters:this.counters,totalRows:totalRows,mapping:"AsakimDonationMapping"});
      logger.info("AsakimDonation migration completed",{runId:this.runId,counters:this.counters});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:"AsakimDonationMapping"});
      logger.error("AsakimDonation migration failed",{runId:this.runId,error:err.message});
      this.isRunning=false;
      throw err;
    }
  }

  async _processBatch(rows){
    var prepared=[];

    // Phase 1: Transform all rows
    for(var row of rows){
      var sourceId=row.Id;
      this.counters.processed++;

      try{
        prepared.push({
          sourceId:sourceId,
          data:{
            CardName:row.CardName?this._trunc(row.CardName,100):null,
            DocumentReferenceNumber:row.DocumentReferenceNumber||null,
            ProjectName:row.ProjectName||null,
            ProjectNumber:row.ProjectNumber||null,
            SumPaymentShekel:row.SumPaymentShekel!=null?row.SumPaymentShekel:null,
            SumPaymentCurrency:row.SumPaymentCurrency!=null?row.SumPaymentCurrency:null,
            DocID:row.DocID!=null?row.DocID:null,
            DocumentPaymentsID:row.DocumentPaymentsID||null,
            DocPaymentDate:ilWallToUtcString(row.DocPaymentDate),
            DocValueDate:ilWallToUtcString(row.DocValueDate),
            DocRegisterDate:ilWallToUtcString(row.DocRegisterDate),
            CardID:row.CardID||null,
            PaymentType:row.PaymentType||null,
            RecordDate:ilWallToUtcString(row.RecordDate),
            CountPayments:row.CountPayments!=null?row.CountPayments:null,
            SourceType:row.SourceType||null,
            Comments:row.Comments||null,
            ArmyIDNumber:row.ArmyIDNumber!=null?row.ArmyIDNumber:null,
            SalesPersonID:row.SalesPersonID!=null?row.SalesPersonID:null,
            SalesPersonName:row.SalesPersonName||null,
            BillingID:row.BillingID!=null?row.BillingID:null,
            BillingItemsID:row.BillingItemsID!=null?row.BillingItemsID:null,
            Status:row.Status!=null?row.Status:0,
            DonationID:row.DonationID||null
          }
        });

      }catch(err){
        this.counters.errors++;
        await recordError(this.runId,sourceId,"transform",err.message,{Id:sourceId},err.stack);
      }
    }

    if(prepared.length===0||this.dryRun) return;

    // Phase 2: Bulk INSERT AsakimDonation
    var cols=Object.keys(prepared[0].data);
    var singlePlaceholder="("+cols.map(function(){return"?"}).join(",")+")";
    var placeholders=prepared.map(function(){return singlePlaceholder}).join(",");
    var vals=[];
    for(var p of prepared){
      for(var c of cols){
        var v=p.data[c];
        vals.push(v===undefined?null:v);
      }
    }

    var sql="INSERT INTO `AsakimDonation` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    var [result]=await targetDb.query(sql,vals);
    var firstId=result.insertId;

    // Phase 3: Bulk INSERT id_mappings + row_status
    var mappingRows=[];
    var statusRows=[];
    for(var i=0;i<prepared.length;i++){
      var newId=firstId+i;
      mappingRows.push(["AsakimDonation",String(prepared[i].sourceId),String(newId),this.runId]);
      statusRows.push([this.runId,String(prepared[i].sourceId),"inserted",String(newId)]);
      this.counters.inserted++;
    }

    if(mappingRows.length>0){
      await this._bulkInsertTracking(mappingRows,statusRows);
    }
  }

  async _bulkInsertTracking(mappingRows,statusRows){
    if(mappingRows.length>0){
      var mPlaceholders=mappingRows.map(function(){return"(?,?,?,?)"}).join(",");
      var mVals=[];
      for(var m of mappingRows){mVals.push(m[0],m[1],m[2],m[3]);}
      await trackerDb.query(
        "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES "+mPlaceholders
        +" ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",mVals);
    }
    if(statusRows.length>0){
      var sPlaceholders=statusRows.map(function(){return"(?,?,?,?)"}).join(",");
      var sVals=[];
      for(var s of statusRows){sVals.push(s[0],s[1],s[2],s[3]);}
      await trackerDb.query(
        "INSERT INTO row_status (run_id,source_id,status,target_id) VALUES "+sPlaceholders
        +" ON DUPLICATE KEY UPDATE status=VALUES(status),target_id=VALUES(target_id)",sVals);
    }
  }

  _trunc(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"");
    return s.length>max?s.substring(0,max):s;
  }
}

module.exports=AsakimDonationEngine;
