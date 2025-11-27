const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function checkPrayersData() {
  console.log('🔍 בודק נתונים בטבלת Prayers...\n');

  let mssqlConn, mysqlConn;

  try {
    // Connect to databases
    console.log('📡 מתחבר לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // 1. Check Prayers table structure
    // ========================================
    console.log('━'.repeat(60));
    console.log('1️⃣  מבנה טבלת Prayers (DB ישן)');
    console.log('━'.repeat(60));

    const tableInfo = await sql.query`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Prayers'
      ORDER BY ORDINAL_POSITION
    `;

    console.log('עמודות בטבלה:');
    tableInfo.recordset.forEach(col => {
      const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
      const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`   - ${col.COLUMN_NAME} ${col.DATA_TYPE}${length} ${nullable}`);
    });

    // ========================================
    // 2. Count total prayers
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('2️⃣  סטטיסטיקות');
    console.log('━'.repeat(60));

    const totalResult = await sql.query`SELECT COUNT(*) as Total FROM Prayers`;
    console.log(`📊 סה"כ Prayers: ${totalResult.recordset[0].Total}`);

    // ========================================
    // 3. Check for NULL/empty names
    // ========================================
    const nullNames = await sql.query`
      SELECT COUNT(*) as count
      FROM Prayers
      WHERE Name IS NULL OR Name = ''
    `;
    console.log(`   - Name NULL/empty: ${nullNames.recordset[0].count}`);

    const nullNamesEn = await sql.query`
      SELECT COUNT(*) as count
      FROM Prayers
      WHERE Name_en IS NULL OR Name_en = '' OR Name_en = 'null'
    `;
    console.log(`   - Name_en NULL/empty/string'null': ${nullNamesEn.recordset[0].count}`);

    const nullNamesFr = await sql.query`
      SELECT COUNT(*) as count
      FROM Prayers
      WHERE Name_fr IS NULL OR Name_fr = '' OR Name_fr = 'null'
    `;
    console.log(`   - Name_fr NULL/empty/string'null': ${nullNamesFr.recordset[0].count}`);

    // ========================================
    // 4. Sample data
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('3️⃣  דוגמת 5 Prayers');
    console.log('━'.repeat(60));

    const sampleResult = await sql.query`
      SELECT TOP 5
        PrayersId,
        Name,
        Name_en,
        Name_fr,
        Sort,
        Hide,
        Price
      FROM Prayers
      ORDER BY PrayersId
    `;

    sampleResult.recordset.forEach((row, i) => {
      console.log(`\n${i + 1}. PrayersId: ${row.PrayersId}`);
      console.log(`   Name (HE): ${row.Name || 'NULL'}`);
      console.log(`   Name_en: ${row.Name_en || 'NULL'}`);
      console.log(`   Name_fr: ${row.Name_fr || 'NULL'}`);
      console.log(`   Sort: ${row.Sort}, Hide: ${row.Hide}, Price: ${row.Price}`);
    });

    // ========================================
    // 5. Check how many Orders depend on Prayers
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('4️⃣  Orders שתלויים ב-Prayers');
    console.log('━'.repeat(60));

    const ordersWithPrayer = await sql.query`
      SELECT COUNT(*) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND PrayerId IS NOT NULL
        AND PrayerId != 0
    `;
    console.log(`📊 Orders עם PrayerId תקין: ${ordersWithPrayer.recordset[0].count}`);

    // Count unique PrayerIds
    const uniquePrayers = await sql.query`
      SELECT COUNT(DISTINCT PrayerId) as count
      FROM Orders
      WHERE (ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE()))
        AND PrayerId IS NOT NULL
        AND PrayerId != 0
    `;
    console.log(`   - Unique PrayerIds בשימוש: ${uniquePrayers.recordset[0].count}`);

    // ========================================
    // 6. Check current state in new DB
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('5️⃣  מצב נוכחי ב-DB החדש');
    console.log('━'.repeat(60));

    const [existingProjects] = await mysqlConn.query(`
      SELECT COUNT(*) as count
      FROM project
      WHERE ProjectType = 3
    `);
    console.log(`📊 Prayer projects קיימים: ${existingProjects[0].count}`);

    const [existingItems] = await mysqlConn.query(`
      SELECT COUNT(*) as count
      FROM projectitem
      WHERE ItemType = 3
    `);
    console.log(`📊 Prayer projectitems קיימים: ${existingItems[0].count}`);

    // ========================================
    // 7. Check ProjectType and ItemType enums
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('6️⃣  בדיקת Enums');
    console.log('━'.repeat(60));

    const [projectTypes] = await mysqlConn.query('SELECT * FROM lutprojecttype');
    console.log('lutprojecttype:');
    projectTypes.forEach(pt => {
      console.log(`   - Id ${pt.Id}: ${pt.Description}${pt.Id === 3 ? ' ← Prayer' : ''}`);
    });

    const [itemTypes] = await mysqlConn.query('SELECT * FROM lutprojectitemtype');
    console.log('\nlutprojectitemtype:');
    itemTypes.forEach(it => {
      console.log(`   - Id ${it.Id}: ${it.Description}${it.Id === 3 ? ' ← PrayerName' : ''}`);
    });

    console.log('\n✅ בדיקה הושלמה!\n');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
  } finally {
    await sql.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

checkPrayersData();
