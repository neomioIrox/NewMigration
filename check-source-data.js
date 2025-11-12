const sql = require('mssql');

const failingProductIds = [103, 104, 105, 106, 107, 108, 109, 110, 111, 113, 116, 119, 121, 122, 134, 136, 137, 139, 140, 142];

async function checkSourceData() {
  const config = {
    server: 'DESKTOP-8E2HGCA\\SQLEXPRESS',
    database: 'KupatHair',
    options: {
      trustServerCertificate: true,
      trustedConnection: true
    }
  };

  try {
    const pool = await sql.connect(config);

    const productIdsStr = failingProductIds.join(',');

    const result = await pool.request()
      .query(`
        SELECT
          productsid,
          Name,
          ShowPrayerNames,
          ISNULL(ShowPrayerNames, -999) as ShowPrayerNames_Coalesced
        FROM products
        WHERE productsid IN (${productIdsStr})
        ORDER BY productsid
      `);

    console.log('=== ShowPrayerNames values for failing product IDs ===\n');
    console.table(result.recordset);

    // Check unique values
    const uniqueValues = new Set(result.recordset.map(r => r.ShowPrayerNames));
    console.log('\n=== Unique ShowPrayerNames values ===');
    console.log([...uniqueValues]);

    // Check if any are truly NULL vs other falsy values
    const nullCount = result.recordset.filter(r => r.ShowPrayerNames === null).length;
    const undefinedCount = result.recordset.filter(r => r.ShowPrayerNames === undefined).length;
    const zeroCount = result.recordset.filter(r => r.ShowPrayerNames === 0).length;
    const falseCount = result.recordset.filter(r => r.ShowPrayerNames === false).length;

    console.log('\n=== Value type breakdown ===');
    console.log(`NULL: ${nullCount}`);
    console.log(`undefined: ${undefinedCount}`);
    console.log(`0: ${zeroCount}`);
    console.log(`false: ${falseCount}`);
    console.log(`Other: ${result.recordset.length - nullCount - undefinedCount - zeroCount - falseCount}`);

    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSourceData();
