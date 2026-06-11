const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {recordError}=require("./batch-runner");
const tracker=require("../services/tracker");
const logger=require("../logger");

/**
 * Video Gallery Migration Engine
 *
 * Migrates Videos (MSSQL) -> VideoGalleryMedia + Media + LinkSetting (MySQL).
 * Engine port of scripts/migration/migrate-video-gallery-media.js so the run
 * is available from the UI (mapping name: VideoGalleryMediaMapping).
 *
 * The app reads videos from VideoGalleryMedia (gallery/getVideoGalleryQuickView),
 * NOT from Gallery/GalleryMedia — see legacy/LESSONS_LEARNED.md.
 *
 * Per source video:
 *   1. INSERT LinkSetting (LinkType=3 ListItem, ProjectId=1 general fund — NOT NULL chain)
 *   2. INSERT Media per unique URL (deduped across the video's languages)
 *   3. INSERT VideoGalleryMedia per language, unless BOTH Name_X empty AND Hide_X=1
 *      - Title/Description fallback to Hebrew when per-language empty
 *      - URL fallback to Hebrew Link when Link_X invalid
 *
 * Idempotent: source ids already in id_mappings (VideoGallery_LinkSetting) are
 * skipped, so re-run/resume never duplicates.
 */
class VideoGalleryEngine extends EventEmitter{
  constructor(options){
    super();
    this.batchSize=(options&&options.batchSize)||500;
    this.dryRun=(options&&options.dryRun)||false;
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.stats={linkSettings:0,media:0,vgm:0,skippedLangs:0,perLang:{1:0,2:0,3:0},alreadyMigrated:0};
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var MAPPING="VideoGalleryMediaMapping";

    try{
      // Pre-flight: Project 1 must exist (LinkSetting.ProjectId NOT NULL)
      var [proj]=await targetDb.query("SELECT Id FROM Project WHERE Id = 1");
      if(!proj.length) throw new Error("Project.Id=1 not found — LinkSetting.ProjectId is NOT NULL");

      // Idempotency: skip videos already migrated
      var [doneRows]=await trackerDb.query(
        "SELECT source_id FROM id_mappings WHERE entity_type='VideoGallery_LinkSetting'");
      var doneSet=new Set(doneRows.map(function(r){return String(r.source_id);}));

      var countResult=await mssqlDb.query(
        "SELECT COUNT(*) AS cnt FROM Videos WHERE Link IS NOT NULL AND Link != ''");
      var totalRows=countResult.recordset[0].cnt;

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
        this.runId=await tracker.createRun(MAPPING,"Videos","VideoGalleryMedia",totalRows,this.batchSize);
      }

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:MAPPING});
      logger.info("VideoGallery migration started",{runId:this.runId,total:totalRows,dryRun:this.dryRun,alreadyDone:doneSet.size});

      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          this.emit("paused",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:MAPPING});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters,stats:this.stats};
        }

        var whereExtra=lastId?" AND VideosId > "+Number(lastId):"";
        var batchResult=await mssqlDb.query(
          "SELECT TOP "+this.batchSize+" VideosId, Name, Name_en, Name_fr,"
          +" Link, Link_en, Link_fr,"
          +" Description, Description_en, Description_fr,"
          +" Hide, Hide_en, Hide_fr, ShowHomePage, Sort"
          +" FROM Videos WHERE Link IS NOT NULL AND Link != ''"+whereExtra
          +" ORDER BY VideosId ASC");
        var rows=batchResult.recordset;
        if(!rows||rows.length===0){hasMore=false;break;}

        for(var v of rows){
          await this._processVideo(v,doneSet);
          lastId=v.VideosId;
        }

        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:MAPPING});

        if(rows.length<this.batchSize) hasMore=false;
      }

      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      this.emit("completed",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:MAPPING});
      logger.info("VideoGallery migration completed",{runId:this.runId,counters:this.counters,stats:this.stats});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters,stats:this.stats};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:MAPPING});
      logger.error("VideoGallery migration failed",{runId:this.runId,error:err.message,stack:err.stack});
      this.isRunning=false;
      throw err;
    }
  }

  async _processVideo(v,doneSet){
    var sourceId=v.VideosId;
    this.counters.processed++;

    if(doneSet.has(String(sourceId))){
      this.counters.skipped++;
      this.stats.alreadyMigrated++;
      return;
    }

    var now=new Date();
    var conn=this.dryRun?null:await targetDb.getConnection();
    try{
      if(conn) await conn.beginTransaction();

      // 1. LinkSetting — one per video
      var lsId=await this._insert(conn,"LinkSetting",{
        LinkType:3,            // ListItem
        LinkTargetType:1,      // ToProjectPage
        ProjectId:1,           // מגבית קופת העיר כללית
        ItemId:null,LinkText:null,MediaId:null,MobileMediaId:null,Description:null,
        DonationPagePaymentType:null,DonationPagePaymentSum:null,DonationPagePaymentCount:null,
        CreatedAt:now,CreatedBy:-1,UpdatedAt:now,UpdatedBy:-1
      });
      this.stats.linkSettings++;
      await this._recordMapping("VideoGallery_LinkSetting",sourceId,lsId);

      var displayInMain=(v.ShowHomePage===1)?1:0;
      var langs=[
        {id:1,label:"he",name:v.Name,desc:v.Description,link:v.Link,hide:v.Hide},
        {id:2,label:"en",name:v.Name_en,desc:v.Description_en,link:v.Link_en,hide:v.Hide_en},
        {id:3,label:"fr",name:v.Name_fr,desc:v.Description_fr,link:v.Link_fr,hide:v.Hide_fr}
      ];

      // Media dedup — same URL across this video's languages reuses one Media row
      var mediaByUrl={};

      for(var lang of langs){
        var hasName=lang.name&&String(lang.name).trim()!=="";
        // Skip only when both nameless AND hidden — nothing useful to store
        if(!hasName&&lang.hide===1){this.stats.skippedLangs++;continue;}

        var titleSource=hasName?lang.name:v.Name;
        // Description fallback chain: per-language desc -> Hebrew desc -> title.
        // The site FE renders `description` as the card text (not `title`), so an
        // empty Description means a blank card — fall back to the title.
        var hasDesc=lang.desc&&String(lang.desc).trim()!=="";
        var hebDesc=v.Description&&String(v.Description).trim()!=="";
        var descSource=hasDesc?lang.desc:(hebDesc?v.Description:titleSource);
        var url=this._isValidUrl(lang.link)?String(lang.link).trim():String(v.Link).trim();

        var mediaId=mediaByUrl[url];
        if(!mediaId){
          mediaId=await this._insert(conn,"Media",{
            YearDirectory:"legacy",MonthDirectory:"videoGallery",
            RelativePath:this._trunc(url,500),
            SourceType:1,          // Youtube/external embed — FE uses RelativePath directly
            MediaType:2,           // Video
            FriendlyName:this._clean(titleSource,100),
            MatchToPlatform:3,RecordStatus:2,
            StatusChangedAt:now,StatusChangedBy:-1,
            CreatedAt:now,CreatedBy:-1,UpdatedAt:now,UpdatedBy:-1
          });
          this.stats.media++;
          mediaByUrl[url]=mediaId;
          await this._recordMapping("VideoGallery_Media_"+lang.label,sourceId,mediaId);
        }

        var vgmId=await this._insert(conn,"VideoGalleryMedia",{
          LanguageId:lang.id,
          MediaId:mediaId,
          LinkSettingId:lsId,
          Title:this._clean(titleSource,200),
          Description:this._clean(descSource,500),
          DisplayInGallery:(lang.hide===0?1:0),
          DisplayInMainPage:displayInMain,
          RecordStatus:2,
          StatusChangedAt:now,StatusChangedBy:-1,
          CreatedAt:now,CreatedBy:-1,UpdatedAt:now,UpdatedBy:-1
        });
        this.stats.vgm++;
        this.stats.perLang[lang.id]++;
        this.counters.inserted++;
        await this._recordMapping("VideoGallery_VGM_"+lang.label,sourceId,vgmId);
      }

      if(conn) await conn.commit();
      doneSet.add(String(sourceId));

      if(!this.dryRun){
        await trackerDb.query(
          "INSERT INTO row_status (run_id,source_id,status,target_id) VALUES (?,?,?,?)"
          +" ON DUPLICATE KEY UPDATE status=VALUES(status),target_id=VALUES(target_id)",
          [this.runId,String(sourceId),"inserted",String(lsId)]);
      }
    }catch(err){
      if(conn) await conn.rollback();
      this.counters.errors++;
      logger.error("VideoGallery video failed",{sourceId:sourceId,error:err.message});
      await recordError(this.runId,sourceId,"video_insert",err.message,{VideosId:sourceId,Name:v.Name,Link:v.Link},err.stack);
    }finally{
      if(conn) conn.release();
    }
  }

  async _insert(conn,tableName,data){
    var cols=Object.keys(data);
    var placeholders=cols.map(function(){return"?"}).join(",");
    var vals=cols.map(function(c){return data[c]===undefined?null:data[c];});
    if(this.dryRun) return Math.floor(Math.random()*1000000);
    var sql="INSERT INTO `"+tableName+"` (`"+cols.join("`,`")+"`) VALUES ("+placeholders+")";
    var [result]=await conn.query(sql,vals);
    return result.insertId;
  }

  async _recordMapping(entityType,sourceId,targetId){
    if(this.dryRun) return;
    await trackerDb.query(
      "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES (?,?,?,?)"
      +" ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
      [entityType,String(sourceId),String(targetId),this.runId]);
  }

  _isValidUrl(v){
    if(!v) return false;
    var s=String(v).trim();
    return s!==""&&/^https?:\/\//i.test(s);
  }

  _trunc(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val);
    return s.length>max?s.substring(0,max):s;
  }

  _clean(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"");
    return this._trunc(s,max);
  }
}

module.exports=VideoGalleryEngine;
