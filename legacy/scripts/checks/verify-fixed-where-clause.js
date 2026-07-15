/**
 * Verify the fixed WHERE clause is working correctly
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function verifyFixedWhereClause() {
  try {
    console.log('🔍 Verifying the FIXED WHERE clause...\n');

    const config = {
      ...mssqlConfig,
      requestTimeout: 120000
    };

    await sql.connect(config);

    // OLD WHERE clause (before fix)
    const oldWhereQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) != 1
        AND NOT EXISTS (
          SELECT 1 FROM ProductGroup g WITH (NOLOCK)
          WHERE g.ParentProductId=p.productsid
             OR g.SubProductId=p.productsid
        )
    `;

    // NEW WHERE clause (after fix)
    const newWhereQuery = `
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

    console.log('📊 Running queries...\n');

    const oldResult = await sql.query(oldWhereQuery);
    const newResult = await sql.query(newWhereQuery);

    const oldCount = oldResult.recordset[0].count;
    const newCount = newResult.recordset[0].count;
    const difference = oldCount - newCount;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 RESULTS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`❌ OLD WHERE (without News check):  ${oldCount} Products`);
    console.log(`✅ NEW WHERE (with News check):     ${newCount} Products`);
    console.log(`🔧 Difference (prevented):          ${difference} Products\n`);

    if (difference === 181) {
      console.log('✅ SUCCESS! The fix is working correctly!');
      console.log(`   We prevented exactly ${difference} Collections from being wrongly classified as Funds.\n`);
    } else {
      console.log(`⚠️  Expected to prevent 181 Products, but prevented ${difference}.`);
      console.log(`   This might be due to database changes or query differences.\n`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 Summary:');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`The new WHERE clause will migrate ${newCount} Products as Funds (ProjectType=1)`);
    console.log(`${difference} Products that reference News will be migrated as Collections instead.\n`);

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyFixedWhereClause();
