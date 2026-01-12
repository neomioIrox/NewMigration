const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function updateMediaPaths() {
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

    console.log('\n📋 Sample paths BEFORE update:');
    before.forEach(row => {
      console.log(`  ID ${row.Id}: ${row.RelativePath}`);
    });

    // Update all paths
    console.log('\n🔄 Updating all Media RelativePath fields...');
    const [result] = await connection.query(`
      UPDATE Media
      SET RelativePath = CONCAT('2020/01/', RelativePath)
      WHERE RelativePath IS NOT NULL
        AND RelativePath != ''
        AND RelativePath NOT LIKE '2020/01/%'
    `);

    console.log(`✅ Updated ${result.affectedRows} records`);

    // Check after update
    const [after] = await connection.query(`
      SELECT Id, RelativePath
      FROM Media
      WHERE RelativePath IS NOT NULL
        AND RelativePath != ''
      LIMIT 5
    `);

    console.log('\n📋 Sample paths AFTER update:');
    after.forEach(row => {
      console.log(`  ID ${row.Id}: ${row.RelativePath}`);
    });

    // Count total
    const [count] = await connection.query(`
      SELECT COUNT(*) as total
      FROM Media
      WHERE RelativePath LIKE '2020/01/%'
    `);

    console.log(`\n✅ Total Media records with '2020/01/' prefix: ${count[0].total}`);

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

// Run the update
updateMediaPaths()
  .then(() => {
    console.log('\n✅ Media paths update completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
