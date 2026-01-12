const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkPrayersStructure() {
  console.log('🔍 בודק מבנה טבלת Prayers...\n');

  try {
    await sql.connect(mssqlConfig);

    // 1. Get column structure
    const colsResult = await sql.query`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Prayers'
      ORDER BY ORDINAL_POSITION
    `;

    console.log('📋 עמודות בטבלת Prayers:');
    console.log('━'.repeat(80));
    colsResult.recordset.forEach(col => {
      const nullable = col.IS_NULLABLE === 'YES' ? '(NULL)' : '(NOT NULL)';
      const maxLen = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`   ${col.COLUMN_NAME.padEnd(30)} ${col.DATA_TYPE}${maxLen} ${nullable}`);
    });

    // 2. Total count
    const countResult = await sql.query`SELECT COUNT(*) as Total FROM Prayers`;
    console.log(`\n📊 סה"כ Prayers: ${countResult.recordset[0].Total}`);

    // 3. Sample data
    const sampleResult = await sql.query`
      SELECT TOP 5 * FROM Prayers ORDER BY PrayersId
    `;
    console.log('\n📄 דוגמאות (5 ראשונות):');
    console.log('━'.repeat(80));
    sampleResult.recordset.forEach((row, i) => {
      console.log(`\n${i+1}. PrayersId: ${row.PrayersId}`);
      Object.keys(row).forEach(key => {
        if (key !== 'PrayersId') {
          console.log(`   ${key}: ${row[key]}`);
        }
      });
    });

    // 4. Check relationship with Orders
    const ordersWithPrayer = await sql.query`
      SELECT COUNT(*) as Count
      FROM Orders
      WHERE PrayerId IS NOT NULL AND PrayerId != 0
    `;
    console.log(`\n📊 Orders עם PrayerId: ${ordersWithPrayer.recordset[0].Count}`);

    // 5. Check unique Prayers used in Orders
    const uniquePrayersInOrders = await sql.query`
      SELECT COUNT(DISTINCT PrayerId) as Count
      FROM Orders
      WHERE PrayerId IS NOT NULL AND PrayerId != 0
    `;
    console.log(`📊 Prayers ייחודיים ב-Orders: ${uniquePrayersInOrders.recordset[0].Count}`);

    console.log('\n✅ בדיקה הושלמה!');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
  } finally {
    await sql.close();
  }
}

checkPrayersStructure();
