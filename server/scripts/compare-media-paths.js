// Compare migrated media vs app-created media paths
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    console.log('=== MEDIA PATH COMPARISON ===\n');
    conn = await mysql.createConnection(config.mysqlTarget);

    // Migrated media (2020)
    console.log('--- MIGRATED MEDIA (YearDirectory=2020) ---');
    const [migrated] = await conn.query(`
      SELECT Id, RelativePath, YearDirectory, MonthDirectory,
             CONCAT(YearDirectory, '/', MonthDirectory, '/', RelativePath) as FullPath
      FROM media
      WHERE YearDirectory = '2020'
      LIMIT 5
    `);
    migrated.forEach(r => {
      console.log('ID ' + r.Id + ':');
      console.log('  RelativePath: ' + r.RelativePath);
      console.log('  FullPath: ' + r.FullPath);
    });

    // App-created media (2025)
    console.log('\n--- APP-CREATED MEDIA (YearDirectory=2025) ---');
    const [appCreated] = await conn.query(`
      SELECT Id, RelativePath, YearDirectory, MonthDirectory,
             CONCAT(YearDirectory, '/', MonthDirectory, '/', RelativePath) as FullPath
      FROM media
      WHERE YearDirectory = '2025'
      LIMIT 5
    `);
    appCreated.forEach(r => {
      console.log('ID ' + r.Id + ':');
      console.log('  RelativePath: ' + r.RelativePath);
      console.log('  FullPath: ' + r.FullPath);
    });

    // Check for duplicated prefix problem
    console.log('\n--- CHECKING FOR DUPLICATED PREFIX ---');
    const [duplicates] = await conn.query(`
      SELECT COUNT(*) as cnt
      FROM media
      WHERE RelativePath LIKE '%2025/01/%'
         OR RelativePath LIKE '%2020/01/%'
    `);
    console.log('Media with year/month in RelativePath:', duplicates[0].cnt);

    if (duplicates[0].cnt > 0) {
      console.log('\nSample duplicated paths:');
      const [samples] = await conn.query(`
        SELECT Id, RelativePath
        FROM media
        WHERE RelativePath LIKE '%2025/01/%'
           OR RelativePath LIKE '%2020/01/%'
        LIMIT 5
      `);
      samples.forEach(r => {
        console.log('  ID ' + r.Id + ': ' + r.RelativePath);
      });
    }

    // Summary
    console.log('\n--- SUMMARY ---');
    const [summary] = await conn.query(`
      SELECT
        YearDirectory,
        COUNT(*) as cnt,
        SUM(CASE WHEN RelativePath LIKE '2025/%' OR RelativePath LIKE '2020/%' THEN 1 ELSE 0 END) as duplicated
      FROM media
      GROUP BY YearDirectory
    `);
    summary.forEach(r => {
      console.log(r.YearDirectory + ': ' + r.cnt + ' records, ' + r.duplicated + ' with duplicated prefix');
    });

    console.log('\n=== DONE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

check();
