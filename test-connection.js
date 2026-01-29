/**
 * Quick script to test MSSQL connection with new credentials
 */
const sql = require('mssql');
const { mssqlConfig } = require('./config/database');

async function testConnection() {
  console.log('Testing MSSQL connection with config:');
  console.log('Server:', mssqlConfig.server);
  console.log('Database:', mssqlConfig.database);
  console.log('User:', mssqlConfig.authentication.options.userName);
  console.log('---');

  try {
    console.log('Connecting...');
    const pool = await sql.connect(mssqlConfig);
    console.log('✅ Connected successfully!');

    // Test a simple query
    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log('Server version:', result.recordset[0].version.split('\n')[0]);

    await pool.close();
    console.log('✅ Connection test passed!');
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    process.exit(1);
  }
}

testConnection();
