// Copy MainMedia from Hebrew to English/French where Hebrew has a proper value
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function fix() {
  let conn;

  try {
    console.log('=== COPYING MAINMEDIA FROM HEBREW TO OTHER LANGUAGES ===\n');
    conn = await mysql.createConnection(config.mysqlTarget);

    // Before
    console.log('--- BEFORE ---');
    const [before] = await conn.query(`
      SELECT Language,
        SUM(CASE WHEN MainMedia IS NULL THEN 1 ELSE 0 END) as null_count,
        SUM(CASE WHEN MainMedia = 1 THEN 1 ELSE 0 END) as default_count,
        SUM(CASE WHEN MainMedia > 1 THEN 1 ELSE 0 END) as proper_count
      FROM projectlocalization GROUP BY Language
    `);
    before.forEach(r => {
      const lang = ['', 'Hebrew', 'English', 'French'][r.Language];
      console.log(lang + ': NULL=' + r.null_count + ', Default=' + r.default_count + ', Proper=' + r.proper_count);
    });

    // Fix English - copy Hebrew values (even default 1)
    console.log('\n--- FIXING ENGLISH ---');
    const [fixEn] = await conn.query(`
      UPDATE projectlocalization en
      JOIN projectlocalization he ON en.ProjectId = he.ProjectId AND he.Language = 1
      SET en.MainMedia = he.MainMedia,
          en.ImageForListsView = he.ImageForListsView
      WHERE en.Language = 2
        AND en.MainMedia IS NULL
        AND he.MainMedia IS NOT NULL
    `);
    console.log('Copied ' + fixEn.affectedRows + ' from Hebrew to English');

    // Fix French - copy Hebrew values
    console.log('\n--- FIXING FRENCH ---');
    const [fixFr] = await conn.query(`
      UPDATE projectlocalization fr
      JOIN projectlocalization he ON fr.ProjectId = he.ProjectId AND he.Language = 1
      SET fr.MainMedia = he.MainMedia,
          fr.ImageForListsView = he.ImageForListsView
      WHERE fr.Language = 3
        AND fr.MainMedia IS NULL
        AND he.MainMedia IS NOT NULL
    `);
    console.log('Copied ' + fixFr.affectedRows + ' from Hebrew to French');

    // After
    console.log('\n--- AFTER ---');
    const [after] = await conn.query(`
      SELECT Language,
        SUM(CASE WHEN MainMedia IS NULL THEN 1 ELSE 0 END) as null_count,
        SUM(CASE WHEN MainMedia = 1 THEN 1 ELSE 0 END) as default_count,
        SUM(CASE WHEN MainMedia > 1 THEN 1 ELSE 0 END) as proper_count
      FROM projectlocalization GROUP BY Language
    `);
    after.forEach(r => {
      const lang = ['', 'Hebrew', 'English', 'French'][r.Language];
      console.log(lang + ': NULL=' + r.null_count + ', Default=' + r.default_count + ', Proper=' + r.proper_count);
    });

    console.log('\n=== DONE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

fix();
