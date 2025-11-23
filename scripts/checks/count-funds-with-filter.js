// Script to count Products records that match the Funds WHERE clause
const sql = require('mssql');
const fs = require('fs');

async function countFunds() {
  try {
    // Load database config from the last connection test
    console.log('Loading database configuration...');

    // MSSQL Configuration
    const mssqlConfig = {
      user: 'sa',
      password: 'Aa123456',
      server: 'localhost',
      database: 'KupatHairDB',
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    };

    // Connect to MSSQL
    console.log('Connecting to MSSQL...');
    const pool = await sql.connect(mssqlConfig);
    console.log('✅ Connected to MSSQL\n');

    // Count total Products
    const totalResult = await pool.request().query('SELECT COUNT(*) as total FROM products');
    const totalCount = totalResult.recordset[0].total;
    console.log('📊 Total Products records:', totalCount);

    // Load the WHERE clause from mapping file
    const mappingPath = './mappings/ProjectMapping_Funds_Fixed.json';
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    const whereClause = mapping.whereClause;

    console.log('\n📋 WHERE Clause:');
    console.log(whereClause);

    // Count with WHERE clause
    const filteredQuery = `SELECT COUNT(*) as filtered FROM products WHERE ${whereClause}`;
    console.log('\n🔍 Executing filtered count...');

    const filteredResult = await pool.request().query(filteredQuery);
    const filteredCount = filteredResult.recordset[0].filtered;

    console.log('\n📊 Results:');
    console.log('   Total Products:', totalCount);
    console.log('   Filtered (Funds only):', filteredCount);
    console.log('   Excluded:', totalCount - filteredCount);
    console.log('   Percentage:', ((filteredCount / totalCount) * 100).toFixed(2) + '%');

    // Show some sample excluded records
    console.log('\n🔍 Sample excluded records (first 5):');
    const excludedQuery = `
      SELECT TOP 5 productsid, Name, Certificate
      FROM products
      WHERE NOT (${whereClause})
    `;
    const excludedResult = await pool.request().query(excludedQuery);

    excludedResult.recordset.forEach(record => {
      console.log(`   ID: ${record.productsid}, Name: ${record.Name}, Certificate: ${record.Certificate}`);
    });

    // Close connection
    await pool.close();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

countFunds();
