// Script to check actual media records by their mapped IDs
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function checkMediaIds() {
  let targetConn, trackerConn;

  try {
    console.log('=== CHECKING MIGRATED MEDIA RECORDS ===\n');
    targetConn = await mysql.createConnection(config.mysqlTarget);
    trackerConn = await mysql.createConnection(config.mysqlTracker);

    // Get sample media IDs from tracker
    console.log('--- 1. SAMPLE MEDIA ID MAPPINGS ---');
    const [sampleMappings] = await trackerConn.query(`
      SELECT source_id, target_id, entity_type
      FROM id_mappings
      WHERE entity_type = 'Media_hebrew_projectImage'
      ORDER BY CAST(source_id AS UNSIGNED)
      LIMIT 10
    `);
    console.log('Sample mappings (source -> target):');
    sampleMappings.forEach(row => {
      console.log('  ProductID ' + row.source_id + ' -> MediaID ' + row.target_id);
    });

    // Get the actual media records for those IDs
    const targetIds = sampleMappings.map(m => m.target_id);
    console.log('\n--- 2. ACTUAL MEDIA RECORDS FOR THOSE IDS ---');
    const [mediaRecords] = await targetConn.query(`
      SELECT Id, RelativePath, YearDirectory, MonthDirectory, SourceType, MediaType
      FROM media
      WHERE Id IN (?)
      ORDER BY Id
    `, [targetIds]);

    if (mediaRecords.length === 0) {
      console.log('NONE OF THE MAPPED MEDIA IDS EXIST IN THE DATABASE!');
      console.log('The media was created but then deleted, or IDs were reset.');
    } else {
      mediaRecords.forEach(row => {
        console.log('MediaID ' + row.Id + ':');
        console.log('  Path: ' + row.RelativePath);
        console.log('  Year/Month: ' + row.YearDirectory + '/' + row.MonthDirectory);
        console.log('  SourceType: ' + row.SourceType + ', MediaType: ' + row.MediaType);
      });
    }

    // Check max media ID vs mapped IDs
    console.log('\n--- 3. MEDIA ID RANGE CHECK ---');
    const [maxId] = await targetConn.query('SELECT MAX(Id) as maxId, MIN(Id) as minId FROM media');
    console.log('Media table ID range:', maxId[0].minId, 'to', maxId[0].maxId);

    const [maxMapped] = await trackerConn.query(`
      SELECT MAX(CAST(target_id AS UNSIGNED)) as maxId, MIN(CAST(target_id AS UNSIGNED)) as minId
      FROM id_mappings
      WHERE entity_type LIKE 'Media_%'
    `);
    console.log('Mapped media ID range:', maxMapped[0].minId, 'to', maxMapped[0].maxId);

    // Check if any mapped IDs exist
    console.log('\n--- 4. CHECKING IF MAPPED IDS EXIST ---');
    const [mappedIds] = await trackerConn.query(`
      SELECT DISTINCT target_id
      FROM id_mappings
      WHERE entity_type LIKE 'Media_%'
      LIMIT 100
    `);
    const idsToCheck = mappedIds.map(m => m.target_id);

    const [existingMedia] = await targetConn.query(`
      SELECT Id FROM media WHERE Id IN (?)
    `, [idsToCheck]);

    console.log('Checked ' + idsToCheck.length + ' mapped IDs');
    console.log('Found in media table: ' + existingMedia.length);

    // Show which ones exist
    if (existingMedia.length > 0) {
      const existingIds = new Set(existingMedia.map(m => String(m.Id)));
      const missing = idsToCheck.filter(id => !existingIds.has(String(id)));
      console.log('Sample missing IDs:', missing.slice(0, 10).join(', '));
    }

    console.log('\n=== CHECK COMPLETE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (targetConn) await targetConn.end();
    if (trackerConn) await trackerConn.end();
  }
}

checkMediaIds();
