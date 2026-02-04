// Verify media paths are correct
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function verify() {
  let conn;

  try {
    console.log('=== VERIFYING MEDIA PATHS ===\n');
    conn = await mysql.createConnection(config.mysqlTarget);

    // 1. Check media table stats
    console.log('--- 1. MEDIA TABLE OVERVIEW ---');
    const [stats] = await conn.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN RelativePath IS NULL OR RelativePath = '' THEN 1 ELSE 0 END) as empty_path,
        SUM(CASE WHEN RelativePath LIKE '%.png' OR RelativePath LIKE '%.PNG' THEN 1 ELSE 0 END) as png,
        SUM(CASE WHEN RelativePath LIKE '%.jpg' OR RelativePath LIKE '%.JPG' OR RelativePath LIKE '%.jpeg' THEN 1 ELSE 0 END) as jpg,
        SUM(CASE WHEN RelativePath LIKE '%.gif' OR RelativePath LIKE '%.GIF' THEN 1 ELSE 0 END) as gif,
        SUM(CASE WHEN YearDirectory = '2020' THEN 1 ELSE 0 END) as from_migration,
        SUM(CASE WHEN YearDirectory = '2025' THEN 1 ELSE 0 END) as from_app
      FROM media
    `);
    const s = stats[0];
    console.log('Total media:', s.total);
    console.log('Empty paths:', s.empty_path);
    console.log('PNG:', s.png, ', JPG:', s.jpg, ', GIF:', s.gif);
    console.log('From migration (2020):', s.from_migration);
    console.log('From app (2025):', s.from_app);

    // 2. Sample paths
    console.log('\n--- 2. SAMPLE MEDIA PATHS ---');
    const [samples] = await conn.query(`
      SELECT Id, RelativePath, YearDirectory, MonthDirectory
      FROM media
      WHERE YearDirectory = '2020'
      LIMIT 10
    `);
    console.log('Migrated media (first 10):');
    samples.forEach(r => {
      const fullPath = r.YearDirectory + '/' + r.MonthDirectory + '/' + r.RelativePath;
      console.log('  ID ' + r.Id + ': ' + fullPath);
    });

    // 3. Check linked projectlocalization
    console.log('\n--- 3. SAMPLE PROJECT WITH MEDIA ---');
    const [linked] = await conn.query(`
      SELECT p.Id as ProjectId, p.Name, pl.Language, pl.MainMedia,
             m.RelativePath, m.YearDirectory, m.MonthDirectory
      FROM project p
      JOIN projectlocalization pl ON p.Id = pl.ProjectId
      JOIN media m ON pl.MainMedia = m.Id
      WHERE pl.MainMedia > 1 AND m.YearDirectory = '2020'
      LIMIT 5
    `);
    linked.forEach(r => {
      const lang = r.Language === 1 ? 'HE' : r.Language === 2 ? 'EN' : 'FR';
      const fullPath = r.YearDirectory + '/' + r.MonthDirectory + '/' + r.RelativePath;
      console.log('Project ' + r.ProjectId + ' (' + lang + '): ' + (r.Name || '').substring(0, 25));
      console.log('  MainMedia=' + r.MainMedia + ' -> ' + fullPath);
    });

    // 4. What the frontend expects
    console.log('\n--- 4. EXPECTED MEDIA URL PATTERN ---');
    console.log('Based on the data, images should be served from:');
    console.log('  /media/{YearDirectory}/{MonthDirectory}/{RelativePath}');
    console.log('  Example: /media/2020/1/peretz.PNG');
    console.log('');
    console.log('Make sure the image files exist in the correct location on the server.');

    console.log('\n=== VERIFICATION COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

verify();
