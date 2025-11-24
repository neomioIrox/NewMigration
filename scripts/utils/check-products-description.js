const sql = require('mssql');

async function checkProductsDescription() {
  console.log('🔍 Checking Products.Description...\n');

  // MSSQL connection
  const config = {
    user: 'sa',
    password: 'T770sz#!',
    server: 'localhost',
    database: 'Kupat1',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    const pool = await sql.connect(config);

    // Get sample Description from Products
    console.log('📄 Sample Products.Description (Hebrew):');
    console.log('='.repeat(80));
    const result = await pool.request().query(`
      SELECT TOP 3
        productsid,
        Name,
        LEFT(Description, 500) as Description_Preview,
        LEN(Description) as Description_Length,
        LEFT(Description_en, 500) as Description_en_Preview,
        LEN(Description_en) as Description_en_Length,
        LEFT(Description_fr, 500) as Description_fr_Preview,
        LEN(Description_fr) as Description_fr_Length
      FROM Products
      WHERE productsid <= 3
      ORDER BY productsid
    `);

    result.recordset.forEach(row => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 Product ID: ${row.productsid}`);
      console.log(`📝 Name: ${row.Name}`);
      console.log(`\n🇮🇱 Hebrew Description (${row.Description_Length} chars):`);
      console.log(row.Description_Preview);
      if (row.Description_Length > 500) {
        console.log(`... (truncated, total ${row.Description_Length} chars)`);
      }

      console.log(`\n🇬🇧 English Description (${row.Description_en_Length} chars):`);
      console.log(row.Description_en_Preview || '(null)');
      if (row.Description_en_Length > 500) {
        console.log(`... (truncated, total ${row.Description_en_Length} chars)`);
      }

      console.log(`\n🇫🇷 French Description (${row.Description_fr_Length} chars):`);
      console.log(row.Description_fr_Preview || '(null)');
      if (row.Description_fr_Length > 500) {
        console.log(`... (truncated, total ${row.Description_fr_Length} chars)`);
      }
    });

    await pool.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkProductsDescription();
