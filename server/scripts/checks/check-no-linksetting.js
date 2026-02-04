const mysql = require('mysql2/promise');
const config = require('../../src/config/database').mysqlTarget;

(async () => {
  const conn = await mysql.createConnection(config);

  console.log('=== Check ID Mappings for Projects without LinkSetting ===');

  // Check if these projects have mappings (were migrated by us)
  const [mappingsCheck] = await conn.execute(`
    SELECT
      p.Id as ProjectId,
      p.ProjectType,
      im.source_id,
      im.entity_type
    FROM kupathairnew.project p
    LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
    LEFT JOIN migration_tracker.id_mappings im ON p.Id = im.target_id AND im.entity_type LIKE 'Project%'
    WHERE ls.Id IS NULL
    ORDER BY p.Id
    LIMIT 20
  `);
  mappingsCheck.forEach(r =>
    console.log('  Project', r.ProjectId, 'Type:', r.ProjectType, '| Source:', r.source_id, 'Entity:', r.entity_type)
  );

  console.log('\n=== Count by Mapping Status ===');
  const [[counts]] = await conn.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN im.id IS NOT NULL THEN 1 ELSE 0 END) as hasMappings,
      SUM(CASE WHEN im.id IS NULL THEN 1 ELSE 0 END) as noMappings
    FROM kupathairnew.project p
    LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
    LEFT JOIN migration_tracker.id_mappings im ON p.Id = im.target_id AND im.entity_type LIKE 'Project%'
    WHERE ls.Id IS NULL
  `);
  console.log('Total without LS:', counts.total);
  console.log('Has migration mapping:', counts.hasMappings);
  console.log('No mapping (pre-existing):', counts.noMappings);

  // Check which entity types have no LinkSetting
  console.log('\n=== Projects without LS by Entity Type ===');
  const [byEntity] = await conn.execute(`
    SELECT
      COALESCE(im.entity_type, 'NO_MAPPING') as entity_type,
      COUNT(*) as cnt
    FROM kupathairnew.project p
    LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
    LEFT JOIN migration_tracker.id_mappings im ON p.Id = im.target_id AND im.entity_type LIKE 'Project%'
    WHERE ls.Id IS NULL
    GROUP BY COALESCE(im.entity_type, 'NO_MAPPING')
    ORDER BY cnt DESC
  `);
  byEntity.forEach(r => console.log(' ', r.entity_type, ':', r.cnt));

  await conn.end();
})();
