// Script to check media migration status
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function checkMediaStatus() {
  let targetConn, trackerConn;

  try {
    console.log('=== MEDIA MIGRATION DIAGNOSTIC ===\n');

    // Connect to databases
    targetConn = await mysql.createConnection(config.mysqlTarget);
    trackerConn = await mysql.createConnection(config.mysqlTracker);
    console.log('Connected to databases\n');

    // 1. Check Media table count
    console.log('--- 1. MEDIA TABLE STATUS ---');
    const [mediaCount] = await targetConn.query('SELECT COUNT(*) as cnt FROM media');
    console.log('Total Media records:', mediaCount[0].cnt);

    // 2. Check Media by MediaType
    const [mediaByType] = await targetConn.query(`
      SELECT MediaType, COUNT(*) as cnt
      FROM media
      GROUP BY MediaType
    `);
    console.log('\nMedia by Type:');
    mediaByType.forEach(row => {
      const typeName = row.MediaType === 1 ? 'Image' : row.MediaType === 2 ? 'Video' : 'Other';
      console.log('  ' + typeName + ' (' + row.MediaType + '): ' + row.cnt);
    });

    // 3. Check RelativePath patterns
    console.log('\n--- 2. RELATIVEPATH ANALYSIS ---');
    const [pathStats] = await targetConn.query(`
      SELECT
        SUM(CASE WHEN RelativePath IS NULL OR RelativePath = '' THEN 1 ELSE 0 END) as empty_paths,
        SUM(CASE WHEN RelativePath LIKE '2020/01/%' THEN 1 ELSE 0 END) as with_2020,
        SUM(CASE WHEN RelativePath LIKE '2025/%' THEN 1 ELSE 0 END) as with_2025,
        SUM(CASE WHEN RelativePath LIKE '%.jpg%' OR RelativePath LIKE '%.png%' OR RelativePath LIKE '%.gif%' THEN 1 ELSE 0 END) as has_image_ext,
        COUNT(*) as total
      FROM media
    `);
    console.log('Empty/NULL paths:', pathStats[0].empty_paths);
    console.log('Paths with 2020/01/:', pathStats[0].with_2020);
    console.log('Paths with 2025/:', pathStats[0].with_2025);
    console.log('Paths with image extensions:', pathStats[0].has_image_ext);

    // 4. Sample paths
    console.log('\n--- 3. SAMPLE MEDIA PATHS ---');
    const [samples] = await targetConn.query(`
      SELECT Id, RelativePath, MediaType, SourceType, YearDirectory, MonthDirectory
      FROM media
      WHERE RelativePath IS NOT NULL AND RelativePath != ''
      LIMIT 10
    `);
    samples.forEach(row => {
      console.log('ID ' + row.Id + ': ' + row.RelativePath);
      console.log('  MediaType=' + row.MediaType + ', SourceType=' + row.SourceType +
                  ', Dir=' + row.YearDirectory + '/' + row.MonthDirectory);
    });

    // 5. Check NULL paths
    const [nullSamples] = await targetConn.query(`
      SELECT Id, MediaType, SourceType
      FROM media
      WHERE RelativePath IS NULL OR RelativePath = ''
      LIMIT 5
    `);
    if (nullSamples.length > 0) {
      console.log('\n--- 4. MEDIA WITH EMPTY PATHS ---');
      nullSamples.forEach(row => {
        console.log('ID ' + row.Id + ': MediaType=' + row.MediaType + ', SourceType=' + row.SourceType);
      });
    }

    // 6. Check migration tracker
    console.log('\n--- 5. MIGRATION TRACKER STATUS ---');
    const [runs] = await trackerConn.query(`
      SELECT mapping_name, status, total_rows, processed_rows, inserted_count, error_count,
             created_at, updated_at
      FROM migration_runs
      WHERE mapping_name LIKE 'ProjectMapping_Funds%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    runs.forEach(row => {
      console.log('\nRun: ' + row.mapping_name);
      console.log('  Status: ' + row.status);
      console.log('  Total: ' + row.total_rows + ', Processed: ' + row.processed_rows +
                  ', Inserted: ' + row.inserted_count + ', Errors: ' + row.error_count);
    });

    // 7. Check media mappings in tracker
    console.log('\n--- 6. MEDIA ID MAPPINGS ---');
    const [mediaMappings] = await trackerConn.query(`
      SELECT entity_type, COUNT(*) as cnt
      FROM id_mappings
      WHERE entity_type LIKE 'Media_%'
      GROUP BY entity_type
    `);
    mediaMappings.forEach(row => {
      console.log('  ' + row.entity_type + ': ' + row.cnt);
    });

    // 8. Check projectlocalization MainMedia
    console.log('\n--- 7. PROJECTLOCALIZATION MAINMEDIA CHECK ---');
    const [plMedia] = await targetConn.query(`
      SELECT
        SUM(CASE WHEN MainMedia IS NULL THEN 1 ELSE 0 END) as null_media,
        SUM(CASE WHEN MainMedia = 1 THEN 1 ELSE 0 END) as default_media,
        SUM(CASE WHEN MainMedia > 1 THEN 1 ELSE 0 END) as custom_media,
        COUNT(*) as total
      FROM projectlocalization
    `);
    console.log('NULL MainMedia:', plMedia[0].null_media);
    console.log('Default (1) MainMedia:', plMedia[0].default_media);
    console.log('Custom MainMedia (>1):', plMedia[0].custom_media);
    console.log('Total projectlocalization:', plMedia[0].total);

    // 9. Check errors
    console.log('\n--- 8. RECENT ERRORS ---');
    const [errors] = await trackerConn.query(`
      SELECT source_id, error_type, error_message
      FROM migration_errors
      ORDER BY created_at DESC
      LIMIT 5
    `);
    if (errors.length === 0) {
      console.log('No recent errors found');
    } else {
      errors.forEach(row => {
        console.log('Source ' + row.source_id + ': ' + row.error_type + ' - ' + row.error_message.substring(0, 100));
      });
    }

    console.log('\n=== DIAGNOSTIC COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (targetConn) await targetConn.end();
    if (trackerConn) await trackerConn.end();
  }
}

checkMediaStatus();
