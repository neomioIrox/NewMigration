const mysql = require('mysql2/promise');
const sql = require('mssql');
const { mysqlConfig, mssqlConfig } = require('../../config/database');

async function checkYnetUser() {
  let mysqlConn;
  let mssqlPool;

  try {
    console.log('🔍 Checking YNET user issue...\n');

    // Check MySQL - is there already a user with UserName='YNET'?
    mysqlConn = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });
    const [existingUsers] = await mysqlConn.query(
      'SELECT * FROM user WHERE UserName = ?',
      ['YNET']
    );

    if (existingUsers.length > 0) {
      console.log('✅ Found existing user with UserName="YNET" in MySQL:');
      console.table(existingUsers);
    } else {
      console.log('❌ No existing user with UserName="YNET" found\n');
    }

    // Check old DB - what's in ParentSources Id=40?
    mssqlPool = await sql.connect(mssqlConfig);
    const result = await mssqlPool.request().query(
      'SELECT * FROM ParentSources WHERE Id = 40'
    );

    if (result.recordset.length > 0) {
      console.log('\n📋 ParentSources Id=40 in old DB:');
      console.table(result.recordset);
    }

    // Check if there are other ParentSources with UserName='YNET'
    const duplicates = await mssqlPool.request().query(
      "SELECT * FROM ParentSources WHERE UserName = 'YNET'"
    );

    if (duplicates.recordset.length > 0) {
      console.log(`\n🔍 Found ${duplicates.recordset.length} ParentSources with UserName='YNET':`);
      console.table(duplicates.recordset);
    }

    // Check missing ParentSourcesId values (4, 8, 40)
    console.log('\n🔍 Checking missing ParentSourcesId values (4, 8, 40):');
    const missingIds = await mssqlPool.request().query(
      'SELECT * FROM ParentSources WHERE Id IN (4, 8, 40)'
    );
    console.table(missingIds.recordset);

    await mysqlConn.end();
    await mssqlPool.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (mysqlConn) {
      try {
        await mysqlConn.end();
      } catch (e) {}
    }
    if (mssqlPool) {
      try {
        await mssqlPool.close();
      } catch (e) {}
    }
  }
}

checkYnetUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
