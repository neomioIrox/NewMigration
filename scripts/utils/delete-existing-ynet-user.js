const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function deleteExistingYnetUser() {
  let connection;

  try {
    console.log('🗑️  Deleting existing YNET user...\n');

    connection = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Check existing user
    const [existing] = await connection.query(
      'SELECT * FROM user WHERE UserName = ?',
      ['ynet']
    );

    if (existing.length === 0) {
      console.log('ℹ️  No user with UserName="ynet" found. Nothing to delete.\n');
      return;
    }

    console.log('📋 Found existing user:');
    console.table(existing);

    // Delete
    const [result] = await connection.query(
      'DELETE FROM user WHERE UserName = ?',
      ['ynet']
    );

    console.log(`\n✅ Deleted ${result.affectedRows} user(s) with UserName="ynet"\n`);

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (connection) {
      try {
        xxxxxxxxxxxction.end();
      } catch (e) {}
    }
  }
}

deleteExistingYnetUser()
  .then(() => {
    console.log('🎉 Done!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
