#!/usr/bin/env node
/**
 * Post-migration: populate affiliate.DefaultSourceId.
 *
 * For each affiliate (via tracker AffiliateMapping source→target), find the source
 * row whose SourceCode matches ParentSources.Code and whose AffiliateId matches the
 * affiliate's Id. Update affiliate.DefaultSourceId = source.Id.
 *
 * Default: dry-run. Use --execute to actually run UPDATEs.
 */
const db = require('../validate/lib/db');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: true };
  for (const a of args) {
    if (a === '--execute') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  console.log('Connecting to databases...');
  await db.connect();
  console.log('Connected.\n');

  console.log('[1/5] Fetching tracker mappings for AffiliateMapping...');
  const trackerRows = await db.trackerQuery(
    `SELECT source_id, target_id FROM id_mappings WHERE entity_type = 'AffiliateMapping'`
  );
  console.log(`      → ${trackerRows.length} affiliate mappings`);

  if (trackerRows.length === 0) {
    console.log('\nNo affiliate mappings in tracker. Nothing to do.');
    await db.closeAll();
    return;
  }

  const sourceIds = trackerRows.map(r => Number(r.source_id)).filter(n => !isNaN(n));
  const targetIds = trackerRows.map(r => Number(r.target_id)).filter(n => !isNaN(n));
  const sourceToTarget = new Map();
  trackerRows.forEach(r => sourceToTarget.set(Number(r.source_id), Number(r.target_id)));

  console.log('[2/5] Fetching ParentSources.Code from MSSQL...');
  const codeRows = await db.mssqlQuery(
    `SELECT Id, Code FROM ParentSources WITH (NOLOCK) WHERE Id IN (${sourceIds.join(',')})`
  );
  const codeBySourceId = new Map();
  codeRows.forEach(r => codeBySourceId.set(Number(r.Id), r.Code));
  console.log(`      → ${codeRows.length} ParentSources rows fetched`);

  console.log('[3/5] Fetching source rows for these affiliates from target...');
  const placeholders = targetIds.map(() => '?').join(',');
  const srcRows = await db.targetQuery(
    `SELECT Id, AffiliateId, SourceCode FROM Source WHERE AffiliateId IN (${placeholders})`,
    targetIds
  );
  const sourceByAffCode = new Map();
  srcRows.forEach(s => sourceByAffCode.set(`${s.AffiliateId}|${s.SourceCode}`, s.Id));
  console.log(`      → ${srcRows.length} source rows fetched`);

  console.log('[4a/5] Building lowest-Id fallback map (Source per Affiliate)...');
  const lowestByAff = new Map();
  for (const s of srcRows) {
    const aff = Number(s.AffiliateId);
    const id = Number(s.Id);
    if (!lowestByAff.has(aff) || id < lowestByAff.get(aff)) lowestByAff.set(aff, id);
  }

  console.log('[4b/5] Computing updates...');
  const updates = [];
  const stats = { total: trackerRows.length, noCode: 0, matchedByCode: 0, fallbackLowestId: 0, noSourceAtAll: 0, planned: 0 };

  for (const tr of trackerRows) {
    const srcId = Number(tr.source_id);
    const tgtId = Number(tr.target_id);
    const code = codeBySourceId.get(srcId);
    let srcRowId = null;
    let reason = null;

    if (code) {
      srcRowId = sourceByAffCode.get(`${tgtId}|${code}`);
      if (srcRowId) reason = 'code-match';
    } else {
      stats.noCode++;
    }

    if (!srcRowId) {
      srcRowId = lowestByAff.get(tgtId);
      if (srcRowId) reason = 'fallback-lowest-id';
    }

    if (!srcRowId) {
      stats.noSourceAtAll++;
      continue;
    }

    if (reason === 'code-match') stats.matchedByCode++;
    else stats.fallbackLowestId++;

    updates.push({ affiliateId: tgtId, defaultSourceId: srcRowId, code, reason });
    stats.planned++;
  }

  console.log(`      → Planned: ${stats.planned} (by Code match: ${stats.matchedByCode}, by lowest-Id fallback: ${stats.fallbackLowestId})`);
  console.log(`      → NoCode: ${stats.noCode}, NoSourceAtAll: ${stats.noSourceAtAll}`);

  console.log('\n[5/5] ' + (opts.dryRun ? 'DRY-RUN — no UPDATEs executed' : 'Executing UPDATEs...'));

  if (!opts.dryRun) {
    const batchSize = 100;
    let done = 0;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      for (const u of batch) {
        await db.targetQuery(
          `UPDATE Affiliate SET DefaultSourceId = ? WHERE Id = ?`,
          [u.defaultSourceId, u.affiliateId]
        );
      }
      done += batch.length;
      console.log(`      → ${done}/${updates.length}`);
    }
  } else {
    console.log('      Sample (first 5):');
    updates.slice(0, 5).forEach(u =>
      console.log(`        UPDATE Affiliate SET DefaultSourceId=${u.defaultSourceId} WHERE Id=${u.affiliateId}  (${u.reason}, code="${u.code || ''}")`)
    );
  }

  console.log('\nSUMMARY:');
  console.log(`  Total affiliate mappings:     ${stats.total}`);
  console.log(`  Planned updates:              ${stats.planned}`);
  console.log(`  Matched by Code=SourceCode:   ${stats.matchedByCode}`);
  console.log(`  Fallback to lowest Source.Id: ${stats.fallbackLowestId}`);
  console.log(`  Affiliate has no source:      ${stats.noSourceAtAll}`);
  console.log(opts.dryRun ? '\n(Dry-run — re-run with --execute to apply.)\n' : '\n✅ Done.\n');

  await db.closeAll();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
