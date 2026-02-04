const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function fixDuplicates() {
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);

    // Find duplicates
    const [duplicates] = await connection.query(`
      SELECT Id, RelativePath
      FROM Media
      WHERE RelativePath LIKE '2020/01/2025/%'
    `);

    console.log(`\n🔍 Found ${duplicates.length} records with duplicate prefix:`);
    duplicates.forEach(row => {
      const fixed = row.RelativePath.replace('2020/01/2025/', '2020/01/');
      console.log(`  ID ${row.Id}: ${row.RelativePath} → ${fixed}`);
    });

    // Fix them
    if (duplicates.length > 0) {
      const [result] = await connection.query(`
        UPDATE Media
        SET RelativePath = REPLACE(RelativePath, '2020/01/2025/', '2020/01/')
        WHERE RelativePath LIKE '2020/01/2025/%'
      `);
      console.log(`\n✅ Fixed ${result.affectedRows} records`);
    }

    await connection.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixDuplicates();
