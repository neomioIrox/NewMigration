// Check the UPDATE issue - column names and actual behavior
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    conn = await mysql.createConnection(config.mysqlTarget);

    console.log('=== CHECKING UPDATE ISSUE ===\n');

    // 1. Check projectlocalization column names
    console.log('--- 1. PROJECTLOCALIZATION COLUMNS ---');
    const [cols] = await conn.query(`
      SHOW COLUMNS FROM projectlocalization
    `);
    const colNames = cols.map(c => c.Field);
    console.log('Columns:', colNames.join(', '));

    // Check if it's ProjectId or ProjectID or something else
    const projectIdCol = colNames.find(c => c.toLowerCase() === 'projectid');
    const languageCol = colNames.find(c => c.toLowerCase() === 'language');
    console.log('ProjectId column:', projectIdCol);
    console.log('Language column:', languageCol);

    // 2. Test the exact UPDATE that the migration runs
    console.log('\n--- 2. TESTING UPDATE MANUALLY ---');

    // Get a specific project
    const projectId = 2888;
    const langId = 1;
    const mediaId = 51;

    // First check current state
    const [before] = await conn.query(`
      SELECT ${projectIdCol}, ${languageCol}, MainMedia
      FROM projectlocalization
      WHERE ${projectIdCol} = ? AND ${languageCol} = ?
    `, [projectId, langId]);

    console.log('Before UPDATE:');
    console.log('  ProjectId:', before[0]?.[projectIdCol] ?? 'NOT FOUND');
    console.log('  Language:', before[0]?.[languageCol] ?? 'NOT FOUND');
    console.log('  MainMedia:', before[0]?.MainMedia ?? 'NOT FOUND');

    if (!before.length) {
      console.log('\n  ROW DOES NOT EXIST! That explains the issue.');
      return;
    }

    // Run the UPDATE
    console.log('\nRunning UPDATE...');
    const [result] = await conn.query(`
      UPDATE projectlocalization
      SET MainMedia = ?, ImageForListsView = ?
      WHERE ${projectIdCol} = ? AND ${languageCol} = ?
    `, [mediaId, mediaId, projectId, langId]);

    console.log('Affected rows:', result.affectedRows);
    console.log('Changed rows:', result.changedRows);

    // Check after
    const [after] = await conn.query(`
      SELECT MainMedia, ImageForListsView
      FROM projectlocalization
      WHERE ${projectIdCol} = ? AND ${languageCol} = ?
    `, [projectId, langId]);

    console.log('\nAfter UPDATE:');
    console.log('  MainMedia:', after[0]?.MainMedia);
    console.log('  ImageForListsView:', after[0]?.ImageForListsView);

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    if (conn) await conn.end();
  }
}
check();
