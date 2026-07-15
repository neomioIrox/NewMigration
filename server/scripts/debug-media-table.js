// Debug media table structure and content
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    console.log('=== DEBUG MEDIA TABLE ===\n');
    conn = await mysql.createConnection(config.mysqlTarget);

    // Check table structure
    console.log('--- TABLE STRUCTURE ---');
    const [cols] = await conn.query('SHOW COLUMNS FROM media');
    cols.forEach(c => console.log('  ' + c.Field + ' (' + c.Type + ')'));

    // Count and sample
    console.log('\n--- BASIC STATS ---');
    const [count] = await conn.query('SELECT COUNT(*) as cnt FROM media');
    console.log('Total rows:', count[0].cnt);

    // Sample raw data
    console.log('\n--- RAW SAMPLE DATA ---');
    const [sample] = await conn.query('SELECT * FROM media LIMIT 3');
    sample.forEach((r, i) => {
      console.log('\nRow ' + (i + 1) + ':');
      Object.keys(r).forEach(k => {
        console.log('  ' + k + ': ' + JSON.stringify(r[k]));
      });
    });

    // Check YearDirectory values
    console.log('\n--- DISTINCT YEARDIRECTORY VALUES ---');
    const [years] = await conn.query(`
      SELECT DISTINCT YearDirectory, COUNT(*) as cnt
      FROM media
      GROUP BY YearDirectory
    `);
    years.forEach(r => console.log('  "' + r.YearDirectory + '": ' + r.cnt));

    console.log('\n=== DONE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

check();
