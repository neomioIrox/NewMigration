const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {recordError}=require("./batch-runner");
const {preloadFKCache}=require("./fk-resolver");
const {processGetDate}=require("./expression-eval");
const {ilWallToUtcString}=require("./tz");
const tracker=require("../services/tracker");
const logger=require("../logger");
const migrationCheckpoint=require("../services/migration-checkpoint");

// PrayName scope: only prayer names whose donation is in the migrated scope.
// Mirror the donation cutoff (scope-products.json, the SAME file the donation engine
// reads) so we don't process the ~600k pre-cutoff rows whose orders were never
// migrated and would all be dropped as fkMissing. After this filter, fkMissing
// becomes a real signal (a genuinely unresolved in-scope donation) instead of noise.
const prayScope=require("../../data/scope-products.json");
const SCOPE_CUTOFF=(prayScope&&prayScope.cutoff)?String(prayScope.cutoff):"2025-06-01";
if(!/^\d{4}-\d{2}-\d{2}$/.test(SCOPE_CUTOFF)) throw new Error("Invalid PrayName scope cutoff: "+SCOPE_CUTOFF);

/**
 * PrayName Migration Engine (Bulk INSERT)
 *
 * Migrates PrayerNames (MSSQL) -> PrayName (MySQL)
 *
 * Source: PrayerNames JOIN Orders (ChargeStatus='OrderFinished')
 * FK: OrderId -> Donation id_mappings
 * Gender: 0->1(Male), 1->2(Female), other->NULL
 */
class PrayNameEngine extends EventEmitter{
  constructor(options){
    super();
    this.batchSize=(options&&options.batchSize)||2000;
    this.dryRun=(options&&options.dryRun)||false;
    this.startMode=(options&&options.startMode)||"continue";
    if(this.startMode==="gapfill"){logger.warn("startMode gapfill not supported by PrayNameEngine - running as continue");this.startMode="continue";}
    this.checkpointReporter=migrationCheckpoint.createReporter("PrayNameMapping");
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.stats={fkMissing:0,nullName:0};
    this.donationCache=null;
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var sourceTable="PrayerNames";
    var targetTable="PrayName";
    var sourceIdCol="PrayerNamesId";
    var entityType="PrayName";

    try{
      // Preload Donation FK cache
      logger.info("Loading Donation FK cache for PrayName migration");
      this.donationCache=await preloadFKCache("Donation");
      logger.info("Donation cache: "+this.donationCache.size+" entries");

      // Count source rows
      var countSql="WITH src AS ("+this._getSourceQuery()+") SELECT COUNT(*) as cnt FROM src";
      var countResult=await mssqlDb.query(countSql);
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
        if(!this.dryRun&&this.startMode==="fresh"){
          await migrationCheckpoint.ensureTable();
          await migrationCheckpoint.resetForMapping("PrayNameMapping");
        }else if(this.startMode==="continue"){
          await migrationCheckpoint.ensureTable();
          var cpRow=await migrationCheckpoint.get("PrayNameMapping");
          if(cpRow&&cpRow.LastSourceId!=null){lastId=cpRow.LastSourceId;logger.info("continue mode: seeding from checkpoint",{mapping:"PrayNameMapping",lastSourceId:lastId});}
        }
        this.runId=await tracker.createRun("PrayNameMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }
      if(!this.dryRun) await this.checkpointReporter.init(this.counters.inserted);

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:"PrayNameMapping"});
      logger.info("PrayName migration started",{runId:this.runId,total:totalRows,resumeFrom:lastId});

      // Main batch loop
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          if(!this.dryRun) await this.checkpointReporter.batch(lastId,this.counters.inserted);
          this.emit("paused",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"PrayNameMapping"});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters,stats:this.stats};
        }

        // Fetch batch
        var whereExtra=lastId?" WHERE "+sourceIdCol+">"+lastId:"";
        var batchSql="WITH src AS ("+this._getSourceQuery()+") SELECT TOP "+this.batchSize+" * FROM src"+whereExtra+" ORDER BY "+sourceIdCol+" ASC";
        var batchResult=await mssqlDb.query(batchSql);
        var rows=batchResult.recordset;
        if(!rows||rows.length===0){hasMore=false;break;}

        await this._processBatch(rows,sourceIdCol);

        lastId=rows[rows.length-1][sourceIdCol];
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        if(!this.dryRun) await this.checkpointReporter.batch(lastId,this.counters.inserted);
        this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"PrayNameMapping"});

        if(rows.length<this.batchSize) hasMore=false;
      }

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      if(!this.dryRun) await this.checkpointReporter.complete();
      this.emit("completed",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"PrayNameMapping"});
      logger.info("PrayName migration completed",{runId:this.runId,counters:this.counters,stats:this.stats});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters,stats:this.stats};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:"PrayNameMapping"});
      logger.error("PrayName migration failed",{runId:this.runId,error:err.message});
      this.isRunning=false;
      throw err;
    }
  }

  async _processBatch(rows,sourceIdCol){
    var now=processGetDate();
    var prepared=[];

    // Phase 1: Transform all rows
    for(var row of rows){
      var sourceId=row[sourceIdCol];
      this.counters.processed++;

      try{
        // FK: OrderId -> Donation target_id
        var donationId=null;
        if(row.OrderId!=null){
          var mapped=this.donationCache.get(String(row.OrderId));
          if(mapped) donationId=parseInt(mapped);
        }
        if(!donationId){
          this.counters.skipped++;
          this.stats.fkMissing++;
          continue;
        }

        // Name (NOT NULL)
        var name=row.FirstName?this._trunc(row.FirstName,100):"";
        if(!name&&name!==""){
          this.stats.nullName++;
          name="";
        }

        // Gender: 0->1(Male), 1->2(Female), other->NULL
        var gender=null;
        if(row.Gender===0) gender=1;
        else if(row.Gender===1) gender=2;

        // ParentName (nullable)
        var parentName=row.LastName?this._trunc(row.LastName,100):null;

        // PrayDescription (NOT NULL)
        var prayDesc=row.Comment!=null?String(row.Comment):"";

        // CreatedAt (NOT NULL) — source wall-clock Date must become a UTC string (see tz.js)
        var createdAt=row.DateCreated?ilWallToUtcString(row.DateCreated):now;

        prepared.push({
          sourceId:sourceId,
          data:{
            BelongToEntityType:4,
            BelongToEntityId:donationId,
            Name:name,
            Gender:gender,
            ParentName:parentName,
            PrayDescription:prayDesc,
            CreatedAt:createdAt,
            CreatedBy:-1,
            UpdatedAt:now,
            UpdatedBy:-1
          }
        });

      }catch(err){
        this.counters.errors++;
        await recordError(this.runId,sourceId,"transform",err.message,{
          PrayerNamesId:sourceId,OrderId:row.OrderId,FirstName:row.FirstName
        },err.stack);
      }
    }

    if(prepared.length===0||this.dryRun) return;

    // Phase 2: Bulk INSERT PrayName
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

    var sql="INSERT INTO `PrayName` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    var [result]=await targetDb.query(sql,vals);
    var firstId=result.insertId;

    // Phase 3: Bulk INSERT id_mappings + row_status
    var mappingRows=[];
    var statusRows=[];
    for(var i=0;i<prepared.length;i++){
      var newId=firstId+i;
      mappingRows.push(["PrayName",String(prepared[i].sourceId),String(newId),this.runId]);
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

  _getSourceQuery(){
    return "SELECT pn.PrayerNamesId, pn.FirstName, pn.LastName, pn.Comment, pn.OrderId, pn.DateCreated, pn.Gender"
      +" FROM PrayerNames pn WITH (NOLOCK)"
      +" INNER JOIN Orders o WITH (NOLOCK) ON pn.OrderId = o.OrdersId"
      +" WHERE o.ChargeStatus = 'OrderFinished'"
      +" AND o.DateCreated >= '"+SCOPE_CUTOFF+"'";
  }

  _trunc(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"");
    return s.length>max?s.substring(0,max):s;
  }
}

module.exports=PrayNameEngine;
