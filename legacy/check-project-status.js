/**
 * Check Project table migration status
 */
const mysql = require('mysql2/promise');
const { mysqlConfig } = require('./config/database');

async function checkStatus() {
  console.log('Checking Project migration status...\n');

  try {
    const connection = await mysql.createConnection(mysqlConfig);

    // Count projects
    const [projectRows] = await connection.execute('SELECT COUNT(*) as count FROM Project');
    console.log('✓ Project rows:', projectRows[0].count);

    // Count project localizations
    const [locRows] = await connection.execute('SELECT COUNT(*) as count FROM ProjectLocalization');
    console.log('✓ ProjectLocalization rows:', locRows[0].count);

    // Count project items
    const [itemRows] = await connection.execute('SELECT COUNT(*) as count FROM ProjectItem');
    console.log('✓ ProjectItem rows:', itemRows[0].count);

    // Count project item localizations
    const [itemLocRows] = await connection.execute('SELECT COUNT(*) as count FROM ProjectItemLocalization');
    console.log('✓ ProjectItemLocalization rows:', itemLocRows[0].count);

    // Count media
    const [mediaRows] = await connection.execute('SELECT COUNT(*) as count FROM Media');
    console.log('✓ Media rows:', mediaRows[0].count);

    // Check MainMedia FK updates
    const [mainMediaRows] = await connection.execute('SELECT COUNT(*) as count FROM Project WHERE MainMediaId IS NOT NULL');
    console.log('✓ Projects with MainMediaId:', mainMediaRows[0].count);

    console.log('\n' + '='.repeat(50));
    console.log('Expected:');
    console.log('- Project: 1,271');
    console.log('- ProjectLocalization: 3,813 (1,271 × 3 languages)');
    console.log('- ProjectItem: 1,271');
    console.log('- ProjectItemLocalization: 3,813 (1,271 × 3 languages)');
    console.log('- Media: 1,721');
    console.log('- Projects with MainMediaId: ~966');

    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStatus();
