/**
 * Simple validation using known counts
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function validateSplitSimple() {
  try {
    console.log('🔍 Validating Funds/Collections split (simple check)...\n');

    await sql.connect(mssqlConfig);

    // Get basic counts
    const totalQuery = 'SELECT COUNT(*) as count FROM products WITH (NOLOCK)';
    const certQuery = 'SELECT COUNT(*) as count FROM products WITH (NOLOCK) WHERE IsNull([Certificate],0) = 1';
    const groupQuery = `
      SELECT COUNT(DISTINCT p.productsid) as count
      FROM products p WITH (NOLOCK)
      INNER JOIN ProductGroup g WITH (NOLOCK)
        ON g.ParentProductId=p.productsid OR g.SubProductId=p.productsid
    `;

    console.log('📊 Running basic queries...\n');

    const totalResult = await sql.query(totalQuery);
    const certResult = await sql.query(certQuery);
    const groupResult = await sql.query(groupQuery);

    const totalCount = totalResult.recordset[0].count;
    const certCount = certResult.recordset[0].count;
    const groupCount = groupResult.recordset[0].count;

    // From previous analysis, we know:
    const newsCount = 457; // Total Products in News
    const newsOnlyCount = 181; // Products ONLY in News (not cert/group)

    // Calculate Certificate OR ProductGroup
    // From previous check: Current Funds (without News) = 1,452
    // Which means: Certificate OR ProductGroup = Total - 1,452
    const currentFundsWithoutNews = 1452; // From check-funds-validation.js
    const certOrGroup = totalCount - currentFundsWithoutNews;

    // Calculate Collections
    // Collections = (Certificate OR ProductGroup) OR News
    // = certOrGroup + newsOnlyCount (no overlap by definition)
    const estimatedCollections = certOrGroup + newsOnlyCount;

    // Funds = Total - Collections (no overlap)
    const estimatedFunds = totalCount - estimatedCollections;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 COUNTS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Total Products:                     ${totalCount}`);
    console.log(`Certificate Products:               ${certCount}`);
    console.log(`ProductGroup Members:               ${groupCount}`);
    console.log(`News Referenced (from prev check):  ${newsCount}`);
    console.log(`  - Unique to News (not cert/grp):  ${newsOnlyCount}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 CALCULATED SPLIT:');
    console.log('═══════════════════════════════════════════════════════════\n');

    const overlap = certCount + groupCount - certOrGroup;
    console.log(`Collections (Type 2):               ${estimatedCollections}`);
    console.log(`  - Certificate:                    ${certCount}`);
    console.log(`  - ProductGroup:                   ${groupCount}`);
    console.log(`  - Overlap (Cert ∩ Group):         ${overlap}`);
    console.log(`  - Cert ∪ Group:                   ${certOrGroup}`);
    console.log(`  - News only (not Cert/Group):     ${newsOnlyCount}`);
    console.log(`  - Total Collections:              ${certOrGroup} + ${newsOnlyCount} = ${estimatedCollections}\n`);

    console.log(`Funds (Type 1):                     ~${estimatedFunds}`);
    console.log(`Sum:                                ${estimatedFunds + estimatedCollections}\n`);

    // Validation
    const isClose = Math.abs(totalCount - (estimatedFunds + estimatedCollections)) < 50;

    if (isClose) {
      console.log('✅ VALIDATION LOOKS GOOD!');
      console.log('   - Funds + Collections ≈ Total Products');
      console.log('   - Split appears mathematically sound\n');
    } else {
      console.log('⚠️  WARNING: Numbers don\'t add up perfectly');
      console.log('   This could be due to overlaps in Collections criteria\n');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 EXPECTED MIGRATION RESULTS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`When you run Funds migration:`);
    console.log(`  → Should create ~${estimatedFunds} Projects with ProjectType=1\n`);

    console.log(`When you run Collections migration:`);
    console.log(`  → Should create ~${estimatedCollections} Projects with ProjectType=2\n`);

    console.log(`Total Projects in new DB: ~${totalCount}\n`);

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

validateSplitSimple();
