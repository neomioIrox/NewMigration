/**
 * Validate that Funds and Collections WHERE clauses don't overlap
 * and cover all Products
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function validateFundsCollectionsSplit() {
  try {
    console.log('🔍 Validating Funds/Collections split...\n');

    const config = {
      ...mssqlConfig,
      requestTimeout: 120000
    };

    await sql.connect(config);

    // Total Products
    const totalQuery = 'SELECT COUNT(*) as count FROM products WITH (NOLOCK)';
    const totalResult = await sql.query(totalQuery);
    const totalCount = totalResult.recordset[0].count;

    // Funds WHERE clause
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

    // Collections WHERE clause
    const collectionsQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) = 1
         OR EXISTS (
           SELECT 1 FROM ProductGroup g WITH (NOLOCK)
           WHERE g.ParentProductId=p.productsid
              OR g.SubProductId=p.productsid
         )
         OR EXISTS (
           SELECT 1 FROM News
           WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
              OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
              OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
         )
    `;

    console.log('📊 Running queries...\n');

    const fundsResult = await sql.query(fundsQuery);
    const collectionsResult = await sql.query(collectionsQuery);

    const fundsCount = fundsResult.recordset[0].count;
    const collectionsCount = collectionsResult.recordset[0].count;
    const sumCount = fundsCount + collectionsCount;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 RESULTS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Total Products in database:        ${totalCount}`);
    console.log(`Funds (ProjectType=1):              ${fundsCount} (${(fundsCount/totalCount*100).toFixed(1)}%)`);
    console.log(`Collections (ProjectType=2):        ${collectionsCount} (${(collectionsCount/totalCount*100).toFixed(1)}%)`);
    console.log(`Sum (Funds + Collections):          ${sumCount}\n`);

    // Validation
    const isValid = (sumCount === totalCount);

    if (isValid) {
      console.log('✅ VALIDATION PASSED!');
      console.log('   - No overlap between Funds and Collections');
      console.log('   - All Products are covered');
      console.log('   - Split is mathematically correct\n');
    } else {
      const difference = totalCount - sumCount;
      console.log('❌ VALIDATION FAILED!');
      console.log(`   - Expected sum: ${totalCount}`);
      console.log(`   - Actual sum: ${sumCount}`);
      console.log(`   - Difference: ${difference}`);

      if (difference > 0) {
        console.log(`   - ${difference} Products are missing from both queries!`);
      } else {
        console.log(`   - ${Math.abs(difference)} Products are counted twice (overlap)!`);
      }
      console.log('');
    }

    // Breakdown
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 Collections Breakdown:');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Certificate only
    const certOnlyQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) = 1
    `;
    const certOnlyResult = await sql.query(certOnlyQuery);
    const certOnlyCount = certOnlyResult.recordset[0].count;

    // ProductGroup only
    const groupOnlyQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE EXISTS (
        SELECT 1 FROM ProductGroup g WITH (NOLOCK)
        WHERE g.ParentProductId=p.productsid
           OR g.SubProductId=p.productsid
      )
    `;
    const groupOnlyResult = await sql.query(groupOnlyQuery);
    const groupOnlyCount = groupOnlyResult.recordset[0].count;

    // News only
    const newsOnlyQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE EXISTS (
        SELECT 1 FROM News
        WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
           OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
           OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
      )
    `;
    const newsOnlyResult = await sql.query(newsOnlyQuery);
    const newsOnlyCount = newsOnlyResult.recordset[0].count;

    console.log(`Certificate Products:               ${certOnlyCount}`);
    console.log(`ProductGroup Members:               ${groupOnlyCount}`);
    console.log(`News Referenced:                    ${newsOnlyCount}`);
    console.log(`Total Collections (with overlaps):  ${collectionsCount}\n`);

    console.log('Note: Some Products may meet multiple criteria,');
    console.log('      so the sum may exceed total Collections count.\n');

    await sql.close();

    if (!isValid) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

validateFundsCollectionsSplit();
