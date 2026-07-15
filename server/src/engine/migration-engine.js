const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const {processRow,processColumn,processLocalizations,LANG_IDS}=require("./row-processor");
const {insertRow,insertRowWithTracking,recordMapping,markRowProcessed,updateRow,recordError,findExistingId}=require("./batch-runner");
const {preloadFKCache,resolveFK}=require("./fk-resolver");
const {evaluateCondition,processGetDate}=require("./expression-eval");
const tracker=require("../services/tracker");
const legacyMapping=require("../services/legacy-mapping");
const migrationCheckpoint=require("../services/migration-checkpoint");
const logger=require("../logger");

class MigrationEngine extends EventEmitter{
  constructor(mapping,options){
    super();
    this.mapping=mapping;
    this.batchSize=(options&&options.batchSize)||500;
    this.totalLimit=(options&&options.totalLimit)||0;
    this.startMode=(options&&options.startMode)||"continue"; // continue | fresh | gapfill
    this.checkpointReporter=migrationCheckpoint.createReporter(mapping.filename||mapping.targetTable);
    this.gapfillExistingIds=null; // Set<number> of source ids already in the target (gapfill mode)
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.conditionSets={};
    this.parentMap=null; // lazy-loaded when mapping.parentProjectIdMapFile is set
  }

  requestPause(){this.pauseRequested=true;}

  // Load a frozen scope list (array of ids) from server/data for scopeFilter
  _loadScopeList(file){
    var fs=require("fs");
    var path=require("path");
    var fp=path.join(__dirname,"../../data",file);
    if(!fs.existsSync(fp)) throw new Error("scopeFilter list not found: "+fp+" (run scripts/migration/extract-scope-products.js)");
    var raw=JSON.parse(fs.readFileSync(fp,"utf8"));
    var ids=Array.isArray(raw)?raw:(raw.productIds||raw.ids||[]);
    return ids.map(Number).filter(function(x){return!isNaN(x)});
  }

  // gapfill: where to read "already migrated" source ids from. Precedence:
  // 1. LegacyMapping (per-MappingName, one row per source row — covers collapse mappings
  //    whose main table was never inserted). A row that failed AFTER its LegacyMapping
  //    insert would be silently skipped, but LegacyMapping is written with the item insert
  //    in the same row try/catch, so a partial row has no LegacyMapping entry.
  // 2. preserveSourceId: the target table's own ids (Id==sourceId).
  // 3. id_mappings by entityType (tracker approximation, survives for non-preserve mappings).
  _gapfillSourceQuery(m){
    if(m.legacyMapping){
      return {db:"target",sql:"SELECT SourceId AS id FROM LegacyMapping WHERE MappingName=?",params:[m.filename||m.targetTable]};
    }
    if(m.preserveSourceId){
      var idCol=m.targetIdColumn||"Id";
      return {db:"target",sql:"SELECT `"+idCol+"` AS id FROM `"+m.targetTable+"`",params:[]};
    }
    var entityType=m._meta&&m._meta.entityType||m.filename||m.targetTable;
    return {db:"tracker",sql:"SELECT source_id AS id FROM id_mappings WHERE entity_type=?",params:[entityType]};
  }

  async _loadGapfillSet(m){
    var src=this._gapfillSourceQuery(m);
    if(src.db==="target"&&m.legacyMapping) await legacyMapping.ensureTable();
    var db=src.db==="target"?targetDb:require("../db/mysql-tracker");
    var [rows]=await db.query(src.sql,src.params);
    var set=new Set(rows.map(function(r){return Number(r.id)}));
    logger.info("gapfill: existing source ids preloaded",{mapping:m.filename||m.targetTable,count:set.size,from:src.db==="target"?src.sql.split("FROM ")[1].split(" ")[0]:"id_mappings"});
    return set;
  }

  // Collapse mode with a per-row parent chosen OFFLINE: parentProjectIdMapFile names a JSON
  // snapshot in server/data ({map:{"<sourceId>":"<parentProjectId>"}}). Unlike
  // parentProjectIdColumn (JOIN-based), the map guarantees exactly one row per source id and
  // an ACTIVE parent (one that really has a Project), so no dup-row skips and no FK errors.
  _loadParentMap(file){
    var fs=require("fs");
    var path=require("path");
    var fp=path.join(__dirname,"../../data",file);
    if(!fs.existsSync(fp)) throw new Error("parentProjectIdMapFile not found: "+fp+" (run scripts/migration/extract-scope-type3.js)");
    var raw=JSON.parse(fs.readFileSync(fp,"utf8"));
    return raw.map||raw;
  }

  // Hebrew media values (image > video > null). Mirrored onto the main
  // Project/ProjectItem tables so the Hebrew settings appear "doubled" (table + Hebrew loc).
  // No numeric fallback: Media.Id=1 is a real (arbitrary) media row, not a placeholder —
  // falling back to it contaminated 162 projects (see COLLECTIONS_MIGRATION_SUMMARY.md).
  _hebrewMediaValues(mediaIdMap){
    var mainMedia=mediaIdMap["hebrew_projectImage"]||mediaIdMap["hebrew_projectVideo"]||null;
    var imageForLists=mediaIdMap["hebrew_projectImage"]||null;
    var banner=mediaIdMap["hebrew_donationBanner"]||null;
    return {mainMedia:mainMedia,imageForLists:imageForLists,banner:banner};
  }

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

      // Pre-migration runners (e.g. seed rows the mapping's inserts depend on, like the
      // Project-1 general bucket). Unlike postMigrationRunners these are PRECONDITIONS:
      // a failure aborts the run instead of being logged and swallowed. Runners must be
      // idempotent — the same runner is attached to several mappings and whichever runs
      // first does the work.
      if(m.preMigrationRunners&&Array.isArray(m.preMigrationRunners)){
        for(var preRunnerName of m.preMigrationRunners){
          logger.info("Running pre-migration runner",{runner:preRunnerName,mapping:m.filename});
          var preRunner=require("./pre-runners/"+preRunnerName);
          var preResult=await preRunner.run();
          logger.info("Pre-migration runner completed",{runner:preRunnerName,result:preResult});
        }
      }

      // LegacyMapping (app-facing legacy-id map on the TARGET DB): make sure the table
      // exists before any ProjectItem insert. Population is opt-in per mapping via
      // m.legacyMapping.sourceType (1=Product, 2=Prayer). Cleanup is delete-per-mapping
      // and lives ONLY in restartMigration (next to cleanupForRestart) — never here:
      // ordinary re-runs are gap-fills that would not re-insert deleted rows.
      if(m.legacyMapping){
        // Fail fast: MappingName comes from m.filename. Without it the record hook would
        // fall back to targetTable ("Project" for every product mapping) — the exact
        // cross-mapping collision LegacyMapping must avoid — and restart cleanup would
        // never find the rows. Better to abort the run than write orphaned rows.
        if(!m.filename) throw new Error("legacyMapping requires the mapping JSON to set \"filename\" (used as LegacyMapping.MappingName)");
        await legacyMapping.ensureTable();
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

      // Count source rows — combine mapping whereClause with optional scopeFilter (frozen product list)
      var effectiveWhere=m.whereClause||null;
      if(m.scopeFilter){
        var scopeIds=this._loadScopeList(m.scopeFilter.file);
        var scopeCond=scopeIds.length?(m.scopeFilter.column+" IN ("+scopeIds.join(",")+")"):"1=0";
        effectiveWhere=effectiveWhere?"("+effectiveWhere+") AND ("+scopeCond+")":scopeCond;
        logger.info("scopeFilter applied",{file:m.scopeFilter.file,column:m.scopeFilter.column,count:scopeIds.length});
      }
      var whereClause=effectiveWhere?" WHERE ("+effectiveWhere+")":"";
      // If totalLimit is set, wrap query to get only the last N rows by ID
      var limitWrap=this.totalLimit>0;
      var countSql;
      if(limitWrap){
        var innerSql=m.sourceQuery
          ?"WITH src AS ("+m.sourceQuery+") SELECT TOP "+this.totalLimit+" * FROM src"+whereClause+" ORDER BY "+sourceIdCol+" DESC"
          :"SELECT TOP "+this.totalLimit+" * FROM "+sourceTable+" WITH (NOLOCK)"+whereClause+" ORDER BY "+sourceIdCol+" DESC";
        countSql="SELECT COUNT(*) as cnt FROM ("+innerSql+") AS _limited";
      }else if(m.sourceQuery){
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
        // startMode (checkpoint feature): fresh deletes this mapping's checkpoint row HERE —
        // the single owner of the reset, so restartMigration, the pipeline orchestrator and
        // the UI all inherit it. continue seeds the keyset cursor from the checkpoint.
        // gapfill scans from 0 and skips ids already in the target. A checkpoint READ
        // failure or gapfill-set load failure aborts the run (throw) — silently starting
        // from 0 would duplicate rows on non-preserveSourceId mappings.
        if(this.startMode==="fresh"){
          await migrationCheckpoint.ensureTable();
          await migrationCheckpoint.resetForMapping(m.filename||targetTable);
        }else if(this.startMode==="continue"){
          await migrationCheckpoint.ensureTable();
          var cp=await migrationCheckpoint.get(m.filename||targetTable);
          if(cp&&cp.LastSourceId!=null) lastId=cp.LastSourceId;
          if(lastId!=null) logger.info("continue mode: seeding from checkpoint",{mapping:m.filename||targetTable,lastSourceId:lastId});
        }else if(this.startMode==="gapfill"){
          this.gapfillExistingIds=await this._loadGapfillSet(m);
        }
        this.runId=await tracker.createRun(m.filename||targetTable,sourceTable,targetTable,totalRows,this.batchSize);
      }
      await this.checkpointReporter.init(this.counters.inserted);

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:m.filename});
      logger.info("Migration started",{runId:this.runId,source:sourceTable,target:targetTable,total:totalRows});

      // Main batch loop
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          await this.checkpointReporter.batch(lastId,this.counters.inserted);
          this.emit("paused",{runId:this.runId,counters:this.counters,mapping:m.filename});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters};
        }

        // Fetch batch from source
        var whereExtra=lastId?" AND "+sourceIdCol+">"+lastId:"";
        var orderBy=" ORDER BY "+sourceIdCol+" ASC";
        var batchSql;
        if(limitWrap){
          // Subquery: get last N rows by descending ID, then paginate ascending from that subset
          var innerQ=m.sourceQuery
            ?"WITH src AS ("+m.sourceQuery+") SELECT TOP "+this.totalLimit+" * FROM src"+whereClause+" ORDER BY "+sourceIdCol+" DESC"
            :"SELECT TOP "+this.totalLimit+" * FROM "+sourceTable+" WITH (NOLOCK)"+whereClause+" ORDER BY "+sourceIdCol+" DESC";
          var limitWhere=lastId?" WHERE "+sourceIdCol+">"+lastId:"";
          batchSql="SELECT TOP "+this.batchSize+" * FROM ("+innerQ+") AS _limited"+limitWhere+orderBy;
        }else if(m.sourceQuery){
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

          // gapfill: skip rows already in the target (cheaper than the per-row tracker check)
          if(this.gapfillExistingIds&&this.gapfillExistingIds.has(Number(sourceId))){this.counters.skipped++;continue;}

          // Check if already processed
          var alreadyDone=await tracker.isRowProcessed(this.runId,sourceId);
          if(alreadyDone){this.counters.skipped++;continue;}

          try{
            // 1. Transform and insert main row
            // fixedParentProjectId — "collapse" mode: do NOT create a per-row parent (Project).
            // Instead attach the child items (projectItemMappings) to an existing parent row.
            // Used by PrayerMapping: every prayer becomes a ProjectItem under Project Id=1, with
            // no per-prayer Project/ProjectLocalization. Donation linkage is unaffected because
            // donations bind to ProjectItem (via ProjectItem_prayerName), never to Project.
            // Collapse mode also supports a PER-ROW parent: parentProjectIdColumn resolves the
            // parent ProjectId from a source column (e.g. ProductGroup.ParentProductId joined in via
            // sourceQuery), so each sub-product's items attach to its own campaign's Project instead
            // of a global constant. Project.Id == parent productsid (the parent ran with preserveSourceId).
            // parentProjectIdMapFile resolves the parent from an offline snapshot map instead
            // (one deterministic ACTIVE parent per sub — see _loadParentMap).
            var fixedParent=(m.fixedParentProjectId!==undefined&&m.fixedParentProjectId!==null)||!!m.parentProjectIdColumn||!!m.parentProjectIdMapFile;
            var newId;
            if(fixedParent){
              // No main-table INSERT, no Project id_mapping. newId is the parent ProjectId —
              // a constant (fixedParentProjectId), a per-row column (parentProjectIdColumn),
              // or an offline map lookup (parentProjectIdMapFile).
              if(m.parentProjectIdMapFile){
                if(!this.parentMap) this.parentMap=this._loadParentMap(m.parentProjectIdMapFile);
                newId=this.parentMap[String(sourceId)];
              }else{
                newId=m.parentProjectIdColumn?row[m.parentProjectIdColumn]:m.fixedParentProjectId;
              }
              if(newId===undefined||newId===null) throw new Error("collapse mode: parent ProjectId unresolved (sourceId="+sourceId+", parentProjectIdColumn="+m.parentProjectIdColumn+", parentProjectIdMapFile="+m.parentProjectIdMapFile+")");
              newId=Number(newId);
            }else{
              var targetRow=await processRow(m.columnMappings,row,m.fkMappings);
              var explicitId;
              if(m.preserveSourceId){
                // Insert with target Id == source Id so FKs need no translation.
                // id_mappings is still recorded (source==target) as a transitional bridge
                // for tables not yet converted to preserveSourceId.
                var idCol=m.targetIdColumn||"Id";
                targetRow[idCol]=sourceId;
                explicitId=sourceId;
              }
              newId=await this._insertMainRow(m,targetTable,targetRow,sourceId,entityType,explicitId);
            }
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
            // Skipped in collapse mode: the parent Project already exists; per-row
            // ProjectLocalization would create duplicate rows under the shared parent.
            if(m.localizationMappings&&!fixedParent){
              createdLangs=await this._processLocalizationsConditional(m,row,newId,sourceId);
            }

            // 5. Handle projectItemMappings
            // FIXED: Create LinkSettings per item and update ProjectItemLocalization per item
            if(m.projectItemMappings){
              for(var itemKey of Object.keys(m.projectItemMappings)){
                var itemMapping=m.projectItemMappings[itemKey];
                // Underscore-prefixed keys are per-item directives, not columns.
                // _localizationOverrides: constant values forced onto this item's
                // ProjectItemLocalization in every language (e.g. {"DisplayInSite":0} to hide it).
                var itemLocOverrides=itemMapping._localizationOverrides||null;
                var itemColMap={};
                for(var icol of Object.keys(itemMapping)){if(icol.charAt(0)!=="_")itemColMap[icol]=itemMapping[icol];}
                var itemRow=await processRow(itemColMap,row,m.fkMappings);
                itemRow.ProjectId=newId;
                // Hebrew media settings also live on the main ProjectItem table ("doubled" — always Hebrew)
                var itemHebMedia=m.mediaMappings?this._hebrewMediaValues(mediaIdMap):null;
                if(itemHebMedia){
                  itemRow.MainMedia=itemHebMedia.mainMedia;
                  itemRow.ImageForListsView=itemHebMedia.imageForLists;
                  if(itemHebMedia.banner){
                    itemRow.MediaForExecutePage=itemHebMedia.banner;
                    itemRow.MobileMediaForExecutePage=itemHebMedia.banner;
                  }
                }
                itemId=await insertRow("ProjectItem",itemRow);
                await recordMapping("ProjectItem_"+itemKey,sourceId,itemId,this.runId);

                // Also persist to LegacyMapping on the TARGET DB (app runtime lookup:
                // legacy productsid/prayerId -> ProjectId+ItemId). MappingName is the
                // mapping filename (== migration_runs.mapping_name) — NOT entityType,
                // which is "Project" for every product mapping. A failure here fails the
                // row like any other child insert — this table is app-critical.
                if(m.legacyMapping){
                  await legacyMapping.record(m.legacyMapping.sourceType,sourceId,newId,itemId,m.filename||targetTable);
                }

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
                    // Fill the Hebrew ProjectItemLocalization media (MainMedia/ImageForListsView were NULL)
                    if(itemHebMedia&&lang==="hebrew"){
                      pilRow.MainMedia=itemHebMedia.mainMedia;
                      pilRow.ImageForListsView=itemHebMedia.imageForLists;
                    }
                    // Per-item localization overrides (e.g. force DisplayInSite=0 to hide this item)
                    if(itemLocOverrides){for(var ovk of Object.keys(itemLocOverrides))pilRow[ovk]=itemLocOverrides[ovk];}
                    // Collapse mode: there is no per-row Project/ProjectLocalization to hold the rich
                    // content, so attach the EntityContent (built in step 3 from this row's Description)
                    // to THIS item's localization. In normal mode content goes to ProjectLocalization
                    // (see _postInsertUpdates), so this only fires for per-row-parent collapse (Type3_Subs).
                    if(fixedParent&&contentIdMap&&contentIdMap[lang]) pilRow.ContentId=contentIdMap[lang];
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

            // 11. Collapse mode: no main-table INSERT occurred (insertRowWithTracking was
            // skipped), so flag the source row processed — tag it with the created
            // ProjectItem id — to keep isRowProcessed()/resume working.
            if(fixedParent){
              await markRowProcessed(this.runId,sourceId,itemId||newId);
            }

          }catch(err){
            this.counters.errors++;
            await recordError(this.runId,sourceId,"transform",err.message,row,err.stack);
            logger.error("Row failed",{runId:this.runId,sourceId:sourceId,error:err.message});
          }

          // Emit progress every 10 rows
          if(this.counters.processed%10===0){
            this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,mapping:m.filename});
          }
        }

        // Update counters after each batch
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
        await this.checkpointReporter.batch(lastId,this.counters.inserted);
        if(rows.length<this.batchSize) hasMore=false;
      }

      // preserveSourceId: realign AUTO_INCREMENT so future app inserts continue past the
      // migrated IDs ("restore the identity"). MySQL usually auto-bumps on explicit insert,
      // but we set it explicitly to be safe (e.g. after deletes/ghost rows).
      if(m.preserveSourceId){
        try{
          var idColReset=m.targetIdColumn||"Id";
          var [maxRows]=await targetDb.query("SELECT MAX(`"+idColReset+"`) AS maxId FROM `"+targetTable+"`");
          var nextId=(maxRows&&maxRows[0]&&maxRows[0].maxId!=null)?Number(maxRows[0].maxId)+1:1;
          await targetDb.query("ALTER TABLE `"+targetTable+"` AUTO_INCREMENT = "+nextId);
          logger.info("AUTO_INCREMENT realigned",{table:targetTable,nextId:nextId});
        }catch(err){
          logger.error("Failed to realign AUTO_INCREMENT",{table:targetTable,error:err.message});
        }
      }

      // Post-migration runners (e.g. populate back-references that need all rows to exist first)
      if(m.postMigrationRunners&&Array.isArray(m.postMigrationRunners)){
        for(var runnerName of m.postMigrationRunners){
          try{
            logger.info("Running post-migration runner",{runner:runnerName,runId:this.runId});
            var runner=require("./post-runners/"+runnerName);
            var runnerResult=await runner.run();
            logger.info("Post-migration runner completed",{runner:runnerName,runId:this.runId,result:runnerResult});
          }catch(err){
            logger.error("Post-migration runner failed",{runner:runnerName,runId:this.runId,error:err.message,stack:err.stack});
            // Don't fail the main migration — post-runners are best-effort enrichment
          }
        }
      }

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      await this.checkpointReporter.complete();
      this.emit("completed",{runId:this.runId,counters:this.counters,mapping:m.filename});
      logger.info("Migration completed",{runId:this.runId,counters:this.counters});
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:m.filename});
      logger.error("Migration failed",{runId:this.runId,error:err.message});
      this.isRunning=false;
      throw err;
    }
  }

  // Insert the main target row, retrying with a uniqueness suffix when a column
  // declared in m.dedupColumns (e.g. CustomerUser.UserName, a UNIQUE constraint)
  // collides. The suffix derives from the globally-unique source Id, so a single
  // retry converges; the attempt counter is a defensive bound. The base value is
  // truncated to keep "<base>_<sourceId>" within m.dedupMaxLen (default 40 chars,
  // CustomerUser.UserName width). Only engages when dedupColumns is set, so other
  // mappings are unaffected.
  async _insertMainRow(m,targetTable,targetRow,sourceId,entityType,explicitId){
    var dedupCols=m.dedupColumns||[];
    var maxLen=m.dedupMaxLen||40;
    for(var attempt=0;;attempt++){
      try{
        return await insertRowWithTracking(targetTable,targetRow,this.runId,sourceId,entityType,explicitId);
      }catch(err){
        // Only resolve a duplicate on a declared dedup column whose UNIQUE index name
        // actually appears in the error message. Never mask a PRIMARY/other-constraint
        // collision — important since preserveSourceId inserts an explicit PK, so a
        // dirty re-run could raise ER_DUP_ENTRY on the Id, which must surface, not retry.
        var col=(err&&err.code==="ER_DUP_ENTRY"&&err.message)
          ?dedupCols.filter(function(c){return err.message.indexOf(c)!==-1;})[0]
          :null;
        if(col&&attempt<dedupCols.length+3){
          var suffix="_"+sourceId+(attempt>0?("_"+attempt):"");
          var base=targetRow[col]==null?"":String(targetRow[col]);
          var maxBase=Math.max(0,maxLen-suffix.length);
          targetRow[col]=base.substring(0,maxBase)+suffix;
          logger.warn("dedup suffix applied",{table:targetTable,column:col,sourceId:sourceId,newValue:targetRow[col]});
          continue;
        }
        throw err;
      }
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
        var jId=null;
        // lookupKey: check if record already exists before inserting
        if(aim.lookupKey){
          var lookupVal=junctionRow[aim.lookupKey];
          if(lookupVal!=null){
            jId=await findExistingId(targetTable,aim.lookupKey,lookupVal);
          }
        }
        if(!jId){
          jId=await insertRow(targetTable,junctionRow);
        }
        var entityLabel=aim.entityType||targetTable;
        await recordMapping(entityLabel,sourceId,jId,this.runId);
        // updateParentColumn: write child ID back to the parent record
        if(aim.updateParentColumn&&jId){
          var parentTable=m.targetTable;
          var updateData={};
          updateData[aim.updateParentColumn]=jId;
          await updateRow(parentTable,updateData,{Id:newId});
        }
      }
    }
  }

  // ======= Post-Insert UPDATEs =======
  async _postInsertUpdates(m,row,newId,itemId,mediaIdMap,contentIdMap,linkSettingIds,createdLangs){
    var langsToUpdate=createdLangs.length>0?createdLangs:["hebrew","english","french"];
    // Collapse mode: the parent (Project + ProjectLocalization) is shared/pre-existing and must
    // never be touched per-row. Skip ALL parent-level writes here — only the item-level updates
    // below (ProjectItemLocalization) are valid. Without this guard, a non-empty linkSettingIds
    // would overwrite the shared Project's localization (MainLinkButtonSettingId/MainMedia), and a
    // sub-product's media would overwrite the parent campaign Project's media.
    // Covers ALL collapse forms: a constant parent (fixedParentProjectId), a per-row parent
    // (parentProjectIdColumn) and an offline map (parentProjectIdMapFile) — must match the
    // main loop's fixedParent definition.
    var fixedParent=(m.fixedParentProjectId!==undefined&&m.fixedParentProjectId!==null)||!!m.parentProjectIdColumn||!!m.parentProjectIdMapFile;

    // Hebrew media settings also live on the main Project table ("doubled" — always Hebrew)
    if(m.mediaMappings&&!fixedParent){
      var projHebMedia=this._hebrewMediaValues(mediaIdMap);
      var projMediaSet={};
      if(projHebMedia.mainMedia) projMediaSet.MainMedia=projHebMedia.mainMedia;
      if(projHebMedia.imageForLists) projMediaSet.ImageForListsView=projHebMedia.imageForLists;
      if(Object.keys(projMediaSet).length>0) await updateRow(m.targetTable,projMediaSet,{Id:newId});
    }

    // ProjectLocalization updates
    if(m.localizationMappings&&!fixedParent&&(Object.keys(mediaIdMap).length>0||Object.keys(contentIdMap).length>0||Object.keys(linkSettingIds).length>0)){
      for(var lang of langsToUpdate){
        var langId=LANG_IDS[lang]||1;
        var setData={};

        // MainMedia: image > video > hebrew fallback > (none). No Media#1 default —
        // a missing image must stay NULL, not point at an arbitrary media row.
        var imgKey=lang+"_projectImage";
        var vidKey=lang+"_projectVideo";
        var mainMedia=mediaIdMap[imgKey]||mediaIdMap[vidKey];
        if(!mainMedia&&lang!=="hebrew"){
          mainMedia=mediaIdMap["hebrew_projectImage"]||mediaIdMap["hebrew_projectVideo"];
        }
        if(mainMedia) setData.MainMedia=mainMedia;

        // ImageForListsView: only images, not video
        var imageForLists=mediaIdMap[imgKey];
        if(!imageForLists&&lang!=="hebrew"){
          imageForLists=mediaIdMap["hebrew_projectImage"];
        }
        if(imageForLists) setData.ImageForListsView=imageForLists;

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
