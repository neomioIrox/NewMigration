const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function checkDonationDependencies() {
  console.log('🔍 בודק תלויות למיגרציית Donation...\n');

  let mssqlConn, mysqlConn;

  try {
    // Connect to both databases
    console.log('📡 מתחבר לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // 1. CHECK: ProjectItem (ItemId FK)
    // ========================================
    console.log('━'.repeat(60));
    console.log('1️⃣  בדיקת ProjectItem (FK: ItemId)');
    console.log('━'.repeat(60));

    const [projectItems] = await mysqlConn.query('SELECT COUNT(*) as count FROM projectitem');
    console.log(`✅ ProjectItem: ${projectItems[0].count} פריטים קיימים`);

    // Check if we have projectItem=1 (default for orphaned)
    const [defaultItem] = await mysqlConn.query('SELECT * FROM projectitem WHERE Id = 1');
    if (defaultItem.length > 0) {
      console.log(`✅ ProjectItem Id=1 קיים (ברירת מחדל לOrders orphaned)`);
      console.log(`   Name: ${defaultItem[0].Name || 'N/A'}`);
    } else {
      console.log(`⚠️  ProjectItem Id=1 לא קיים! צריך ליצור עבור orphaned orders`);
    }

    // ========================================
    // 2. CHECK: CustomerUser (UserId FK)
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('2️⃣  בדיקת CustomerUser (FK: UserId)');
    console.log('━'.repeat(60));

    // Check if user table exists
    const [userTables] = await mysqlConn.query("SHOW TABLES LIKE 'user'");
    if (userTables.length > 0) {
      console.log('✅ טבלת user קיימת');

      // Count users by RoleId
      const [usersByRole] = await mysqlConn.query(`
        SELECT RoleId, COUNT(*) as count
        FROM user
        GROUP BY RoleId
        ORDER BY count DESC
      `);
      console.log('   משתמשים לפי RoleId:');
      usersByRole.forEach(row => {
        console.log(`   - RoleId ${row.RoleId}: ${row.count} משתמשים`);
      });

      // Check how many Orders have UserId
      const ordersWithUserId = await sql.query`
        SELECT COUNT(*) as count
        FROM Orders
        WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
          AND UserId IS NOT NULL
          AND UserId != 0
      `;
      console.log(`\n   📊 Orders עם UserId תקין: ${ordersWithUserId.recordset[0].count}`);

      // Check if old DB Users exist
      const oldUsersCount = await sql.query`SELECT COUNT(*) as count FROM Users`;
      console.log(`   📊 Users בDB הישן: ${oldUsersCount.recordset[0].count}`);

    } else {
      console.log('⚠️  טבלת user לא קיימת - צריך לבדוק!');
    }

    // ========================================
    // 3. CHECK: Address (ReceiptAddress, ShippingAddress FKs)
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('3️⃣  בדיקת Address (FK: ReceiptAddress, ShippingAddress)');
    console.log('━'.repeat(60));

    const [addressTables] = await mysqlConn.query("SHOW TABLES LIKE 'address'");
    if (addressTables.length > 0) {
      const [addressCount] = await mysqlConn.query('SELECT COUNT(*) as count FROM address');
      console.log(`✅ טבלת address קיימת: ${addressCount[0].count} כתובות`);
    } else {
      console.log('🔴 טבלת address לא קיימת!');

      // Check how many orders have address data
      const ordersWithBilling = await sql.query`
        SELECT COUNT(*) as count
        FROM Orders
        WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
          AND (BillingStreet IS NOT NULL OR BillingCity IS NOT NULL)
      `;
      console.log(`   📊 Orders עם כתובת billing: ${ordersWithBilling.recordset[0].count}`);

      const ordersWithShipping = await sql.query`
        SELECT COUNT(*) as count
        FROM Orders
        WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
          AND (CertificateStreet IS NOT NULL OR ShippingStreet IS NOT NULL)
      `;
      console.log(`   📊 Orders עם כתובת shipping: ${ordersWithShipping.recordset[0].count}`);
    }

    // ========================================
    // 4. CHECK: Source (SourceId FK)
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('4️⃣  בדיקת Source (FK: SourceId)');
    console.log('━'.repeat(60));

    const [sources] = await mysqlConn.query('SELECT COUNT(*) as count FROM source');
    console.log(`✅ Source: ${sources[0].count} מקורות קיימים`);

    // Check UserSource usage in Orders
    const ordersWithUserSource = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND UserSource IS NOT NULL
        AND UserSource != ''
    `;
    console.log(`   📊 Orders עם UserSource: ${ordersWithUserSource.recordset[0].count}`);

    // Check recParam pattern
    const ordersWithRecParam = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND UserSource LIKE 'recParam%'
    `;
    console.log(`   📊 Orders עם recParam pattern: ${ordersWithRecParam.recordset[0].count}`);

    // ========================================
    // 5. CHECK: Recruiter (RecruiterId FK)
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('5️⃣  בדיקת Recruiter (FK: RecruiterId)');
    console.log('━'.repeat(60));

    const [recruiters] = await mysqlConn.query('SELECT COUNT(*) as count FROM recruiter');
    console.log(`✅ Recruiter: ${recruiters[0].count} מגייסים קיימים`);

    const ordersWithRecruiter = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND RecruiterId IS NOT NULL
        AND RecruiterId != 0
    `;
    console.log(`   📊 Orders עם RecruiterId: ${ordersWithRecruiter.recordset[0].count}`);

    // ========================================
    // 6. CHECK: Prayer/PrayerName (for PrayerId Orders)
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('6️⃣  בדיקת Prayer (עבור Orders עם PrayerId)');
    console.log('━'.repeat(60));

    // Check old DB Prayers
    const oldPrayers = await sql.query`SELECT COUNT(*) as count FROM Prayers`;
    console.log(`   📊 Prayers בDB הישן: ${oldPrayers.recordset[0].count}`);

    const ordersWithPrayer = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND PrayerId IS NOT NULL
        AND PrayerId != 0
    `;
    console.log(`   📊 Orders עם PrayerId תקין: ${ordersWithPrayer.recordset[0].count}`);

    // Check if Prayer projects exist in new DB
    const [prayerProjects] = await mysqlConn.query(`
      SELECT COUNT(*) as count
      FROM project
      WHERE ProjectType = 3
    `);
    if (prayerProjects[0].count > 0) {
      console.log(`✅ Prayer projects קיימים בDB החדש: ${prayerProjects[0].count}`);
    } else {
      console.log(`🔴 Prayer projects לא קיימים בDB החדש!`);
      console.log(`   ⚠️  ${ordersWithPrayer.recordset[0].count} Orders תלויים בזה!`);
    }

    // ========================================
    // 7. CHECK: ClearingMethodArea
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('7️⃣  בדיקת ClearingMethodArea (FK: ClearingMethodAreaId)');
    console.log('━'.repeat(60));

    const [clearingTables] = await mysqlConn.query("SHOW TABLES LIKE 'clearingmethodarea'");
    if (clearingTables.length > 0) {
      const [clearingCount] = await mysqlConn.query('SELECT COUNT(*) as count FROM clearingmethodarea');
      console.log(`✅ ClearingMethodArea קיימת: ${clearingCount[0].count} שיטות`);

      // Show sample data (first check columns)
      const [clearingColumns] = await mysqlConn.query('DESCRIBE clearingmethodarea');
      console.log('   עמודות בטבלה:');
      clearingColumns.forEach(col => {
        console.log(`   - ${col.Field} (${col.Type})`);
      });

      const [clearingSample] = await mysqlConn.query('SELECT * FROM clearingmethodarea LIMIT 5');
      console.log('   דוגמאות (5 ראשונות):');
      clearingSample.forEach((row, i) => {
        console.log(`   ${i+1}. ${JSON.stringify(row)}`);
      });
    } else {
      console.log('⚠️  טבלת clearingmethodarea לא קיימת');
    }

    // ========================================
    // 8. CHECK: Missing fields in mapping
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('8️⃣  שדות חסרים במיפוי (קיימים בDB חדש אבל לא במיפוי CSV)');
    console.log('━'.repeat(60));

    const [donationColumns] = await mysqlConn.query("DESCRIBE donation");
    const mappedFields = [
      'Id', 'ItemId', 'Status', 'Currency', 'MonthlySum', 'PaymentsCount',
      'PaymentType', 'ReferenceNum', 'ClearingMethodAreaId', 'TerminalId',
      'ProviderReferenceNum', 'ProviderApprovalNum', 'ProviderResultCode',
      'ProviderResultMsg', 'MoreProviderDetails', 'ReceiptBy', 'ReceiptForCountry',
      'ReceiptNum', 'UserId', 'DonorFirstName', 'DonorLastName', 'DonorEmail',
      'DonorPhone', 'SourceType', 'SourceId', 'UnknownSourceCode', 'RecruiterId',
      'SourceApp', 'SourceIP', 'EngravingName', 'SendReceiptByPost',
      'ReceiptAddress', 'ShippingAddress', 'DeliveryMethod', 'DisplayAsAnonymous',
      'DisplayName', 'CustomerComments', 'RecordStatus', 'StatusChangedAt',
      'StatusChangedBy', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'
    ];

    const missingFields = donationColumns
      .map(col => col.Field)
      .filter(field => !mappedFields.includes(field));

    if (missingFields.length > 0) {
      console.log('🔴 שדות חסרים במיפוי:');
      missingFields.forEach(field => {
        const colInfo = donationColumns.find(c => c.Field === field);
        const nullable = colInfo.Null === 'YES' ? '(NULL)' : '(NOT NULL) ⚠️';
        console.log(`   - ${field} ${colInfo.Type} ${nullable}`);
      });
    } else {
      console.log('✅ כל השדות ממופים');
    }

    // ========================================
    // 9. SUMMARY: Orders breakdown by category
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('9️⃣  סיכום Orders לפי קטגוריות');
    console.log('━'.repeat(60));

    const categoryA = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND ProjectId IS NOT NULL
        AND ProjectId != 0
    `;
    console.log(`📊 קטגוריה A (ProjectId תקין): ${categoryA.recordset[0].count.toLocaleString()}`);

    const categoryB = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND (ProjectId IS NULL OR ProjectId = 0)
        AND PrayerId IS NOT NULL
        AND PrayerId != 0
    `;
    console.log(`📊 קטגוריה B (PrayerId תקין): ${categoryB.recordset[0].count.toLocaleString()}`);

    const categoryC = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND (ProjectId IS NULL OR ProjectId = 0)
        AND (PrayerId IS NULL OR PrayerId = 0)
    `;
    console.log(`📊 קטגוריה C (Orphaned): ${categoryC.recordset[0].count.toLocaleString()}`);

    const total = categoryA.recordset[0].count + categoryB.recordset[0].count + categoryC.recordset[0].count;
    console.log(`📊 סה"כ: ${total.toLocaleString()}`);

    console.log('\n✅ בדיקת תלויות הושלמה!\n');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
  } finally {
    await sql.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

checkDonationDependencies();
