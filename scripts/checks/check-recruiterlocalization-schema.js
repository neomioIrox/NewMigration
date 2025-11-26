const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkSchema() {
  try {
    const conn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    const [cols] = await conn.query('DESCRIBE recruiterlocalization');
    console.log('\nrecruiterlocalization columns:\n');
    cols.forEach(r => {
      console.log(`  ${r.Field.padEnd(25)} ${r.Type.padEnd(20)} ${r.Null} ${r.Key} ${r.Default}`);
    });

    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkSchema();
