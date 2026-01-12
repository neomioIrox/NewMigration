/**
 * Quick validation: Check Products count with different WHERE conditions
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkFundsValidation() {
  try {
    console.log('🔍 Validating Funds WHERE clause...\n');

    // Increase timeout
    const config = {
      ...mssqlConfig,
      requestTimeout: 120000  // 2 minutes
    };

    await sql.connect(config);

    // Total Products
    console.log('1️⃣ Counting total Products...');
    const totalResult = await sql.query('SELECT COUNT(*) as total FROM products WITH (NOLOCK)');
    const total = totalResult.recordset[0].total;
    console.log(`   Total Products: ${total}\n`);

    // Products with Certificate = 1
    console.log('2️⃣ Counting Products with Certificate=1 (should be Collections)...');
    const certResult = await sql.query('SELECT COUNT(*) as count FROM products WITH (NOLOCK) WHERE Certificate = 1');
    const certCount = certResult.recordset[0].count;
    console.log(`   Certificate=1: ${certCount}\n`);

    // Products in ProductGroup
    console.log('3️⃣ Counting Products in ProductGroup (should be Collections)...');
    const groupResult = await sql.query(`
      SELECT COUNT(DISTINCT p.productsid) as count
      FROM products p WITH (NOLOCK)
      INNER JOIN ProductGroup g WITH (NOLOCK)
        ON g.ParentProductId=p.productsid OR g.SubProductId=p.productsid
    `);
    const groupCount = groupResult.recordset[0].count;
    console.log(`   In ProductGroup: ${groupCount}\n`);

    // Current Funds WHERE (without News check)
    console.log('4️⃣ Counting Products passing CURRENT Funds migration...');
    const currentFundsResult = await sql.query(`
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) != 1
        AND NOT EXISTS (
          SELECT 1 FROM ProductGroup g WITH (NOLOCK)
          WHERE g.ParentProductId=p.productsid
             OR g.SubProductId=p.productsid
        )
    `);
    const currentFunds = currentFundsResult.recordset[0].count;
    console.log(`   Current Funds count: ${currentFunds}\n`);

    // Check how many News records exist
    console.log('5️⃣ Checking News table...');
    const newsCountResult = await sql.query('SELECT COUNT(*) as count FROM News WITH (NOLOCK)');
    const newsCount = newsCountResult.recordset[0].count;
    console.log(`   Total News records: ${newsCount}\n`);

    // Sample News to see if they have product links
    console.log('6️⃣ Sampling News content for product links...');
    const newsSampleResult = await sql.query(`
      SELECT TOP 5 NewsId,
        CASE WHEN content1 LIKE '%pid=%' THEN 'Has pid link' ELSE 'No pid' END as hebrew,
        CASE WHEN content1_en LIKE '%pid=%' THEN 'Has pid link' ELSE 'No pid' END as english,
        CASE WHEN content1_fr LIKE '%pid=%' THEN 'Has pid link' ELSE 'No pid' END as french
      FROM News WITH (NOLOCK)
      WHERE content1 LIKE '%pid=%'
         OR content1_en LIKE '%pid=%'
         OR content1_fr LIKE '%pid=%'
    `);
    console.log(`   News with product links: ${newsSampleResult.recordset.length}`);
    if (newsSampleResult.recordset.length > 0) {
      newsSampleResult.recordset.forEach(row => {
        console.log(`     NewsId ${row.NewsId}: ${row.hebrew}, ${row.english}, ${row.french}`);
      });
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total Products:                    ${total}`);
    console.log(`  - Certificate=1 (Collections):   ${certCount}`);
    console.log(`  - In ProductGroup (Collections): ${groupCount}`);
    console.log(`  - Current Funds migration:       ${currentFunds}`);
    console.log(`  - Remaining (estimate):          ${total - currentFunds - certCount}\n`);

    console.log(`News records total:                ${newsCount}`);
    console.log(`News with product links (sample):  ${newsSampleResult.recordset.length}\n`);

    if (newsCount > 0 && newsSampleResult.recordset.length > 0) {
      console.log('⚠️  WARNING: News table contains product links (pid=X)');
      console.log('   The News check is REQUIRED to avoid migrating Collections as Funds!\n');
    } else {
      console.log('ℹ️  Info: News table appears empty or has no product links.');
      console.log('   The News check may not be necessary for this database.\n');
    }

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkFundsValidation();
