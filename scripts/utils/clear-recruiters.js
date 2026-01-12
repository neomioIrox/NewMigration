/**
 * Clear recruiters and recruitersgroup tables
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function clearTables() {
  try {
    const conn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    console.log('🗑️  Clearing recruiters and recruitersgroup tables...\n');

    // Disable FK checks temporarily
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Count before
    const [recruitersBefore] = await conn.query('SELECT COUNT(*) as count FROM recruiter');
    const [groupsBefore] = await conn.query('SELECT COUNT(*) as count FROM recruitersgroup');
    const [recruiterLocBefore] = await conn.query('SELECT COUNT(*) as count FROM recruiterlocalization');
    const [groupLangBefore] = await conn.query('SELECT COUNT(*) as count FROM recruitersgrouplanguage');

    console.log('📊 BEFORE:');
    console.log(`   recruiter: ${recruitersBefore[0].count}`);
    console.log(`   recruitersgroup: ${groupsBefore[0].count}`);
    console.log(`   recruiterlocalization: ${recruiterLocBefore[0].count}`);
    console.log(`   recruitersgrouplanguage: ${groupLangBefore[0].count}`);

    // Delete (CASCADE will handle child tables)
    await conn.query('DELETE FROM recruiterlocalization');
    await conn.query('DELETE FROM recruiter');
    await conn.query('DELETE FROM recruitersgrouplanguage');
    await conn.query('DELETE FROM recruitersgroup');

    // Count after
    const [recruitersAfter] = await conn.query('SELECT COUNT(*) as count FROM recruiter');
    const [groupsAfter] = await conn.query('SELECT COUNT(*) as count FROM recruitersgroup');
    const [recruiterLocAfter] = await conn.query('SELECT COUNT(*) as count FROM recruiterlocalization');
    const [groupLangAfter] = await conn.query('SELECT COUNT(*) as count FROM recruitersgrouplanguage');

    console.log('\n📊 AFTER:');
    console.log(`   recruiter: ${recruitersAfter[0].count}`);
    console.log(`   recruitersgroup: ${groupsAfter[0].count}`);
    console.log(`   recruiterlocalization: ${recruiterLocAfter[0].count}`);
    console.log(`   recruitersgrouplanguage: ${groupLangAfter[0].count}`);

    // Re-enable FK checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅ Tables cleared successfully!');
    console.log('   Now you can run recruiter migration and all 242 groups will be inserted.');

    await conn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

clearTables();
