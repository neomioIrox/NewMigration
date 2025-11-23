// Test the performance of the Funds WHERE clause
const sql = require('mssql');

async function testQuery() {
  try {
    console.log('🔍 Testing WHERE clause performance...\n');

    // MSSQL Configuration - adjust if needed
    const mssqlConfig = {
      server: 'localhost',
      database: 'KupatHairDB',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      authentication: {
        type: 'default'
      },
      requestTimeout: 120000 // 2 minutes
    };

    console.log('Connecting to MSSQL...');
    const pool = await sql.connect(mssqlConfig);
    console.log('✅ Connected\n');

    // Test 1: Count without WHERE clause
    console.log('Test 1: Counting all Products...');
    const start1 = Date.now();
    const result1 = await pool.request().query('SELECT COUNT(*) as total FROM products');
    const time1 = Date.now() - start1;
    console.log(`   Total: ${result1.recordset[0].total} records`);
    console.log(`   Time: ${time1}ms\n`);

    // Test 2: Count with WHERE clause
    const whereClause = `IsNull([Certificate],0) != 1 AND NOT EXISTS (SELECT * FROM ProductGroup g WHERE g.ParentProductId=products.productsid OR g.SubProductId=products.productsid) AND NOT EXISTS (SELECT * FROM news WHERE content1 LIKE '%pid='+CONVERT(NVARCHAR(50),products.productsid)+'&%' OR content1_en LIKE '%pid='+CONVERT(NVARCHAR(50),products.productsid)+'&%' OR content1_fr LIKE '%pid='+CONVERT(NVARCHAR(50),products.productsid)+'&%')`;

    console.log('Test 2: Counting with WHERE clause...');
    console.log('WHERE:', whereClause.substring(0, 100) + '...\n');

    const start2 = Date.now();
    const result2 = await pool.request().query(`SELECT COUNT(*) as filtered FROM products WHERE ${whereClause}`);
    const time2 = Date.now() - start2;
    console.log(`   Filtered: ${result2.recordset[0].filtered} records`);
    console.log(`   Time: ${time2}ms`);
    console.log(`   Excluded: ${result1.recordset[0].total - result2.recordset[0].filtered} records\n`);

    if (time2 > 15000) {
      console.log('⚠️  WARNING: Query takes longer than 15 seconds!');
      console.log('   The migration will timeout in the web UI.');
      console.log('   Consider optimizing the WHERE clause or adding indexes.\n');
    } else {
      console.log('✅ Query completes within 15 seconds');
      console.log('   Should work with the web UI.\n');
    }

    // Test 3: Sample the actual SELECT with all columns
    console.log('Test 3: Fetching actual data with WHERE clause...');
    const start3 = Date.now();
    const result3 = await pool.request().query(`
      SELECT productsid, Name, Certificate, Terminal, DateCreated,
             Name_en, Name_fr, ShortDescription, ShortDescription_en, ShortDescription_fr,
             Hide, Hide_en, Hide_fr, ShowMainPage, Price, Price_en, Price_fr,
             HideDonationAmount, Sort, ShowPrayerNames, ProjectNumber, WithoutKupatView
      FROM products
      WHERE ${whereClause}
    `);
    const time3 = Date.now() - start3;
    console.log(`   Fetched: ${result3.recordset.length} records`);
    console.log(`   Time: ${time3}ms\n`);

    if (time3 > 15000) {
      console.log('❌ FULL SELECT query takes longer than 15 seconds!');
      console.log('   This will cause timeout in migration.\n');
    } else {
      console.log('✅ Full SELECT completes within 15 seconds\n');
    }

    await pool.close();
    console.log('✅ Test complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('Login failed')) {
      console.log('\n💡 Tip: This script uses Windows Authentication.');
      console.log('   Make sure SQL Server is configured for Windows Auth,');
      console.log('   or modify the script to use SQL Authentication.\n');
    }
  }
}

testQuery();
