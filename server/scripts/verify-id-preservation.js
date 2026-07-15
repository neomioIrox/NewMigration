// READ-ONLY verification: preserved-ID integrity between MSSQL source and MySQL target.
//
// For every preserveSourceId entity, verifies on the FULL data set (no sampling):
//   1. Membership   — every target row's Id exists in the source table (same Id).
//   2. Content      — a stable per-row field matches the mapping's transform (proves the
//                     row is the SAME source row, not just a number that happens to exist).
//   3. FK identity  — cross-entity FKs that must equal the raw source value because both
//                     sides preserve Ids (Source.AffiliateId==ParentSourcesId,
//                     Recruiter.ProjectId==ProductId, RecruitersGroup.ProjectId==Resolved,
//                     Donation.UserId==Orders.UserId).
//   4. Coverage     — source rows missing from target (informational; scope filters apply).
//   5. AUTO_INCREMENT realignment — next id must be past MAX(Id).
//   6. id_mappings  — tracker bridge rows must have source_id==target_id for preserved
//                     entities (Project reports the split: subs/type2/prayers differ by design).
//
// Entities: Affiliate, Source, Project, RecruitersGroup, Recruiter, CustomerUser, Donation.

const mysql = require('mysql2/promise');
const config = require('../src/config/database');
const mssqlDb = require('../src/db/mssql');

const results = [];
function report(entity, check, status, detail) {
  results.push({ entity, check, status, detail });
  const icon = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`  [${icon}] ${check}${detail ? ' — ' + detail : ''}`);
}

function sample(arr, n = 10) { return arr.slice(0, n).join(', '); }

async function srcQuery(sql) {
  const r = await mssqlDb.query(sql);
  return r.recordset;
}

// Batched membership fetch against MSSQL for large tables (Orders).
async function fetchSourceByIds(table, idCol, cols, ids, batchSize = 5000) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const rows = await srcQuery(
      `SELECT ${cols.join(',')} FROM ${table} WITH (NOLOCK) WHERE ${idCol} IN (${batch.join(',')})`
    );
    for (const r of rows) out.set(Number(r[idCol]), r);
    if ((i / batchSize) % 40 === 0 && i > 0) console.log(`    ...fetched ${i}/${ids.length} from ${table}`);
  }
  return out;
}

function mapBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(Number(r[key]), r);
  return m;
}

// Compare with whitespace-noise separation: exact / trailing-space-only diff / real diff.
function classifyDiffs(pairs) {
  const real = [], ws = [];
  for (const p of pairs) {
    const a = p.expected == null ? null : String(p.expected);
    const b = p.actual == null ? null : String(p.actual);
    if (a === b) continue;
    if (a != null && b != null && a.trim() === b.trim()) ws.push(p);
    else real.push(p);
  }
  return { real, ws };
}

async function checkAutoIncrement(target, table, dbName) {
  await target.query('SET SESSION information_schema_stats_expiry=0').catch(() => {});
  const [[ai]] = await target.query(
    'SELECT AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
    [dbName, table]
  );
  const [[mx]] = await target.query('SELECT MAX(Id) mx FROM `' + table + '`');
  if (mx.mx == null) { report(table, 'AUTO_INCREMENT', 'WARN', 'table empty'); return; }
  if (ai && ai.ai != null && Number(ai.ai) > Number(mx.mx)) {
    report(table, 'AUTO_INCREMENT', 'PASS', `next=${ai.ai} > max(Id)=${mx.mx}`);
  } else {
    report(table, 'AUTO_INCREMENT', 'FAIL', `next=${ai && ai.ai} but max(Id)=${mx.mx} — future app inserts would collide`);
  }
}

// Generic preserved-entity check.
// fields: [{name, expected(srcRow), actual(tgtRow), allow(exp, act, srcRow, tgtRow) -> bool | undefined}]
function verifyEntity(entity, targetRows, sourceMap, fields) {
  const missing = [];
  const fieldDiffs = fields.map(() => []);
  for (const t of targetRows) {
    const s = sourceMap.get(Number(t.Id));
    if (!s) { missing.push(t.Id); continue; }
    fields.forEach((f, i) => {
      const exp = f.expected(s);
      const act = f.actual(t);
      if (f.allow && f.allow(exp, act, s, t)) return;
      fieldDiffs[i].push({ id: t.Id, expected: exp, actual: act });
    });
  }
  if (missing.length === 0) {
    report(entity, `Id membership (${targetRows.length} target rows)`, 'PASS', 'every target Id exists in source');
  } else {
    report(entity, 'Id membership', 'FAIL', `${missing.length} target Ids NOT in source: ${sample(missing)}`);
  }
  fields.forEach((f, i) => {
    const { real, ws } = classifyDiffs(fieldDiffs[i]);
    if (real.length === 0) {
      report(entity, `${f.name} match`, 'PASS', ws.length ? `${ws.length} whitespace-only diffs (ignored)` : '');
    } else {
      const ex = real.slice(0, 5).map(d => `Id=${d.id} expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)}`).join(' | ');
      report(entity, `${f.name} match`, 'FAIL', `${real.length} mismatches. ${ex}`);
    }
  });
  return { missing };
}

function coverage(entity, sourceIds, targetIdSet, note) {
  const absent = [];
  for (const id of sourceIds) if (!targetIdSet.has(Number(id))) absent.push(id);
  if (absent.length === 0) report(entity, 'Coverage (source→target)', 'PASS', `all ${sourceIds.length} source rows present`);
  else report(entity, 'Coverage (source→target)', 'WARN', `${absent.length}/${sourceIds.length} source rows not in target${note ? ' (' + note + ')' : ''}: ${sample(absent)}`);
}

async function main() {
  const t0 = Date.now();
  const target = await mysql.createConnection(config.mysqlTarget);
  const tracker = await mysql.createConnection(config.mysqlTracker);
  const dbName = config.mysqlTarget.database;

  // ---------- Affiliate <- ParentSources ----------
  console.log('\n=== Affiliate (ParentSources) ===');
  {
    const src = await srcQuery('SELECT Id, Name FROM ParentSources WITH (NOLOCK)');
    const [tgt] = await target.query('SELECT Id, Name FROM Affiliate');
    const m = mapBy(src, 'Id');
    verifyEntity('Affiliate', tgt, m, [
      { name: 'Name', expected: s => (s.Name ? String(s.Name).substring(0, 100) : 'ללא שם'), actual: t => t.Name }
    ]);
    coverage('Affiliate', src.map(r => r.Id), new Set(tgt.map(r => Number(r.Id))));
    await checkAutoIncrement(target, 'Affiliate', dbName);
  }

  // ---------- Source <- UserSources ----------
  console.log('\n=== Source (UserSources) ===');
  {
    const src = await srcQuery(
      'SELECT us.UserSourcesId, us.Name, us.ParentSourcesId FROM UserSources us WITH (NOLOCK) ' +
      'WHERE us.ParentSourcesId IS NOT NULL AND EXISTS (SELECT 1 FROM ParentSources ps WHERE ps.Id = us.ParentSourcesId)'
    );
    const [tgt] = await target.query('SELECT Id, SourceCode, AffiliateId FROM Source');
    const m = mapBy(src, 'UserSourcesId');
    verifyEntity('Source', tgt, m, [
      { name: 'SourceCode', expected: s => (s.Name ? String(s.Name).substring(0, 50) : 'unknown'), actual: t => t.SourceCode },
      { name: 'AffiliateId==ParentSourcesId', expected: s => Number(s.ParentSourcesId), actual: t => (t.AffiliateId == null ? null : Number(t.AffiliateId)) }
    ]);
    coverage('Source', src.map(r => r.UserSourcesId), new Set(tgt.map(r => Number(r.Id))));
    await checkAutoIncrement(target, 'Source', dbName);
  }

  // ---------- Project <- products ----------
  console.log('\n=== Project (products) ===');
  {
    const src = await srcQuery('SELECT productsid, Name FROM products WITH (NOLOCK)');
    const [tgt] = await target.query('SELECT Id, Name FROM Project');
    const m = mapBy(src, 'productsid');
    // Split: rows claiming a products id vs. rows born on target (seed Id=1, prayer-projects,
    // type2 collections get auto ids ABOVE max(productsid) after AUTO_INCREMENT realignment).
    const fromProducts = tgt.filter(r => m.has(Number(r.Id)) && Number(r.Id) !== 1);
    const nonProducts = tgt.filter(r => !m.has(Number(r.Id)) && Number(r.Id) !== 1);
    const seed = tgt.find(r => Number(r.Id) === 1);
    if (seed) console.log(`  [info] Project Id=1 (seed): Name=${JSON.stringify(seed.Name)} — excluded from products comparison`);
    verifyEntity('Project', fromProducts, m, [
      { name: 'Name', expected: s => (s.Name ? String(s.Name).substring(0, 150) : null), actual: t => t.Name }
    ]);
    const maxProductsId = Math.max(...src.map(r => Number(r.productsid)));
    const suspicious = nonProducts.filter(r => Number(r.Id) <= maxProductsId);
    if (suspicious.length === 0) {
      report('Project', 'Non-product rows above max(productsid)', 'PASS',
        `${nonProducts.length} target-born rows (prayers/type2), all with Id > ${maxProductsId}`);
    } else {
      report('Project', 'Non-product rows above max(productsid)', 'FAIL',
        `${suspicious.length} rows have Id <= max(productsid)=${maxProductsId} but no matching product: ${sample(suspicious.map(r => r.Id))}`);
    }
    await checkAutoIncrement(target, 'Project', dbName);
  }

  // ---------- RecruitersGroup <- RecruitersGroups ----------
  console.log('\n=== RecruitersGroup (RecruitersGroups) ===');
  {
    const src = await srcQuery(
      'SELECT rg.ID, rg.Name, COALESCE(rg.ProjectId, pstop.ProductId) AS ResolvedProjectId ' +
      'FROM RecruitersGroups rg WITH (NOLOCK) ' +
      'OUTER APPLY (SELECT TOP 1 ps.ProductId FROM ProductStock ps WITH (NOLOCK) ' +
      'WHERE ps.GroupId = rg.ID AND ps.ProductId IS NOT NULL) pstop'
    );
    const [tgt] = await target.query('SELECT Id, Name, ProjectId FROM RecruitersGroup');
    const m = mapBy(src, 'ID');
    verifyEntity('RecruitersGroup', tgt, m, [
      { name: 'Name', expected: s => (s.Name ? String(s.Name).substring(0, 200) : 'ללא שם'), actual: t => t.Name },
      { name: 'ProjectId==ResolvedProjectId', expected: s => (s.ResolvedProjectId == null ? null : Number(s.ResolvedProjectId)), actual: t => (t.ProjectId == null ? null : Number(t.ProjectId)) }
    ]);
    coverage('RecruitersGroup', src.map(r => r.ID), new Set(tgt.map(r => Number(r.Id))), 'scope: only groups whose project migrated');
    await checkAutoIncrement(target, 'RecruitersGroup', dbName);
  }

  // ---------- Recruiter <- ProductStock ----------
  console.log('\n=== Recruiter (ProductStock) ===');
  {
    // Recompute _DisplayName exactly like the engine's source query (ROW_NUMBER dedup).
    const src = await srcQuery(
      "SELECT t.ProductStockId, t.ProductId, t.GroupId, " +
      "CASE WHEN t._rn = 1 THEN t._norm ELSE LEFT(t._norm,190) + N' (' + CAST(t._rn AS nvarchar(10)) + N')' END AS _DisplayName " +
      "FROM (SELECT ps.*, LEFT(ISNULL(NULLIF(ps.Name,''),N'ללא שם'),200) AS _norm, " +
      "ROW_NUMBER() OVER (PARTITION BY ps.ProductId, LEFT(ISNULL(NULLIF(ps.Name,''),N'ללא שם'),200) ORDER BY ps.ProductStockId) AS _rn " +
      "FROM ProductStock ps WITH (NOLOCK)) t"
    );
    const [tgt] = await target.query('SELECT Id, Name, ProjectId, RecruiterGroupId FROM Recruiter');
    const [tgtGroups] = await target.query('SELECT Id FROM RecruitersGroup');
    const groupSet = new Set(tgtGroups.map(r => Number(r.Id)));
    const m = mapBy(src, 'ProductStockId');
    verifyEntity('Recruiter', tgt, m, [
      { name: 'Name (deduped _DisplayName)', expected: s => (s._DisplayName ? String(s._DisplayName).substring(0, 200) : 'ללא שם'), actual: t => t.Name },
      { name: 'ProjectId==ProductId', expected: s => (s.ProductId == null ? null : Number(s.ProductId)), actual: t => (t.ProjectId == null ? null : Number(t.ProjectId)) },
      {
        name: 'RecruiterGroupId==GroupId (when group migrated)',
        expected: s => (s.GroupId == null ? null : Number(s.GroupId)),
        actual: t => (t.RecruiterGroupId == null ? null : Number(t.RecruiterGroupId)),
        // NULL on target is legitimate when the source group never migrated (out of scope).
        allow: (exp, act) => act === null && exp !== null && !groupSet.has(exp)
      }
    ]);
    await checkAutoIncrement(target, 'Recruiter', dbName);
  }

  // ---------- CustomerUser <- Users ----------
  console.log('\n=== CustomerUser (Users) ===');
  {
    const src = await srcQuery('SELECT Id, UserName FROM Users WITH (NOLOCK)');
    const [tgt] = await target.query('SELECT Id, UserName FROM CustomerUser');
    const m = mapBy(src, 'Id');
    verifyEntity('CustomerUser', tgt, m, [
      {
        name: 'UserName (dedup suffix allowed)',
        expected: s => (s.UserName ? String(s.UserName).substring(0, 35) : 'user' + s.Id),
        actual: t => t.UserName,
        // dedupColumns: UNIQUE collision resolved as <truncated-base>_<sourceId>
        allow: (exp, act, s, t) => typeof act === 'string' && act.endsWith('_' + t.Id) && exp.startsWith(act.slice(0, act.lastIndexOf('_')))
      }
    ]);
    coverage('CustomerUser', src.map(r => r.Id), new Set(tgt.map(r => Number(r.Id))), 'no scope filter — should be full');
    await checkAutoIncrement(target, 'CustomerUser', dbName);
  }

  // ---------- Donation <- Orders ----------
  console.log('\n=== Donation (Orders) — batched, full set ===');
  {
    const [tgt] = await target.query('SELECT Id, UserId FROM Donation');
    console.log(`  target Donation rows: ${tgt.length}`);
    const [tgtUsers] = await target.query('SELECT Id FROM CustomerUser');
    const userSet = new Set(tgtUsers.map(r => Number(r.Id)));
    const ids = tgt.map(r => Number(r.Id));
    const srcMap = await fetchSourceByIds('Orders', 'OrdersId', ['OrdersId', 'UserId'], ids);
    const missing = [];
    const userMismatch = [];
    let nullButUnmapped = 0;
    for (const t of tgt) {
      const s = srcMap.get(Number(t.Id));
      if (!s) { missing.push(t.Id); continue; }
      const srcUser = s.UserId == null || Number(s.UserId) === 0 ? null : Number(s.UserId);
      const tgtUser = t.UserId == null ? null : Number(t.UserId);
      if (tgtUser === null) {
        // legitimate iff the source user never made it into CustomerUser
        if (srcUser !== null && userSet.has(srcUser)) userMismatch.push({ id: t.Id, expected: srcUser, actual: null });
        else if (srcUser !== null) nullButUnmapped++;
      } else if (tgtUser !== srcUser) {
        userMismatch.push({ id: t.Id, expected: srcUser, actual: tgtUser });
      }
    }
    if (missing.length === 0) report('Donation', `Id membership (${tgt.length} rows == OrdersId)`, 'PASS', 'every Donation.Id exists in Orders');
    else report('Donation', 'Id membership', 'FAIL', `${missing.length} Donation Ids NOT in Orders: ${sample(missing)}`);
    if (userMismatch.length === 0) {
      report('Donation', 'UserId==Orders.UserId', 'PASS', nullButUnmapped ? `${nullButUnmapped} NULLs where source user never migrated (legitimate)` : '');
    } else {
      const ex = userMismatch.slice(0, 5).map(d => `Id=${d.id} expected=${d.expected} actual=${d.actual}`).join(' | ');
      report('Donation', 'UserId==Orders.UserId', 'FAIL', `${userMismatch.length} mismatches. ${ex}`);
    }
    await checkAutoIncrement(target, 'Donation', dbName);
  }

  // ---------- tracker id_mappings bridge consistency ----------
  console.log('\n=== id_mappings (tracker bridge) ===');
  {
    const [types] = await tracker.query(
      'SELECT entity_type, COUNT(*) total, SUM(CAST(source_id AS UNSIGNED) <> target_id) diff FROM id_mappings GROUP BY entity_type'
    );
    const preservedExact = ['Affiliate', 'Source', 'CustomerUser', 'Donation', 'Recruiter', 'RecruiterMapping', 'RecruitersGroup', 'RecruitersGroupMapping'];
    for (const r of types) {
      const diff = Number(r.diff || 0);
      if (preservedExact.includes(r.entity_type)) {
        if (diff === 0) report('id_mappings', r.entity_type, 'PASS', `${r.total} rows, all source_id==target_id`);
        else report('id_mappings', r.entity_type, 'FAIL', `${diff}/${r.total} rows with source_id<>target_id`);
      } else if (r.entity_type === 'Project') {
        // subs/type2/prayers legitimately map source->different target
        report('id_mappings', 'Project', 'PASS',
          `${r.total} rows: ${Number(r.total) - diff} identity (preserved), ${diff} translated (Type3_Subs/Type2/prayers — by design)`);
      } else {
        console.log(`  [info] ${r.entity_type}: ${r.total} rows, ${diff} translated (not an ID-preserving entity)`);
      }
    }
  }

  // ---------- summary ----------
  const fails = results.filter(r => r.status === 'FAIL');
  const warns = results.filter(r => r.status === 'WARN');
  console.log('\n================ SUMMARY ================');
  console.log(`checks: ${results.length}  PASS: ${results.filter(r => r.status === 'PASS').length}  WARN: ${warns.length}  FAIL: ${fails.length}`);
  for (const f of fails) console.log(`  FAIL: [${f.entity}] ${f.check} — ${f.detail}`);
  for (const w of warns) console.log(`  WARN: [${w.entity}] ${w.check} — ${w.detail}`);
  console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await target.end();
  await tracker.end();
  await mssqlDb.close();
  process.exit(fails.length ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err.message); console.error(err.stack); process.exit(2); });
