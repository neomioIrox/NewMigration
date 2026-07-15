#!/usr/bin/env node
/**
 * Pre-check for Affiliate/Source re-run.
 * Read-only. Queries MSSQL source, MySQL target, and MySQL tracker.
 * Prints a human summary and writes full JSON to reports/.
 */
const fs = require('fs');
const path = require('path');
const db = require('../validate/lib/db');

const REPORTS_DIR = path.resolve(__dirname, '../../reports');

async function safe(fn, fallback) {
  try { return await fn(); }
  catch (err) { return { __error: err.message, ...(fallback || {}) }; }
}

async function gatherMssql() {
  const r = {};

  r.parentSources = await safe(async () => {
    const [totals] = await db.mssqlQuery(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN Name IS NULL OR LTRIM(RTRIM(Name))='' THEN 1 ELSE 0 END) AS nullName,
        SUM(CASE WHEN UserName IS NULL OR LTRIM(RTRIM(UserName))='' THEN 1 ELSE 0 END) AS nullUserName,
        SUM(CASE WHEN Password IS NULL OR LTRIM(RTRIM(Password))='' THEN 1 ELSE 0 END) AS nullPassword,
        SUM(CASE WHEN Code IS NULL OR LTRIM(RTRIM(Code))='' THEN 1 ELSE 0 END) AS nullCode
      FROM ParentSources WITH (NOLOCK)
    `);
    return totals;
  });

  r.userSources = await safe(async () => {
    const [totals] = await db.mssqlQuery(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN ParentSourcesId IS NULL THEN 1 ELSE 0 END) AS nullParent,
        SUM(CASE WHEN ParentSourcesId = 0 THEN 1 ELSE 0 END) AS zeroParent
      FROM UserSources WITH (NOLOCK)
    `);
    return totals;
  });

  r.userSourcesMigratable = await safe(async () => {
    const [totals] = await db.mssqlQuery(`
      SELECT COUNT(*) AS total
      FROM UserSources us WITH (NOLOCK)
      WHERE us.ParentSourcesId IS NOT NULL
        AND EXISTS (SELECT 1 FROM ParentSources ps WITH (NOLOCK) WHERE ps.Id = us.ParentSourcesId)
    `);
    return totals.total;
  });

  r.userSourcesOrphanNonExistent = await safe(async () => {
    const [totals] = await db.mssqlQuery(`
      SELECT COUNT(*) AS total
      FROM UserSources us WITH (NOLOCK)
      WHERE us.ParentSourcesId IS NOT NULL
        AND us.ParentSourcesId <> 0
        AND NOT EXISTS (SELECT 1 FROM ParentSources ps WITH (NOLOCK) WHERE ps.Id = us.ParentSourcesId)
    `);
    return totals.total;
  });

  r.descriptionFallback = await safe(async () => {
    const [totals] = await db.mssqlQuery(`
      SELECT
        SUM(CASE WHEN (Title IS NULL OR LTRIM(RTRIM(Title))='')
                  AND (Name IS NOT NULL AND LTRIM(RTRIM(Name))<>'') THEN 1 ELSE 0 END) AS titleEmptyNameFilled,
        SUM(CASE WHEN (Title IS NULL OR LTRIM(RTRIM(Title))='')
                  AND (Name IS NULL OR LTRIM(RTRIM(Name))='') THEN 1 ELSE 0 END) AS bothEmpty,
        SUM(CASE WHEN Title IS NOT NULL AND LTRIM(RTRIM(Title))<>'' THEN 1 ELSE 0 END) AS titleFilled
      FROM UserSources us WITH (NOLOCK)
      WHERE us.ParentSourcesId IS NOT NULL
        AND EXISTS (SELECT 1 FROM ParentSources ps WITH (NOLOCK) WHERE ps.Id = us.ParentSourcesId)
    `);
    return totals;
  });

  r.userNameCollisions20 = await safe(async () => {
    return await db.mssqlQuery(`
      SELECT LEFT(UserName, 20) AS prefix20, COUNT(*) AS n
      FROM ParentSources WITH (NOLOCK)
      WHERE UserName IS NOT NULL AND LTRIM(RTRIM(UserName))<>''
      GROUP BY LEFT(UserName, 20)
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);
  });

  r.userNameDuplicatesFull = await safe(async () => {
    return await db.mssqlQuery(`
      SELECT UserName, COUNT(*) AS n
      FROM ParentSources WITH (NOLOCK)
      WHERE UserName IS NOT NULL AND LTRIM(RTRIM(UserName))<>''
      GROUP BY UserName
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);
  });

  r.samplesParentSources = await safe(async () =>
    db.mssqlQuery(`SELECT TOP 5 Id, Name, Code, UserName, LEN(UserName) AS userNameLen FROM ParentSources WITH (NOLOCK) ORDER BY Id`)
  );

  r.samplesUserSources = await safe(async () =>
    db.mssqlQuery(`
      SELECT TOP 5 UserSourcesId, Name, Title, ParentSourcesId
      FROM UserSources WITH (NOLOCK)
      WHERE ParentSourcesId IS NOT NULL
      ORDER BY UserSourcesId
    `)
  );

  return r;
}

async function gatherTarget() {
  const r = {};

  r.affiliate = await safe(async () => {
    const rows = await db.targetQuery(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN UserId IS NULL THEN 1 ELSE 0 END) AS userIdNull,
        SUM(CASE WHEN DefaultSourceId IS NULL THEN 1 ELSE 0 END) AS defaultSourceIdNull
      FROM Affiliate
    `);
    return rows[0];
  });

  r.source = await safe(async () => {
    const rows = await db.targetQuery(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN Description IS NULL THEN 1 ELSE 0 END) AS descriptionNull
      FROM Source
    `);
    return rows[0];
  });

  r.sourceBadFk = await safe(async () => {
    const rows = await db.targetQuery(`
      SELECT COUNT(*) AS total
      FROM Source s
      LEFT JOIN Affiliate a ON a.Id = s.AffiliateId
      WHERE s.AffiliateId IS NOT NULL AND a.Id IS NULL
    `);
    return rows[0].total;
  });

  r.usersRole3 = await safe(async () => {
    const rows = await db.targetQuery(`SELECT COUNT(*) AS total FROM User WHERE RoleId = 3`);
    return rows[0].total;
  });

  r.affiliateUserOrphan = await safe(async () => {
    const rows = await db.targetQuery(`
      SELECT COUNT(*) AS total
      FROM Affiliate a
      LEFT JOIN User u ON u.Id = a.UserId
      WHERE a.UserId IS NOT NULL AND u.Id IS NULL
    `);
    return rows[0].total;
  });

  r.samplesAffiliate = await safe(async () =>
    db.targetQuery(`SELECT Id, Name, UserId, DefaultSourceId FROM Affiliate ORDER BY Id LIMIT 5`)
  );

  r.samplesSource = await safe(async () =>
    db.targetQuery(`SELECT Id, AffiliateId, SourceCode, Description FROM Source ORDER BY Id LIMIT 5`)
  );

  r.samplesUsers = await safe(async () =>
    db.targetQuery(`SELECT Id, UserName, FirstName, LastName, RoleId FROM User WHERE RoleId = 3 ORDER BY Id LIMIT 5`)
  );

  return r;
}

async function gatherTracker() {
  const r = {};

  r.perEntityType = await safe(async () =>
    db.trackerQuery(`SELECT entity_type, COUNT(*) AS n FROM id_mappings GROUP BY entity_type ORDER BY entity_type`)
  );

  for (const et of ['AffiliateMapping', 'AffiliateUser', 'SourceMapping']) {
    r[et] = await safe(async () => {
      const rows = await db.trackerQuery(`SELECT COUNT(*) AS n FROM id_mappings WHERE entity_type = ?`, [et]);
      return rows[0].n;
    });
  }

  return r;
}

async function gatherCrossDb() {
  const r = {};

  r.trackerAffiliateTargetsMissing = await safe(async () => {
    const trackerRows = await db.trackerQuery(
      `SELECT target_id FROM id_mappings WHERE entity_type = 'AffiliateMapping'`
    );
    if (trackerRows.length === 0) return 0;
    const ids = trackerRows.map(r => Number(r.target_id)).filter(n => !isNaN(n));
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const existingRows = await db.targetQuery(
      `SELECT Id FROM Affiliate WHERE Id IN (${placeholders})`,
      ids
    );
    return ids.length - existingRows.length;
  });

  r.affiliateRowsMissingFromTracker = await safe(async () => {
    const affRows = await db.targetQuery(`SELECT Id FROM Affiliate`);
    if (affRows.length === 0) return 0;
    const ids = affRows.map(r => Number(r.Id));
    const placeholders = ids.map(() => '?').join(',');
    const trackerRows = await db.trackerQuery(
      `SELECT target_id FROM id_mappings WHERE entity_type = 'AffiliateMapping' AND target_id IN (${placeholders})`,
      ids
    );
    return ids.length - trackerRows.length;
  });

  return r;
}

function humanSummary(report) {
  const lines = [];
  const p = (s) => lines.push(s);

  p('');
  p('='.repeat(70));
  p('AFFILIATE / SOURCE — PRE-CHECK SUMMARY');
  p('='.repeat(70));

  p('\n[SOURCE — MSSQL]');
  const ps = report.mssql.parentSources;
  p(`  ParentSources: total=${ps.total}, nullName=${ps.nullName}, nullUserName=${ps.nullUserName}, nullPassword=${ps.nullPassword}, nullCode=${ps.nullCode}`);
  const us = report.mssql.userSources;
  p(`  UserSources:   total=${us.total}, nullParent=${us.nullParent}, zeroParent=${us.zeroParent}`);
  p(`  Migratable (valid ParentSourcesId): ${report.mssql.userSourcesMigratable}`);
  p(`  Orphan (ParentSourcesId points to non-existent): ${report.mssql.userSourcesOrphanNonExistent}`);
  const df = report.mssql.descriptionFallback;
  p(`  Description: titleFilled=${df.titleFilled}, titleEmpty→Name fallback=${df.titleEmptyNameFilled}, BOTH empty=${df.bothEmpty}`);
  p(`  UserName 20-char prefix collisions: ${report.mssql.userNameCollisions20.length || 0}`);
  if ((report.mssql.userNameCollisions20.length || 0) > 0) {
    report.mssql.userNameCollisions20.slice(0, 5).forEach(c => p(`    - "${c.prefix20}": ${c.n} rows`));
  }
  p(`  UserName full duplicates: ${report.mssql.userNameDuplicatesFull.length || 0}`);

  p('\n[TARGET — MySQL]');
  const aff = report.target.affiliate;
  p(`  affiliate: total=${aff.total}, UserId=NULL: ${aff.userIdNull}, DefaultSourceId=NULL: ${aff.defaultSourceIdNull}`);
  const src = report.target.source;
  p(`  source:    total=${src.total}, Description=NULL: ${src.descriptionNull}`);
  p(`  source rows with bad AffiliateId FK: ${report.target.sourceBadFk}`);
  p(`  user WHERE RoleId=3: ${report.target.usersRole3}`);
  p(`  affiliate→user orphans: ${report.target.affiliateUserOrphan}`);

  p('\n[TRACKER — id_mappings]');
  (report.tracker.perEntityType || []).forEach(r => p(`  ${r.entity_type}: ${r.n}`));
  p(`  (Expected: AffiliateMapping=${report.tracker.AffiliateMapping}, AffiliateUser=${report.tracker.AffiliateUser}, SourceMapping=${report.tracker.SourceMapping})`);

  p('\n[CROSS-DB CONSISTENCY]');
  p(`  Tracker AffiliateMapping rows whose target_id missing from affiliate: ${report.crossDb.trackerAffiliateTargetsMissing}`);
  p(`  affiliate rows whose Id missing from tracker AffiliateMapping:         ${report.crossDb.affiliateRowsMissingFromTracker}`);

  p('\n[VERDICT]');
  const expectedParentSources = report.mssql.parentSources.total;
  const expectedMigratableSources = report.mssql.userSourcesMigratable;
  const bothEmpty = report.mssql.descriptionFallback.bothEmpty;
  const verdict = [];

  if (report.target.affiliate.total === 0 && report.target.source.total === 0 && report.target.usersRole3 === 0) {
    verdict.push('  ✅ Target is CLEAN. Ready to migrate.');
  } else {
    verdict.push(`  ⚠️  Target has existing data:`);
    verdict.push(`      ${report.target.affiliate.total} affiliate rows (expect ${expectedParentSources} after re-run)`);
    verdict.push(`      ${report.target.source.total} source rows (expect ${expectedMigratableSources} after re-run)`);
    verdict.push(`      ${report.target.usersRole3} user rows with RoleId=3`);
    if (report.target.affiliate.userIdNull > 0) verdict.push(`      ❌ ${report.target.affiliate.userIdNull} affiliates have UserId=NULL (broken)`);
    if (report.target.source.descriptionNull > 0) verdict.push(`      ❌ ${report.target.source.descriptionNull} sources have Description=NULL (check expected bothEmpty=${bothEmpty})`);
    verdict.push(`      → Run 02-cleanup.js before re-migrating.`);
  }

  if ((report.mssql.userNameCollisions20.length || 0) > 0) {
    verdict.push(`  ⚠️  UserName 20-char collisions detected — lookupKey will silently merge users. Decide policy before re-run.`);
  }
  if (bothEmpty > 0) {
    verdict.push(`  ℹ️  Expected NULL Description count after re-run: ${bothEmpty} (Title AND Name both empty).`);
  }

  lines.push(...verdict);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  console.log('Connecting to all three databases...');
  await db.connect();
  console.log('Connected. Gathering stats...\n');

  const report = {
    timestamp: new Date().toISOString(),
    mssql: await gatherMssql(),
    target: await gatherTarget(),
    tracker: await gatherTracker(),
    crossDb: await gatherCrossDb()
  };

  console.log(humanSummary(report));

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, '-');
  const outPath = path.join(REPORTS_DIR, `affiliate-rerun-precheck-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to: ${outPath}`);

  await db.closeAll();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
