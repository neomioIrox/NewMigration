const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function fixMediaPaths() {
  let connection;

  try {
    console.log('Connecting to MySQL...');
    connection = await mysql.createConnection(mysqlConfig);
    console.log('Connected successfully');

    // First, check current paths
    const [before] = await connection.query(`
      SELECT Id, RelativePath
      FROM Media
      WHERE RelativePath IS NOT NULL
        AND RelativePath != ''
      LIMIT 5
    `);

    console.log('\n📋 Sample paths BEFORE fix:');
    before.forEach(row => {
      console.log(`  ID ${row.Id}: ${row.RelativePath}`);
    });

    // Fix: Replace "2020/01/2025/01/" with "2020/01/"
    console.log('\n🔄 Fixing Media RelativePath fields...');
    const [result] = await connection.query(`
      UPDATE Media
      SET RelativePath = REPLACE(RelativePath, '2020/01/2025/01/', '2020/01/')
      WHERE RelativePath LIKE '2020/01/2025/01/%'
    `);

    console.log(`✅ Fixed ${result.affectedRows} records`);

    // Check after fix
    const [after] = await connection.query(`
      SELECT Id, RelativePath
      FROM Media
      WHERE RelativePath IS NOT NULL
        AND RelativePath != ''
      LIMIT 5
    `);

    console.log('\n📋 Sample paths AFTER fix:');
    after.forEach(row => {
      console.log(`  ID ${row.Id}: ${row.RelativePath}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Connection closed');
    }
  }
}

// Run the fix
fixMediaPaths()
  .then(() => {
    console.log('\n✅ Media paths fix completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fix failed:', error);
    process.exit(1);
  });
