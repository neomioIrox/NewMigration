const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function analyzeDuplicates() {
  console.log('🔍 ניתוח Products שמופיעים גם ב-ProductGroup\n');
  console.log('='.repeat(70));

  try {
    // Connect to both databases
    await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection(mysqlConfig);

    // Get all ProductGroup ParentProductIds
    const productGroupResult = await sql.query`
      SELECT DISTINCT ParentProductId
      FROM ProductGroup
      ORDER BY ParentProductId
    `;

    const allParentIds = productGroupResult.recordset.map(r => r.ParentProductId);
    console.log(`\n📊 סה"כ ParentProductIds ב-ProductGroup: ${allParentIds.length}\n`);

    // Check which ones already exist in new DB
    const [existingProjects] = await mysqlConn.query(`
      SELECT Id, Name, ProjectType
      FROM project
      WHERE Id IN (${allParentIds.join(',')})
      ORDER BY Id
    `);

    console.log(`❌ Products שכבר קיימים בבסיס החדש: ${existingProjects.length}/${allParentIds.length}\n`);
    console.log('━'.repeat(70));

    // Group by ProjectType
    const byType = {
      1: [], // Funds
      2: []  // Campaign
    };

    existingProjects.forEach(p => {
      if (byType[p.ProjectType]) {
        byType[p.ProjectType].push(p.Id);
      }
    });

    console.log(`\n📌 פילוח לפי ProjectType:`);
    console.log(`   ProjectType=1 (Funds): ${byType[1].length} products`);
    console.log(`   ProjectType=2 (Campaign): ${byType[2].length} products`);

    // Show first 10 examples from each type
    console.log('\n━'.repeat(70));
    console.log('🔍 דוגמאות מ-Funds (ProjectType=1):');
    console.log('━'.repeat(70));

    for (let i = 0; i < Math.min(10, byType[1].length); i++) {
      const id = byType[1][i];
      const project = existingProjects.find(p => p.Id === id);
      console.log(`  ${id}: "${project.Name.substring(0, 50)}..."`);
    }

    if (byType[1].length > 10) {
      console.log(`  ... ועוד ${byType[1].length - 10} נוספים`);
    }

    console.log('\n━'.repeat(70));
    console.log('🔍 דוגמאות מ-Campaign Type 2 (ProjectType=2):');
    console.log('━'.repeat(70));

    for (let i = 0; i < Math.min(10, byType[2].length); i++) {
      const id = byType[2][i];
      const project = existingProjects.find(p => p.Id === id);
      console.log(`  ${id}: "${project.Name.substring(0, 50)}..."`);
    }

    if (byType[2].length > 10) {
      console.log(`  ... ועוד ${byType[2].length - 10} נוספים`);
    }

    // Check in old DB: do these products have Certificate=1?
    console.log('\n━'.repeat(70));
    console.log('🔍 בדיקה בבסיס הישן - האם יש להם Certificate=1?');
    console.log('━'.repeat(70));

    const sample = byType[1].slice(0, 10);
    if (sample.length > 0) {
      const checkResult = await sql.query`
        SELECT ProductsId, Name, Certificate
        FROM Products
        WHERE ProductsId IN (${sample.join(',')})
        ORDER BY ProductsId
      `;

      console.log('\nProducts שכבר קיימים כ-Funds:');
      checkResult.recordset.forEach(p => {
        console.log(`  ID ${p.ProductsId}: Certificate=${p.Certificate} - "${p.Name.substring(0, 40)}"`);
      });
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 סיכום:');
    console.log('='.repeat(70));
    console.log(`✅ Products חדשים שנוצרו בהצלחה: ${allParentIds.length - existingProjects.length}`);
    console.log(`❌ Products שכבר קיימים (Duplicate): ${existingProjects.length}`);
    console.log(`   └─ Funds (Type 1): ${byType[1].length}`);
    console.log(`   └─ Campaign (Type 2): ${byType[2].length}`);
    console.log('\n💡 המלצה:');
    console.log('   אם Products אלה אמורים להישאר Funds → המיגרציה תקינה');
    console.log('   אם Products אלה אמורים להיות Type 3 → צריך למחוק ולהריץ שוב');
    console.log('='.repeat(70));

    await mysqlConn.end();
    await sql.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  }
}

analyzeDuplicates();
