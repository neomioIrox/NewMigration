// Check all migration-related tables
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    console.log('=== CHECKING ALL TABLES ===\n');
    conn = await mysql.createConnection(config.mysqlTarget);

    const tables = [
      'project',
      'projectlocalization',
      'projectitem',
      'projectitemlocalization',
      'media',
      'linksetting',
      'entitycontent',
      'entitycontentitem',
      'recruitersgroup'
    ];

    for (const table of tables) {
      try {
        const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM `' + table + '`');
        console.log(table + ': ' + rows[0].cnt + ' rows');
      } catch (e) {
        console.log(table + ': ERROR - ' + e.message);
      }
    }

    console.log('\n=== DONE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

check();
