// READ-ONLY: quantifies the two real risk classes found by verify-id-preservation.js:
//  A. Forward id-space collision — both sides are live; source keeps allocating ids that
//     the target has already handed to app-created / prayer-born rows.
//  B. id_mappings 'Project' namespace poisoning — PrayerMapping wrote prayer ids into the
//     same entity_type as product ids; consumers that resolved FKs via that namespace
//     (old generic Recruiter run, FundCategory.FundId) may point at wrong projects.

const mysql = require('mysql2/promise');
const config = require('../src/config/database');
const mssqlDb = require('../src/db/mssql');

async function srcQuery(sql) { return (await mssqlDb.query(sql)).recordset; }

async function main() {
  const target = await mysql.createConnection(config.mysqlTarget);
  const tracker = await mysql.createConnection(config.mysqlTracker);

  // ---- A. forward collision runway per preserved pair ----
  console.log('=== A. id-space runway (source next id vs target occupied ids) ===');
  const pairs = [
    ['products.productsid -> Project.Id', 'SELECT MAX(productsid) mx FROM products WITH (NOLOCK)', 'Project'],
    ['ProductStock.ProductStockId -> Recruiter.Id', 'SELECT MAX(ProductStockId) mx FROM ProductStock WITH (NOLOCK)', 'Recruiter'],
    ['RecruitersGroups.ID -> RecruitersGroup.Id', 'SELECT MAX(ID) mx FROM RecruitersGroups WITH (NOLOCK)', 'RecruitersGroup'],
    ['UserSources.UserSourcesId -> Source.Id', 'SELECT MAX(UserSourcesId) mx FROM UserSources WITH (NOLOCK)', 'Source'],
    ['ParentSources.Id -> Affiliate.Id', 'SELECT MAX(Id) mx FROM ParentSources WITH (NOLOCK)', 'Affiliate'],
    ['Users.Id -> CustomerUser.Id', 'SELECT MAX(Id) mx FROM Users WITH (NOLOCK)', 'CustomerUser'],
    ['Orders.OrdersId -> Donation.Id', 'SELECT MAX(OrdersId) mx FROM Orders WITH (NOLOCK)', 'Donation']
  ];
  for (const [label, q, tbl] of pairs) {
    const [s] = await srcQuery(q);
    const [[t]] = await target.query('SELECT MAX(Id) mx FROM `' + tbl + '`');
    const srcNext = Number(s.mx) + 1;
    const status = srcNext <= Number(t.mx) ? '!! COLLISION ZONE — next source id already taken on target' : 'ok for now';
    console.log(`  ${label}: source max=${s.mx}, target max=${t.mx}  -> ${status} (gap: ${Number(t.mx) - Number(s.mx)})`);
  }

  // Overlap already materialized for Orders? Which source Orders ids are >= lowest app-created Donation id?
  console.log('\n--- Orders vs app-created Donations overlap detail ---');
  const [appDon] = await target.query(
    'SELECT MIN(Id) lo, MAX(Id) hi, COUNT(*) c FROM Donation WHERE Id > 1834815');
  console.log('  target Donation rows with Id > 1834815 (post-migration):', JSON.stringify(appDon[0]));
  const srcNew = await srcQuery('SELECT COUNT(*) c, MIN(OrdersId) lo, MAX(OrdersId) hi FROM Orders WITH (NOLOCK) WHERE OrdersId > 1834815');
  console.log('  source Orders rows with OrdersId > 1834815 (created after donation migration):', JSON.stringify(srcNew[0]));

  // ---- B1. full list of Recruiter.ProjectId mismatches ----
  console.log('\n=== B1. all Recruiter.ProjectId mismatches (old run resolved via poisoned namespace) ===');
  const ps = await srcQuery('SELECT ProductStockId, ProductId FROM ProductStock WITH (NOLOCK)');
  const psMap = new Map(ps.map(r => [Number(r.ProductStockId), r]));
  const [recs] = await target.query('SELECT Id, Name, ProjectId FROM Recruiter');
  const bad = [];
  for (const r of recs) {
    const s = psMap.get(Number(r.Id));
    if (!s) continue;
    if (s.ProductId != null && Number(r.ProjectId) !== Number(s.ProductId)) bad.push({ recruiterId: r.Id, name: r.Name, targetProjectId: r.ProjectId, sourceProductId: s.ProductId });
  }
  console.log(`  total mismatched recruiters: ${bad.length}`);
  for (const b of bad) console.log('   ', JSON.stringify(b));

  // Do these recruiters have donations attached on target? (impact assessment)
  if (bad.length) {
    const ids = bad.map(b => b.recruiterId);
    const [dcnt] = await target.query(
      'SELECT RecruiterId, COUNT(*) c FROM Donation WHERE RecruiterId IN (?) GROUP BY RecruiterId', [ids]).catch(() => [[]]);
    console.log('  donations referencing these recruiters:', dcnt.length ? JSON.stringify(dcnt) : 'none');
  }

  // ---- B2. FundCategory.FundId sanity (resolved via same 'Project' namespace) ----
  console.log('\n=== B2. FundCategory.FundId vs source productsid ===');
  const [fc] = await tracker.query("SELECT source_id, target_id FROM id_mappings WHERE entity_type='FundCategory'");
  console.log(`  id_mappings FundCategory rows: ${fc.length}`);
  if (fc.length) {
    const [fcRows] = await target.query('SELECT Id, FundId, CategoryId FROM FundCategory');
    const fcMap = new Map(fcRows.map(r => [Number(r.Id), r]));
    let ok = 0, wrong = [], missing = 0;
    for (const m of fc) {
      const row = fcMap.get(Number(m.target_id));
      if (!row) { missing++; continue; }
      if (Number(row.FundId) === Number(m.source_id)) ok++;
      else wrong.push({ fundCategoryId: m.target_id, sourceProductId: m.source_id, actualFundId: row.FundId });
    }
    console.log(`  FundId==productsid: ${ok} ok, ${wrong.length} WRONG, ${missing} rows missing on target`);
    for (const w of wrong.slice(0, 20)) console.log('   ', JSON.stringify(w));
  } else {
    const [[c]] = await target.query('SELECT COUNT(*) c FROM FundCategory');
    console.log(`  (no bridge rows; target FundCategory count=${c.c})`);
  }

  // ---- B3. how many prayer-ids shadow product-ids in the 'Project' namespace? ----
  console.log('\n=== B3. Project namespace ambiguity (prayer ids vs product ids) ===');
  const [dupes] = await tracker.query(
    "SELECT source_id, COUNT(*) c, GROUP_CONCAT(target_id) targets FROM id_mappings WHERE entity_type='Project' GROUP BY source_id HAVING COUNT(*) > 1");
  console.log(`  source_ids with MULTIPLE target mappings in entity 'Project': ${dupes.length}`);
  for (const d of dupes.slice(0, 15)) console.log('   ', JSON.stringify(d));

  await target.end(); await tracker.end(); await mssqlDb.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(2); });
