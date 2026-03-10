const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const {processRow,processColumn,processLocalizations,LANG_IDS}=require("./row-processor");
const {insertRow,insertRowWithTracking,recordMapping,updateRow,recordError}=require("./batch-runner");
const {preloadFKCache,resolveFK}=require("./fk-resolver");
const {evaluateCondition,processGetDate}=require("./expression-eval");
const tracker=require("../services/tracker");
const logger=require("../logger");

class MigrationEngine extends EventEmitter{
  constructor(mapping,options){
    super();
    this.mapping=mapping;
    this.batchSize=(options&&options.batchSize)||500;
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.conditionSets={};
  }

  requestPause(){this.pauseRequested=true;}

  // Check if a language localization should be created for this row
  shouldCreateLang(lang,row,sourceId,m){
    if(lang==="hebrew") return true;
    if(!m.localizationConditions||!m.localizationConditions[lang]) return true;
    if(evaluateCondition(m.localizationConditions[lang],row)) return true;
    // Check preloaded condition sets (e.g. orders in that language)
    var setKey=lang==="french"?"hasFrenchOrders":"hasEnglishOrders";
    if(this.conditionSets[setKey]&&this.conditionSets[setKey].has(String(sourceId))) return true;
    return false;
  }

  async run(resumeRunId){
    var m=this.mapping;
    var sourceTable=m.sourceTable;
    var targetTable=m.targetTable;
    var sourceIdCol=m.sourceIdColumn||"ID";
    var entityType=m._meta&&m._meta.entityType||m.filename||targetTable;
    this.isRunning=true;
    this.pauseRequested=false;

    try{
      // Preload FK caches for dependencies
      if(m.fkMappings){
        for(var fkKey of Object.keys(m.fkMappings)){
          var fkVal=m.fkMappings[fkKey];
          if(typeof fkVal==="string"){
            await preloadFKCache(fkVal.replace(".json",""));
          }
        }
      }

      // Preload condition sets (e.g. orders by language)
      if(m.preloadConditionSets){
        for(var setKey of Object.keys(m.preloadConditionSets)){
          var setSql=m.preloadConditionSets[setKey];
          var setResult=await mssqlDb.query(setSql);
          this.conditionSets[setKey]=new Set(setResult.recordset.map(function(r){return String(r.id)}));
          logger.info("Preloaded condition set",{key:setKey,count:this.conditionSets[setKey].size});
        }
      }

      // Count source rows
      var whereClause=m.whereClause?" WHERE ("+m.whereClause+")":"";
      var countSql;
      if(m.sourceQuery){
        countSql="WITH src AS ("+m.sourceQuery+") SELECT COUNT(*) as cnt FROM src"+whereClause;
      }else{
        countSql="SELECT COUNT(*) as cnt FROM "+sourceTable+" WITH (NOLOCK)"+whereClause;
      }
      var countResult=await mssqlDb.query(countSql);
      var totalRows=countResult.recordset[0].cnt;

      // Create or resume run
      var lastId=null;
      if(resumeRunId){
        this.runId=resumeRunId;
        var existingRun=await tracker.getRun(resumeRunId);
        if(existingRun) lastId=existingRun.last_processed_source_id;
        await tracker.updateRunStatus(resumeRunId,"running");
      }else{
        this.runId=await tracker.createRun(m.filename||targetTable,sourceTable,targetTable,totalRows,this.batchSize);
      }

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:m.filename});
      logger.info("Migration started",{runId:this.runId,source:sourceTable,target:targetTable,total:totalRows});

      // Main batch loop
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          this.emit("paused",{runId:this.runId,counters:this.counters});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters};
        }

        // Fetch batch from source
        var whereExtra=lastId?" AND "+sourceIdCol+">"+lastId:"";
        var orderBy=" ORDER BY "+sourceIdCol+" ASC";
        var batchSql;
        if(m.sourceQuery){
          batchSql="WITH src AS ("+m.sourceQuery+") SELECT TOP "+this.batchSize+" * FROM src"+whereClause+(whereClause?whereExtra:(whereExtra?" WHERE 1=1"+whereExtra:""))+orderBy;
        }else{
          batchSql="SELECT TOP "+this.batchSize+" * FROM "+sourceTable+" WITH (NOLOCK)"+whereClause+(whereClause?whereExtra:(whereExtra?" WHERE 1=1"+whereExtra:""))+orderBy;
        }
        var batchResult=await mssqlDb.query(batchSql);
        var rows=batchResult.recordset;

        if(!rows||rows.length===0){hasMore=false;break;}

        // Process each row
        for(var row of rows){
          var sourceId=row[sourceIdCol];
          lastId=sourceId;
          this.counters.processed++;

          // Check if already processed
          var alreadyDone=await tracker.isRowProcessed(this.runId,sourceId);
          if(alreadyDone){this.counters.skipped++;continue;}

          try{
            // 1. Transform and insert main row
            var targetRow=await processRow(m.columnMappings,row,m.fkMappings);
            var newId=await insertRowWithTracking(targetTable,targetRow,this.runId,sourceId,entityType);
            this.counters.inserted++;

            // Track which languages were created
            var createdLangs=[];
            var mediaIdMap={};
            var contentIdMap={};
            var linkSettingIds={};
            var itemId=null;

            // 2. Process media mappings (before localization, so media IDs are available)
            if(m.mediaMappings){
              mediaIdMap=await this._processMedia(m,row,sourceId);
            }

            // 3. Process entity content mappings (Description → entitycontent + entitycontentitem)
            if(m.entityContentMappings){
              contentIdMap=await this._processEntityContent(m,row,sourceId);
            }

            // 4. Handle localizations (with conditional FR/EN)
            if(m.localizationMappings){
              createdLangs=await this._processLocalizationsConditional(m,row,newId,sourceId);
            }

            // 5. Handle projectItemMappings
            // FIXED: Create LinkSettings per item and update ProjectItemLocalization per item
            if(m.projectItemMappings){
              for(var itemKey of Object.keys(m.projectItemMappings)){
                var itemMapping=m.projectItemMappings[itemKey];
                var itemRow=await processRow(itemMapping,row,m.fkMappings);
                itemRow.ProjectId=newId;
                itemId=await insertRow("ProjectItem",itemRow);
                await recordMapping("ProjectItem_"+itemKey,sourceId,itemId,this.runId);

                // 5b. projectItemLocalizationMappings (with conditional FR/EN)
                if(m.projectItemLocalizationMappings){
                  for(var lang of ["hebrew","english","french"]){
                    if(!this.shouldCreateLang(lang,row,sourceId,m)) continue;
                    var langDefs=m.projectItemLocalizationMappings[lang];
                    if(!langDefs) continue;
                    var langId=LANG_IDS[lang]||1;
                    var pilRow={ItemId:itemId,Language:langId};
                    for(var fld of Object.keys(langDefs)){
                      var fd=langDefs[fld];
                      if(fd&&fd.convertType){
                        pilRow[fld]=await processColumn(fld,fd,row,m.fkMappings);
                      }
                    }
                    await insertRow("ProjectItemLocalization",pilRow);
                  }
                }

                // 5c. Create LinkSettings for THIS item (inside loop)
                if(m.linkSettingMappings){
                  var itemLinkSettingIds=await this._processLinkSettings(m,row,newId,itemId,sourceId,createdLangs);
                  // Merge into main linkSettingIds (for ProjectLocalization update)
                  Object.assign(linkSettingIds,itemLinkSettingIds);
                  // Update ProjectItemLocalization with footerButton for THIS item
                  await this._updateItemLocalizationLinks(itemId,itemLinkSettingIds,createdLangs);
                }
              }
            }

            // 6. LinkSetting processing - only if no projectItemMappings (backward compat)
            if(m.linkSettingMappings&&!m.projectItemMappings&&itemId){
              linkSettingIds=await this._processLinkSettings(m,row,newId,itemId,sourceId,createdLangs);
            }

            // 7. EntityMedia processing (video associations)
            if(m.entityMediaMappings){
              await this._processEntityMedia(m,row,newId,mediaIdMap,createdLangs,sourceId);
            }

            // 8. Post-insert UPDATEs for FK back-references
            await this._postInsertUpdates(m,row,newId,itemId,mediaIdMap,contentIdMap,linkSettingIds,createdLangs);

            // 9. Translation mappings (for LutFundCategory etc.)
            if(m.translationMappings){
              await this._processTranslations(m,row,newId);
            }

            // 10. After-insert junction/link table records
            if(m.afterInsertMappings){
              await this._processAfterInsertMappings(m,row,newId,mediaIdMap,sourceId);
            }

          }catch(err){
            this.counters.errors++;
            await recordError(this.runId,sourceId,"transform",err.message,row,err.stack);
            logger.error("Row failed",{runId:this.runId,sourceId:sourceId,error:err.message});
          }

          // Emit progress every 10 rows
          if(this.counters.processed%10===0){
            this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows});
          }
        }

        // Update counters after each batch
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        if(rows.length<this.batchSize) hasMore=false;
      }

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      this.emit("completed",{runId:this.runId,counters:this.counters});
      logger.info("Migration completed",{runId:this.runId,counters:this.counters});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message});
      logger.error("Migration failed",{runId:this.runId,error:err.message});
      this.isRunning=false;
      throw err;
    }
  }

  // ======= Media Processing =======
  async _processMedia(m,row,sourceId){
    var mediaIdMap={};
    var langs=Object.keys(m.mediaMappings);
    for(var lang of langs){
      var langMediaDefs=m.mediaMappings[lang];
      var mediaKeys=Object.keys(langMediaDefs);
      for(var mediaKey of mediaKeys){
        var mediaDef=langMediaDefs[mediaKey];
        // Check condition
        if(mediaDef.condition&&!evaluateCondition(mediaDef.condition,row)) continue;
        // Build media row from column defs (skip 'condition' key)
        var mediaRow={};
        var colKeys=Object.keys(mediaDef);
        for(var ck of colKeys){
          if(ck==="condition") continue;
          var cd=mediaDef[ck];
          if(cd&&typeof cd==="object"&&cd.convertType){
            mediaRow[ck]=await processColumn(ck,cd,row,m.fkMappings);
          }else if(typeof cd!=="object"){
            // Direct value assignment (legacy format: "value": "2")
            mediaRow[ck]=cd;
          }
        }
        var mediaId=await insertRow("Media",mediaRow);
        var mapKey=lang+"_"+mediaKey;
        mediaIdMap[mapKey]=mediaId;
        await recordMapping("Media_"+mapKey,sourceId,mediaId,this.runId);
      }
    }
    return mediaIdMap;
  }

  // ======= EntityContent Processing =======
  async _processEntityContent(m,row,sourceId){
    var contentIdMap={};
    var now=processGetDate();
    var langs=Object.keys(m.entityContentMappings);
    for(var lang of langs){
      if(!this.shouldCreateLang(lang,row,sourceId,m)) continue;
      var ecDef=m.entityContentMappings[lang];
      var sourceCol=ecDef.sourceColumn;
      var description=row[sourceCol];
      if(!description||String(description).trim()==="") continue;
      var descText=String(description);
      // URL replacement if needed
      if(ecDef.urlReplace){
        descText=descText.replace(/href\s*=\s*["'][^"']*["']/gi,function(match){
          return 'routerLink="/donate"';
        });
      }
      // Insert entitycontent
      var contentId=await insertRow("EntityContent",{
        Name:null,
        IsTemplate:0,
        CreatedAt:now,
        CreatedBy:1
      });
      // Insert entitycontentitem
      await insertRow("EntityContentItem",{
        ContentId:contentId,
        ItemType:11,
        ItemDefinition:JSON.stringify({Text:descText}),
        Name:null,
        CreatedAt:now,
        CreatedBy:1,
        UpdatedAt:now,
        UpdatedBy:1
      });
      contentIdMap[lang]=contentId;
      await recordMapping("EntityContent_"+lang,sourceId,contentId,this.runId);
    }
    return contentIdMap;
  }

  // ======= Conditional Localization =======
  async _processLocalizationsConditional(m,row,newId,sourceId){
    var createdLangs=[];
    var locRows=await processLocalizations(m.localizationMappings,row,newId,m.fkMappings);
    for(var lr of locRows){
      // Determine language from LanguageId
      var langId=lr.data.Language;
      var lang=langId===1?"hebrew":langId===2?"english":"french";
      // Check conditional creation
      if(!this.shouldCreateLang(lang,row,sourceId,m)) continue;
      await insertRow(lr.targetTable,lr.data);
      createdLangs.push(lang);
    }
    return createdLangs;
  }

  // ======= LinkSetting Processing =======
  async _processLinkSettings(m,row,newId,itemId,sourceId,createdLangs){
    var linkSettingIds={};
    var now=processGetDate();
    var buttonTypes=Object.keys(m.linkSettingMappings);
    for(var btnType of buttonTypes){
      var btnDef=m.linkSettingMappings[btnType];
      // Check if this button type should have no ItemId (e.g., listViewButton)
      var noItemId=btnDef._noItemId===true;
      for(var lang of ["hebrew","english","french"]){
        if(!btnDef[lang]) continue;
        if(createdLangs.length>0&&createdLangs.indexOf(lang)===-1) continue;
        var langDef=btnDef[lang];
        var linkText=langDef.LinkTextColumn?row[langDef.LinkTextColumn]:langDef.LinkText;
        if(linkText&&linkText.length>200) linkText=linkText.substring(0,200);
        var lsData={
          LinkType:langDef.LinkType,
          LinkTargetType:langDef.LinkTargetType,
          ProjectId:newId,
          ItemId:noItemId?null:itemId,
          LinkText:linkText||null,
          CreatedAt:now,
          CreatedBy:-1,
          UpdatedAt:now,
          UpdatedBy:-1
        };
        var linkId=await insertRow("LinkSetting",lsData);
        linkSettingIds[btnType+"_"+lang]=linkId;
        await recordMapping("LinkSetting_"+btnType+"_"+lang,sourceId,linkId,this.runId);
      }
    }
    return linkSettingIds;
  }

  // ======= EntityMedia Processing =======
  async _processEntityMedia(m,row,newId,mediaIdMap,createdLangs,sourceId){
    var now=processGetDate();
    var langs=Object.keys(m.entityMediaMappings);
    for(var lang of langs){
      if(createdLangs.length>0&&createdLangs.indexOf(lang)===-1) continue;
      var emDef=m.entityMediaMappings[lang];
      if(emDef.condition&&!evaluateCondition(emDef.condition,row)) continue;
      var videoMediaId=mediaIdMap[lang+"_"+emDef.mediaType];
      if(!videoMediaId) continue;
      var langId=LANG_IDS[lang]||1;
      var emId=await insertRow("EntityMedia",{
        EntityType:emDef.EntityType,
        EntityId:newId,
        Language:langId,
        MediaId:videoMediaId,
        CreatedAt:now,
        CreatedBy:-1,
        UpdatedAt:now,
        UpdatedBy:-1
      });
      await recordMapping("EntityMedia_"+lang,sourceId,emId,this.runId);
    }
  }

  // ======= After-Insert Junction/Link Table Records =======
  async _processAfterInsertMappings(m,row,newId,mediaIdMap,sourceId){
    var now=processGetDate();
    for(var aim of m.afterInsertMappings){
      var targetTable=aim.targetTable;
      var junctionRow={};
      for(var colName of Object.keys(aim.columns)){
        var colDef=aim.columns[colName];
        if(colDef.source==="newId"){
          junctionRow[colName]=newId;
        }else if(colDef.source==="mediaIdMap"){
          var mediaId=mediaIdMap[colDef.key];
          if(!mediaId) break; // skip junction if media wasn't created
          junctionRow[colName]=mediaId;
        }else if(colDef.source==="fk_lookup"){
          var lookupResult=await resolveFK(colDef.entityType,row[colDef.oldColumn]);
          if(!lookupResult){
            logger.warn("afterInsert FK lookup failed",{entityType:colDef.entityType,sourceVal:row[colDef.oldColumn]});
            break;
          }
          junctionRow[colName]=lookupResult;
        }else if(colDef.convertType==="const"){
          var val=colDef.value;
          if(val==="GETDATE()")val=now;
          else if(typeof val==="string"&&val.trim()!==""&&!isNaN(val))val=Number(val);
          junctionRow[colName]=val;
        }else if(colDef.convertType==="expression"){
          junctionRow[colName]=await processColumn(colName,colDef,row,m.fkMappings);
        }else if(colDef.convertType==="direct"){
          junctionRow[colName]=row[colDef.oldColumn];
        }
      }
      // Only insert if all columns were resolved (no break)
      if(Object.keys(junctionRow).length===Object.keys(aim.columns).length){
        var jId=await insertRow(targetTable,junctionRow);
        var entityLabel=aim.entityType||targetTable;
        await recordMapping(entityLabel,sourceId,jId,this.runId);
      }
    }
  }

  // ======= Post-Insert UPDATEs =======
  async _postInsertUpdates(m,row,newId,itemId,mediaIdMap,contentIdMap,linkSettingIds,createdLangs){
    var langsToUpdate=createdLangs.length>0?createdLangs:["hebrew","english","french"];

    // ProjectLocalization updates
    if(m.localizationMappings&&(Object.keys(mediaIdMap).length>0||Object.keys(contentIdMap).length>0||Object.keys(linkSettingIds).length>0)){
      for(var lang of langsToUpdate){
        var langId=LANG_IDS[lang]||1;
        var setData={};

        // MainMedia: image > video > hebrew fallback > default(1)
        var imgKey=lang+"_projectImage";
        var vidKey=lang+"_projectVideo";
        var mainMedia=mediaIdMap[imgKey]||mediaIdMap[vidKey];
        if(!mainMedia&&lang!=="hebrew"){
          mainMedia=mediaIdMap["hebrew_projectImage"]||mediaIdMap["hebrew_projectVideo"];
        }
        if(!mainMedia) mainMedia=1;
        setData.MainMedia=mainMedia;

        // ImageForListsView: only images, not video
        var imageForLists=mediaIdMap[imgKey];
        if(!imageForLists&&lang!=="hebrew"){
          imageForLists=mediaIdMap["hebrew_projectImage"];
        }
        if(!imageForLists) imageForLists=1;
        setData.ImageForListsView=imageForLists;

        // MainLinkButtonSettingId
        var mainLinkId=linkSettingIds["mainButton_"+lang];
        if(mainLinkId) setData.MainLinkButtonSettingId=mainLinkId;

        // LinkSettingIdInListView (listViewButton has _noItemId, links to project page)
        var listViewLinkId=linkSettingIds["listViewButton_"+lang];
        if(listViewLinkId) setData.LinkSettingIdInListView=listViewLinkId;

        // ContentId
        if(contentIdMap[lang]) setData.ContentId=contentIdMap[lang];

        if(Object.keys(setData).length>0){
          await updateRow("ProjectLocalization",setData,{ProjectId:newId,Language:langId});
        }
      }
    }

    // ProjectItemLocalization updates - ONLY media, LinkSettings are handled per-item in loop
    if(itemId&&Object.keys(mediaIdMap).length>0){
      for(var lang of langsToUpdate){
        var langId=LANG_IDS[lang]||1;
        var setData={};

        // MediaForExecutePage: donation banner for this language
        var bannerKey=lang+"_donationBanner";
        var bannerId=mediaIdMap[bannerKey];
        if(!bannerId&&lang!=="hebrew") bannerId=mediaIdMap["hebrew_donationBanner"];
        if(bannerId){
          setData.MediaForExecutePage=bannerId;
          setData.MobileMediaForExecutePage=bannerId;
        }

        // NOTE: ProjectFooterLinkSettingId is now updated per-item in _updateItemLocalizationLinks

        if(Object.keys(setData).length>0){
          await updateRow("ProjectItemLocalization",setData,{ItemId:itemId,Language:langId});
        }
      }
    }
  }

  // ======= Update ProjectItemLocalization with LinkSetting IDs (per item) =======
  async _updateItemLocalizationLinks(itemId,linkSettingIds,createdLangs){
    var langsToUpdate=createdLangs.length>0?createdLangs:["hebrew","english","french"];
    for(var lang of langsToUpdate){
      var langId=LANG_IDS[lang]||1;
      var setData={};
      // MainButtonLinkSettingId for item
      var mainBtnId=linkSettingIds["mainButton_"+lang];
      if(mainBtnId) setData.MainButtonLinkSettingId=mainBtnId;
      // ProjectFooterLinkSettingId for item
      var footerLinkId=linkSettingIds["footerButton_"+lang];
      if(footerLinkId) setData.ProjectFooterLinkSettingId=footerLinkId;
      if(Object.keys(setData).length>0){
        await updateRow("ProjectItemLocalization",setData,{ItemId:itemId,Language:langId});
      }
    }
  }

  // ======= Translation Mappings (for LutFundCategory etc.) =======
  async _processTranslations(m,row,newId){
    var now=processGetDate();
    for(var tDef of m.translationMappings){
      // Check condition
      if(tDef.condition&&!evaluateCondition(tDef.condition,row)) continue;
      var transValue=row[tDef.sourceColumn];
      if(!transValue||String(transValue).trim()==="") continue;
      await insertRow("Translations",{
        TableName:tDef.tableName,
        FieldName:tDef.fieldName,
        RecordId:newId,
        Language:tDef.language,
        Translation:String(transValue).substring(0,4000),
        CreatedAt:now,
        CreatedBy:-1,
        UpdatedAt:now,
        UpdatedBy:-1
      });
    }
  }
}

module.exports=MigrationEngine;
