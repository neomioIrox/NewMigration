/**
 * Clear all migrated tables - prepare for fresh migration
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function clearAllTables() {
  try {
    const conn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    console.log('🗑️  Clearing ALL migrated tables...\n');

    // Disable FK checks temporarily
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'recruiterlocalization',
      'recruiter',
      'recruitersgrouplanguage',
      'recruitersgroup',
      'projectitemlocalization',
      'projectitem',
      'projectlocalization',
      'entitycontentitem',
      'entitycontent',
      'linksetting',
      'project'
    ];

    console.log('📊 Clearing tables in order:');
    for (const table of tables) {
      try {
        const [before] = await conn.query(`SELECT COUNT(*) as count FROM ${table}`);
        await conn.query(`DELETE FROM ${table}`);
        const [after] = await conn.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table}: ${before[0].count} → ${after[0].count}`);
      } catch (error) {
        console.log(`   ${table}: ⚠️  ${error.message}`);
      }
    }

    // Re-enable FK checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅ All tables cleared successfully!');

    await conn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

clearAllTables();
