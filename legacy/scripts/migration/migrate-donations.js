const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

// ============================================
// Table Name Mapping (lowercase → PascalCase for MySQL)
// ============================================
const TABLE_NAME_MAPPING = {
  'donation': 'Donation',
  'donationcurrencyvalue': 'DonationCurrencyValue',
  'address': 'Address',
  'project': 'Project',
  'projectitem': 'ProjectItem'
};

function getCorrectTableName(tableName) {
  const lowerName = tableName.toLowerCase();
  return TABLE_NAME_MAPPING[lowerName] || tableName;
}

// State persistence file paths
const STATE_FILE = path.join(__dirname, '../../data/migration-state/donation-migration-state.json');
const ERRORS_FILE = path.join(__dirname, '../../data/migration-state/donation-errors.json');

/**
 * Save migration errors to file for analysis
 */
function saveErrors(errors) {
  try {
    const errorsDir = path.dirname(ERRORS_FILE);
    if (!fs.existsSync(errorsDir)) {
      fs.mkdirSync(errorsDir, { recursive: true });
    }

    const errorsData = {
      totalErrors: errors.length,
      lastUpdateTime: new Date().toISOString(),
      errors: errors
    };

    fs.writeFileSync(ERRORS_FILE, JSON.stringify(errorsData, null, 2), 'utf8');
    console.log(`📋 Errors saved to file: ${errors.length} שגיאות`);
  } catch (error) {
    console.error('⚠️  Failed to save errors:', error.message);
  }
}

/**
 * Save migration state to file for crash recovery
 */
function saveState(state) {
  try {
    const stateDir = path.dirname(STATE_FILE);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const stateData = {
      currentOffset: state.currentOffset,
      totalProcessed: state.totalProcessed || (state.inserted + state.skipped),
      inserted: state.inserted,
      skipped: state.skipped,
      addressesCreated: state.addressesCreated,
      currencyValuesInserted: state.currencyValuesInserted,
      errorCount: state.errors ? state.errors.length : 0,
      itemIdStats: state.itemIdStats,
      lastUpdateTime: new Date().toISOString(),
      isCompleted: state.isCompleted || false
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2), 'utf8');
    console.log(`💾 State saved to file: offset=${state.currentOffset}, processed=${stateData.totalProcessed}`);

    // Save errors to separate file
    if (state.errors && state.errors.length > 0) {
      saveErrors(state.errors);
    }
  } catch (error) {
    console.error('⚠️  Failed to save state:', error.message);
  }
}

/**
 * Load saved migration state from file
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

      // Don't load if migration was completed
      if (stateData.isCompleted) {
        console.log('ℹ️  Previous migration was completed, ignoring saved state');
        return null;
      }

      console.log(`📂 Loaded saved state: offset=${stateData.currentOffset}, processed=${stateData.totalProcessed}`);
      return stateData;
    }
    return null;
  } catch (error) {
    console.error('⚠️  Failed to load state:', error.message);
    return null;
  }
}

/**
 * Clear saved state (called when migration completes or user starts fresh)
 */
function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
      console.log('🗑️  Saved state cleared');
    }
  } catch (error) {
    console.error('⚠️  Failed to clear state:', error.message);
  }
}

/**
 * Migrate Donations from Orders table (SQL Server) to donation table (MySQL)
 *
 * Key Features:
 * - Batching: 1000 rows per batch (configurable)
 * - Smart Skip: Check existing before INSERT
 * - ItemId Selection: Priority by ItemType (5→4→1→2→3)
 * - Address Inline Creation: Create on-demand
 * - Error Recovery: Continue on error, collect all errors
 *
 * Prerequisites:
 * - Prayer migration completed (PrayerProjectItemId.json must exist)
 * - CustomerUser migration completed (~3,839 users)
 * - ProjectItem Id=1 exists (default for orphaned)
 *
 * @param {Object} options - Migration options
 * @param {number} options.batchSize - Rows per batch (default: 1000)
 * @param {number} options.limit - Max rows to migrate (null = all)
 * @param {number} options.offset - Starting offset (default: 0)
 * @param {boolean} options.dryRun - Simulate without writing (default: false)
 */
async function migrateDonations(options = {}) {
  console.log('💰 מתחיל מיגרציית Orders → donation...\n');

  const {
    batchSize = 1000,
    limit = null,
    offset = 0,
    dryRun = false,
    sharlinOnly = false,
    progressCallback = null,  // Callback for real-time progress updates
    shouldPause = null        // Function that returns true if should pause
  } = options;

  const results = {
    inserted: 0,
    skipped: 0,
    addressesCreated: 0,
    currencyValuesInserted: 0,
    errors: [],
    itemIdStats: {
      fromPrayer: 0,
      fromProduct: 0,
      fromProductMultiChoice: 0,
      orphaned: 0
    }
  };

  let mssqlConn, mysqlConn;

  try {
    // ========================================
    // STEP 0: Load FK Mappings
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 0: טעינת מיפויים');
    console.log('━'.repeat(60));

    const productsMapping = loadMapping('ProductsMapping.json');
    console.log(`✅ ProductsMapping: ${productsMapping.metadata.mapped} products`);

    const prayerMapping = loadMapping('PrayerProjectItemId.json');
    console.log(`✅ PrayerMapping: ${Object.keys(prayerMapping).length} prayers`);

    const userIdMapping = loadMapping('UserId.json');
    console.log(`✅ UserIdMapping: ${Object.keys(userIdMapping).length} users`);

    const recruiterIdMapping = loadMapping('RecruiterId.json');
    console.log(`✅ RecruiterIdMapping: ${Object.keys(recruiterIdMapping.mappings || {}).length} recruiters\n`);

    // ========================================
    // STEP 1: Connect to Databases
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 1: חיבור לבסיסי נתונים');
    console.log('━'.repeat(60));

    mssqlConn = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    console.log('✅ חיבור הצליח\n');

    // ========================================
    // STEP 2: Count Total Orders
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 2: ספירת Orders');
    console.log('━'.repeat(60));

    // Build WHERE clause
    let whereClause = `(ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))`;
    if (sharlinOnly) {
      whereClause += ` AND ProjectId = 1957`;
      console.log('🎯 מסנן: רק תרומות לקרן שרה שרלין (ProductId=1957)');
    }

    const countQuery = `
      SELECT COUNT(*) as Total
      FROM Orders
      WHERE ${whereClause}
    `;

    const countResult = await sql.query(countQuery);
    const totalOrders = countResult.recordset[0].Total;
    console.log(`📊 סה"כ Orders: ${totalOrders.toLocaleString()}\n`);

    // ========================================
    // STEP 3: Process in Batches
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 3: עיבוד Orders בבאצים');
    console.log('━'.repeat(60));
    console.log(`Batch Size: ${batchSize}`);
    console.log(`Limit: ${limit || 'None (all)'}`);
    console.log(`Offset: ${offset}`);
    console.log(`Dry Run: ${dryRun ? 'Yes (no writes)' : 'No'}\n`);

    let currentOffset = offset;
    let hasMore = true;

    while (hasMore) {
      // Query batch
      const batchQuery = `
        SELECT
          OrdersId,
          ProjectId,
          PrayerId,
          UserId,
          Total,
          Payments,
          ChargeStatus,
          PaymentMethod,
          Currency as OrderCurrency,
          ChargeCurrency,
          TotalInILS,
          TotalInUSD,
          TotalInEUR,
          USDRate,
          EURRate,
          DonationType,
          ReferenceCode,
          TerminalNumber,
          InternalDealNumber,
          TokenApprovalNumber,
          ChargeResultNum,
          ChargeErrorDesc,
          BillingFirstName,
          BillingLastName,
          Email,
          Phone,
          UserSource,
          RecruiterId,
          Ip,
          CertificateFullName,
          AnonymousUser,
          AnonymousUserName,
          UserFullName,
          UserComments,
          DateCreated,
          BillingStreet,
          BillingCity,
          BillingCountry,
          BillingZip,
          CertificateStreet,
          CertificateCity,
          CertificateCountry,
          CertificateZip,
          VoucherAccountNum,
          CardToken,
          CardOwnerName,
          CardExp,
          CardNum,
          CardHolderId,
          CardAuthNum,
          FirstPayment,
          ConstPayment,
          LowProfileDealGuid,
          AsakimInvoiceID,
          OrderLaguage,
          IsManualDonation
        FROM Orders
        WHERE ${whereClause}
        ORDER BY OrdersId
        OFFSET ${currentOffset} ROWS
        FETCH NEXT ${batchSize} ROWS ONLY
      `;

      const ordersResult = await sql.query(batchQuery);

      const orders = ordersResult.recordset;

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`\n📦 Batch: ${currentOffset.toLocaleString()} - ${(currentOffset + orders.length).toLocaleString()}`);

      // Process each order in batch
      for (const order of orders) {
        try {
          // Smart Skip: Check if already exists by ReferenceNum (unique identifier from old DB)
          if (!dryRun) {
            const referenceNum = order.ReferenceCode ? order.ReferenceCode.substring(0, 50) : null;

            if (referenceNum) {
              const [existing] = await mysqlConn.query(
                'SELECT Id FROM Donation WHERE ReferenceNum = ?',
                [referenceNum]
              );

              if (existing.length > 0) {
                results.skipped++;
                continue;
              }
            }
          }

          // CRITICAL: Determine ItemId
          const itemId = await determineItemId(
            order,
            productsMapping,
            prayerMapping,
            results
          );

          // Create Address records inline (if needed)
          const receiptAddressId = await createAddressIfNeeded(
            mysqlConn,
            order,
            'billing',
            results,
            dryRun
          );

          const shippingAddressId = await createAddressIfNeeded(
            mysqlConn,
            order,
            'shipping',
            results,
            dryRun
          );

          // Map all donation fields
          // NOTE: Id is AUTO_INCREMENT - we don't set it! (unlike project table)
          const donationData = {
            ItemId: itemId,
            Status: mapDonationStatus(order.ChargeStatus),
            Currency: mapCurrency(order.ChargeCurrency || order.OrderCurrency),
            LanguageId: mapLanguage(order.OrderLaguage),
            MonthlySum: calculateMonthlySum(order.Total, order.Payments),
            PaymentsCount: order.Payments || 1,
            PaymentType: mapPaymentType(order.DonationType),
            ReferenceNum: truncate(order.ReferenceCode, 50),
            ClearingMethodAreaId: await getClearingMethodAreaId(
              mysqlConn,
              order.PaymentMethod,
              order.OrderLaguage,
              order.ChargeCurrency
            ),
            ClearingMethodTerminalNum: truncate(order.TerminalNumber, 50),
            TerminalId: null,  // Direct terminal FK - may need mapping later
            ProviderReferenceNum: truncate(order.InternalDealNumber, 50),
            ProviderApprovalNum: truncate(order.TokenApprovalNumber, 100),
            ProviderResultCode: truncate(order.ChargeResultNum, 10),
            ProviderResultMsg: truncate(order.ChargeErrorDesc, 2000),
            MoreProviderDetails: createProviderJSON(order),
            ReceiptBy: order.AsakimInvoiceID && order.OrderLaguage === 'he' ? 3 : null,
            ReceiptForCountry: order.AsakimInvoiceID && order.OrderLaguage === 'he' ? 1 : null,
            ReceiptNum: order.AsakimInvoiceID,
            UserId: mapUserId(order.UserId, userIdMapping),
            DonorFirstName: truncate(order.BillingFirstName, 100),
            DonorLastName: truncate(order.BillingLastName, 300),
            DonorEmail: truncate(order.Email, 100),
            DonorPhone: truncate(order.Phone, 100),
            SourceType: 3,  // Default: 3(None) - will update later if needed
            SourceId: null,  // TODO: Map from UserSource
            UnknownSourceCode: extractUnknownSource(order.UserSource),
            RecruiterId: mapRecruiterId(order.RecruiterId, recruiterIdMapping),
            SourceApp: mapSourceApp(order.IsManualDonation, order.PaymentMethod),
            SourceIP: truncate(order.Ip, 200),
            EngravingName: truncate(order.CertificateFullName, 300),
            SendReceiptByPost: order.AnonymousUser ? 0 : 1,
            ReceiptAddress: receiptAddressId,
            ShippingAddress: shippingAddressId,
            DeliveryMethod: null,
            DisplayAsAnonymous: order.AnonymousUserName ? 1 : 0,
            DisplayName: truncate(order.UserFullName, 30),  // Schema max: 30
            CustomerComments: order.UserComments,
            RecordStatus: 2,
            StatusChangedAt: new Date(),
            StatusChangedBy: -1,
            CreatedAt: order.DateCreated || new Date(),
            CreatedBy: -1,
            UpdatedAt: new Date(),
            UpdatedBy: -1,
            // Missing NOT NULL fields (not in CSV):
            TreatStatus: 1,  // 1=NotRequired (lutdonationtreatstatus: 1,2,3 only)
            DisplayCurrency: mapCurrency(order.ChargeCurrency || order.OrderCurrency),
            DisplayMonthlySum: calculateMonthlySum(order.Total, order.Payments),
            StatusReason: null  // nullable
          };

          // Insert donation
          let newDonationId = null;
          if (!dryRun) {
            const [insertResult] = await mysqlConn.query(`INSERT INTO ${getCorrectTableName('donation')} SET ?`, [donationData]);
            newDonationId = insertResult.insertId;  // Get AUTO_INCREMENT Id

            // ========================================
            // Create donationcurrencyvalue rows
            // ========================================
            // One row per currency (NO DUPLICATES!)
            const currencyValues = [];

            // Currency 1: ILS (always rate = 1)
            if (order.TotalInILS && order.TotalInILS > 0) {
              currencyValues.push({
                DonationId: newDonationId,
                Currency: 1,  // ILS
                RateInILS: 1,
                TotalSum: order.TotalInILS,
                CreatedAt: new Date(),
                CreatedBy: -1,
                UpdatedAt: new Date(),
                UpdatedBy: -1
              });
            }

            // Currency 2: USD
            if (order.TotalInUSD && order.TotalInUSD > 0 && order.USDRate) {
              currencyValues.push({
                DonationId: newDonationId,
                Currency: 2,  // USD
                RateInILS: order.USDRate,
                TotalSum: order.TotalInUSD,
                CreatedAt: new Date(),
                CreatedBy: -1,
                UpdatedAt: new Date(),
                UpdatedBy: -1
              });
            }

            // Currency 3: EUR
            if (order.TotalInEUR && order.TotalInEUR > 0 && order.EURRate) {
              currencyValues.push({
                DonationId: newDonationId,
                Currency: 3,  // EUR
                RateInILS: order.EURRate,
                TotalSum: order.TotalInEUR,
                CreatedAt: new Date(),
                CreatedBy: -1,
                UpdatedAt: new Date(),
                UpdatedBy: -1
              });
            }

            // Insert currency values (one INSERT per currency)
            for (const currencyValue of currencyValues) {
              await mysqlConn.query(`INSERT INTO ${getCorrectTableName('donationcurrencyvalue')} SET ?`, [currencyValue]);
            }

            if (currencyValues.length > 0) {
              results.currencyValuesInserted = (results.currencyValuesInserted || 0) + currencyValues.length;
            }
          }

          results.inserted++;

          if (results.inserted % 100 === 0) {
            console.log(`  ✅ ${results.inserted.toLocaleString()} donations...`);
          }

        } catch (err) {
          console.error(`  ❌ OrdersId=${order.OrdersId}: ${err.message}`);
          results.errors.push({
            OrdersId: order.OrdersId,
            ProjectId: order.ProjectId,
            PrayerId: order.PrayerId,
            UserId: order.UserId,
            Total: order.Total,
            Currency: order.OrderCurrency,
            ReferenceCode: order.ReferenceCode,
            DateCreated: order.DateCreated,
            errorMessage: err.message,
            errorStack: err.stack,
            timestamp: new Date().toISOString()
          });
        }
      }

      currentOffset += batchSize;

      // Send progress update if callback provided
      if (progressCallback) {
        progressCallback({
          currentOffset: currentOffset,
          totalProcessed: results.inserted + results.skipped,
          inserted: results.inserted,
          skipped: results.skipped,
          addressesCreated: results.addressesCreated,
          currencyValuesInserted: results.currencyValuesInserted,
          errors: results.errors,
          itemIdStats: results.itemIdStats
        });
      }

      // Save state to file for crash recovery
      saveState({
        currentOffset: currentOffset,
        totalProcessed: results.inserted + results.skipped,
        inserted: results.inserted,
        skipped: results.skipped,
        addressesCreated: results.addressesCreated,
        currencyValuesInserted: results.currencyValuesInserted,
        errors: results.errors,
        itemIdStats: results.itemIdStats,
        isCompleted: false
      });

      // Check if should pause
      if (shouldPause && shouldPause()) {
        console.log(`\n⏸️  מיגרציה הושהתה על ידי המשתמש`);
        console.log(`   Offset נוכחי: ${currentOffset}`);
        console.log(`   נוכל להמשיך מ-offset=${currentOffset}\n`);
        hasMore = false;
        break;
      }

      // Check limit
      if (limit && currentOffset >= offset + limit) {
        hasMore = false;
      }
    }

    // ========================================
    // Final Summary
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('סיכום המיגרציה');
    console.log('━'.repeat(60));
    console.log(`✅ תרומות חדשות: ${results.inserted.toLocaleString()}`);
    console.log(`⏭️  תרומות קיימות (נדלגו): ${results.skipped.toLocaleString()}`);
    console.log(`🏠 כתובות שנוצרו: ${results.addressesCreated.toLocaleString()}`);
    console.log(`💱 ערכי מטבע שנוצרו: ${(results.currencyValuesInserted || 0).toLocaleString()}`);

    console.log('\n📊 פילוח ItemId:');
    console.log(`   מתפילות (PrayerId): ${results.itemIdStats.fromPrayer.toLocaleString()}`);
    console.log(`   מפרויקטים (ProjectId): ${results.itemIdStats.fromProduct.toLocaleString()}`);
    console.log(`     └─ מתוכם עם בחירה מרובה: ${results.itemIdStats.fromProductMultiChoice.toLocaleString()}`);
    console.log(`   Orphaned (default): ${results.itemIdStats.orphaned.toLocaleString()}`);

    if (results.errors.length > 0) {
      console.log(`\n⚠️  ${results.errors.length} שגיאות:`);
      console.log(`📋 קובץ שגיאות מלא: data/migration-state/donation-errors.json\n`);
      results.errors.slice(0, 10).forEach(err => {
        console.log(`   - OrdersId=${err.OrdersId}: ${err.errorMessage}`);
      });
      if (results.errors.length > 10) {
        console.log(`   ... ועוד ${results.errors.length - 10} שגיאות`);
      }
    }

    console.log(`\n🎉 מיגרציית Donation הושלמה!${dryRun ? ' (Dry Run)' : ''}\n`);

    // Clear saved state on successful completion
    clearState();

    return results;

  } catch (err) {
    console.error('❌ שגיאה כללית:', err.message);
    console.error(err);

    // Save errors before throwing
    if (results && results.errors && results.errors.length > 0) {
      console.log(`\n💾 שומר ${results.errors.length} שגיאות לקובץ...`);
      saveErrors(results.errors);
    }

    throw err;
  } finally {
    if (mssqlConn) await sql.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Load FK mapping from JSON file
 */
function loadMapping(filename) {
  const mappingPath = path.join(__dirname, '../../data/fk-mappings', filename);

  if (!fs.existsSync(mappingPath)) {
    throw new Error(`ERROR: ${filename} not found! Required for migration.`);
  }

  return JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
}

/**
 * CRITICAL: Determine ItemId for donation
 *
 * Priority Logic (confirmed by user):
 * 1. PrayerId > 0 → Use PrayerProjectItemId.json
 * 2. ProjectId > 0 → Use ProductsMapping.json
 *    - If single item: use that item
 *    - If multiple items: Priority by ItemType (5→4→1→2→3)
 * 3. Both NULL/0 → Default ItemId=1
 *
 * @param {Object} order - Order record from SQL Server
 * @param {Object} productsMapping - ProductsMapping.json
 * @param {Object} prayerMapping - PrayerProjectItemId.json
 * @param {Object} results - Results object for stats
 * @returns {number} ItemId for donation
 */
async function determineItemId(order, productsMapping, prayerMapping, results) {
  // Category B: PrayerId > 0
  if (order.PrayerId && order.PrayerId > 0) {
    // prayerMapping structure: { mapping: { "1": { ProjectItemId: 123 } } }
    const prayerData = prayerMapping.mapping ? prayerMapping.mapping[order.PrayerId] : prayerMapping[order.PrayerId];
    const projectItemId = prayerData?.ProjectItemId ?? (typeof prayerData === 'number' ? prayerData : null);

    if (!projectItemId || projectItemId === null) {
      // Prayer not migrated yet - try fallback to ProjectId if exists
      if (order.ProjectId && order.ProjectId > 0) {
        console.warn(`⚠️  PrayerId ${order.PrayerId} not found - falling back to ProjectId ${order.ProjectId}`);
        // Fall through to Category A logic below
      } else {
        throw new Error(`PrayerId ${order.PrayerId} not found in PrayerProjectItemId.json and no ProjectId fallback`);
      }
    } else {
      results.itemIdStats.fromPrayer++;
      return projectItemId;
    }
  }

  // Category A: ProjectId > 0
  if (order.ProjectId && order.ProjectId > 0) {
    const productMapping = productsMapping.mapping[order.ProjectId];

    if (!productMapping) {
      console.warn(`⚠️  ProjectId ${order.ProjectId} not found in ProductsMapping.json - using default ItemId=1`);
      results.itemIdStats.orphaned++;
      return 1;  // Default: "קרן קופת העיר"
    }

    const projectItemIds = productMapping.ProjectItemIds;

    // Single item: easy choice
    if (projectItemIds.length === 1) {
      results.itemIdStats.fromProduct++;
      return projectItemIds[0].Id;
    }

    // Multiple items: CRITICAL - Priority by ItemType
    // Priority Order (confirmed by user): 5 → 4 → 1 → 2 → 3
    results.itemIdStats.fromProduct++;
    results.itemIdStats.fromProductMultiChoice++;

    const priorityOrder = [5, 4, 1, 2, 3];

    for (const itemType of priorityOrder) {
      const item = projectItemIds.find(i => i.ItemType === itemType);
      if (item) {
        return item.Id;
      }
    }

    // Fallback: first item
    return projectItemIds[0].Id;
  }

  // Category C: Orphaned (both NULL/0)
  results.itemIdStats.orphaned++;
  return 1;  // Default: "קרן קופת העיר"
}

/**
 * Create Address record inline if needed
 *
 * @param {Object} mysqlConn - MySQL connection
 * @param {Object} order - Order record
 * @param {string} type - 'billing' or 'shipping'
 * @param {Object} results - Results object for stats
 * @param {boolean} dryRun - Dry run mode
 * @returns {number|null} Address ID or null
 */
async function createAddressIfNeeded(mysqlConn, order, type, results, dryRun) {
  let street, city, country, zip;

  if (type === 'billing') {
    // No billing address for anonymous users
    if (order.AnonymousUser) return null;

    street = order.BillingStreet;
    city = order.BillingCity;
    country = order.BillingCountry;
    zip = order.BillingZip;
  } else {
    // Shipping address from certificate fields
    street = order.CertificateStreet;
    city = order.CertificateCity;
    country = order.CertificateCountry;
    zip = order.CertificateZip;
  }

  // No data → no address
  if (!street && !city && !country && !zip) {
    return null;
  }

  if (dryRun) {
    results.addressesCreated++;
    return null;  // Don't actually create in dry run
  }

  // Insert address
  // Note: address table has simple structure - no RecordStatus/CreatedAt/etc.
  // Country is int NOT NULL (FK to lutcountry) - default to 1 (Israel)
  // City is varchar NOT NULL - MUST use empty string (truncate returns null for empty!)
  const [result] = await mysqlConn.query(`
    INSERT INTO ${getCorrectTableName('address')} (
      Street,
      City,
      Country,
      ZipCode
    ) VALUES (?, ?, ?, ?)
  `, [
    street ? truncate(street, 100) : '',
    city ? truncate(city, 100) : '',  // City NOT NULL - empty string if no value
    1,  // Country: Default to 1 (Israel) - TODO: Map country strings to lutcountry IDs
    zip ? truncate(zip, 10) : ''
  ]);

  results.addressesCreated++;
  return result.insertId;
}

/**
 * Map ChargeStatus to donation.Status
 */
function mapDonationStatus(chargeStatus) {
  if (!chargeStatus) return 3;  // Failed

  switch (chargeStatus) {
    case 'RedirectedToChargePage':
      return 1;  // RedirectToPayment
    case 'OrderFinished':
      return 2;  // Complete
    case 'AwaitingCharge':
    case 'ManualCharge':
      return 4;  // WaitForPhonePayment
    default:
      return 3;  // Failed
  }
}

/**
 * Map currency string to lutcurrency.Id
 */
function mapCurrency(currency) {
  if (!currency) return 1;  // Default: NIS

  switch (currency) {
    case '₪':
    case 'NIS':
    case 'ILS':
      return 1;  // NIS
    case '$':
    case 'USD':
      return 2;  // Dollar
    case '€':
    case 'EUR':
      return 3;  // Euro
    case '£':
    case 'GBP':
      return 4;  // Pound
    default:
      return 1;  // Default: NIS
  }
}

/**
 * Map OrderLanguage to lutlanguage.Id
 */
function mapLanguage(orderLanguage) {
  if (!orderLanguage) return null;

  switch (orderLanguage.toLowerCase()) {
    case 'he':
    case 'hebrew':
      return 1;
    case 'en':
    case 'english':
      return 2;
    case 'fr':
    case 'french':
      return 3;
    default:
      return null;
  }
}

/**
 * Calculate MonthlySum
 */
function calculateMonthlySum(total, payments) {
  if (!total) return 0;
  const numPayments = payments || 1;
  return Math.round((total / numPayments) * 100) / 100;  // Round to 2 decimals
}

/**
 * Map DonationType to lutpaymenttype.Id
 */
function mapPaymentType(donationType) {
  if (donationType === 'FixedDonation') {
    return 1;  // Fixed
  }
  return 2;  // OneTime
}

/**
 * Get ClearingMethodAreaId from PaymentMethod + OrderLanguage + ChargeCurrency
 *
 * Complex mapping with 22 cases (from CSV line 1207-1227)
 */
async function getClearingMethodAreaId(mysqlConn, paymentMethod, orderLanguage, chargeCurrency) {
  if (!paymentMethod) return null;

  let clearingMethodId;

  // Map PaymentMethod to ClearingMethodId (FIXED: correct IDs from clearingmethod table)
  if (paymentMethod === 'CreditCard') {
    if (orderLanguage === 'en' && chargeCurrency === '£') {
      clearingMethodId = 1;  // Stripe
    } else if (orderLanguage === 'en') {
      clearingMethodId = 3;  // Authorize
    } else if (orderLanguage === 'he') {
      clearingMethodId = 2;  // CardCom
    } else if (orderLanguage === 'fr') {
      clearingMethodId = 4;  // PayLine
    } else {
      clearingMethodId = 24;  // Other (FIXED: was 22, actual DB has 24)
    }
  } else if (paymentMethod === 'PayPal' || paymentMethod === ' PayPal') {
    clearingMethodId = 7;  // PayPal (FIXED: was 5, actual DB has 7)
  } else if (paymentMethod === 'NedarimPlus') {
    clearingMethodId = 8;  // Nedarim (FIXED: was 6, actual DB has 8)
  } else if (paymentMethod === 'AsserBishvil') {
    clearingMethodId = 10;  // AsserBishvil (FIXED: was 8, actual DB has 10)
  } else if (paymentMethod === 'Broom') {
    clearingMethodId = 11;  // Broom (FIXED: was 9, actual DB has 11)
  } else if (paymentMethod === 'ThreePillars') {
    clearingMethodId = 12;  // ThreePillars (FIXED: was 10, actual DB has 12)
  } else if (paymentMethod === 'Cash') {
    clearingMethodId = 13;  // Cache (FIXED: was 11, actual DB has 13)
  } else if (paymentMethod === 'Check') {
    clearingMethodId = 14;  // Check (FIXED: was 12, actual DB has 14)
  } else if (paymentMethod === 'BusinessCredit' && orderLanguage === 'he') {
    clearingMethodId = 18;  // Asakim Phone Credit (FIXED: was 16, actual DB has 18)
  } else if (paymentMethod === 'BankTransfer') {
    clearingMethodId = 21;  // BankTransfer (FIXED: was 19, actual DB has 21)
  } else if (paymentMethod === 'BankStandingOrder') {
    clearingMethodId = 22;  // BankStandingOrder (FIXED: was 20, actual DB has 22)
  } else if (paymentMethod === 'Bit') {
    clearingMethodId = 23;  // Bit (FIXED: was 21, actual DB has 23)
  } else {
    clearingMethodId = 24;  // Other (FIXED: was 22, actual DB has 24)
  }

  // Map OrderLanguage to Area
  let area;
  if (orderLanguage === 'he') {
    area = 1;  // Israel
  } else if (orderLanguage === 'en' && chargeCurrency === '£') {
    area = 2;  // UK (FIXED: was 3)
  } else if (orderLanguage === 'en') {
    area = 3;  // USA (FIXED: was 2)
  } else if (orderLanguage === 'fr') {
    area = 4;  // France
  } else {
    area = 1;  // Default: Israel
  }

  // Lookup ClearingMethodAreaId
  try {
    const [result] = await mysqlConn.query(
      'SELECT Id FROM clearingmethodarea WHERE ClearingMethodId = ? AND Area = ?',
      [clearingMethodId, area]
    );

    return result.length > 0 ? result[0].Id : null;
  } catch (err) {
    console.warn(`Warning: ClearingMethod lookup failed for Method=${clearingMethodId}, Area=${area}`);
    return null;
  }
}

/**
 * Create JSON for MoreProviderDetails field
 */
function createProviderJSON(order) {
  const details = {
    voucherAccountNum: order.VoucherAccountNum,
    cardToken: order.CardToken,
    cardOwnerName: order.CardOwnerName,
    cardExp: order.CardExp,
    cardNum: order.CardNum,
    cardHolderId: order.CardHolderId,
    cardAuthNum: order.CardAuthNum,
    firstPayment: order.FirstPayment,
    constPayment: order.ConstPayment,
    lowProfileDealGuid: order.LowProfileDealGuid
  };

  // Remove null/undefined values
  Object.keys(details).forEach(key => {
    if (details[key] === null || details[key] === undefined) {
      delete details[key];
    }
  });

  return Object.keys(details).length > 0 ? JSON.stringify(details) : null;
}

/**
 * Map UserId with FK mapping
 */
function mapUserId(userId, userIdMapping) {
  if (!userId || userId === 0) return null;

  const mappedId = userIdMapping[userId];
  return mappedId || null;  // Return null if not found
}

/**
 * Map RecruiterId with FK mapping
 *
 * Logic from CSV: "find created Recriuter for Orders.RecriuterId or UserSource=recParam<RecriuterId>"
 * - First check if RecruiterId exists in mapping (ProductStock.ProductStockId -> recruiter.Id)
 * - Could also extract from UserSource with pattern "recParam<RecriuterId>" (future enhancement)
 *
 * @param {number} recruiterId - RecruiterId from Orders table
 * @param {Object} recruiterIdMapping - RecruiterId.json mapping
 * @returns {number|null} Mapped RecruiterId or null
 */
function mapRecruiterId(recruiterId, recruiterIdMapping) {
  if (!recruiterId || recruiterId === 0) return null;

  // recruiterIdMapping.mappings contains: { "oldId": newId }
  const mappings = recruiterIdMapping.mappings || {};
  const mappedId = mappings[recruiterId.toString()];

  return mappedId || null;  // Return null if not found in mapping
}

/**
 * Extract UnknownSourceCode from UserSource
 */
function extractUnknownSource(userSource) {
  if (!userSource) return null;

  // If starts with recParam, it's not unknown
  if (userSource.startsWith('recParam')) return null;

  // TODO: Check if exists in UserSources/Source table
  // For now, return the code as-is
  return truncate(userSource, 50);
}

/**
 * Map SourceApp from IsManualDonation and PaymentMethod
 */
function mapSourceApp(isManualDonation, paymentMethod) {
  if (isManualDonation === true || isManualDonation === 1) {
    return 2;  // ManagementSite
  }

  if (paymentMethod === 'NedarimPlus') {
    return 4;  // Nedarim
  }

  return 1;  // CustomerSite (default)
}

/**
 * Truncate string to max length
 */
function truncate(value, maxLength) {
  if (!value) return null;

  const str = String(value);
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}

// ============================================
// EXPORT & RUN
// ============================================

// If run directly (not imported)
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  args.forEach((arg, index) => {
    if (arg === '--dryRun') {
      options.dryRun = true;
    } else if (arg === '--limit' && args[index + 1]) {
      options.limit = parseInt(args[index + 1]);
    } else if (arg === '--offset' && args[index + 1]) {
      options.offset = parseInt(args[index + 1]);
    } else if (arg === '--batchSize' && args[index + 1]) {
      options.batchSize = parseInt(args[index + 1]);
    }
  });

  console.log('Migration Options:', options);

  migrateDonations(options)
    .then(results => {
      console.log('\n✅ Migration completed successfully');
      process.exit(results.errors.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('\n❌ Migration failed:', err);
      process.exit(1);
    });
}

// Export for use in server
module.exports = { migrateDonations, loadState, clearState, saveState };
