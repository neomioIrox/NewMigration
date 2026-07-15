// Script to check why projectlocalization is not linked to migrated media
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function checkMediaLinkage() {
  let targetConn, trackerConn;

  try {
    console.log('=== CHECKING MEDIA LINKAGE ISSUE ===\n');
    targetConn = await mysql.createConnection(config.mysqlTarget);
    trackerConn = await mysql.createConnection(config.mysqlTracker);

    // 1. Count media by Year/Month
    console.log('--- 1. MEDIA BY YEAR/MONTH ---');
    const [byYear] = await targetConn.query(`
      SELECT YearDirectory, MonthDirectory, COUNT(*) as cnt
      FROM media
      GROUP BY YearDirectory, MonthDirectory
      ORDER BY cnt DESC
    `);
    byYear.forEach(row => {
      console.log('  ' + row.YearDirectory + '/' + row.MonthDirectory + ': ' + row.cnt);
    });

    // 2. Check projectlocalization MainMedia values
    console.log('\n--- 2. PROJECTLOCALIZATION MAINMEDIA DISTRIBUTION ---');
    const [plMainMedia] = await targetConn.query(`
      SELECT
        CASE
          WHEN MainMedia IS NULL THEN 'NULL'
          WHEN MainMedia = 1 THEN 'Default (1)'
          WHEN MainMedia < 51 THEN 'App created (1-50)'
          ELSE 'Migration (51+)'
        END as media_source,
        COUNT(*) as cnt
      FROM projectlocalization
      GROUP BY media_source
      ORDER BY cnt DESC
    `);
    plMainMedia.forEach(row => {
      console.log('  ' + row.media_source + ': ' + row.cnt);
    });

    // 3. Sample projects with their expected vs actual media
    console.log('\n--- 3. SAMPLE PROJECTS: EXPECTED VS ACTUAL MEDIA ---');

    // Get first 5 projects mapped in migration
    const [projectMappings] = await trackerConn.query(`
      SELECT source_id, target_id
      FROM id_mappings
      WHERE entity_type = 'Project'
      ORDER BY CAST(source_id AS UNSIGNED)
      LIMIT 5
    `);

    for (const pm of projectMappings) {
      const sourceId = pm.source_id;
      const projectId = pm.target_id;

      // Get expected media from tracker
      const [expectedMedia] = await trackerConn.query(`
        SELECT entity_type, target_id
        FROM id_mappings
        WHERE source_id = ? AND entity_type LIKE 'Media_%'
      `, [sourceId]);

      // Get actual MainMedia from projectlocalization
      const [actualPl] = await targetConn.query(`
        SELECT Language, MainMedia, ImageForListsView
        FROM projectlocalization
        WHERE ProjectId = ?
      `, [projectId]);

      console.log('\nSource ProductID ' + sourceId + ' -> Project ' + projectId + ':');
      console.log('  Expected media (from tracker):');
      expectedMedia.forEach(m => {
        console.log('    ' + m.entity_type + ' -> MediaID ' + m.target_id);
      });
      console.log('  Actual MainMedia in projectlocalization:');
      actualPl.forEach(pl => {
        console.log('    Lang ' + pl.Language + ': MainMedia=' + pl.MainMedia +
                    ', ImageForListsView=' + pl.ImageForListsView);
      });
    }

    // 4. Check if there's a mismatch between tracker and actual data
    console.log('\n--- 4. CHECKING FOR UPDATE ISSUES ---');

    // Get a sample project and check its media path
    const [sample] = await trackerConn.query(`
      SELECT im.source_id, im.target_id as project_id, mm.target_id as media_id
      FROM id_mappings im
      JOIN id_mappings mm ON im.source_id = mm.source_id AND mm.entity_type = 'Media_hebrew_projectImage'
      WHERE im.entity_type = 'Project'
      LIMIT 1
    `);

    if (sample.length > 0) {
      const projectId = sample[0].project_id;
      const expectedMediaId = sample[0].media_id;

      const [actualPl] = await targetConn.query(`
        SELECT MainMedia FROM projectlocalization WHERE ProjectId = ? AND Language = 1
      `, [projectId]);

      console.log('Project ' + projectId + ':');
      console.log('  Expected MainMedia (from tracker): ' + expectedMediaId);
      console.log('  Actual MainMedia: ' + (actualPl[0]?.MainMedia || 'NULL'));

      if (actualPl[0]?.MainMedia != expectedMediaId) {
        console.log('  MISMATCH! The UPDATE did not work or was overwritten!');
      }
    }

    // 5. Check if media with 2020 year exists and has correct paths
    console.log('\n--- 5. SAMPLE MIGRATED MEDIA (2020) ---');
    const [media2020] = await targetConn.query(`
      SELECT Id, RelativePath, YearDirectory, MonthDirectory
      FROM media
      WHERE YearDirectory = '2020'
      LIMIT 10
    `);
    media2020.forEach(row => {
      console.log('  ID ' + row.Id + ': ' + row.RelativePath +
                  ' (Year=' + row.YearDirectory + ', Month=' + row.MonthDirectory + ')');
    });

    console.log('\n=== LINKAGE CHECK COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (targetConn) await targetConn.end();
    if (trackerConn) await trackerConn.end();
  }
}

checkMediaLinkage();
