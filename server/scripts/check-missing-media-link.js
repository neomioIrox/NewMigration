// Check which projects should have media but don't
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let targetConn, trackerConn;

  try {
    console.log('=== CHECKING MISSING MEDIA LINKS ===\n');
    targetConn = await mysql.createConnection(config.mysqlTarget);
    trackerConn = await mysql.createConnection(config.mysqlTracker);

    // 1. Projects with media in tracker but MainMedia=1 (default) in DB
    console.log('--- 1. PROJECTS WITH MEDIA IN TRACKER BUT DEFAULT/NULL MAINMEDIA ---');

    // Get projects that have media mappings
    const [mediaProjects] = await trackerConn.query(`
      SELECT DISTINCT source_id
      FROM id_mappings
      WHERE entity_type = 'Media_hebrew_projectImage'
    `);
    console.log('Projects with media in tracker:', mediaProjects.length);

    // Check how many have proper MainMedia set
    // First, get the project ID mappings
    const [projectMappings] = await trackerConn.query(`
      SELECT source_id, target_id
      FROM id_mappings
      WHERE entity_type = 'Project'
    `);
    const projectIdMap = {};
    projectMappings.forEach(m => projectIdMap[m.source_id] = m.target_id);

    // Get media ID mappings
    const [mediaMappings] = await trackerConn.query(`
      SELECT source_id, target_id
      FROM id_mappings
      WHERE entity_type = 'Media_hebrew_projectImage'
    `);
    const mediaIdMap = {};
    mediaMappings.forEach(m => mediaIdMap[m.source_id] = m.target_id);

    // Sample check - for first 10 projects with media
    console.log('\n--- 2. SAMPLE: EXPECTED VS ACTUAL MAINMEDIA ---');
    const sampleSourceIds = mediaProjects.slice(0, 10).map(p => p.source_id);

    for (const sourceId of sampleSourceIds) {
      const projectId = projectIdMap[sourceId];
      const expectedMediaId = mediaIdMap[sourceId];

      if (!projectId) {
        console.log('Source ' + sourceId + ': No project mapping');
        continue;
      }

      const [pl] = await targetConn.query(`
        SELECT MainMedia FROM projectlocalization
        WHERE ProjectId = ? AND Language = 1
      `, [projectId]);

      const actualMediaId = pl[0]?.MainMedia;
      const match = actualMediaId == expectedMediaId ? 'MATCH' : 'MISMATCH';

      console.log('Source ' + sourceId + ' -> Project ' + projectId + ':');
      console.log('  Expected MediaId: ' + expectedMediaId + ', Actual: ' + actualMediaId + ' (' + match + ')');
    }

    // 3. Count mismatches
    console.log('\n--- 3. COUNTING MISMATCHES ---');
    let matches = 0;
    let mismatches = 0;
    let noProject = 0;
    let noLocalization = 0;

    for (const p of mediaProjects) {
      const sourceId = p.source_id;
      const projectId = projectIdMap[sourceId];
      const expectedMediaId = mediaIdMap[sourceId];

      if (!projectId) {
        noProject++;
        continue;
      }

      const [pl] = await targetConn.query(`
        SELECT MainMedia FROM projectlocalization
        WHERE ProjectId = ? AND Language = 1
      `, [projectId]);

      if (!pl.length) {
        noLocalization++;
        continue;
      }

      const actualMediaId = pl[0].MainMedia;
      if (actualMediaId == expectedMediaId) {
        matches++;
      } else {
        mismatches++;
      }
    }

    console.log('Matches: ' + matches);
    console.log('Mismatches: ' + mismatches);
    console.log('No project found: ' + noProject);
    console.log('No localization found: ' + noLocalization);

    console.log('\n=== CHECK COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (targetConn) await targetConn.end();
    if (trackerConn) await trackerConn.end();
  }
}

check();
