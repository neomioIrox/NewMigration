// Check if projectlocalization exists for the problematic projects
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    conn = await mysql.createConnection(config.mysqlTarget);

    console.log('=== CHECKING LOCALIZATION RECORDS ===\n');

    // Projects with NULL MainMedia
    console.log('--- Projects with NULL MainMedia ---');
    const [nullMain] = await conn.query(`
      SELECT ProjectId, Language, MainMedia
      FROM projectlocalization
      WHERE MainMedia IS NULL
      LIMIT 10
    `);
    nullMain.forEach(r => console.log('  Project ' + r.ProjectId + ', Lang ' + r.Language + ': NULL'));

    // Check if projects 2888-2891 have localizations
    console.log('\n--- Checking Projects 2888-2891 ---');
    const [pl] = await conn.query(`
      SELECT ProjectId, COUNT(*) as langs
      FROM projectlocalization
      WHERE ProjectId IN (2888, 2889, 2890, 2891)
      GROUP BY ProjectId
    `);
    console.log('Localization records found:', pl.length);
    pl.forEach(r => console.log('  Project ' + r.ProjectId + ': ' + r.langs + ' languages'));

    // Check if these projects exist in project table
    console.log('\n--- Checking if Projects exist ---');
    const [prj] = await conn.query(`
      SELECT Id, Name FROM project WHERE Id IN (2888, 2889, 2890, 2891)
    `);
    prj.forEach(r => console.log('  Project ' + r.Id + ': ' + (r.Name || '').substring(0, 30)));

    // Check total projects vs localizations
    console.log('\n--- Project vs Localization Count ---');
    const [projCount] = await conn.query('SELECT COUNT(*) as cnt FROM project');
    const [plCount] = await conn.query('SELECT COUNT(DISTINCT ProjectId) as cnt FROM projectlocalization');
    console.log('Total projects:', projCount[0].cnt);
    console.log('Projects with localizations:', plCount[0].cnt);

    // Find projects without localizations
    console.log('\n--- Projects WITHOUT any localization ---');
    const [orphans] = await conn.query(`
      SELECT p.Id, p.Name
      FROM project p
      LEFT JOIN projectlocalization pl ON p.Id = pl.ProjectId
      WHERE pl.ProjectId IS NULL
      LIMIT 10
    `);
    console.log('Found:', orphans.length, 'projects without localization');
    orphans.forEach(r => console.log('  ' + r.Id + ': ' + (r.Name || '').substring(0, 30)));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}
check();
