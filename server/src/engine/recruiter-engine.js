const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {bulkInsert,recordError}=require("./batch-runner");
const {processGetDate}=require("./expression-eval");
const tracker=require("../services/tracker");
const logger=require("../logger");
const migrationCheckpoint=require("../services/migration-checkpoint");

/**
 * Recruiter Migration Engine (Bulk INSERT)
 *
 * Migrates ProductStock (MSSQL) -> Recruiter + RecruiterLocalization (MySQL).
 *
 * Replaces the generic row-by-row MigrationEngine path (RecruiterMapping.json) which took
 * ~hours: per row it ran isRowProcessed, a dedicated transaction, a cached FK lookup, 2
 * tracker writes and 3 localization inserts. This engine prepares a whole batch and issues a
 * handful of bulk INSERTs per batch — same pattern as the donation/prayname engines.
 *
 * Faithful to RecruiterMapping.json:
 *   - preserveSourceId: Recruiter.Id == ProductStock.ProductStockId
 *   - Name dedup: the sourceQuery's ROW_NUMBER computes _DisplayName (clean for the first of a
 *     (ProductId,Name) group, "(2)"/"(3)" suffix for the rest) to clear UNIQUE(ProjectId,Name);
 *     RecruiterLocalization keeps the ORIGINAL Name (clean display).
 *   - ProjectId = ProductStock.ProductId, resolved DIRECTLY (Project.Id == products.productsid).
 *   - RecruiterGroupId = ProductStock.GroupId if that group migrated (else NULL), resolved
 *     against the target RecruitersGroup table (RecruitersGroup.Id == RecruitersGroups.ID).
 *   - scope: only recruiters whose ProductId exists in the target Project table.
 *   - id_mappings entity_type "RecruiterMapping" is still recorded (source==target) — the
 *     donation engine resolves RecruiterId via preloadFKCache("RecruiterMapping").
 */
class RecruiterEngine extends EventEmitter{
  constructor(options){
    super();
    this.batchSize=(options&&options.batchSize)||1000;
    this.dryRun=(options&&options.dryRun)||false;
    this.startMode=(options&&options.startMode)||"continue";
    if(this.startMode==="gapfill"){logger.warn("startMode gapfill not supported by RecruiterEngine - running as continue (built-in alreadyExists skip covers gaps)");this.startMode="continue";}
    else if(this.startMode!=="continue"&&this.startMode!=="fresh"){logger.warn("unknown startMode '"+this.startMode+"' - running as continue");this.startMode="continue";}
    this.checkpointReporter=migrationCheckpoint.createReporter("RecruiterMapping");
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.stats={fkMissing:0,alreadyExists:0,groupNull:0,langRows:0};
    this.projectIds=null;       // Set of target Project.Id (scope + FK validation)
    this.groupIds=null;         // Set of target RecruitersGroup.Id (RecruiterGroupId resolution)
    this.existingIds=null;      // Set of Recruiter.Id already in target (skip-existing)
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var sourceTable="ProductStock";
    var targetTable="Recruiter";
    var sourceIdCol="ProductStockId";
    var entityType="RecruiterMapping"; // must match the generic engine's filename (donation FK lookup)

    try{
      // Preload target Project ids (== products.productsid): scope + FK validation
      var [projRows]=await targetDb.query("SELECT Id FROM Project");
      this.projectIds=new Set(projRows.map(function(r){return Number(r.Id)}).filter(function(n){return!isNaN(n)&&n>0}));
      logger.info("Recruiter: target Project scope loaded",{count:this.projectIds.size});
      var scopeSql=this.projectIds.size?Array.from(this.projectIds).join(","):"0";

      // Preload target RecruitersGroup ids (== RecruitersGroups.ID): resolve RecruiterGroupId,
      // NULL when the group wasn't migrated (mirrors the old nullable FK lookup).
      var [grpRows]=await targetDb.query("SELECT Id FROM RecruitersGroup");
      this.groupIds=new Set(grpRows.map(function(r){return Number(r.Id)}).filter(function(n){return!isNaN(n)&&n>0}));
      logger.info("Recruiter: target RecruitersGroup ids loaded",{count:this.groupIds.size});

      // Preload existing Recruiter ids for skip-existing (idempotent re-runs)
      var [existRows]=await targetDb.query("SELECT Id FROM Recruiter");
      this.existingIds=new Set(existRows.map(function(r){return Number(r.Id)}));
      logger.info("Recruiter: existing rows preloaded for skip",{count:this.existingIds.size});

      // Count source rows in scope
      var countSql="WITH src AS ("+this._getSourceQuery()+") SELECT COUNT(*) as cnt FROM src"
        +" WHERE ProductId IS NOT NULL AND ProductId IN ("+scopeSql+")";
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
          await migrationCheckpoint.resetForMapping("RecruiterMapping");
        }else if(this.startMode==="continue"){
          await migrationCheckpoint.ensureTable();
          var cpRow=await migrationCheckpoint.get("RecruiterMapping");
          if(cpRow&&cpRow.LastSourceId!=null){
            // The VARCHAR cursor is interpolated into keyset SQL — abort on garbage instead
            // of injecting it (matches the "checkpoint READ failure aborts the run" rule).
            var seeded=Number(cpRow.LastSourceId);
            if(isNaN(seeded)) throw new Error("MigrationCheckpoint.LastSourceId is not numeric: "+cpRow.LastSourceId);
            lastId=seeded;
            logger.info("continue mode: seeding from checkpoint",{mapping:"RecruiterMapping",lastSourceId:lastId});
          }
        }
        this.runId=await tracker.createRun("RecruiterMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }
      if(!this.dryRun) await this.checkpointReporter.init(this.counters.inserted);

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:"RecruiterMapping"});
      logger.info("Recruiter migration started",{runId:this.runId,total:totalRows,resumeFrom:lastId});

      // Main batch loop (keyset paginate on ProductStockId)
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          if(!this.dryRun) await this.checkpointReporter.batch(lastId,this.counters.inserted);
          this.emit("paused",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"RecruiterMapping"});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters,stats:this.stats};
        }

        var whereExtra=lastId?" AND ProductStockId>"+lastId:"";
        var batchSql="WITH src AS ("+this._getSourceQuery()+") SELECT TOP "+this.batchSize+" * FROM src"
          +" WHERE ProductId IS NOT NULL AND ProductId IN ("+scopeSql+")"+whereExtra
          +" ORDER BY ProductStockId ASC";
        var batchResult=await mssqlDb.query(batchSql);
        var rows=batchResult.recordset;
        if(!rows||rows.length===0){hasMore=false;break;}

        await this._processBatch(rows,sourceIdCol,entityType);

        lastId=rows[rows.length-1][sourceIdCol];
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        if(!this.dryRun) await this.checkpointReporter.batch(lastId,this.counters.inserted);
        this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"RecruiterMapping"});

        if(rows.length<this.batchSize) hasMore=false;
      }

      // preserveSourceId: realign AUTO_INCREMENT so future app inserts continue past migrated ids
      if(!this.dryRun) await this._realignAutoIncrement(targetTable);

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      if(!this.dryRun) await this.checkpointReporter.complete();
      this.emit("completed",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"RecruiterMapping"});
      logger.info("Recruiter migration completed",{runId:this.runId,counters:this.counters,stats:this.stats});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters,stats:this.stats};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:"RecruiterMapping"});
      logger.error("Recruiter migration failed",{runId:this.runId,error:err.message,stack:err.stack});
      this.isRunning=false;
      throw err;
    }
  }

  async _processBatch(rows,sourceIdCol,entityType){
    var now=processGetDate();
    var parentRows=[];
    var langRows=[];
    var done=[];

    for(var row of rows){
      var sourceId=row[sourceIdCol];
      this.counters.processed++;

      try{
        if(this.existingIds&&this.existingIds.has(Number(sourceId))){
          this.counters.skipped++;this.stats.alreadyExists++;continue;
        }

        var projectId=row.ProductId;
        if(projectId==null||!this.projectIds.has(Number(projectId))){
          this.counters.skipped++;this.stats.fkMissing++;continue;
        }

        // RecruiterGroupId: only if the group actually migrated, else NULL
        var groupId=null;
        if(row.GroupId!=null&&this.groupIds.has(Number(row.GroupId))){
          groupId=Number(row.GroupId);
        }else if(row.GroupId!=null){
          this.stats.groupNull++;
        }

        // Name = deduped _DisplayName (clears UNIQUE(ProjectId,Name))
        var name=row._DisplayName?this._trunc(row._DisplayName,200):"ללא שם";

        // RecruitmentTarget: (Price===0||null) -> null, else Math.round(Price)
        var price=row.Price;
        var recruitmentTarget=(price===0||price===null||price===undefined)?null:Math.round(price);

        parentRows.push({
          Id:sourceId,
          Name:name,
          ProjectId:Number(projectId),
          RecruiterGroupId:groupId,
          Phone:null,
          Email:null,
          RecruitmentTarget:recruitmentTarget,
          RecordStatus:2,
          StatusChangedAt:now,
          StatusChangedBy:-1,
          CreatedAt:now,
          CreatedBy:-1,
          UpdatedAt:now,
          UpdatedBy:-1
        });

        // RecruiterLocalization — original Name (clean), per-language fallback to Hebrew Name.
        // DisplayInSite from per-language Hide (0/null => visible).
        var heName=row.Name?this._trunc(row.Name,200):null;
        var enName=row.Name_en?this._trunc(row.Name_en,200):heName;
        var frName=row.Name_fr?this._trunc(row.Name_fr,200):heName;
        var locs=[
          {LanguageId:1,Name:heName,DisplayInSite:(row.Hide===0||row.Hide===null)?1:0},
          {LanguageId:2,Name:enName,DisplayInSite:(row.Hide_en===0||row.Hide_en===null)?1:0},
          {LanguageId:3,Name:frName,DisplayInSite:(row.Hide_fr===0||row.Hide_fr===null)?1:0}
        ];
        for(var lc of locs){
          langRows.push({
            RecruiterId:sourceId,
            LanguageId:lc.LanguageId,
            Name:lc.Name,
            Description:null,
            DisplayInSite:lc.DisplayInSite,
            CreatedAt:now,
            CreatedBy:-1,
            UpdatedAt:now,
            UpdatedBy:-1
          });
        }

        done.push(sourceId);

      }catch(err){
        this.counters.errors++;
        await recordError(this.runId,sourceId,"transform",err.message,{ProductStockId:sourceId,ProductId:row.ProductId,Name:row.Name},err.stack);
      }
    }

    if(done.length===0||this.dryRun) return;

    await bulkInsert("Recruiter",parentRows);
    if(langRows.length>0){await bulkInsert("RecruiterLocalization",langRows);this.stats.langRows+=langRows.length;}

    var mappingRows=[],statusRows=[];
    for(var sid of done){
      mappingRows.push([entityType,String(sid),String(sid),this.runId]);
      statusRows.push([this.runId,String(sid),"inserted",String(sid)]);
      this.counters.inserted++;
    }
    await this._bulkInsertTracking(mappingRows,statusRows);
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

  async _realignAutoIncrement(targetTable){
    try{
      var [maxRows]=await targetDb.query("SELECT MAX(`Id`) AS maxId FROM `"+targetTable+"`");
      var nextId=(maxRows&&maxRows[0]&&maxRows[0].maxId!=null)?Number(maxRows[0].maxId)+1:1;
      await targetDb.query("ALTER TABLE `"+targetTable+"` AUTO_INCREMENT = "+nextId);
      logger.info("AUTO_INCREMENT realigned",{table:targetTable,nextId:nextId});
    }catch(err){
      logger.error("Failed to realign AUTO_INCREMENT",{table:targetTable,error:err.message});
    }
  }

  // Mirrors RecruiterMapping.sourceQuery: ROW_NUMBER over (ProductId, normalized Name) so the
  // first member of a duplicate-name group keeps a clean name and the rest get "(2)"/"(3)" —
  // clearing the UNIQUE(ProjectId,Name) constraint without dropping rows.
  _getSourceQuery(){
    return "SELECT t.*, CASE WHEN t._rn = 1 THEN t._norm"
      +" ELSE LEFT(t._norm,190) + N' (' + CAST(t._rn AS nvarchar(10)) + N')' END AS _DisplayName"
      +" FROM (SELECT ps.*, LEFT(ISNULL(NULLIF(ps.Name,''),N'ללא שם'),200) AS _norm,"
      +" ROW_NUMBER() OVER (PARTITION BY ps.ProductId, LEFT(ISNULL(NULLIF(ps.Name,''),N'ללא שם'),200) ORDER BY ps.ProductStockId) AS _rn"
      +" FROM ProductStock ps WITH (NOLOCK)) t";
  }

  _trunc(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"");
    return s.length>max?s.substring(0,max):s;
  }
}

module.exports=RecruiterEngine;
