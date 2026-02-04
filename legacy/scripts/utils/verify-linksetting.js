// Script to verify LinkSetting table structure
const mysql = require('mysql2/promise');

async function verifyLinkSetting() {
  console.log('🔍 Verifying LinkSetting Table Structure');
  console.log('=========================================\n');

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

    // Get table structure
    console.log('📋 LinkSetting Table Structure:');
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM linksetting
    `);

    columns.forEach(col => {
      const nullable = col.Null === 'YES' ? '(nullable)' : '(required)';
      const extra = col.Extra ? `[${col.Extra}]` : '';
      console.log(`   ${col.Field.padEnd(25)} ${col.Type.padEnd(20)} ${nullable} ${extra}`);
    });

    console.log('');

    // Check current data
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as count FROM linksetting
    `);
    console.log(`📊 Current records in LinkSetting: ${countResult[0].count}\n`);

    if (countResult[0].count > 0) {
      console.log('📝 Sample LinkSetting records:');
      const [records] = await connection.execute(`
        SELECT
          Id,
          LinkType,
          LinkTargetType,
          ProjectId,
          ItemId,
          LinkText
        FROM linksetting
        LIMIT 5
      `);

      records.forEach(rec => {
        console.log(`   ID ${rec.Id}: Type=${rec.LinkType}, TargetType=${rec.LinkTargetType}, Project=${rec.ProjectId}, Item=${rec.ItemId}, Text="${rec.LinkText}"`);
      });
      console.log('');
    }

    await connection.end();

    console.log('✅ Verification complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('   1. Check MySQL connection settings');
    console.error('   2. Verify database name: kupathair_newdb');
    console.error('   3. Check user permissions');
  }
}

verifyLinkSetting();
