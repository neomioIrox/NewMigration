/**
 * Count Funds by counting Collections and subtracting from total
 * (Faster than running the full Funds query with News LIKE)
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function countBySubtraction() {
  try {
    console.log('🔍 Counting Products by category...\n');

    const config = {
      ...mssqlConfig,
      requestTimeout: 180000
    };

    await sql.connect(config);

    // 1. Total Products
    console.log('1️⃣ Counting total Products...');
    const totalQuery = 'SELECT COUNT(*) as count FROM products WITH (NOLOCK)';
    const totalResult = await sql.query(totalQuery);
    const total = totalResult.recordset[0].count;
    console.log(`   Total: ${total}\n`);

    // 2. Collections (Certificate OR ProductGroup OR News)
    // We'll count each separately and use set theory

    console.log('2️⃣ Counting Collections components...');

    // Certificate
    const certQuery = 'SELECT COUNT(*) as count FROM products WITH (NOLOCK) WHERE IsNull([Certificate],0) = 1';
    const certResult = await sql.query(certQuery);
    const certCount = certResult.recordset[0].count;
    console.log(`   Certificate: ${certCount}`);

    // ProductGroup
    const groupQuery = `
      SELECT COUNT(DISTINCT p.productsid) as count
      FROM products p WITH (NOLOCK)
      INNER JOIN ProductGroup g WITH (NOLOCK)
        ON g.ParentProductId=p.productsid OR g.SubProductId=p.productsid
    `;
    const groupResult = await sql.query(groupQuery);
    const groupCount = groupResult.recordset[0].count;
    console.log(`   ProductGroup: ${groupCount}`);

    // Cert OR Group (without News yet)
    const certOrGroupQuery = `
      SELECT COUNT(*) as count
      FROM products p WITH (NOLOCK)
      WHERE IsNull([Certificate],0) = 1
         OR EXISTS (
           SELECT 1 FROM ProductGroup g WITH (NOLOCK)
           WHERE g.ParentProductId=p.productsid
              OR g.SubProductId=p.productsid
         )
    `;
    const certOrGroupResult = await sql.query(certOrGroupQuery);
    const certOrGroup = certOrGroupResult.recordset[0].count;
    console.log(`   Cert ∪ Group: ${certOrGroup}`);

    // From previous analysis: 181 Products are in News but not Cert/Group
    const newsOnly = 181;
    console.log(`   News only: ${newsOnly} (from previous check)\n`);

    // Total Collections
    const collections = certOrGroup + newsOnly;
    console.log(`3️⃣ Total Collections: ${certOrGroup} + ${newsOnly} = ${collections}\n`);

    // Funds = Total - Collections
    const funds = total - collections;
    console.log(`4️⃣ Total Funds: ${total} - ${collections} = ${funds}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 FINAL ANSWER:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Products matching Funds criteria: ${funds}`);
    console.log(`   (These will have ProjectType = 1)\n`);

    console.log(`✅ Products matching Collections criteria: ${collections}`);
    console.log(`   (These will have ProjectType = 2)\n`);

    console.log(`Total: ${funds} + ${collections} = ${total}\n`);

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

countBySubtraction();
