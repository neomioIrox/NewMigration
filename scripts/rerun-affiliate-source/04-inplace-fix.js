#!/usr/bin/env node
/**
 * In-place repair for Affiliate/Source data.
 *
 * Does NOT delete existing rows. Fixes known gaps:
 *   Phase A: Source.Description — populate NULLs via UserSources.Title → Name fallback
 *   Phase B: Affiliate.UserId    — create User for each tracked Affiliate with UserId=NULL
 *                                 and register in tracker as AffiliateUser
 *
 * Only touches rows that are registered in tracker (id_mappings). Ghost rows
 * (inserted outside the engine) are reported but not modified.
 *
 * Default: dry-run. Use --execute to apply.
 */
const db = require('../validate/lib/db');

const AFFILIATE_ROLE_ID = 3;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: true, phase: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--execute') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--phase') opts.phase = args[++i];
  }
  return opts;
}

function computeDescription(title, name) {
  const t = (title || '').trim();
  if (t !== '') return t.substring(0, 100);
  const n = (name || '').trim();
  if (n !== '') return n.substring(0, 100);
  return null;
}

function computeUserFields(ps) {
  const nameParts = (ps.Name || '').trim().split(/\s+/).filter(x => x);
  let firstName, lastName;
  if (nameParts.length > 1) {
    firstName = nameParts.slice(0, -1).join(' ').substring(0, 100);
    lastName = nameParts[nameParts.length - 1].substring(0, 300);
  } else {
    firstName = (ps.Name || 'Affiliate').substring(0, 100);
    lastName = 'Affiliate';
  }

  let userName = (ps.UserName || ps.Name || `aff_${ps.Id}`).substring(0, 20);

  return {
    firstName,
    lastName,
    userName,
    password: ps.Password || ''
  };
}

async function phaseA_Description(opts) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE A — Source.Description');
  console.log('='.repeat(70));

  const trackerRows = await db.trackerQuery(
    `SELECT source_id, target_id FROM id_mappings WHERE entity_type = 'SourceMapping'`
  );
  console.log(`  Tracker SourceMapping rows: ${trackerRows.length}`);

  const targetIds = trackerRows.map(r => Number(r.target_id));
  const ph = targetIds.map(() => '?').join(',');
  const nullSources = await db.targetQuery(
    `SELECT Id FROM Source WHERE Description IS NULL AND Id IN (${ph})`,
    targetIds
  );
  const nullIds = nullSources.map(r => r.Id);
  console.log(`  Tracked Sources with Description=NULL: ${nullIds.length}`);

  if (nullIds.length === 0) {
    console.log('  ✅ Nothing to fix.');
    return { planned: 0, updated: 0 };
  }

  const trackerByTarget = new Map();
  trackerRows.forEach(r => trackerByTarget.set(Number(r.target_id), Number(r.source_id)));
  const sourceIdsForNull = nullIds.map(id => trackerByTarget.get(id)).filter(x => x != null);

  const batch = 1000;
  const usRows = [];
  for (let i = 0; i < sourceIdsForNull.length; i += batch) {
    const chunk = sourceIdsForNull.slice(i, i + batch);
    const rows = await db.mssqlQuery(
      `SELECT UserSourcesId, Name, Title FROM UserSources WITH (NOLOCK) WHERE UserSourcesId IN (${chunk.join(',')})`
    );
    usRows.push(...rows);
  }
  const usById = new Map();
  usRows.forEach(r => usById.set(Number(r.UserSourcesId), r));
  console.log(`  Fetched ${usRows.length} UserSources rows from MSSQL`);

  const plan = [];
  const missing = [];
  let willBeNull = 0;
  for (const targetId of nullIds) {
    const srcId = trackerByTarget.get(targetId);
    const us = usById.get(srcId);
    if (!us) { missing.push({ targetId, srcId }); continue; }
    const desc = computeDescription(us.Title, us.Name);
    if (desc === null) { willBeNull++; continue; }
    plan.push({ targetId, desc, src: srcId });
  }

  console.log(`  Planned updates: ${plan.length}`);
  console.log(`  Would stay NULL (Title+Name both empty): ${willBeNull}`);
  console.log(`  Missing UserSources row (unexpected): ${missing.length}`);
  if (missing.length > 0 && missing.length <= 10) {
    console.log('  Missing details:', missing);
  }

  if (opts.dryRun) {
    console.log('  Sample (first 5):');
    plan.slice(0, 5).forEach(p =>
      console.log(`    UPDATE Source SET Description=${JSON.stringify(p.desc)} WHERE Id=${p.targetId}`)
    );
    return { planned: plan.length, updated: 0, willBeNull, missing: missing.length };
  }

  console.log('  Executing UPDATEs...');
  let done = 0;
  for (const p of plan) {
    await db.targetQuery(`UPDATE Source SET Description = ? WHERE Id = ?`, [p.desc, p.targetId]);
    done++;
    if (done % 200 === 0) console.log(`    ${done}/${plan.length}`);
  }
  console.log(`  ✅ Updated ${done} rows`);
  return { planned: plan.length, updated: done, willBeNull, missing: missing.length };
}

async function phaseB_Users(opts) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE B — Affiliate.UserId (create Users)');
  console.log('='.repeat(70));

  const trackerRows = await db.trackerQuery(
    `SELECT source_id, target_id FROM id_mappings WHERE entity_type = 'AffiliateMapping'`
  );
  console.log(`  Tracker AffiliateMapping rows: ${trackerRows.length}`);

  const targetIds = trackerRows.map(r => Number(r.target_id));
  const ph = targetIds.map(() => '?').join(',');
  const nullAffs = await db.targetQuery(
    `SELECT Id FROM Affiliate WHERE UserId IS NULL AND Id IN (${ph})`,
    targetIds
  );
  const nullIds = nullAffs.map(r => r.Id);
  console.log(`  Tracked Affiliates with UserId=NULL: ${nullIds.length}`);

  if (nullIds.length === 0) {
    console.log('  ✅ Nothing to fix.');
    return { planned: 0, created: 0, reused: 0 };
  }

  const [roleRow] = await db.targetQuery(`SELECT Id FROM Role WHERE Id = ?`, [AFFILIATE_ROLE_ID]).catch(() => [[]]);
  if (!roleRow || (Array.isArray(roleRow) && roleRow.length === 0)) {
    // Try lookup in common role tables
    console.log('  Note: Could not verify Role.Id=3 exists. Continuing anyway.');
  }

  const trackerByTarget = new Map();
  trackerRows.forEach(r => trackerByTarget.set(Number(r.target_id), Number(r.source_id)));
  const parentIds = nullIds.map(id => trackerByTarget.get(id)).filter(x => x != null);

  const psRows = await db.mssqlQuery(
    `SELECT Id, Name, UserName, Password FROM ParentSources WITH (NOLOCK) WHERE Id IN (${parentIds.join(',')})`
  );
  const psById = new Map();
  psRows.forEach(r => psById.set(Number(r.Id), r));
  console.log(`  Fetched ${psRows.length} ParentSources rows from MSSQL`);

  const plan = [];
  const missing = [];
  for (const affId of nullIds) {
    const psId = trackerByTarget.get(affId);
    const ps = psById.get(psId);
    if (!ps) { missing.push({ affId, psId }); continue; }
    const u = computeUserFields(ps);
    plan.push({ affId, psId, ...u });
  }

  console.log(`  Planned user actions: ${plan.length}`);
  console.log(`  Missing ParentSources row: ${missing.length}`);

  const existingUsers = new Map();
  if (plan.length > 0) {
    const names = plan.map(p => p.userName);
    const phU = names.map(() => '?').join(',');
    const rows = await db.targetQuery(
      `SELECT Id, UserName FROM User WHERE UserName IN (${phU})`,
      names
    );
    rows.forEach(r => existingUsers.set(String(r.UserName).toLowerCase(), r.Id));
  }
  console.log(`  Users already existing with matching UserName (case-insensitive): ${existingUsers.size}`);

  if (opts.dryRun) {
    console.log('  Sample (first 5):');
    plan.slice(0, 5).forEach(p => {
      const existingId = existingUsers.get(p.userName);
      if (existingId) {
        console.log(`    UPDATE Affiliate SET UserId=${existingId} WHERE Id=${p.affId}  (reuse existing User "${p.userName}")`);
      } else {
        console.log(`    INSERT User("${p.userName}", FirstName="${p.firstName}", LastName="${p.lastName}", RoleId=${AFFILIATE_ROLE_ID}); UPDATE Affiliate SET UserId=<new> WHERE Id=${p.affId}`);
      }
    });
    return { planned: plan.length, created: 0, reused: 0 };
  }

  console.log('  Executing...');
  let created = 0, reused = 0;
  for (const p of plan) {
    let userId = existingUsers.get(String(p.userName).toLowerCase());
    if (!userId) {
      const now = new Date();
      try {
        const r = await db.targetQuery(
          `INSERT INTO User (FirstName, LastName, Email, UserName, Password, RoleId,
                             RecordStatus, StatusChangedAt, StatusChangedBy,
                             CreatedAt, CreatedBy, UpdatedAt, UpdatedBy)
           VALUES (?, ?, NULL, ?, ?, ?, 2, ?, -1, ?, -1, ?, -1)`,
          [p.firstName, p.lastName, p.userName, p.password, AFFILIATE_ROLE_ID, now, now, now]
        );
        userId = r.insertId;
        created++;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          const fb = await db.targetQuery(`SELECT Id FROM User WHERE UserName = ? LIMIT 1`, [p.userName]);
          if (fb.length === 0) throw err;
          userId = fb[0].Id;
          existingUsers.set(String(p.userName).toLowerCase(), userId);
          reused++;
        } else {
          throw err;
        }
      }
    } else {
      reused++;
    }
    await db.targetQuery(`UPDATE Affiliate SET UserId = ? WHERE Id = ?`, [userId, p.affId]);
    await db.trackerQuery(
      `INSERT IGNORE INTO id_mappings (entity_type, source_id, target_id) VALUES ('AffiliateUser', ?, ?)`,
      [p.psId, userId]
    );
    if ((created + reused) % 20 === 0) console.log(`    ${created + reused}/${plan.length}`);
  }
  console.log(`  ✅ Created ${created} users, reused ${reused}, linked ${created + reused} affiliates`);
  return { planned: plan.length, created, reused };
}

async function ghostReport() {
  console.log('\n' + '='.repeat(70));
  console.log('GHOST ROW REPORT (info only — not modified)');
  console.log('='.repeat(70));

  const trackerAff = await db.trackerQuery(`SELECT target_id FROM id_mappings WHERE entity_type='AffiliateMapping'`);
  const trackedAffSet = new Set(trackerAff.map(r => Number(r.target_id)));
  const allAff = await db.targetQuery(`SELECT Id, Name, UserId FROM Affiliate`);
  const ghostAff = allAff.filter(a => !trackedAffSet.has(a.Id));
  console.log(`  Ghost Affiliates: ${ghostAff.length}`);
  ghostAff.forEach(a => console.log(`    Id=${a.Id}  Name="${a.Name}"  UserId=${a.UserId}`));

  const trackerSrc = await db.trackerQuery(`SELECT target_id FROM id_mappings WHERE entity_type='SourceMapping'`);
  const trackedSrcSet = new Set(trackerSrc.map(r => Number(r.target_id)));
  const allSrc = await db.targetQuery(`SELECT Id, AffiliateId, SourceCode FROM Source`);
  const ghostSrc = allSrc.filter(s => !trackedSrcSet.has(s.Id));
  console.log(`  Ghost Sources: ${ghostSrc.length}`);
  ghostSrc.forEach(s => console.log(`    Id=${s.Id}  AffiliateId=${s.AffiliateId}  SourceCode="${s.SourceCode}"`));

  if (ghostSrc.length > 0) {
    const ids = ghostSrc.map(s => s.Id);
    const ph = ids.map(() => '?').join(',');
    const [don] = await db.targetQuery(`SELECT COUNT(*) AS n FROM Donation WHERE SourceId IN (${ph})`, ids);
    console.log(`  Donations referencing these ghost Sources: ${don.n}`);
  }
}

async function main() {
  const opts = parseArgs();

  console.log('Connecting to databases...');
  await db.connect();
  console.log('Connected.');

  const results = {};
  if (!opts.phase || opts.phase === 'A') results.phaseA = await phaseA_Description(opts);
  if (!opts.phase || opts.phase === 'B') results.phaseB = await phaseB_Users(opts);
  await ghostReport();

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(JSON.stringify(results, null, 2));
  if (opts.dryRun) {
    console.log('\n(Dry-run — re-run with --execute to apply.)\n');
  } else {
    console.log('\n✅ In-place fix complete. Next: node scripts/rerun-affiliate-source/03-set-default-source-id.js --execute\n');
  }

  await db.closeAll();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
