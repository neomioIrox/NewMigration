/**
 * Count exact number of Products that match Funds criteria
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function countFundsExact() {
  try {
    console.log('🔍 Counting Products that match Funds criteria...\n');

    const config = {
      ...mssqlConfig,
      requestTimeout: 180000  // 3 minutes
    };

    await sql.connect(config);

    // Exact WHERE clause from ProjectMapping_Funds_Fixed.json
    const fundsQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) != 1
        AND NOT EXISTS (
          SELECT 1 FROM ProductGroup g WITH (NOLOCK)
          WHERE g.ParentProductId=p.productsid
             OR g.SubProductId=p.productsid
        )
        AND NOT EXISTS (
          SELECT 1 FROM News
          WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
             OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
             OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
        )
    `;

    console.log('⏳ Running query (this may take 1-2 minutes)...\n');

    const result = await sql.query(fundsQuery);
    const fundsCount = result.recordset[0].count;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RESULT:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Products matching Funds criteria: ${fundsCount}\n`);

    console.log('These Products will be migrated as:');
    console.log(`  - ProjectType = 1 (Funds)\n`);

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

countFundsExact();
