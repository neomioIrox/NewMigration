/**
 * Test both authentication methods
 */
const sql = require('mssql');

// Option 1: SQL Authentication (user/password directly)
const sqlAuthConfig = {
  server: 'DESKTOP-7QELS7G',
  database: 'kupatOld',
  user: 'no',
  password: '0987654321',
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  connectionTimeout: 30000,
  requestTimeout: 300000
};

// Option 2: Windows Authentication
const windowsAuthConfig = {
  server: 'DESKTOP-7QELS7G',
  database: 'kupatOld',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    trustedConnection: true
  },
  connectionTimeout: 30000,
  requestTimeout: 300000
};

async function testAuth(config, authType) {
  console.log(`\n=== Testing ${authType} ===`);
  if (config.user) {
    console.log('User:', config.user);
  }
  console.log('Server:', config.server);
  console.log('Database:', config.database);

  try {
    console.log('Connecting...');
    const pool = await sql.connect(config);
    console.log('✅ Connected successfully!');

    const result = await pool.request().query('SELECT DB_NAME() as db, SYSTEM_USER as user');
    console.log('Connected to DB:', result.recordset[0].db);
    console.log('As user:', result.recordset[0].user);

    await pool.close();
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

async function run() {
  console.log('Testing MSSQL Connection Methods');
  console.log('='.repeat(50));

  const sqlAuthSuccess = await testAuth(sqlAuthConfig, 'SQL Authentication');
  const winAuthSuccess = await testAuth(windowsAuthConfig, 'Windows Authentication');

  console.log('\n' + '='.repeat(50));
  console.log('RESULTS:');
  console.log('SQL Auth:', sqlAuthSuccess ? '✅ Success' : '❌ Failed');
  console.log('Windows Auth:', winAuthSuccess ? '✅ Success' : '❌ Failed');
}

run();
