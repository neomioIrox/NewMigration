// Fix MainMedia using the correct media IDs from tracker
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function fix() {
  let targetConn, trackerConn;

  try {
    console.log('=== FIXING MAINMEDIA FROM TRACKER DATA ===\n');
    targetConn = await mysql.createConnection(config.mysqlTarget);
    trackerConn = await mysql.createConnection(config.mysqlTracker);

    // Get all the mappings we need
    console.log('--- 1. LOADING TRACKER MAPPINGS ---');

    const [projectMappings] = await trackerConn.query(`
      SELECT source_id, target_id
      FROM id_mappings
      WHERE entity_type = 'Project'
    `);
    const projectIdMap = {};
    projectMappings.forEach(m => projectIdMap[m.source_id] = m.target_id);
    console.log('Project mappings:', projectMappings.length);

    const [mediaMappings] = await trackerConn.query(`
      SELECT source_id, target_id
      FROM id_mappings
      WHERE entity_type = 'Media_hebrew_projectImage'
    `);
    const mediaIdMap = {};
    mediaMappings.forEach(m => mediaIdMap[m.source_id] = m.target_id);
    console.log('Media mappings:', mediaMappings.length);

    // Find mismatched records
    console.log('\n--- 2. FINDING MISMATCHES ---');
    let fixes = [];

    for (const sourceId of Object.keys(mediaIdMap)) {
      const projectId = projectIdMap[sourceId];
      const expectedMediaId = mediaIdMap[sourceId];

      if (!projectId || !expectedMediaId) continue;

      const [pl] = await targetConn.query(`
        SELECT MainMedia FROM projectlocalization
        WHERE ProjectId = ? AND Language = 1
      `, [projectId]);

      if (!pl.length) continue;

      const actualMediaId = pl[0].MainMedia;
      if (actualMediaId != expectedMediaId) {
        fixes.push({
          projectId: projectId,
          wrongValue: actualMediaId,
          correctValue: expectedMediaId
        });
      }
    }

    console.log('Found ' + fixes.length + ' records to fix');

    if (fixes.length === 0) {
      console.log('Nothing to fix!');
      return;
    }

    // Show sample
    console.log('\nSample fixes:');
    fixes.slice(0, 5).forEach(f => {
      console.log('  Project ' + f.projectId + ': ' + f.wrongValue + ' -> ' + f.correctValue);
    });

    // Apply fixes to Hebrew
    console.log('\n--- 3. APPLYING FIXES (Hebrew) ---');
    let fixedHebrew = 0;
    for (const f of fixes) {
      const [result] = await targetConn.query(`
        UPDATE projectlocalization
        SET MainMedia = ?, ImageForListsView = ?
        WHERE ProjectId = ? AND Language = 1
      `, [f.correctValue, f.correctValue, f.projectId]);
      fixedHebrew += result.affectedRows;
    }
    console.log('Fixed ' + fixedHebrew + ' Hebrew records');

    // Apply fixes to English (copy from Hebrew)
    console.log('\n--- 4. APPLYING FIXES (English) ---');
    let fixedEnglish = 0;
    for (const f of fixes) {
      const [result] = await targetConn.query(`
        UPDATE projectlocalization
        SET MainMedia = ?, ImageForListsView = ?
        WHERE ProjectId = ? AND Language = 2
      `, [f.correctValue, f.correctValue, f.projectId]);
      fixedEnglish += result.affectedRows;
    }
    console.log('Fixed ' + fixedEnglish + ' English records');

    // Apply fixes to French (copy from Hebrew)
    console.log('\n--- 5. APPLYING FIXES (French) ---');
    let fixedFrench = 0;
    for (const f of fixes) {
      const [result] = await targetConn.query(`
        UPDATE projectlocalization
        SET MainMedia = ?, ImageForListsView = ?
        WHERE ProjectId = ? AND Language = 3
      `, [f.correctValue, f.correctValue, f.projectId]);
      fixedFrench += result.affectedRows;
    }
    console.log('Fixed ' + fixedFrench + ' French records');

    // Verify
    console.log('\n--- 6. VERIFICATION ---');
    const [after] = await targetConn.query(`
      SELECT
        Language,
        SUM(CASE WHEN MainMedia IS NULL THEN 1 ELSE 0 END) as null_count,
        SUM(CASE WHEN MainMedia = 1 THEN 1 ELSE 0 END) as default_count,
        SUM(CASE WHEN MainMedia > 1 THEN 1 ELSE 0 END) as proper_count,
        COUNT(*) as total
      FROM projectlocalization
      GROUP BY Language
    `);
    after.forEach(r => {
      const lang = r.Language === 1 ? 'Hebrew' : r.Language === 2 ? 'English' : 'French';
      console.log(lang + ': NULL=' + r.null_count + ', Default(1)=' + r.default_count +
                  ', Proper=' + r.proper_count + ', Total=' + r.total);
    });

    console.log('\n=== FIX COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (targetConn) await targetConn.end();
    if (trackerConn) await trackerConn.end();
  }
}

fix();
