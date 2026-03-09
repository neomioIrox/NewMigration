const EventEmitter=require("events");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const {recordError}=require("./batch-runner");
const {preloadFKCache}=require("./fk-resolver");
const {processGetDate}=require("./expression-eval");
const tracker=require("../services/tracker");
const logger=require("../logger");

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
    // Warn dedup - only warn once per ProjectId/PrayerId
    this._warnedProjectIds=new Set();
    this._warnedPrayerIds=new Set();
  }

  requestPause(){this.pauseRequested=true;}

  async run(resumeRunId){
    this.isRunning=true;
    this.pauseRequested=false;
    var sourceTable="Orders";
    var targetTable="donation";
    var sourceIdCol="OrdersId";
    var entityType="Donation";

    try{
      // ========================================
      // STEP 0: Preload FK Caches
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

      // ========================================
      // STEP 1: Count source rows
      // ========================================
      var whereClause=" WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))";
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

        // Process entire batch with bulk inserts
        await this._processBatch(rows,sourceIdCol);

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
      this.isRunning=false;
      return {status:"completed",runId:this.runId,counters:this.counters,stats:this.stats};

    }catch(err){
      if(this.runId) await tracker.updateRunStatus(this.runId,"failed");
      this.emit("error",{runId:this.runId,error:err.message,mapping:"DonationMapping"});
      logger.error("Donation migration failed",{runId:this.runId,error:err.message});
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
        var clearingMethodAreaId=this._getClearingMethodAreaIdSync(
          row.PaymentMethod,row.OrderLaguage,row.ChargeCurrency);

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
          ItemId:itemId,
          Status:this._mapStatus(row.ChargeStatus),
          Currency:this._mapCurrency(row.ChargeCurrency||row.OrderCurrency),
          LanguageId:this._mapLanguage(row.OrderLaguage),
          MonthlySum:this._calcMonthlySum(row.Total,row.Payments),
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
          ReceiptBy:row.AsakimInvoiceID&&row.OrderLaguage==="he"?3:null,
          ReceiptForCountry:row.AsakimInvoiceID&&row.OrderLaguage==="he"?1:null,
          ReceiptNum:row.AsakimInvoiceID||null,
          UserId:this._resolveUserId(row.UserId),
          DonorFirstName:this._trunc(row.BillingFirstName,100),
          DonorLastName:this._trunc(row.BillingLastName,300),
          DonorEmail:this._trunc(row.Email,100),
          DonorPhone:this._trunc(row.Phone,100),
          SourceType:3,
          SourceId:null,
          UnknownSourceCode:this._extractUnknownSource(row.UserSource),
          RecruiterId:this._resolveRecruiterId(row.RecruiterId),
          SourceApp:this._mapSourceApp(row.IsManualDonation,row.PaymentMethod),
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
          DisplayMonthlySum:this._calcMonthlySum(row.Total,row.Payments),
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
    var sql="INSERT INTO `address` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
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
    var sql="INSERT INTO `donation` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    var [result]=await targetDb.query(sql,vals);

    var firstId=result.insertId;
    var ids=[];
    for(var i=0;i<prepared.length;i++){
      ids.push(firstId+i);
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
    var sql="INSERT INTO `donationcurrencyvalue` (`"+cols.join("`,`")+"`) VALUES "+placeholders;
    await targetDb.query(sql,vals);
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
      var [rows]=await targetDb.query("SELECT Id,ClearingMethodId,Area FROM clearingmethodarea");
      for(var r of rows){
        this.clearingMethodAreaCache.set(r.ClearingMethodId+"_"+r.Area,r.Id);
      }
      logger.info("ClearingMethodArea cache: "+this.clearingMethodAreaCache.size+" entries");
    }catch(err){
      logger.warn("Failed to preload ClearingMethodArea: "+err.message);
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
      Country:1,
      ZipCode:zip?this._trunc(zip,10):""
    };
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
  _getClearingMethodAreaIdSync(paymentMethod,orderLanguage,chargeCurrency){
    if(!paymentMethod) return null;
    var clearingMethodId=this._mapClearingMethod(paymentMethod,orderLanguage,chargeCurrency);
    var area=this._mapArea(orderLanguage,chargeCurrency);
    var cacheKey=clearingMethodId+"_"+area;
    return this.clearingMethodAreaCache.get(cacheKey)||null;
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
    switch(currency){
      case "₪": case "NIS": case "ILS": return 1;
      case "$": case "USD": return 2;
      case "€": case "EUR": return 3;
      case "£": case "GBP": return 4;
      default: return 1;
    }
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

  _mapSourceApp(isManualDonation,paymentMethod){
    if(isManualDonation===true||isManualDonation===1) return 2;
    if(paymentMethod==="NedarimPlus") return 4;
    return 1;
  }

  _resolveUserId(userId){
    if(!userId||userId===0) return null;
    var mapped=this.userIdCache.get(String(userId));
    return mapped?parseInt(mapped):null;
  }

  _resolveRecruiterId(recruiterId){
    if(!recruiterId||recruiterId===0) return null;
    var mapped=this.recruiterIdCache.get(String(recruiterId));
    return mapped?parseInt(mapped):null;
  }

  _extractUnknownSource(userSource){
    if(!userSource) return null;
    if(userSource.startsWith("recParam")) return null;
    return this._trunc(userSource,50);
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
      "Total","Payments","ChargeStatus","PaymentMethod",
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
      "AsakimInvoiceID","OrderLaguage","IsManualDonation"
    ].join(",");
  }
}

module.exports=DonationEngine;
