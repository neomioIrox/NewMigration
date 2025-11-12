// Script to clear all tables before re-migration
const mysql = require('mysql2/promise');

async function clearTables() {
  console.log('Connecting to MySQL...');

  // Using the connection details that the user has configured
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  });

  try {
    console.log('Connected! Clearing tables...\n');

    // Disable foreign key checks temporarily
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Clear projectItem first (child table)
    console.log('Truncating projectItem...');
    await connection.execute('TRUNCATE TABLE projectitem');
    console.log('✓ projectItem cleared');

    // Clear projectLocalization
    console.log('Truncating projectLocalization...');
    await connection.execute('TRUNCATE TABLE projectlocalization');
    console.log('✓ projectLocalization cleared');

    // Clear project (parent table)
    console.log('Truncating project...');
    await connection.execute('TRUNCATE TABLE project');
    console.log('✓ project cleared');

    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅ All tables cleared successfully!');
    console.log('\nNow you can run the migration again.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Note: Update the password in clear-tables.js if needed');
    }
  } finally {
    await connection.end();
  }
}

clearTables();
