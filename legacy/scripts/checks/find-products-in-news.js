/**
 * Find specific Products mentioned in News
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function findProductsInNews() {
  try {
    console.log('🔍 Finding Products mentioned in News...\n');

    const config = {
      ...mssqlConfig,
      requestTimeout: 120000
    };

    await sql.connect(config);

    // Extract product IDs from News content
    const query = `
      SELECT
        n.NewsId,
        n.Name as NewsName,
        n.content1,
        n.content1_en,
        n.content1_fr
      FROM News n WITH (NOLOCK)
      WHERE content1 LIKE '%pid=%'
         OR content1_en LIKE '%pid=%'
         OR content1_fr LIKE '%pid=%'
    `;

    console.log('📰 Fetching News with product links...\n');
    const result = await sql.query(query);

    console.log(`Found ${result.recordset.length} News records with product links\n`);

    const productIds = new Set();
    const newsDetails = [];

    // Parse product IDs from content
    result.recordset.forEach(news => {
      const pidRegex = /pid=(\d+)/g;

      [news.content1, news.content1_en, news.content1_fr].forEach((content, langIndex) => {
        if (!content) return;

        let match;
        while ((match = pidRegex.exec(content)) !== null) {
          const pid = parseInt(match[1]);
          productIds.add(pid);

          const lang = ['Hebrew', 'English', 'French'][langIndex];
          newsDetails.push({
            newsId: news.NewsId,
            newsName: news.NewsName,
            language: lang,
            productId: pid
          });
        }
      });
    });

    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`Found ${productIds.size} unique Product IDs in News:\n`);

    const pidArray = Array.from(productIds).sort((a, b) => a - b);
    console.log(`Product IDs: ${pidArray.join(', ')}\n`);

    // Check which of these Products would pass current Funds migration
    if (productIds.size > 0) {
      const checkQuery = `
        SELECT
          p.productsid,
          p.Name,
          p.Certificate,
          CASE
            WHEN IsNull(p.Certificate, 0) = 1 THEN 'Certificate=1 (Collection)'
            WHEN EXISTS (
              SELECT 1 FROM ProductGroup g WITH (NOLOCK)
              WHERE g.ParentProductId=p.productsid OR g.SubProductId=p.productsid
            ) THEN 'In ProductGroup (Collection)'
            ELSE 'Would pass as FUND ❌'
          END as Status
        FROM products p WITH (NOLOCK)
        WHERE p.productsid IN (${pidArray.join(',')})
        ORDER BY p.productsid
      `;

      const checkResult = await sql.query(checkQuery);

      console.log(`═══════════════════════════════════════════════════════════`);
      console.log(`🎯 Products Status:\n`);

      let wronglyClassified = 0;
      checkResult.recordset.forEach(product => {
        const isWrong = product.Status.includes('Would pass as FUND');
        if (isWrong) wronglyClassified++;

        console.log(`${isWrong ? '❌' : '✅'} ID ${product.productsid}: ${product.Name || '(null)'}`);
        console.log(`   Status: ${product.Status}`);

        // Show which news reference this product
        const refs = newsDetails.filter(d => d.productId === product.productsid);
        refs.forEach(ref => {
          console.log(`   📰 Referenced in News ${ref.newsId} (${ref.language}): ${ref.newsName || '(no name)'}`);
        });
        console.log('');
      });

      console.log(`═══════════════════════════════════════════════════════════`);
      console.log(`📈 RESULTS:\n`);
      console.log(`Total Products in News:           ${productIds.size}`);
      console.log(`Already marked as Collections:    ${productIds.size - wronglyClassified}`);
      console.log(`❌ WRONGLY classified as Funds:   ${wronglyClassified}\n`);

      if (wronglyClassified > 0) {
        console.log(`⚠️  CRITICAL: ${wronglyClassified} Products are being migrated as FUNDS but should be COLLECTIONS!`);
        console.log(`   They are referenced in News and need ProjectType=2\n`);
      } else {
        console.log(`✅ All Products in News are already correctly classified as Collections.\n`);
      }
    }

    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findProductsInNews();
