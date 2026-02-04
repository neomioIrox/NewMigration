const mysql = require('mysql2/promise');
const sql = require('mssql');
const { mysqlConfig, mssqlConfig } = require('../../config/database');

async function analyzePrayerItems() {
  console.log('🔍 מנתח PrayerName items קיימים...\n');

  let mysqlConn;

  try {
    // Connect to MySQL
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // ========================================
    // 1. Find existing PrayerName items (ItemType=3)
    // ========================================
    console.log('━'.repeat(80));
    console.log('1️⃣  PrayerName items שכבר קיימים (ItemType=3)');
    console.log('━'.repeat(80));

    const [items] = await mysqlConn.query(`
      SELECT pi.*, p.ProjectType
      FROM projectitem pi
      JOIN project p ON pi.ProjectId = p.Id
      WHERE pi.ItemType = 3
      ORDER BY pi.Id
    `);

    console.log(`נמצאו ${items.length} PrayerName items:\n`);

    items.forEach((item, i) => {
      console.log(`${i+1}. ItemId: ${item.Id}, ProjectId: ${item.ProjectId}, ProjectType: ${item.ProjectType}`);
      console.log(`   ItemName: ${item.ItemName}`);
      console.log(`   KupatFundNo: ${item.KupatFundNo}`);
      console.log(`   HasEngravingName: ${item.HasEngravingName ? 'YES' : 'NO'}`);
      console.log(`   AllowFreeAddPrayerNames: ${item.AllowFreeAddPrayerNames ? 'YES' : 'NO'}`);
      console.log('');
    });

    // ========================================
    // 2. Check those Projects
    // ========================================
    console.log('━'.repeat(80));
    console.log('2️⃣  Projects שמכילים PrayerName items');
    console.log('━'.repeat(80));

    const projectIds = [...new Set(items.map(i => i.ProjectId))];
    console.log(`ProjectIds: ${projectIds.join(', ')}\n`);

    for (const projId of projectIds) {
      const [proj] = await mysqlConn.query('SELECT * FROM project WHERE Id = ?', [projId]);
      if (proj.length > 0) {
        const p = proj[0];
        console.log(`📌 Project ${p.Id}:`);
        console.log(`   ProjectType: ${p.ProjectType}`);
        console.log(`   RecordStatus: ${p.RecordStatus}`);

        const [loc] = await mysqlConn.query(
          'SELECT * FROM projectlocalization WHERE ProjectId = ? ORDER BY Language',
          [p.Id]
        );
        loc.forEach(l => {
          console.log(`   Title (Lang ${l.Language}): ${l.Title || l.Name || 'N/A'}`);
        });
        console.log('');
      }
    }

    // ========================================
    // 3. Compare with old DB - ShowPrayerNames field
    // ========================================
    console.log('━'.repeat(80));
    console.log('3️⃣  בדיקה: ShowPrayerNames ב-Products (DB ישן)');
    console.log('━'.repeat(80));

    await sql.connect(mssqlConfig);

    const showPrayerResult = await sql.query`
      SELECT COUNT(*) as Count
      FROM Products
      WHERE ShowPrayerNames = 1
    `;
    console.log(`Products עם ShowPrayerNames=1: ${showPrayerResult.recordset[0].Count}`);

    if (showPrayerResult.recordset[0].Count > 0) {
      const sampleResult = await sql.query`
        SELECT TOP 5 ProductsId, Name, Certificate, ShowPrayerNames
        FROM Products
        WHERE ShowPrayerNames = 1
      `;
      console.log('\nדוגמאות:');
      sampleResult.recordset.forEach((row, i) => {
        console.log(`${i+1}. ProductId=${row.ProductsId}: "${row.Name}"`);
        console.log(`   Certificate=${row.Certificate}, ShowPrayerNames=${row.ShowPrayerNames}`);
      });
    }

    // ========================================
    // 4. Key Question: Are these related to Prayers table?
    // ========================================
    console.log('\n' + '━'.repeat(80));
    console.log('4️⃣  האם PrayerName items קשורים לטבלת Prayers?');
    console.log('━'.repeat(80));

    console.log(`
📝 הבדל בין 2 מושגים:

1. **AllowFreeAddPrayerNames** (שדה ב-ProjectItem):
   - מאפשר למשתמש להוסיף שמות לתפילה חופשי
   - קיים ב-${items.length} ProjectItems
   - נוצר מהשדה ShowPrayerNames ב-Products הישן
   - **לא קשור לטבלת Prayers!**

2. **Prayers Table** (294 תפילות):
   - תפילות מוגדרות מראש (כותל 40 יום, עמוקה, וכו')
   - Orders עם PrayerId → תפילות אלו
   - צריך להיגרר כ-Projects נפרדים (ProjectType=3?)
   - **עדיין לא הוגרר!**
`);

    console.log('\n✅ ניתוח הושלם!');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
  } finally {
    if (mysqlConn) await mysqlConn.end();
    await sql.close();
  }
}

analyzePrayerItems();
