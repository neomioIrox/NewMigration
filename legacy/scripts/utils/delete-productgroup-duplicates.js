const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

/**
 * Delete Products that appear in ProductGroup from project table
 *
 * These Products should ONLY be migrated as Type 3 (ProductGroup campaigns),
 * not as Funds (Type 1) or Collections (Type 2).
 *
 * This script deletes them from the new DB so Type 3 migration can run cleanly.
 */

async function deleteDuplicates() {
  console.log('🗑️  מחיקת Products שמופיעים ב-ProductGroup\n');
  console.log('='.repeat(70));
  console.log('⚠️  זהירות: הסקריפט ימחק Products מטבלת project (ו-FK cascading)');
  console.log('='.repeat(70));

  try {
    // Connect to both databases
    console.log('\n📡 מתחבר לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // STEP 1: Get all ProductGroup ParentProductIds
    // ========================================
    console.log('━'.repeat(70));
    console.log('📊 STEP 1: קריאת Products מ-ProductGroup...');
    console.log('━'.repeat(70));

    const productGroupResult = await sql.query`
      SELECT DISTINCT ParentProductId
      FROM ProductGroup
      ORDER BY ParentProductId
    `;

    const allParentIds = productGroupResult.recordset.map(r => r.ParentProductId);
    console.log(`✅ נמצאו ${allParentIds.length} Products ב-ProductGroup\n`);

    // ========================================
    // STEP 2: Find which ones exist in new DB
    // ========================================
    console.log('━'.repeat(70));
    console.log('📊 STEP 2: בדיקה אילו כבר קיימים בבסיס החדש...');
    console.log('━'.repeat(70));

    const [existingProjects] = await mysqlConn.query(`
      SELECT Id, Name, ProjectType
      FROM project
      WHERE Id IN (${allParentIds.join(',')})
      ORDER BY ProjectType, Id
    `);

    console.log(`❌ Products שכבר קיימים: ${existingProjects.length}/${allParentIds.length}\n`);

    if (existingProjects.length === 0) {
      console.log('✅ אין Products למחיקה - הכל נקי!');
      await mysqlConn.end();
      await sql.close();
      return;
    }

    // Group by ProjectType
    const byType = {
      1: [], // Funds
      2: []  // Campaign
    };

    existingProjects.forEach(p => {
      if (byType[p.ProjectType]) {
        byType[p.ProjectType].push(p);
      }
    });

    console.log('📌 פילוח לפי ProjectType:');
    console.log(`   ProjectType=1 (Funds): ${byType[1].length} products`);
    console.log(`   ProjectType=2 (Campaign): ${byType[2].length} products`);
    console.log('');

    // Show examples
    console.log('━'.repeat(70));
    console.log('🔍 דוגמאות (10 ראשונים):');
    console.log('━'.repeat(70));

    existingProjects.slice(0, 10).forEach(p => {
      const typeName = p.ProjectType === 1 ? 'Funds' : 'Campaign';
      console.log(`  ID ${p.Id}: "${p.Name.substring(0, 50)}" (${typeName})`);
    });

    if (existingProjects.length > 10) {
      console.log(`  ... ועוד ${existingProjects.length - 10} נוספים`);
    }

    console.log('');

    // ========================================
    // STEP 3: Confirm deletion
    // ========================================
    console.log('━'.repeat(70));
    console.log('⚠️  אזהרה: מחיקה של Products אלה תמחק גם:');
    console.log('━'.repeat(70));
    console.log('   ✗ projectLocalization (לוקליזציות)');
    console.log('   ✗ projectItem (פריטים)');
    console.log('   ✗ projectItemLocalization (לוקליזציות פריטים)');
    console.log('   ✗ linkSetting (קישורים)');
    console.log('   ✗ entityContent (תכנים)');
    console.log('   ✗ entityContentItem (פריטי תוכן)');
    console.log('');
    console.log('❗ יש לוודא שאין תרומות (donations) שתלויות ב-Products אלה!');
    console.log('');

    // Ask for confirmation (for manual run)
    // In automated mode, you can comment this out
    console.log('━'.repeat(70));
    console.log('❓ האם להמשיך במחיקה?');
    console.log('   הערה: סקריפט זה מחכה לאישור ידני.');
    console.log('   אם אתה רוצה להריץ אוטומטית, הסר את השורה process.exit()');
    console.log('━'.repeat(70));

    // SAFETY: Exit to prevent accidental deletion
    // Comment out this line if you want to run automatically
    console.log('\n⏸️  סקריפט עצר - הסר את process.exit() כדי להמשיך');
    process.exit(0);

    // ========================================
    // STEP 4: Delete Products (CASCADE will delete related records)
    // ========================================
    console.log('\n━'.repeat(70));
    console.log('🗑️  STEP 4: מחיקת Products...');
    console.log('━'.repeat(70));

    const idsToDelete = existingProjects.map(p => p.Id);

    // Delete in batches of 50 (safer)
    let totalDeleted = 0;
    for (let i = 0; i < idsToDelete.length; i += 50) {
      const batch = idsToDelete.slice(i, i + 50);

      const [result] = await mysqlConn.query(
        `DELETE FROM project WHERE Id IN (${batch.join(',')})`,
        []
      );

      totalDeleted += result.affectedRows;
      console.log(`  מחק ${result.affectedRows} products (${i + batch.length}/${idsToDelete.length})`);
    }

    console.log(`\n✅ נמחקו ${totalDeleted} Products בהצלחה!`);

    // ========================================
    // STEP 5: Verify deletion
    // ========================================
    console.log('\n━'.repeat(70));
    console.log('✅ STEP 5: אימות מחיקה...');
    console.log('━'.repeat(70));

    const [remaining] = await mysqlConn.query(`
      SELECT COUNT(*) as count
      FROM project
      WHERE Id IN (${allParentIds.join(',')})
    `);

    console.log(`📊 Products שנשארו: ${remaining[0].count}/${allParentIds.length}`);

    if (remaining[0].count === 0) {
      console.log('✅ כל ה-Products נמחקו בהצלחה!');
      console.log('\n🎯 עכשיו אפשר להריץ Type 3 migration מחדש.');
    } else {
      console.log(`⚠️  עדיין נותרו ${remaining[0].count} products - בדוק שגיאות!`);
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(70));
    console.log('📊 סיכום');
    console.log('='.repeat(70));
    console.log(`✅ נמצאו: ${existingProjects.length} products`);
    console.log(`✅ נמחקו: ${totalDeleted} products`);
    console.log(`   └─ Funds (Type 1): ${byType[1].length}`);
    console.log(`   └─ Campaign (Type 2): ${byType[2].length}`);
    console.log(`✅ נותרו: ${remaining[0].count} products`);
    console.log('='.repeat(70));

    await mysqlConn.end();
    await sql.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  }
}

// Run if called directly
if (require.main === module) {
  deleteDuplicates();
}

module.exports = { deleteDuplicates };
