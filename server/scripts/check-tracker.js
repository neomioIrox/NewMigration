// Script to check migration tracker status
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function checkTracker() {
  let conn;

  try {
    console.log('=== MIGRATION TRACKER ANALYSIS ===\n');
    conn = await mysql.createConnection(config.mysqlTracker);

    // Check tables exist
    console.log('--- 1. TRACKER TABLES ---');
    const [tables] = await conn.query("SHOW TABLES");
    console.log('Tables:', tables.map(t => Object.values(t)[0]).join(', '));

    // Check migration_runs
    console.log('\n--- 2. MIGRATION RUNS ---');
    const [runs] = await conn.query(`
      SELECT * FROM migration_runs
      ORDER BY created_at DESC
      LIMIT 10
    `);
    if (runs.length === 0) {
      console.log('No migration runs found!');
    } else {
      runs.forEach(row => {
        console.log('\nRun ID: ' + row.id + ' - ' + row.mapping_name);
        console.log('  Status: ' + row.status);
        console.log('  Created: ' + row.created_at);
        console.log('  Counters: ' + JSON.stringify({
          processed: row.processed_rows,
          inserted: row.inserted_count,
          skipped: row.skipped_count,
          errors: row.error_count
        }));
      });
    }

    // Check id_mappings for media
    console.log('\n--- 3. ID MAPPINGS BY ENTITY TYPE ---');
    const [mappings] = await conn.query(`
      SELECT entity_type, COUNT(*) as cnt
      FROM id_mappings
      GROUP BY entity_type
      ORDER BY cnt DESC
    `);
    mappings.forEach(row => {
      console.log('  ' + row.entity_type + ': ' + row.cnt);
    });

    // Specifically check for Media_ mappings
    console.log('\n--- 4. MEDIA-RELATED MAPPINGS ---');
    const [mediaMappings] = await conn.query(`
      SELECT entity_type, COUNT(*) as cnt
      FROM id_mappings
      WHERE entity_type LIKE 'Media%'
      GROUP BY entity_type
    `);
    if (mediaMappings.length === 0) {
      console.log('NO MEDIA MAPPINGS RECORDED! Migration did not create media.');
    } else {
      mediaMappings.forEach(row => {
        console.log('  ' + row.entity_type + ': ' + row.cnt);
      });
    }

    // Check recent errors
    console.log('\n--- 5. RECENT MIGRATION ERRORS ---');
    const [errors] = await conn.query(`
      SELECT source_id, error_type, error_message, created_at
      FROM migration_errors
      ORDER BY created_at DESC
      LIMIT 10
    `);
    if (errors.length === 0) {
      console.log('No errors recorded');
    } else {
      errors.forEach(row => {
        console.log('Source ' + row.source_id + ' (' + row.error_type + '): ' +
                    (row.error_message || '').substring(0, 80));
      });
    }

    // Check row_status
    console.log('\n--- 6. ROW STATUS SUMMARY ---');
    const [rowStatus] = await conn.query(`
      SELECT status, COUNT(*) as cnt
      FROM row_status
      GROUP BY status
    `);
    rowStatus.forEach(row => {
      console.log('  ' + row.status + ': ' + row.cnt);
    });

    console.log('\n=== TRACKER ANALYSIS COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

checkTracker();
