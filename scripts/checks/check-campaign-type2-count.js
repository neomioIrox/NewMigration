const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkCampaignType2Count() {
  console.log('🔍 ספירת מגביות סוג 2 (Certificate-only campaigns)...\n');

  try {
    // Connect to old DB
    console.log('📡 מתחבר ל-DB הישן...');
    await sql.connect(mssqlConfig);
    console.log('✅ חיבור הצליח\n');

    // Count Campaign Type 2
    console.log('━'.repeat(60));
    console.log('מגביות סוג 2: מגבית עם שטר בלבד');
    console.log('━'.repeat(60));
    console.log('WHERE: Certificate = 1 AND NOT EXISTS ProductGroup\n');

    const result = await sql.query`
      SELECT COUNT(*) as total
      FROM Products
      WHERE Certificate = 1
      AND NOT EXISTS (
        SELECT * FROM ProductGroup g
        WHERE g.ParentProductId = Products.ProductsId
        OR g.SubProductId = Products.ProductsId
      )
    `;

    console.log(`✅ סה"כ מגביות סוג 2: ${result.recordset[0].total}\n`);

    // Show sample
    console.log('━'.repeat(60));
    console.log('דוגמאות (5 ראשונות):');
    console.log('━'.repeat(60));

    const samples = await sql.query`
      SELECT TOP 5
        ProductsId,
        Name,
        Certificate,
        ProjectNumber
      FROM Products
      WHERE Certificate = 1
      AND NOT EXISTS (
        SELECT * FROM ProductGroup g
        WHERE g.ParentProductId = Products.ProductsId
        OR g.SubProductId = Products.ProductsId
      )
      ORDER BY ProductsId
    `;

    samples.recordset.forEach((row, idx) => {
      console.log(`\n${idx + 1}. ID=${row.ProductsId}, Name="${row.Name.substring(0, 50)}..."`);
      console.log(`   Certificate=${row.Certificate}, ProjectNumber=${row.ProjectNumber}`);
    });

    console.log('\n' + '━'.repeat(60));
    console.log(`סיכום: ${result.recordset[0].total} מגביות מוכנות למיגרציה`);
    console.log('━'.repeat(60));

    return result.recordset[0].total;

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
  checkCampaignType2Count()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Failed:', err);
      process.exit(1);
    });
}

module.exports = { checkCampaignType2Count };
