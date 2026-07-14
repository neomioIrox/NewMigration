const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {bulkInsert,recordError}=require("./batch-runner");
const {processGetDate}=require("./expression-eval");
const tracker=require("../services/tracker");
const logger=require("../logger");

/**
 * RecruitersGroup Migration Engine (Bulk INSERT)
 *
 * Migrates RecruitersGroups (MSSQL) -> RecruitersGroup + RecruitersGroupLanguage (MySQL).
 *
 * Replaces the generic row-by-row MigrationEngine path (RecruitersGroupMapping.json) which
 * took ~hours: per row it ran isRowProcessed, a dedicated transaction, 2 tracker writes and
 * 3 localization inserts. This engine prepares a whole batch and issues a handful of bulk
 * INSERTs per batch (parent, language rows, id_mappings, row_status) — the same pattern as
 * the donation/prayname engines.
 *
 * Faithful to RecruitersGroupMapping.json:
 *   - preserveSourceId: RecruitersGroup.Id == RecruitersGroups.ID
 *   - ProjectId = COALESCE(rg.ProjectId, ProductStock.ProductId), resolved DIRECTLY because
 *     Project.Id == products.productsid (no id_mappings translation needed).
 *   - scope: only groups whose resolved ProjectId exists in the target Project table.
 *   - id_mappings entity_type "RecruitersGroupMapping" is still recorded (source==target) so
 *     Recruiter.RecruiterGroupId resolution and any other consumer keep working.
 */
class RecruitersGroupEngine extends EventEmitter{
  constructor(options){
    super();
    this.batchSize=(options&&options.batchSize)||1000;
    this.dryRun=(options&&options.dryRun)||false;
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.stats={fkMissing:0,alreadyExists:0,langRows:0};
    this.projectIds=null;       // Set of target Project.Id (scope + FK validation)
    this.existingIds=null;      // Set of RecruitersGroup.Id already in target (skip-existing)
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var sourceTable="RecruitersGroups";
    var targetTable="RecruitersGroup";
    var sourceIdCol="ID";
    // entity_type MUST match the generic engine's filename so downstream FK lookups
    // (Recruiter.RecruiterGroupId via "RecruitersGroupMapping") keep resolving.
    var entityType="RecruitersGroupMapping";

    try{
      // Preload target Project ids (live source of truth — == products.productsid).
      // Used both as the migration scope and to validate the FK before insert.
      var [projRows]=await targetDb.query("SELECT Id FROM Project");
      this.projectIds=new Set(projRows.map(function(r){return Number(r.Id)}).filter(function(n){return!isNaN(n)&&n>0}));
      logger.info("RecruitersGroup: target Project scope loaded",{count:this.projectIds.size});
      var scopeSql=this.projectIds.size?Array.from(this.projectIds).join(","):"0";

      // Preload existing RecruitersGroup ids for skip-existing (idempotent re-runs).
      var [existRows]=await targetDb.query("SELECT Id FROM RecruitersGroup");
      this.existingIds=new Set(existRows.map(function(r){return Number(r.Id)}));
      logger.info("RecruitersGroup: existing rows preloaded for skip",{count:this.existingIds.size});

      // Count source rows in scope
      var countSql="WITH src AS ("+this._getSourceQuery()+") SELECT COUNT(*) as cnt FROM src"
        +" WHERE ResolvedProjectId IS NOT NULL AND ResolvedProjectId IN ("+scopeSql+")";
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
        this.runId=await tracker.createRun("RecruitersGroupMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:"RecruitersGroupMapping"});
      logger.info("RecruitersGroup migration started",{runId:this.runId,total:totalRows,resumeFrom:lastId});

      // Main batch loop (keyset paginate on ID)
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          this.emit("paused",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"RecruitersGroupMapping"});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters,stats:this.stats};
        }

        var whereExtra=lastId?" AND ID>"+lastId:"";
        var batchSql="WITH src AS ("+this._getSourceQuery()+") SELECT TOP "+this.batchSize+" * FROM src"
          +" WHERE ResolvedProjectId IS NOT NULL AND ResolvedProjectId IN ("+scopeSql+")"+whereExtra
          +" ORDER BY ID ASC";
        var batchResult=await mssqlDb.query(batchSql);
        var rows=batchResult.recordset;
        if(!rows||rows.length===0){hasMore=false;break;}

        await this._processBatch(rows,sourceIdCol,entityType);

        lastId=rows[rows.length-1][sourceIdCol];
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"RecruitersGroupMapping"});

        if(rows.length<this.batchSize) hasMore=false;
      }

      // preserveSourceId: realign AUTO_INCREMENT so future app inserts continue past migrated ids
      if(!this.dryRun) await this._realignAutoIncrement(targetTable);

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      this.emit("completed",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"RecruitersGroupMapping"});
      logger.info("RecruitersGroup migration completed",{runId:this.runId,counters:this.counters,stats:this.stats});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters,stats:this.stats};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:"RecruitersGroupMapping"});
      logger.error("RecruitersGroup migration failed",{runId:this.runId,error:err.message,stack:err.stack});
      this.isRunning=false;
      throw err;
    }
  }

  async _processBatch(rows,sourceIdCol,entityType){
    var now=processGetDate();
    var parentRows=[];   // RecruitersGroup rows (explicit Id)
    var langRows=[];     // RecruitersGroupLanguage rows
    var done=[];         // sourceIds inserted this batch (for tracking)

    for(var row of rows){
      var sourceId=row[sourceIdCol];
      this.counters.processed++;

      try{
        // Skip rows already present in the target (gap-fill re-run)
        if(this.existingIds&&this.existingIds.has(Number(sourceId))){
          this.counters.skipped++;this.stats.alreadyExists++;continue;
        }

        var projectId=row.ResolvedProjectId;
        // Defensive: the IN-clause scope already restricts to existing Projects, but guard the FK
        if(projectId==null||!this.projectIds.has(Number(projectId))){
          this.counters.skipped++;this.stats.fkMissing++;continue;
        }

        var name=row.Name?this._trunc(row.Name,200):"ללא שם";

        parentRows.push({
          Id:sourceId,
          Name:name,
          ProjectId:Number(projectId),
          RecordStatus:2,
          StatusChangedAt:now,
          StatusChangedBy:-1,
          CreatedAt:now,
          CreatedBy:-1,
          UpdatedAt:now,
          UpdatedBy:-1
        });

        // RecruitersGroupLanguage: he/en/fr all use the source Name, DisplayInSite=1 (per mapping)
        var locName=row.Name?this._trunc(row.Name,200):null;
        for(var langId of [1,2,3]){
          langRows.push({
            RecruiterGroupId:sourceId,
            LanguageId:langId,
            Name:locName,
            Description:null,
            DisplayInSite:1,
            CreatedAt:now,
            CreatedBy:-1,
            UpdatedAt:now,
            UpdatedBy:-1
          });
        }

        done.push(sourceId);

      }catch(err){
        this.counters.errors++;
        await recordError(this.runId,sourceId,"transform",err.message,{ID:sourceId,ProjectId:row.ResolvedProjectId,Name:row.Name},err.stack);
      }
    }

    if(done.length===0||this.dryRun) return;

    // Bulk INSERT parent (explicit Id), then language rows
    await bulkInsert("RecruitersGroup",parentRows);
    if(langRows.length>0){await bulkInsert("RecruitersGroupLanguage",langRows);this.stats.langRows+=langRows.length;}

    // Bulk INSERT id_mappings + row_status. Id == sourceId (preserveSourceId).
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

  // Mirrors RecruitersGroupMapping.sourceQuery: OUTER APPLY pulls a ProductId from ProductStock
  // so groups without a direct ProjectId still resolve one via their member products.
  _getSourceQuery(){
    return "SELECT rg.*, COALESCE(rg.ProjectId, pstop.ProductId) AS ResolvedProjectId"
      +" FROM RecruitersGroups rg WITH (NOLOCK)"
      +" OUTER APPLY (SELECT TOP 1 ps.ProductId FROM ProductStock ps WITH (NOLOCK)"
      +" WHERE ps.GroupId = rg.ID AND ps.ProductId IS NOT NULL) pstop";
  }

  _trunc(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"");
    return s.length>max?s.substring(0,max):s;
  }
}

module.exports=RecruitersGroupEngine;
