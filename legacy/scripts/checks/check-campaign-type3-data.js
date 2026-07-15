const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkCampaignType3Data() {
  console.log('🔍 ניתוח מגביות סוג 3 (ProductGroup campaigns)...\n');

  try {
    // Connect to old DB
    console.log('📡 מתחבר ל-DB הישן...');
    await sql.connect(mssqlConfig);
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // 1. Check ProductGroup table structure
    // ========================================
    console.log('━'.repeat(60));
    console.log('1️⃣  מבנה טבלת ProductGroup');
    console.log('━'.repeat(60));

    const sampleResult = await sql.query`
      SELECT TOP 5 *
      FROM ProductGroup
      ORDER BY ParentProductId
    `;

    if (sampleResult.recordset.length > 0) {
      console.log('Columns:', Object.keys(sampleResult.recordset[0]).join(', '));
      console.log('\nדוגמאות:');
      sampleResult.recordset.forEach((row, idx) => {
        console.log(`\n${idx + 1}. ParentProductId=${row.ParentProductId}, SubProductId=${row.SubProductId}`);
      });
    }

    // ========================================
    // 2. Count unique ParentProductId (= Projects)
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('2️⃣  כמה Projects ייווצרו?');
    console.log('━'.repeat(60));

    const parentCountResult = await sql.query`
      SELECT COUNT(DISTINCT ParentProductId) as uniqueParents
      FROM ProductGroup
    `;
    console.log(`סה"כ ParentProductId ייחודיים: ${parentCountResult.recordset[0].uniqueParents}`);
    console.log('(= מספר Projects שייווצרו)\n');

    // ========================================
    // 3. Count total SubProducts (= ProjectItems)
    // ========================================
    console.log('━'.repeat(60));
    console.log('3️⃣  כמה ProjectItems ייווצרו?');
    console.log('━'.repeat(60));

    const subCountResult = await sql.query`
      SELECT COUNT(*) as totalSubs
      FROM ProductGroup
    `;
    console.log(`סה"כ SubProductId: ${subCountResult.recordset[0].totalSubs}`);
    console.log('(לא כולל פריטי Donation שייווצרו)\n');

    // ========================================
    // 4. Show distribution (items per project)
    // ========================================
    console.log('━'.repeat(60));
    console.log('4️⃣  התפלגות פריטים לפי מגבית');
    console.log('━'.repeat(60));

    const distributionResult = await sql.query`
      SELECT
        ParentProductId,
        COUNT(*) as SubCount,
        STRING_AGG(CAST(SubProductId AS VARCHAR), ', ') as SubProducts
      FROM ProductGroup
      GROUP BY ParentProductId
      ORDER BY SubCount DESC
    `;

    console.log(`סה"כ מגביות: ${distributionResult.recordset.length}\n`);
    console.log('Top 10 מגביות עם הכי הרבה פריטים:');
    distributionResult.recordset.slice(0, 10).forEach((row, idx) => {
      console.log(`${idx + 1}. ParentProductId=${row.ParentProductId}: ${row.SubCount} פריטים`);
      console.log(`   SubProducts: ${row.SubProducts}`);
    });

    // ========================================
    // 5. Check Certificate distribution in SubProducts
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('5️⃣  Certificate vs. Non-Certificate בפריטים');
    console.log('━'.repeat(60));

    const certificateResult = await sql.query`
      SELECT
        SUM(CASE WHEN p.Certificate = 1 THEN 1 ELSE 0 END) as CertificateItems,
        SUM(CASE WHEN p.Certificate = 0 OR p.Certificate IS NULL THEN 1 ELSE 0 END) as NonCertificateItems
      FROM ProductGroup pg
      JOIN Products p ON pg.SubProductId = p.ProductsId
    `;

    const certCount = certificateResult.recordset[0].CertificateItems;
    const nonCertCount = certificateResult.recordset[0].NonCertificateItems;
    console.log(`פריטים מסוג Certificate (ItemType=2): ${certCount}`);
    console.log(`פריטים מסוג FundDonation (ItemType=5): ${nonCertCount}`);
    console.log(`סה"כ: ${certCount + nonCertCount}\n`);

    // ========================================
    // 6. Check ParentProduct details
    // ========================================
    console.log('━'.repeat(60));
    console.log('6️⃣  פרטי ParentProducts (מגביות)');
    console.log('━'.repeat(60));

    const parentDetailsResult = await sql.query`
      SELECT TOP 5
        p.ProductsId,
        p.Name,
        p.ProjectNumber,
        (SELECT COUNT(*) FROM ProductGroup WHERE ParentProductId = p.ProductsId) as ItemCount
      FROM Products p
      WHERE EXISTS (
        SELECT 1 FROM ProductGroup WHERE ParentProductId = p.ProductsId
      )
      ORDER BY ItemCount DESC
    `;

    console.log('דוגמאות מגביות:');
    parentDetailsResult.recordset.forEach((row, idx) => {
      console.log(`\n${idx + 1}. ID=${row.ProductsId}`);
      console.log(`   Name: ${row.Name.substring(0, 50)}...`);
      console.log(`   ProjectNumber: ${row.ProjectNumber}`);
      console.log(`   Items: ${row.ItemCount}`);
    });

    // ========================================
    // Summary
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('📊 סיכום');
    console.log('━'.repeat(60));
    console.log(`✅ Projects: ${parentCountResult.recordset[0].uniqueParents}`);
    console.log(`✅ ProjectItems from SubProducts: ${subCountResult.recordset[0].totalSubs}`);
    console.log(`✅ Donation Items: ${parentCountResult.recordset[0].uniqueParents} (אחד לכל מגבית)`);
    console.log(`✅ סה"כ ProjectItems: ${subCountResult.recordset[0].totalSubs + parentCountResult.recordset[0].uniqueParents}`);
    console.log('━'.repeat(60));

    return {
      projects: parentCountResult.recordset[0].uniqueParents,
      subItems: subCountResult.recordset[0].totalSubs,
      certificateItems: certCount,
      nonCertificateItems: nonCertCount
    };

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    console.error(err);
    throw err;
  } finally {
    await sql.close();
  }
}

// Run if called directly
if (require.main === module) {
  checkCampaignType3Data()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Failed:', err);
      process.exit(1);
    });
}

module.exports = { checkCampaignType3Data };
