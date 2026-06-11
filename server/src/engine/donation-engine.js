const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {recordError}=require("./batch-runner");
const {preloadFKCache}=require("./fk-resolver");
const {processGetDate}=require("./expression-eval");
const tracker=require("../services/tracker");
const logger=require("../logger");

// Donation scope cutoff — single source of truth: the SAME file that freezes the product
// scope (scope-products.json was built from "OrderFinished AND DateCreated >= cutoff").
// The cutoff decides WHICH PROJECTS exist. Donations linked to an existing project/prayer
// migrate ALL-TIME; the cutoff applies only to general (no-project) donations. See run().
const donationScope=require("../../data/scope-products.json");
const SCOPE_CUTOFF=(donationScope&&donationScope.cutoff)?String(donationScope.cutoff):"2025-06-01";
if(!/^\d{4}-\d{2}-\d{2}$/.test(SCOPE_CUTOFF)) throw new Error("Invalid donation scope cutoff: "+SCOPE_CUTOFF);

/**
 * Donation Migration Engine (Optimized - Bulk INSERT)
 *
 * Migrates Orders (MSSQL) -> donation + donationcurrencyvalue + address (MySQL)
 *
 * Performance: ~6 bulk queries per batch instead of ~5 queries per row
 */
class DonationEngine extends EventEmitter{
  constructor(options){
    super();
    this.batchSize=(options&&options.batchSize)||1000;
    this.dryRun=(options&&options.dryRun)||false;
    this.runId=null;
    this.pauseRequested=false;
    this.isRunning=false;
    this.counters={processed:0,inserted:0,skipped:0,errors:0};
    this.stats={
      addressesCreated:0,
      currencyValuesInserted:0,
      actionLogsInserted:0,
      itemIdStats:{fromPrayer:0,fromProduct:0,fromProductMultiChoice:0,orphaned:0}
    };
    // FK caches
    this.projectItemFundsCache=null;
    this.projectItemCertCache=null;
    this.projectItemDonationCache=null;
    this.projectItemPrayerCache=null;
    this.userIdCache=null;
    this.recruiterIdCache=null;
    // ClearingMethodArea cache (DB lookup results)
    this.clearingMethodAreaCache=new Map();
    // Source attribution: normalized SourceCode -> Source.Id (lowest Id wins on duplicate codes)
    this.sourceCodeCache=new Map();
    // Warn dedup - only warn once per ProjectId/PrayerId
    this._warnedProjectIds=new Set();
    this._warnedPrayerIds=new Set();
    // Orphan tracking: donations that HAVE a Project/Prayer reference that didn't resolve to
    // a migrated ProjectItem. They still migrate (ItemId=1), but are logged for audit (Excel).
    this.orphanTracking=[];
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var sourceTable="Orders";
    var targetTable="Donation";
    var sourceIdCol="OrdersId";
    var entityType="Donation";

    try{
      // ========================================
      // STEP 0a: Remove AUTO_INCREMENT from Donation table (ID preservation)
      // ========================================
      logger.info("Dropping FKs referencing Donation.Id before removing AUTO_INCREMENT");
      try{await targetDb.query("ALTER TABLE `DonationActionLog` DROP FOREIGN KEY `FK_DonationActionLog_DI_Donation`");}catch(e){logger.info("FK_DonationActionLog_DI_Donation already dropped");}
      try{await targetDb.query("ALTER TABLE `DonationCurrencyValue` DROP FOREIGN KEY `FK_DonationCurrencyValue_DI_Donation`");}catch(e){logger.info("FK_DonationCurrencyValue_DI_Donation already dropped");}
      logger.info("FKs dropped");

      logger.info("Removing AUTO_INCREMENT from Donation table for ID preservation");
      await targetDb.query("ALTER TABLE `Donation` MODIFY COLUMN `Id` int NOT NULL");
      logger.info("AUTO_INCREMENT removed from Donation table");

      // ========================================
      // STEP 0b: Preload FK Caches
      // ========================================
      logger.info("Loading FK caches for donation migration");

      this.projectItemFundsCache=await preloadFKCache("ProjectItem_funds");
      logger.info("ProjectItem_funds cache: "+this.projectItemFundsCache.size+" entries");

      this.projectItemCertCache=await preloadFKCache("ProjectItem_certificate");
      logger.info("ProjectItem_certificate cache: "+this.projectItemCertCache.size+" entries");

      this.projectItemDonationCache=await preloadFKCache("ProjectItem_donation");
      logger.info("ProjectItem_donation cache: "+this.projectItemDonationCache.size+" entries");

      this.projectItemPrayerCache=await preloadFKCache("ProjectItem_prayerName");
      logger.info("ProjectItem_prayerName cache: "+this.projectItemPrayerCache.size+" entries");

      this.userIdCache=await preloadFKCache("CustomerUser");
      logger.info("CustomerUser cache: "+this.userIdCache.size+" entries"+(this.userIdCache.size===0?" (WARNING: CustomerUser not yet migrated!)":""));

      this.recruiterIdCache=await preloadFKCache("RecruiterMapping");
      logger.info("RecruiterMapping cache: "+this.recruiterIdCache.size+" entries");

      // Preload ALL ClearingMethodArea combos (small table)
      await this._preloadClearingMethodAreas();

      // Preload Source codes for donation source attribution (SourceType/SourceId)
      await this._preloadSourceCodes();

      // ========================================
      // STEP 1: Count source rows
      // Scope rule (corrected 2026-06-10): a completed donation migrates if
      //   (a) its ProjectId exists in the TARGET DB (Project.Id==productsid, plus Type3 sub
      //       products whose items live under their parent campaign Project) — ALL TIME; or
      //   (b) its PrayerId is a migrated prayer (ProjectItem_prayerName) — ALL TIME; or
      //   (c) it is recent (DateCreated >= cutoff) — keeps general donations (no project)
      //       and recent leftovers on the previous behavior.
      // The cutoff decides WHICH PROJECTS exist; once a project exists, ALL its donations come.
      // ========================================
      var [projRows]=await targetDb.query("SELECT Id FROM Project");
      var scopePids=projRows.map(function(r){return Number(r.Id)}).filter(function(n){return!isNaN(n)&&n>0});
      try{
        var subList=require("../../data/type3-subs.json").productIds||[];
        for(var sp of subList){sp=Number(sp);if(!isNaN(sp)&&sp>0)scopePids.push(sp);}
      }catch(e){logger.info("type3-subs.json not found - donation scope uses target Projects only");}
      scopePids=Array.from(new Set(scopePids));
      var prayerPids=Array.from(this.projectItemPrayerCache.keys()).map(Number).filter(function(n){return!isNaN(n)&&n>0});
      var whereClause=" WHERE ChargeStatus = 'OrderFinished' AND ("
        +"ProjectId IN ("+(scopePids.length?scopePids.join(","):"0")+")"
        +(prayerPids.length?" OR PrayerId IN ("+prayerPids.join(",")+")":"")
        +" OR DateCreated >= '"+SCOPE_CUTOFF+"')";
      logger.info("Donation scope",{projectsAndSubs:scopePids.length,prayers:prayerPids.length,cutoffForGenerals:SCOPE_CUTOFF});

      // Skip-existing: re-runs only fill the gap. Donation.Id==OrdersId (preserveSourceId),
      // so rows already in the target are filtered out before processing. On a fresh/empty
      // target this set is empty and everything migrates.
      var [existRows]=await targetDb.query("SELECT Id FROM Donation");
      this.existingDonationIds=new Set(existRows.map(function(r){return Number(r.Id)}));
      logger.info("Existing donations preloaded for skip",{count:this.existingDonationIds.size});
      var countSql="SELECT COUNT(*) as cnt FROM "+sourceTable+" WITH (NOLOCK)"+whereClause;
      var countResult=await mssqlDb.query(countSql);
      var totalRows=countResult.recordset[0].cnt;

      // ========================================
      // STEP 2: Create or resume run
      // ========================================
      var lastId=null;
      if(resumeRunId){
        this.runId=resumeRunId;
        var existingRun=await tracker.getRun(resumeRunId);
        if(existingRun){
          lastId=existingRun.last_processed_source_id;
          // Restore counters from previous run
          this.counters.processed=existingRun.processed_rows||0;
          this.counters.inserted=existingRun.inserted_rows||0;
          this.counters.skipped=existingRun.skipped_rows||0;
          this.counters.errors=existingRun.error_rows||0;
        }
        await tracker.updateRunStatus(resumeRunId,"running");
      }else{
        this.runId=await tracker.createRun("DonationMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }

      this.emit("started",{runId:this.runId,totalRows:totalRows,mapping:"DonationMapping"});
      logger.info("Donation migration started",{runId:this.runId,total:totalRows,resumeFrom:lastId});

      // ========================================
      // STEP 3: Main batch loop (BULK)
      // ========================================
      var hasMore=true;
      while(hasMore){
        if(this.pauseRequested){
          await tracker.updateRunStatus(this.runId,"paused",{last_processed_source_id:lastId});
          await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
          this.emit("paused",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"DonationMapping"});
          this.isRunning=false;
          return {status:"paused",runId:this.runId,counters:this.counters,stats:this.stats};
        }

        // Fetch batch from source
        var whereExtra=lastId?" AND "+sourceIdCol+">"+lastId:"";
        var batchSql="SELECT TOP "+this.batchSize+" "+this._getSelectColumns()
          +" FROM "+sourceTable+" WITH (NOLOCK)"
          +whereClause+whereExtra
          +" ORDER BY "+sourceIdCol+" ASC";

        var batchResult=await mssqlDb.query(batchSql);
        var rows=batchResult.recordset;
        if(!rows||rows.length===0){hasMore=false;break;}

        // Skip donations already in the target (gap-fill re-run); fresh target -> no-op
        var newRows=rows;
        if(this.existingDonationIds&&this.existingDonationIds.size>0){
          newRows=rows.filter(function(r){return!this.existingDonationIds.has(Number(r[sourceIdCol]))}.bind(this));
          var skippedNow=rows.length-newRows.length;
          if(skippedNow>0){this.counters.processed+=skippedNow;this.counters.skipped+=skippedNow;}
        }

        // Process entire batch with bulk inserts
        if(newRows.length>0) await this._processBatch(newRows,sourceIdCol);

        lastId=rows[rows.length-1][sourceIdCol];

        // Update counters after each batch
        await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);

        // Emit progress after each batch
        this.emit("progress",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"DonationMapping"});

        if(rows.length<this.batchSize) hasMore=false;
      }

      // Completed
      await tracker.updateRunStatus(this.runId,"completed");
      await tracker.updateRunCounters(this.runId,this.counters.processed,this.counters.inserted,this.counters.skipped,this.counters.errors,lastId);
      this.emit("completed",{runId:this.runId,counters:this.counters,totalRows:totalRows,stats:this.stats,mapping:"DonationMapping"});
      logger.info("Donation migration completed",{runId:this.runId,counters:this.counters,stats:this.stats});

      // Write orphan-donations audit report (donations whose project/prayer ref didn't resolve)
      this._writeOrphanReport();

      // Restore AUTO_INCREMENT on Donation table
      await this._restoreAutoIncrement();

      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters,stats:this.stats};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:"DonationMapping"});
      logger.error("Donation migration failed",{runId:this.runId,error:err.message});
      // Restore AUTO_INCREMENT even on failure
      try{await this._restoreAutoIncrement();}catch(e){logger.error("Failed to restore AUTO_INCREMENT: "+e.message);}
      this.isRunning=false;
      throw err;
    }
  }

  // ============================================
  // Process entire batch with bulk inserts
  // ============================================
  async _processBatch(rows,sourceIdCol){
    var now=processGetDate();

    // Phase 1: Transform all rows (sync) and collect addresses
    var prepared=[];       // {sourceId, order, donationData, billingAddr, shippingAddr, cvRows}
    var addressRows=[];    // All addresses to bulk insert
    var addressIndex=[];   // Maps each address back to its prepared entry + type

    for(var row of rows){
      var sourceId=row[sourceIdCol];
      this.counters.processed++;

      try{
        var itemId=this._determineItemId(row);
        // Orphan audit: a Project/Prayer reference existed but didn't resolve -> goes to ItemId=1.
        if(itemId===1&&((row.ProjectId&&row.ProjectId>0)||(row.PrayerId&&row.PrayerId>0))){
          this.orphanTracking.push({OrdersId:sourceId,ProjectId:row.ProjectId||null,PrayerId:row.PrayerId||null,
            Total:row.Total,ChargeCurrency:row.ChargeCurrency,DateCreated:row.DateCreated,PaymentMethod:row.PaymentMethod,
            Reason:(row.ProjectId&&row.ProjectId>0)?"project-unresolved":"prayer-unresolved"});
        }
        var cma=this._getClearingMethodAreaSync(
          row.PaymentMethod,row.OrderLaguage,row.ChargeCurrency);
        var clearingMethodAreaId=cma?cma.Id:null;
        var src=this._resolveSource(row.UserSource);
        var amount=this._authoritativeAmount(row);

        // Collect billing address
        var billingIdx=-1;
        var billingAddr=this._buildAddress(row,"billing");
        if(billingAddr&&!this.dryRun){
          billingIdx=addressRows.length;
          addressRows.push(billingAddr);
        }

        // Collect shipping address
        var shippingIdx=-1;
        var shippingAddr=this._buildAddress(row,"shipping");
        if(shippingAddr&&!this.dryRun){
          shippingIdx=addressRows.length;
          addressRows.push(shippingAddr);
        }

        // Build donation data (without address IDs yet)
        var donationData={
          Id:sourceId,
          ItemId:itemId,
          Status:this._mapStatus(row.ChargeStatus),
          Currency:this._mapCurrency(row.ChargeCurrency||row.OrderCurrency),
          LanguageId:this._mapLanguage(row.OrderLaguage),
          MonthlySum:this._calcMonthlySum(amount,row.Payments),
          PaymentsCount:row.Payments||1,
          PaymentType:row.DonationType==="FixedDonation"?1:2,
          ReferenceNum:this._trunc(row.ReferenceCode,50),
          ClearingMethodAreaId:clearingMethodAreaId,
          ClearingMethodTerminalNum:this._trunc(row.TerminalNumber,50),
          TerminalId:null,
          ProviderReferenceNum:this._trunc(row.InternalDealNumber,50),
          ProviderApprovalNum:this._trunc(row.TokenApprovalNumber,100),
          ProviderResultCode:this._trunc(row.ChargeResultNum,10),
          ProviderResultMsg:this._trunc(row.ChargeErrorDesc,2000),
          MoreProviderDetails:this._buildProviderJSON(row),
          ReceiptBy:cma?cma.ReceiptBy:null,
          ReceiptForCountry:cma?cma.Area:null,
          ReceiptNum:row.AsakimInvoiceID||null,
          UserId:this._resolveUserId(row.UserId),
          DonorFirstName:this._trunc(row.BillingFirstName,100),
          DonorLastName:this._trunc(row.BillingLastName,300),
          DonorEmail:this._trunc(row.Email,100),
          DonorPhone:this._trunc(row.Phone,100),
          SourceType:src.type,
          SourceId:src.id,
          UnknownSourceCode:src.code,
          RecruiterId:this._resolveRecruiterId(row.RecruiterId,row.UserSource),
          SourceApp:this._mapSourceApp(row.IsManualDonation,row.PaymentMethod,row.AsakimID),
          SourceIP:this._trunc(row.Ip,200),
          EngravingName:this._trunc(row.CertificateFullName,300),
          SendReceiptByPost:row.AnonymousUser?0:1,
          ReceiptAddress:null,  // Will be set after bulk address insert
          ShippingAddress:null,
          DeliveryMethod:null,
          DisplayAsAnonymous:row.AnonymousUserName?1:0,
          DisplayName:this._trunc(row.UserFullName,30),
          CustomerComments:row.UserComments||null,
          RecordStatus:2,
          TreatStatus:1,
          StatusChangedAt:now,
          StatusChangedBy:-1,
          CreatedAt:row.DateCreated||now,
          CreatedBy:-1,
          UpdatedAt:now,
          UpdatedBy:-1,
          DisplayCurrency:this._mapCurrency(row.ChargeCurrency||row.OrderCurrency),
          DisplayMonthlySum:this._calcMonthlySum(amount,row.Payments),
          StatusReason:null
        };

        // Collect currency value rows
        var cvRows=this._buildCurrencyValues(row,now);

        prepared.push({sourceId:sourceId,order:row,donationData:donationData,
          billingIdx:billingIdx,shippingIdx:shippingIdx,cvRows:cvRows});

      }catch(err){
        this.counters.errors++;
        await recordError(this.runId,sourceId,"transform",err.message,{
          OrdersId:sourceId,ProjectId:row.ProjectId,PrayerId:row.PrayerId,
          Total:row.Total,Currency:row.OrderCurrency
        },err.stack);
      }
    }

    if(prepared.length===0||this.dryRun) return;

    // Phase 2: Bulk INSERT addresses
    var addressIds=[];
    if(addressRows.length>0){
      addressIds=await this._bulkInsertAddresses(addressRows);
      this.stats.addressesCreated+=addressRows.length;
    }

    // Phase 3: Assign address IDs to donation rows
    for(var p of prepared){
      if(p.billingIdx>=0) p.donationData.ReceiptAddress=addressIds[p.billingIdx];
      if(p.shippingIdx>=0) p.donationData.ShippingAddress=addressIds[p.shippingIdx];
    }

    // Phase 4: Bulk INSERT donations
    var donationIds=await this._bulkInsertDonations(prepared);

    // Phase 5: Bulk INSERT donationcurrencyvalue
    var allCvRows=[];
    for(var i=0;i<prepared.length;i++){
      var donId=donationIds[i];
      if(!donId) continue;
      for(var cv of prepared[i].cvRows){
        cv.DonationId=donId;
        allCvRows.push(cv);
      }
    }
    if(allCvRows.length>0){
      await this._bulkInsertCurrencyValues(allCvRows);
      this.stats.currencyValuesInserted+=allCvRows.length;
    }

    // Phase 5.5: Bulk INSERT DonationActionLog (from OrderLog)
    var actionLogRows=[];
    for(var i=0;i<prepared.length;i++){
      var donId=donationIds[i];
      if(!donId) continue;
      var orderLog=prepared[i].order.OrderLog;
      if(orderLog){
        actionLogRows.push({
          DonationId:donId,
          ActionId:1,
          CreatedAt:prepared[i].order.DateCreated||now,
          CreatedBy:-1,
          UpdatedAt:now,
          UpdatedBy:-1,
          MoreDetails:orderLog,
          SourceIP:prepared[i].order.Ip?this._trunc(prepared[i].order.Ip,200):null
        });
      }
    }
    if(actionLogRows.length>0){
      await this._bulkInsertActionLogs(actionLogRows);
      this.stats.actionLogsInserted+=actionLogRows.length;
    }

    // Phase 6: Bulk INSERT id_mappings + row_status
    var mappingRows=[];
    var statusRows=[];
    for(var i=0;i<prepared.length;i++){
      var donId=donationIds[i];
      if(!donId) continue;
      mappingRows.push(["Donation",String(prepared[i].sourceId),String(donId),this.runId]);
      statusRows.push([this.runId,String(prepared[i].sourceId),"inserted",String(donId)]);
      this.counters.inserted++;
    }

    if(mappingRows.length>0){
      await this._bulkInsertTracking(mappingRows,statusRows);
    }
  }

  // ============================================
  // Bulk INSERT helpers
  // ============================================
  async _bulkInsertAddresses(addressRows){
    // INSERT INTO address (Street,City,Country,ZipCode) VALUES (...), (...), ...
    var cols=["Street","City","Country","ZipCode"];
    var placeholders=addressRows.map(function(){return "(?,?,?,?)"}).join(",");
    var vals=[];
    for(var a of addressRows){
      vals.push(a.Street,a.City,a.Country,a.ZipCode);
    }
    var sql="INSERT INTO `Address` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    var [result]=await targetDb.query(sql,vals);

    // MySQL returns first insertId, rest are sequential
    var firstId=result.insertId;
    var ids=[];
    for(var i=0;i<addressRows.length;i++){
      ids.push(firstId+i);
    }
    return ids;
  }

  async _bulkInsertDonations(prepared){
    // Get column list from first entry
    var cols=Object.keys(prepared[0].donationData);
    var singlePlaceholder="("+cols.map(function(){return"?"}).join(",")+")";
    var placeholders=prepared.map(function(){return singlePlaceholder}).join(",");
    var vals=[];
    for(var p of prepared){
      for(var c of cols){
        var v=p.donationData[c];
        vals.push(v===undefined?null:v);
      }
    }
    var sql="INSERT INTO `Donation` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    await targetDb.query(sql,vals);

    // IDs are the original source IDs (preserved)
    var ids=[];
    for(var i=0;i<prepared.length;i++){
      ids.push(prepared[i].sourceId);
    }
    return ids;
  }

  async _bulkInsertCurrencyValues(cvRows){
    var cols=["DonationId","Currency","RateInILS","TotalSum","CreatedAt","CreatedBy","UpdatedAt","UpdatedBy"];
    var singlePlaceholder="(?,?,?,?,?,?,?,?)";
    var placeholders=cvRows.map(function(){return singlePlaceholder}).join(",");
    var vals=[];
    for(var cv of cvRows){
      vals.push(cv.DonationId,cv.Currency,cv.RateInILS,cv.TotalSum,cv.CreatedAt,cv.CreatedBy,cv.UpdatedAt,cv.UpdatedBy);
    }
    var sql="INSERT INTO `DonationCurrencyValue` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    await targetDb.query(sql,vals);
  }

  async _bulkInsertActionLogs(logRows){
    var cols=["DonationId","ActionId","CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","MoreDetails","SourceIP"];
    var singlePlaceholder="(?,?,?,?,?,?,?,?)";
    var placeholders=logRows.map(function(){return singlePlaceholder}).join(",");
    var vals=[];
    for(var l of logRows){
      vals.push(l.DonationId,l.ActionId,l.CreatedAt,l.CreatedBy,l.UpdatedAt,l.UpdatedBy,l.MoreDetails,l.SourceIP);
    }
    var sql="INSERT INTO `DonationActionLog` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    await targetDb.query(sql,vals);
  }

  async _restoreAutoIncrement(){
    logger.info("Restoring AUTO_INCREMENT on Donation table");
    var [rows]=await targetDb.query("SELECT COALESCE(MAX(Id),0)+1 as nextId FROM `Donation`");
    var nextId=rows[0].nextId;
    await targetDb.query("ALTER TABLE `Donation` MODIFY COLUMN `Id` int NOT NULL AUTO_INCREMENT");
    await targetDb.query("ALTER TABLE `Donation` AUTO_INCREMENT="+nextId);
    logger.info("AUTO_INCREMENT restored on Donation table, next ID: "+nextId);

    // Restore FKs
    logger.info("Restoring FKs referencing Donation.Id");
    try{await targetDb.query("ALTER TABLE `DonationActionLog` ADD CONSTRAINT `FK_DonationActionLog_DI_Donation` FOREIGN KEY (`DonationId`) REFERENCES `Donation` (`Id`)");}catch(e){logger.info("FK_DonationActionLog_DI_Donation already exists");}
    try{await targetDb.query("ALTER TABLE `DonationCurrencyValue` ADD CONSTRAINT `FK_DonationCurrencyValue_DI_Donation` FOREIGN KEY (`DonationId`) REFERENCES `Donation` (`Id`)");}catch(e){logger.info("FK_DonationCurrencyValue_DI_Donation already exists");}
    logger.info("FKs restored");
  }

  // Write an Excel audit of donations whose Project/Prayer reference didn't resolve
  // (they migrated into the general bucket ItemId=1). reports/orphan-donations.xlsx.
  _writeOrphanReport(){
    if(this.dryRun||!this.orphanTracking||this.orphanTracking.length===0){
      logger.info("Orphan report: no referenced-but-unresolved donations");
      return;
    }
    try{
      var XLSX=require("xlsx");
      var path=require("path");
      var rows=this.orphanTracking.map(function(o){
        return {OrdersId:o.OrdersId,ProjectId:o.ProjectId||"",PrayerId:o.PrayerId||"",
          Total:o.Total,ChargeCurrency:o.ChargeCurrency,
          DateCreated:o.DateCreated?String(o.DateCreated):"",PaymentMethod:o.PaymentMethod||"",
          OrphanReason:o.Reason||"",MigratedToItemId:1};
      });
      var ws=XLSX.utils.json_to_sheet(rows);
      var wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"OrphanDonations");
      var out=path.join(__dirname,"../../../reports/orphan-donations.xlsx");
      XLSX.writeFile(wb,out);
      logger.info("Orphan donations report written",{count:rows.length,file:out});
    }catch(err){
      logger.warn("Failed to write orphan donations report: "+err.message);
    }
  }

  async _bulkInsertTracking(mappingRows,statusRows){
    // Bulk id_mappings
    if(mappingRows.length>0){
      var mPlaceholders=mappingRows.map(function(){return"(?,?,?,?)"}).join(",");
      var mVals=[];
      for(var m of mappingRows){mVals.push(m[0],m[1],m[2],m[3]);}
      await trackerDb.query(
        "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES "+mPlaceholders
        +" ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",mVals);
    }

    // Bulk row_status
    if(statusRows.length>0){
      var sPlaceholders=statusRows.map(function(){return"(?,?,?,?)"}).join(",");
      var sVals=[];
      for(var s of statusRows){sVals.push(s[0],s[1],s[2],s[3]);}
      await trackerDb.query(
        "INSERT INTO row_status (run_id,source_id,status,target_id) VALUES "+sPlaceholders
        +" ON DUPLICATE KEY UPDATE status=VALUES(status),target_id=VALUES(target_id)",sVals);
    }
  }

  // ============================================
  // Preload ClearingMethodArea (small table)
  // ============================================
  async _preloadClearingMethodAreas(){
    try{
      var [rows]=await targetDb.query("SELECT Id,ClearingMethodId,Area,ReceiptBy FROM ClearingMethodArea");
      for(var r of rows){
        this.clearingMethodAreaCache.set(r.ClearingMethodId+"_"+r.Area,{Id:r.Id,Area:r.Area,ReceiptBy:r.ReceiptBy});
      }
      logger.info("ClearingMethodArea cache: "+this.clearingMethodAreaCache.size+" entries");
    }catch(err){
      logger.warn("Failed to preload ClearingMethodArea: "+err.message);
    }
  }

  // ============================================
  // Preload Source codes (target Source table) for donation source attribution.
  // Normalized (trim+lowercase, strips tab-suffixed codes); lowest Id wins on duplicates.
  // ============================================
  async _preloadSourceCodes(){
    try{
      var [rows]=await targetDb.query("SELECT Id,SourceCode FROM Source ORDER BY Id ASC");
      for(var r of rows){
        var k=String(r.SourceCode||"").trim().toLowerCase();
        if(!k||this.sourceCodeCache.has(k)) continue;
        this.sourceCodeCache.set(k,r.Id);
      }
      logger.info("Source code cache: "+this.sourceCodeCache.size+" entries"+(this.sourceCodeCache.size===0?" (WARNING: Source not yet migrated — all donations will get SourceType=2/3!)":""));
    }catch(err){
      logger.warn("Failed to preload Source codes: "+err.message);
    }
  }

  // ============================================
  // Build address data (sync, no DB)
  // ============================================
  _buildAddress(order,type){
    var street,city,country,zip;
    if(type==="billing"){
      if(order.AnonymousUser) return null;
      street=order.BillingStreet;
      city=order.BillingCity;
      country=order.BillingCountry;
      zip=order.BillingZip;
    }else{
      street=order.CertificateStreet;
      city=order.CertificateCity;
      country=order.CertificateCountry;
      zip=order.CertificateZip;
    }

    if(!street&&!city&&!country&&!zip) return null;

    return {
      Street:street?this._trunc(street,100):"",
      City:city?this._trunc(city,100):"",
      Country:this._mapCountry(country),
      ZipCode:zip?this._trunc(zip,10):""
    };
  }

  // ============================================
  // Country mapping: source free-text -> LutCountry.Id
  // LutCountry holds 12 canonical countries (Ids 1-12); 13-17 are duplicates.
  // Address.Country is NOT NULL, so unmapped/empty falls back to 1 (Israel).
  // ============================================
  _mapCountry(country){
    if(!country) return 1;
    var k=String(country).trim().toLowerCase();
    var map={
      "ישראל":1,"israel":1,
      "usa":2,"united states":2,"united states of america":2,"u.s.a.":2,"us":2,
        "united states virgin islands":2,"guam (usa)":2,"guam usa":2,
      "canada":3,
      "united kingdom":4,"uk":4,"england":4,"great britain":4,"gb":4,
      "france":5,
      "venezuela":6,
      "belgium":7,
      "south africa":8,"southafrica":8,
      "brazil":9,
      "switzerland":10,
      "mexico":11,
      "argentina":12
    };
    return map[k]||1;
  }

  // ============================================
  // Build CurrencyValue rows (sync, no DB)
  // ============================================
  _buildCurrencyValues(order,now){
    var values=[];
    if(order.TotalInILS&&order.TotalInILS>0){
      values.push({DonationId:null,Currency:1,RateInILS:1,TotalSum:order.TotalInILS,
        CreatedAt:now,CreatedBy:-1,UpdatedAt:now,UpdatedBy:-1});
    }
    if(order.TotalInUSD&&order.TotalInUSD>0&&order.USDRate){
      values.push({DonationId:null,Currency:2,RateInILS:order.USDRate,TotalSum:order.TotalInUSD,
        CreatedAt:now,CreatedBy:-1,UpdatedAt:now,UpdatedBy:-1});
    }
    if(order.TotalInEUR&&order.TotalInEUR>0&&order.EURRate){
      values.push({DonationId:null,Currency:3,RateInILS:order.EURRate,TotalSum:order.TotalInEUR,
        CreatedAt:now,CreatedBy:-1,UpdatedAt:now,UpdatedBy:-1});
    }
    return values;
  }

  // ============================================
  // ClearingMethodAreaId (sync - fully cached)
  // ============================================
  _getClearingMethodAreaSync(paymentMethod,orderLanguage,chargeCurrency){
    if(!paymentMethod) return null;
    var clearingMethodId=this._mapClearingMethod(paymentMethod,orderLanguage,chargeCurrency);
    var area=this._mapArea(orderLanguage,chargeCurrency);
    var cacheKey=clearingMethodId+"_"+area;
    return this.clearingMethodAreaCache.get(cacheKey)||null;
  }

  _getClearingMethodAreaIdSync(paymentMethod,orderLanguage,chargeCurrency){
    var cma=this._getClearingMethodAreaSync(paymentMethod,orderLanguage,chargeCurrency);
    return cma?cma.Id:null;
  }

  // ============================================
  // ItemId Determination
  // ============================================
  _determineItemId(order){
    if(order.PrayerId&&order.PrayerId>0){
      var prayerItemId=this.projectItemPrayerCache.get(String(order.PrayerId));
      if(prayerItemId){
        this.stats.itemIdStats.fromPrayer++;
        return parseInt(prayerItemId);
      }
      if(order.ProjectId&&order.ProjectId>0){
        if(!this._warnedPrayerIds.has(order.PrayerId)){
          this._warnedPrayerIds.add(order.PrayerId);
          logger.warn("PrayerId "+order.PrayerId+" not in cache, falling back to ProjectId");
        }
      }else{
        this.stats.itemIdStats.orphaned++;
        return 1;
      }
    }

    if(order.ProjectId&&order.ProjectId>0){
      var pid=String(order.ProjectId);

      var itemId=this.projectItemFundsCache.get(pid);
      if(itemId){this.stats.itemIdStats.fromProduct++;return parseInt(itemId);}

      itemId=this.projectItemCertCache.get(pid);
      if(itemId){this.stats.itemIdStats.fromProduct++;return parseInt(itemId);}

      itemId=this.projectItemDonationCache.get(pid);
      if(itemId){this.stats.itemIdStats.fromProduct++;return parseInt(itemId);}

      if(!this._warnedProjectIds.has(order.ProjectId)){
        this._warnedProjectIds.add(order.ProjectId);
        logger.warn("ProjectId "+order.ProjectId+" not found in any ProjectItem cache - using default ItemId=1");
      }
      this.stats.itemIdStats.orphaned++;
      return 1;
    }

    this.stats.itemIdStats.orphaned++;
    return 1;
  }

  // ============================================
  // Simple mappers (unchanged)
  // ============================================
  _mapClearingMethod(paymentMethod,orderLanguage,chargeCurrency){
    if(paymentMethod==="CreditCard"){
      if(orderLanguage==="en"&&chargeCurrency==="£") return 1;
      if(orderLanguage==="en") return 3;
      if(orderLanguage==="he") return 2;
      if(orderLanguage==="fr") return 4;
      return 24;
    }
    if(paymentMethod==="PayPal"||paymentMethod===" PayPal") return 7;
    if(paymentMethod==="NedarimPlus") return 8;
    if(paymentMethod==="AsserBishvil") return 10;
    if(paymentMethod==="Broom") return 11;
    if(paymentMethod==="ThreePillars") return 12;
    if(paymentMethod==="Cash") return 13;
    if(paymentMethod==="Check") return 14;
    if(paymentMethod==="BusinessCredit"&&orderLanguage==="he") return 18;
    if(paymentMethod==="BankTransfer") return 21;
    if(paymentMethod==="BankStandingOrder") return 22;
    if(paymentMethod==="Bit") return 23;
    return 24;
  }

  _mapArea(orderLanguage,chargeCurrency){
    if(orderLanguage==="he") return 1;
    if(orderLanguage==="en"&&chargeCurrency==="£") return 2;
    if(orderLanguage==="en") return 3;
    if(orderLanguage==="fr") return 4;
    return 1;
  }

  _mapStatus(chargeStatus){
    if(!chargeStatus) return 3;
    switch(chargeStatus){
      case "RedirectedToChargePage": return 1;
      case "OrderFinished": return 2;
      case "AwaitingCharge": case "ManualCharge": return 4;
      default: return 3;
    }
  }

  _mapCurrency(currency){
    if(!currency) return 1;
    switch(String(currency).trim()){
      case "₪": case "NIS": case "ILS": return 1;
      case "$": case "USD": return 2;
      case "€": case "EUR": return 3;
      case "£": case "GBP": return 4;
      case "C$": case "CA$": case "CAD": return 5;
      default: return 1;
    }
  }

  // Authoritative donation amount: Donation.Currency is derived from ChargeCurrency (when set),
  // so the amount must come from the SAME currency — ChargeTotal. Orders.Total is in the ORDER
  // currency, which differs from the charge currency on cross-currency rows (e.g. C$/£ charges
  // on the $ site): using Total there pairs a wrong amount with the currency label.
  _authoritativeAmount(row){
    var cc=row.ChargeCurrency?String(row.ChargeCurrency).trim():"";
    if(cc&&row.ChargeTotal!==null&&row.ChargeTotal!==undefined&&Number(row.ChargeTotal)>0) return row.ChargeTotal;
    return row.Total;
  }

  _mapLanguage(orderLanguage){
    if(!orderLanguage) return null;
    switch(orderLanguage.toLowerCase()){
      case "he": case "hebrew": return 1;
      case "en": case "english": return 2;
      case "fr": case "french": return 3;
      default: return null;
    }
  }

  _mapSourceApp(isManualDonation,paymentMethod,asakimId){
    if(isManualDonation===true||isManualDonation===1) return 2; // ManagementSite
    if(paymentMethod==="NedarimPlus") return 4;                 // Nedarim
    if(paymentMethod==="Asakim") return 3;                      // Asakim (business app)
    // Business orders sometimes have an empty PaymentMethod but always carry AsakimID
    // (verified: in-scope orders with AsakimID are only Asakim=100,006 / empty=262)
    if(!paymentMethod&&asakimId&&String(asakimId).trim()!=="") return 3;
    return 1;                                                   // CustomerSite (default)
  }

  _resolveUserId(userId){
    if(!userId||userId===0) return null;
    var mapped=this.userIdCache.get(String(userId));
    return mapped?parseInt(mapped):null;
  }

  // RecruiterId column is authoritative; when it's missing, fall back to the recruiter id
  // embedded in UserSource ("recparam<id>"). Validated: embedded==column in 99.45% of rows
  // that have both. Only ids resolving via RecruiterMapping are used (FK-safe).
  _resolveRecruiterId(recruiterId,userSource){
    if(recruiterId&&recruiterId!==0){
      var mapped=this.recruiterIdCache.get(String(recruiterId));
      if(mapped) return parseInt(mapped);
    }
    if(userSource){
      var m=String(userSource).trim().match(/^recparam(\d+)/i);
      if(m&&Number(m[1])>0){
        var fb=this.recruiterIdCache.get(m[1]);
        if(fb) return parseInt(fb);
      }
    }
    return null;
  }

  // Source attribution per LutDonationSourceType:
  //   1=DefinedSource (UserSource matches Source.SourceCode -> SourceId set)
  //   2=UnknownSource (non-empty but unmatched -> code kept in UnknownSourceCode)
  //   3=None (empty, or recParam* which is a recruiter param handled via RecruiterId)
  _resolveSource(userSource){
    if(userSource===null||userSource===undefined) return {type:3,id:null,code:null};
    var s=String(userSource).trim();
    if(!s) return {type:3,id:null,code:null};
    if(s.toLowerCase().startsWith("recparam")) return {type:3,id:null,code:null};
    var sid=this.sourceCodeCache.get(s.toLowerCase());
    if(sid) return {type:1,id:sid,code:null};
    return {type:2,id:null,code:this._trunc(s,50)};
  }

  _calcMonthlySum(total,payments){
    if(!total) return 0;
    var n=payments||1;
    return Math.round((total/n)*100)/100;
  }

  _buildProviderJSON(order){
    var d={};
    if(order.VoucherAccountNum) d.voucherAccountNum=order.VoucherAccountNum;
    if(order.CardToken) d.cardToken=order.CardToken;
    if(order.CardOwnerName) d.cardOwnerName=order.CardOwnerName;
    if(order.CardExp) d.cardExp=order.CardExp;
    if(order.CardNum) d.cardNum=order.CardNum;
    if(order.CardHolderId) d.cardHolderId=order.CardHolderId;
    if(order.CardAuthNum) d.cardAuthNum=order.CardAuthNum;
    if(order.FirstPayment) d.firstPayment=order.FirstPayment;
    if(order.ConstPayment) d.constPayment=order.ConstPayment;
    if(order.LowProfileDealGuid) d.lowProfileDealGuid=order.LowProfileDealGuid;
    return Object.keys(d).length>0?JSON.stringify(d):null;
  }

  _trunc(val,max){
    if(val===null||val===undefined) return null;
    var s=String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"");
    return s.length>max?s.substring(0,max):s;
  }

  _getSelectColumns(){
    return [
      "OrdersId","ProjectId","PrayerId","UserId",
      "Total","ChargeTotal","Payments","ChargeStatus","PaymentMethod",
      "Currency as OrderCurrency","ChargeCurrency",
      "TotalInILS","TotalInUSD","TotalInEUR","USDRate","EURRate",
      "DonationType","ReferenceCode","TerminalNumber",
      "InternalDealNumber","TokenApprovalNumber",
      "ChargeResultNum","ChargeErrorDesc",
      "BillingFirstName","BillingLastName","Email","Phone",
      "UserSource","RecruiterId","Ip",
      "CertificateFullName","AnonymousUser","AnonymousUserName",
      "UserFullName","UserComments","DateCreated",
      "BillingStreet","BillingCity","BillingCountry","BillingZip",
      "CertificateStreet","CertificateCity","CertificateCountry","CertificateZip",
      "VoucherAccountNum","CardToken","CardOwnerName","CardExp",
      "CardNum","CardHolderId","CardAuthNum",
      "FirstPayment","ConstPayment","LowProfileDealGuid",
      "AsakimInvoiceID","AsakimID","OrderLaguage","IsManualDonation",
      "OrderLog"
    ].join(",");
  }
}

module.exports=DonationEngine;
