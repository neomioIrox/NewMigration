/**
 * Check how many Products pass current Funds migration but are mentioned in News
 * These should be Collections, not Funds!
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkFundsNewsMismatch() {
  try {
    console.log('🔍 Checking for Products that pass Funds migration but appear in News...\n');

    await sql.connect(mssqlConfig);

    // Current WHERE clause used in Funds migration
    const currentFundsQuery = `
      SELECT COUNT(*) as CurrentFundsCount
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) != 1
        AND NOT EXISTS (
          SELECT 1 FROM ProductGroup g WITH (NOLOCK)
          WHERE g.ParentProductId=p.productsid
             OR g.SubProductId=p.productsid
        )
    `;

    // Correct WHERE clause (with News check)
    const correctFundsQuery = `
      SELECT COUNT(*) as CorrectFundsCount
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

    // Products that are wrongly classified (pass current but should be Collections)
    const mismatchQuery = `
      SELECT
        p.productsid,
        p.Name,
        p.Certificate,
        CASE
          WHEN EXISTS (SELECT 1 FROM ProductGroup g WHERE g.ParentProductId=p.productsid OR g.SubProductId=p.productsid)
          THEN 'In ProductGroup'
          ELSE 'Not in ProductGroup'
        END as GroupStatus,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM News
            WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
               OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
               OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
          ) THEN 'Referenced in News'
          ELSE 'Not in News'
        END as NewsStatus
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) != 1
        AND NOT EXISTS (
          SELECT 1 FROM ProductGroup g WITH (NOLOCK)
          WHERE g.ParentProductId=p.productsid
             OR g.SubProductId=p.productsid
        )
        AND EXISTS (
          SELECT 1 FROM News
          WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
             OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
             OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
        )
      ORDER BY p.productsid
    `;

    console.log('📊 Running queries...\n');

    const currentResult = await sql.query(currentFundsQuery);
    const correctResult = await sql.query(correctFundsQuery);
    const mismatchResult = await sql.query(mismatchQuery);

    const currentCount = currentResult.recordset[0].CurrentFundsCount;
    const correctCount = correctResult.recordset[0].CorrectFundsCount;
    const mismatchCount = currentCount - correctCount;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 RESULTS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Products passing CURRENT Funds migration: ${currentCount}`);
    console.log(`✅ Products that SHOULD be Funds (correct):   ${correctCount}`);
    console.log(`❌ Products WRONGLY classified as Funds:      ${mismatchCount}\n`);

    if (mismatchCount > 0) {
      console.log('⚠️  WARNING: Found Products that are being migrated as Funds but should be Collections!\n');
      console.log(`These ${mismatchCount} products are mentioned in News and should have ProjectType=2 (Collection)\n`);

      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 MISMATCHED PRODUCTS (first 20):');
      console.log('═══════════════════════════════════════════════════════════\n');

      mismatchResult.recordset.slice(0, 20).forEach((row, i) => {
        console.log(`${i + 1}. ID: ${row.productsid}`);
        console.log(`   Name: ${row.Name || '(null)'}`);
        console.log(`   Certificate: ${row.Certificate || 0}`);
        console.log(`   ${row.GroupStatus}`);
        console.log(`   ${row.NewsStatus}`);
        console.log('');
      });

      if (mismatchResult.recordset.length > 20) {
        console.log(`... and ${mismatchResult.recordset.length - 20} more\n`);
      }
    } else {
      console.log('✅ No mismatches found! All Products are correctly classified.\n');
    }

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkFundsNewsMismatch();
