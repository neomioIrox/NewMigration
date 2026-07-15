// READ-ONLY follow-up to verify-id-preservation.js findings.
// Classifies each FAIL: app-created-on-target vs deleted-in-source vs real migration defect.

const mysql = require('mysql2/promise');
const config = require('../src/config/database');
const mssqlDb = require('../src/db/mssql');

async function srcQuery(sql) { return (await mssqlDb.query(sql)).recordset; }

async function main() {
  const target = await mysql.createConnection(config.mysqlTarget);
  const tracker = await mysql.createConnection(config.mysqlTracker);

  // 1. Are the suspect target rows in id_mappings (migrated) or not (app-created)?
  console.log('=== 1. suspect target ids: migrated (in id_mappings) or app-created? ===');
  const suspects = [
    ['Affiliate', [128, 129]],
    ['Source', [12953, 12954]],
    ['RecruitersGroupMapping', [447, 448, 449, 450, 451]],
    ['RecruiterMapping', [12388, 12389, 12390, 12391, 12392, 12393, 12394, 12395, 12397, 12398, 12399, 12400, 12405]],
    ['CustomerUser', [4316, 4317, 4318, 4319]],
    ['Donation', [1834838, 1834839, 1834840, 1834841, 1834842, 1834882, 1834884, 1834886, 1834889, 1834892]]
  ];
  for (const [etype, ids] of suspects) {
    const [rows] = await tracker.query(
      'SELECT target_id FROM id_mappings WHERE entity_type=? AND target_id IN (?)', [etype, ids]);
    console.log(`  ${etype}: ${rows.length}/${ids.length} of suspect ids ARE in id_mappings` +
      (rows.length ? ' -> ' + rows.map(r => r.target_id).join(',') : ' -> none migrated => app-created on target'));
  }

  // 2. CreatedAt/CreatedBy of suspect rows on target (engine writes CreatedBy=-1)
  console.log('\n=== 2. target row provenance (CreatedAt/CreatedBy) ===');
  const provQueries = [
    ['Affiliate', 'SELECT Id,Name,CreatedAt,CreatedBy FROM Affiliate WHERE Id IN (128,129)'],
    ['Source', 'SELECT Id,SourceCode,CreatedAt,CreatedBy FROM Source WHERE Id IN (12953,12954,4565)'],
    ['RecruitersGroup', 'SELECT Id,Name,ProjectId,CreatedAt,CreatedBy FROM RecruitersGroup WHERE Id BETWEEN 447 AND 451'],
    ['Recruiter', 'SELECT Id,Name,ProjectId,RecruiterGroupId,CreatedAt,CreatedBy FROM Recruiter WHERE Id IN (12388,12389,12397,12398,12405,12386,4,7,8,9,12)'],
    ['CustomerUser', 'SELECT Id,UserName,CreatedAt,CreatedBy FROM CustomerUser WHERE Id IN (4316,4317,4318,4319)'],
    ['Donation', 'SELECT Id,UserId,CreatedAt,CreatedBy FROM Donation WHERE Id IN (1834838,1834894,1834882)']
  ];
  for (const [name, q] of provQueries) {
    const [rows] = await target.query(q);
    console.log(`  -- ${name}`);
    for (const r of rows) console.log('     ', JSON.stringify(r));
  }

  // 3. The Project 2432/2433 collision: who owns those ids on each side?
  console.log('\n=== 3. Project id collision 2432/2433 ===');
  const srcProds = await srcQuery(
    "SELECT productsid, Name, Terminal, DateCreated FROM products WITH (NOLOCK) WHERE productsid IN (2432,2433)");
  for (const r of srcProds) console.log('  source products:', JSON.stringify(r));
  const [tgtProj] = await target.query('SELECT Id,Name,ProjectType,CreatedAt,CreatedBy FROM Project WHERE Id IN (2432,2433,2459)');
  for (const r of tgtProj) console.log('  target Project:', JSON.stringify(r));
  const [projMap] = await tracker.query(
    "SELECT entity_type,source_id,target_id,run_id FROM id_mappings WHERE target_id IN (2432,2433,2459) AND entity_type IN ('Project')");
  for (const r of projMap) console.log('  id_mappings Project -> target 2432/2433/2459:', JSON.stringify(r));
  // what is the max productsid in source vs max preserved project id at migration time?
  const [mx] = await srcQuery('SELECT MAX(productsid) mx FROM products WITH (NOLOCK)') ;
  console.log('  current source max(productsid):', mx.mx);

  // 4. Recruiter ProjectId mismatches: current source state of those ProductStock rows
  console.log('\n=== 4. Recruiter ProjectId mismatch source rows (current state) ===');
  const psRows = await srcQuery(
    'SELECT ProductStockId, ProductId, GroupId, Name, Hide FROM ProductStock WITH (NOLOCK) WHERE ProductStockId IN (4,7,8,9,12,12386)');
  for (const r of psRows) console.log('  source ProductStock:', JSON.stringify(r));
  const [recMap] = await tracker.query(
    "SELECT m.source_id, m.target_id, m.run_id, r.started_at FROM id_mappings m LEFT JOIN migration_runs r ON r.id=m.run_id WHERE m.entity_type='RecruiterMapping' AND m.source_id IN ('4','7','8','9','12','12386')");
  for (const r of recMap) console.log('  id_mappings RecruiterMapping:', JSON.stringify(r));

  // 5. When did the Recruiter/RecruitersGroup/Project runs happen (timeline vs drift)?
  console.log('\n=== 5. migration run timeline (latest per mapping) ===');
  const [runs] = await tracker.query(
    "SELECT id, mapping_name, status, started_at, completed_at, inserted_rows FROM migration_runs WHERE mapping_name LIKE '%Recruiter%' OR mapping_name LIKE '%Project%' OR mapping_name LIKE '%Donation%' OR mapping_name LIKE '%CustomerUser%' OR mapping_name LIKE '%Prayer%' ORDER BY id DESC LIMIT 25");
  for (const r of runs) console.log(' ', JSON.stringify(r));

  // 6. CustomerUser gaps 545, 2798: errors? source state?
  console.log('\n=== 6. CustomerUser missing source rows 545, 2798 ===');
  const users = await srcQuery('SELECT Id, UserName, Email FROM Users WITH (NOLOCK) WHERE Id IN (545,2798)');
  for (const r of users) console.log('  source Users:', JSON.stringify(r, (k, v) => typeof v === 'string' ? v.substring(0, 40) : v));
  const [errs] = await tracker.query(
    "SELECT run_id, source_id, error_type, error_message FROM migration_errors WHERE source_id IN ('545','2798') LIMIT 10");
  for (const r of errs) console.log('  migration_errors:', JSON.stringify(r));
  const [rs] = await tracker.query(
    "SELECT run_id, source_id, status FROM row_status WHERE source_id IN ('545','2798') LIMIT 10");
  for (const r of rs) console.log('  row_status:', JSON.stringify(r));

  // 7. Source drift on SourceCode 4565: current source Name vs target
  console.log('\n=== 7. Source 4565 SourceCode drift ===');
  const us = await srcQuery('SELECT UserSourcesId, Name, Title, ParentSourcesId FROM UserSources WITH (NOLOCK) WHERE UserSourcesId=4565');
  for (const r of us) console.log('  source UserSources:', JSON.stringify(r));
  const [s4565] = await target.query('SELECT Id, SourceCode, Description, AffiliateId, CreatedAt, UpdatedAt, UpdatedBy FROM Source WHERE Id=4565');
  for (const r of s4565) console.log('  target Source:', JSON.stringify(r));

  // 8. Do future source products already collide with target-born project ids?
  console.log('\n=== 8. forward collision check: source products vs target-born Project ids ===');
  const [nonProd] = await target.query(
    'SELECT p.Id FROM Project p WHERE p.Id > 1 ORDER BY p.Id');
  const allSrc = await srcQuery('SELECT productsid FROM products WITH (NOLOCK)');
  const srcSet = new Set(allSrc.map(r => Number(r.productsid)));
  const [projIdent] = await tracker.query(
    "SELECT target_id FROM id_mappings WHERE entity_type='Project' AND CAST(source_id AS UNSIGNED)=target_id");
  const identSet = new Set(projIdent.map(r => Number(r.target_id)));
  const collisions = nonProd.filter(r => srcSet.has(Number(r.Id)) && !identSet.has(Number(r.Id)));
  console.log(`  target Project rows whose Id exists in source products but were NOT migrated from that product: ${collisions.length}`);
  console.log('  ids:', collisions.map(r => r.Id).join(', ') || '(none)');

  await target.end(); await tracker.end(); await mssqlDb.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(2); });
