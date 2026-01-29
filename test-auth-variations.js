/**
 * Test different authentication variations
 */
const sql = require('mssql');

const variations = [
  {
    name: 'SQL Auth - no',
    config: {
      server: 'DESKTOP-7QELS7G',
      database: 'kupatOld',
      user: 'no',
      password: '0987654321',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 30000
    }
  },
  {
    name: 'SQL Auth - sa',
    config: {
      server: 'DESKTOP-7QELS7G',
      database: 'kupatOld',
      user: 'sa',
      password: '0987654321',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 30000
    }
  },
  {
    name: 'Domain Auth - DESKTOP-7QELS7G\\no',
    config: {
      server: 'DESKTOP-7QELS7G',
      database: 'kupatOld',
      domain: 'DESKTOP-7QELS7G',
      user: 'no',
      password: '0987654321',
      options: { encrypt: false, trustServerCertificate: true },
connectionTimeout: 30000
    }
  },
  {
    name: 'Windows Auth',
    config: {
      server: 'DESKTOP-7QELS7G',
      database: 'kupatOld',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        trustedConnection: true
      },
connectionTimeout: 30000
    }
  }
];

async function testVariation(variation) {
  console.log(`\nTesting: ${variation.name}`);
  console.log('-'.repeat(50));

  try {
    const pool = await sql.connect(variation.config);
    const result = await pool.request().query('SELECT DB_NAME() as db, SYSTEM_USER as user');
    console.log('✅ SUCCESS!');
    console.log('   DB:', result.recordset[0].db);
    console.log('   User:', result.recordset[0].user);
    await pool.close();
    return true;
  } catch (error) {
    console.log('❌ FAILED:', error.message);
    return false;
  }
}

async function run() {
  console.log('Testing SQL Server Authentication Variations');
  console.log('='.repeat(50));

  for (const variation of variations) {
    await testVariation(variation);
    // Close any lingering connections
    await sql.close();
  }

  console.log('\n' + '='.repeat(50));
  console.log('Test complete');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
