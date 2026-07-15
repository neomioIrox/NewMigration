// Fix NULL MainMedia by copying from Hebrew version
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function fixMainMedia() {
  let conn;

  try {
    console.log('=== FIXING NULL MAINMEDIA VALUES ===\n');
    conn = await mysql.createConnection(config.mysqlTarget);

    // 1. Count the problem
    console.log('--- 1. BEFORE FIX ---');
    const [before] = await conn.query(`
      SELECT
        Language,
        SUM(CASE WHEN MainMedia IS NULL THEN 1 ELSE 0 END) as null_count,
        COUNT(*) as total
      FROM projectlocalization
      GROUP BY Language
    `);
    before.forEach(r => {
      const lang = r.Language === 1 ? 'Hebrew' : r.Language === 2 ? 'English' : 'French';
      console.log(lang + ': ' + r.null_count + ' NULL out of ' + r.total);
    });

    // 2. Fix: Copy MainMedia from Hebrew to English/French where Hebrew has a value
    console.log('\n--- 2. FIXING ENGLISH ---');
    const [fixEn] = await conn.query(`
      UPDATE projectlocalization en
      JOIN projectlocalization he ON en.ProjectId = he.ProjectId AND he.Language = 1
      SET en.MainMedia = he.MainMedia,
          en.ImageForListsView = he.ImageForListsView
      WHERE en.Language = 2
        AND en.MainMedia IS NULL
        AND he.MainMedia IS NOT NULL
    `);
    console.log('Updated ' + fixEn.affectedRows + ' English records');

    console.log('\n--- 3. FIXING FRENCH ---');
    const [fixFr] = await conn.query(`
      UPDATE projectlocalization fr
      JOIN projectlocalization he ON fr.ProjectId = he.ProjectId AND he.Language = 1
      SET fr.MainMedia = he.MainMedia,
          fr.ImageForListsView = he.ImageForListsView
      WHERE fr.Language = 3
        AND fr.MainMedia IS NULL
        AND he.MainMedia IS NOT NULL
    `);
    console.log('Updated ' + fixFr.affectedRows + ' French records');

    // 3. Fix Hebrew where still NULL (set to 1 = default)
    console.log('\n--- 4. FIXING REMAINING HEBREW (set to default 1) ---');
    const [fixHe] = await conn.query(`
      UPDATE projectlocalization
      SET MainMedia = 1, ImageForListsView = 1
      WHERE Language = 1
        AND MainMedia IS NULL
    `);
    console.log('Updated ' + fixHe.affectedRows + ' Hebrew records');

    // 4. Count after fix
    console.log('\n--- 5. AFTER FIX ---');
    const [after] = await conn.query(`
      SELECT
        Language,
        SUM(CASE WHEN MainMedia IS NULL THEN 1 ELSE 0 END) as null_count,
        COUNT(*) as total
      FROM projectlocalization
      GROUP BY Language
    `);
    after.forEach(r => {
      const lang = r.Language === 1 ? 'Hebrew' : r.Language === 2 ? 'English' : 'French';
      console.log(lang + ': ' + r.null_count + ' NULL out of ' + r.total);
    });

    console.log('\n=== FIX COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

fixMainMedia();
