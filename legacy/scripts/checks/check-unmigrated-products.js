/**
 * Check if there are any Products that won't be migrated
 * (neither Funds nor Collections)
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkUnmigratedProducts() {
  try {
    console.log('🔍 Checking for Products that won\'t be migrated...\n');

    await sql.connect(mssqlConfig);

    // Products that are NOT Funds AND NOT Collections
    // This should theoretically be 0 because:
    // Funds = NOT (Cert OR Group OR News)
    // Collections = (Cert OR Group OR News)
    // So every Product is either Funds or Collections

    const unmigratedQuery = `
      SELECT
        p.productsid,
        p.Name,
        p.Certificate,
        p.Hide,
        p.DateCreated,
        CASE
          WHEN EXISTS (SELECT 1 FROM ProductGroup g WHERE g.ParentProductId=p.productsid OR g.SubProductId=p.productsid)
          THEN 'In ProductGroup'
          ELSE 'Not in ProductGroup'
        END as GroupStatus
      FROM products p WITH (NOLOCK)
      WHERE
        -- NOT Funds (opposite of Funds WHERE)
        (
          IsNull([Certificate],0) = 1
          OR EXISTS (
            SELECT 1 FROM ProductGroup g WITH (NOLOCK)
            WHERE g.ParentProductId=p.productsid OR g.SubProductId=p.productsid
          )
          OR EXISTS (
            SELECT 1 FROM News
            WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
               OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
               OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
          )
        )
        AND
        -- NOT Collections (opposite of Collections WHERE)
        NOT (
          IsNull([Certificate],0) = 1
          OR EXISTS (
            SELECT 1 FROM ProductGroup g WITH (NOLOCK)
            WHERE g.ParentProductId=p.productsid OR g.SubProductId=p.productsid
          )
          OR EXISTS (
            SELECT 1 FROM News
            WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
               OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
               OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
          )
        )
    `;

    console.log('⏳ Running query...\n');

    const result = await sql.query(unmigratedQuery);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RESULTS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (result.recordset.length === 0) {
      console.log('✅ ALL PRODUCTS WILL BE MIGRATED!');
      console.log('   No Products found that don\'t match either Funds or Collections.\n');
      console.log('   This is expected because:');
      console.log('   - Funds = NOT (Certificate OR ProductGroup OR News)');
      console.log('   - Collections = (Certificate OR ProductGroup OR News)');
      console.log('   - Every Product must be one or the other.\n');
    } else {
      console.log(`❌ FOUND ${result.recordset.length} PRODUCTS THAT WON'T BE MIGRATED!\n`);
      console.log('These Products don\'t match either Funds or Collections criteria:\n');

      result.recordset.slice(0, 20).forEach((row, i) => {
        console.log(`${i + 1}. ID: ${row.productsid}`);
        console.log(`   Name: ${row.Name || '(null)'}`);
        console.log(`   Certificate: ${row.Certificate || 0}`);
        console.log(`   Hide: ${row.Hide || 0}`);
        console.log(`   ${row.GroupStatus}`);
        console.log('');
      });

      if (result.recordset.length > 20) {
        console.log(`... and ${result.recordset.length - 20} more\n`);
      }

      console.log('⚠️  WARNING: These Products will be missing from the new database!\n');
    }

    // Also check for Hidden products
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 ADDITIONAL CHECK: Hidden Products');
    console.log('═══════════════════════════════════════════════════════════\n');

    const hiddenQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN Hide = 1 THEN 1 ELSE 0 END) as hidden,
        SUM(CASE WHEN Hide_en = 1 THEN 1 ELSE 0 END) as hidden_en,
        SUM(CASE WHEN Hide_fr = 1 THEN 1 ELSE 0 END) as hidden_fr
      FROM products WITH (NOLOCK)
    `;

    const hiddenResult = await sql.query(hiddenQuery);
    const stats = hiddenResult.recordset[0];

    console.log(`Total Products:           ${stats.total}`);
    console.log(`Hidden (Hebrew):          ${stats.hidden}`);
    console.log(`Hidden (English):         ${stats.hidden_en || 0}`);
    console.log(`Hidden (French):          ${stats.hidden_fr || 0}\n`);

    console.log('ℹ️  Note: Hidden Products WILL still be migrated.');
    console.log('   The Hide flag is mapped to DisplayInSite in ProjectLocalization.\n');

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

checkUnmigratedProducts();
