// Script to clear test migration data
const mysql = require('mysql2/promise');

async function clearTestData() {
  console.log('🧹 Clearing Test Migration Data');
  console.log('================================\n');

  // MySQL connection config
  const mysqlConfig = {
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  };

  try {
    console.log('📡 Connecting to MySQL...');
    const connection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Connected!\n');

    // Disable foreign key checks temporarily
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Clear tables in reverse order (to respect foreign keys)
    const tablesToClear = [
      { name: 'linksetting', description: 'Link settings' },
      { name: 'entitycontentitem', description: 'Content items' },
      { name: 'entitycontent', description: 'Content records' },
      { name: 'media', description: 'Media records' },
      { name: 'projectitem', description: 'Project items' },
      { name: 'projectlocalization', description: 'Project localizations' },
      { name: 'project', description: 'Projects' }
    ];

    console.log('🗑️  Deleting data...\n');

    for (const table of tablesToClear) {
      const [result] = await connection.execute(`DELETE FROM ${table.name}`);
      console.log(`   ✓ ${table.name.padEnd(20)} - ${result.affectedRows} rows deleted`);
    }

    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅ All test data cleared successfully!');
    console.log('');
    console.log('💡 Ready for fresh migration test');

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('   1. Check MySQL connection settings');
    console.error('   2. Verify database name: kupathair_newdb');
    console.error('   3. Check user permissions');
  }
}

clearTestData();
