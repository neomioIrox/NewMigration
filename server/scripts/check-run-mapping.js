// Check which migration run created each entity
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function check() {
  let conn;
  try {
    conn = await mysql.createConnection(config.mysqlTracker);

    console.log('=== CHECKING MIGRATION RUN HISTORY ===\n');

    // Check runs for source ProductID 1
    console.log('--- Mappings for Source ProductID 1 ---');
    const [maps1] = await conn.query(`
      SELECT entity_type, target_id, run_id
      FROM id_mappings
      WHERE source_id = '1'
      ORDER BY entity_type
    `);
    maps1.forEach(r => console.log('  ' + r.entity_type + ' -> ' + r.target_id + ' (run ' + r.run_id + ')'));

    // Check runs for source ProductID 2
    console.log('\n--- Mappings for Source ProductID 2 ---');
    const [maps2] = await conn.query(`
      SELECT entity_type, target_id, run_id
      FROM id_mappings
      WHERE source_id = '2'
      ORDER BY entity_type
    `);
    maps2.forEach(r => console.log('  ' + r.entity_type + ' -> ' + r.target_id + ' (run ' + r.run_id + ')'));

    // Check run 28 (the Funds migration we saw)
    console.log('\n--- Run 28 Details ---');
    const [run28] = await conn.query(`
      SELECT * FROM migration_runs WHERE id = 28
    `);
    if (run28.length) {
      const r = run28[0];
      console.log('Mapping:', r.mapping_name);
      console.log('Status:', r.status);
      console.log('Processed:', r.processed_rows);
    }

    // Check how many entities were created in each run
    console.log('\n--- Entities Created Per Run ---');
    const [perRun] = await conn.query(`
      SELECT run_id, entity_type, COUNT(*) as cnt
      FROM id_mappings
      WHERE entity_type IN ('Project', 'Media_hebrew_projectImage')
      GROUP BY run_id, entity_type
      ORDER BY run_id DESC, entity_type
      LIMIT 20
    `);
    perRun.forEach(r => console.log('  Run ' + r.run_id + ': ' + r.entity_type + ' = ' + r.cnt));

    // The key question: are Project and Media from SAME run?
    console.log('\n--- Checking if Project and Media from Same Run ---');
    const [mismatched] = await conn.query(`
      SELECT p.source_id, p.run_id as proj_run, m.run_id as media_run,
             p.target_id as project_id, m.target_id as media_id
      FROM id_mappings p
      JOIN id_mappings m ON p.source_id = m.source_id
      WHERE p.entity_type = 'Project'
        AND m.entity_type = 'Media_hebrew_projectImage'
        AND p.run_id != m.run_id
      LIMIT 10
    `);
    if (mismatched.length === 0) {
      console.log('All Projects and Media are from the SAME run.');
    } else {
      console.log('MISMATCHED RUNS FOUND:');
      mismatched.forEach(r => {
        console.log('  Source ' + r.source_id + ': Project (run ' + r.proj_run + '), Media (run ' + r.media_run + ')');
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}
check();
