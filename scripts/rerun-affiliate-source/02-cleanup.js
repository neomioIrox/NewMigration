#!/usr/bin/env node
/**
 * Cleanup for Affiliate/Source re-run.
 *
 * Default: dry-run (prints counts, no writes).
 * To execute: --execute --confirm=YES-DELETE-AFFILIATE-DATA
 *
 * Deletion rules:
 *   - target.source: all rows (these came from broken UserSources migration)
 *   - target.affiliate: all rows
 *   - target.user: only rows that are BOTH (RoleId=3) AND (Id in tracker AffiliateUser mappings)
 *   - tracker.id_mappings: entity_type IN (AffiliateMapping, AffiliateUser, SourceMapping)
 */
const db = require('../validate/lib/db');

const TRACKER_ENTITY_TYPES = ['AffiliateMapping', 'AffiliateUser', 'SourceMapping'];
const CONFIRM_VALUE = 'YES-DELETE-AFFILIATE-DATA';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: true, confirm: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--execute') opts.dryRun = false;
    else if (a.startsWith('--confirm=')) opts.confirm = a.substring('--confirm='.length);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage:\n  node 02-cleanup.js                                     # dry-run\n  node 02-cleanup.js --execute --confirm=' + CONFIRM_VALUE);
      process.exit(0);
    }
  }
  return opts;
}

async function gatherCounts() {
  const counts = {};

  const [affRow] = await db.targetQuery(`SELECT COUNT(*) AS n FROM Affiliate`);
  counts.affiliate = affRow.n;

  const [srcRow] = await db.targetQuery(`SELECT COUNT(*) AS n FROM Source`);
  counts.source = srcRow.n;

  const [usrRow] = await db.targetQuery(`
    SELECT COUNT(*) AS n FROM User WHERE RoleId = 3
  `);
  counts.userRole3 = usrRow.n;

  const trackerUserIds = await db.trackerQuery(
    `SELECT target_id FROM id_mappings WHERE entity_type = 'AffiliateUser'`
  );
  counts.trackerAffiliateUserIds = trackerUserIds.length;
  counts.trackerAffiliateUserIdList = trackerUserIds.map(r => Number(r.target_id)).filter(n => !isNaN(n));

  if (counts.trackerAffiliateUserIdList.length > 0) {
    const placeholders = counts.trackerAffiliateUserIdList.map(() => '?').join(',');
    const [intersect] = await db.targetQuery(
      `SELECT COUNT(*) AS n FROM User WHERE RoleId = 3 AND Id IN (${placeholders})`,
      counts.trackerAffiliateUserIdList
    );
    counts.usersToDelete = intersect.n;
  } else {
    counts.usersToDelete = 0;
  }

  counts.trackerByEntity = {};
  for (const et of TRACKER_ENTITY_TYPES) {
    const rows = await db.trackerQuery(
      `SELECT COUNT(*) AS n FROM id_mappings WHERE entity_type = ?`, [et]
    );
    counts.trackerByEntity[et] = rows[0].n;
  }

  return counts;
}

function printPlan(counts) {
  console.log('\n' + '='.repeat(70));
  console.log('CLEANUP PLAN');
  console.log('='.repeat(70));
  console.log(`\n  Target DB:`);
  console.log(`    source       rows to delete:  ${counts.source}`);
  console.log(`    affiliate    rows to delete:  ${counts.affiliate}`);
  console.log(`    user (RoleId=3, in tracker AffiliateUser):  ${counts.usersToDelete}`);
  console.log(`        (of ${counts.userRole3} RoleId=3 users in target; ${counts.trackerAffiliateUserIds} mapped in tracker)`);
  console.log(`\n  Tracker DB (id_mappings):`);
  for (const et of TRACKER_ENTITY_TYPES) {
    console.log(`    ${et.padEnd(18)} rows to delete:  ${counts.trackerByEntity[et]}`);
  }
  console.log('');
}

async function executeCleanup(counts) {
  console.log('\nExecuting cleanup...\n');

  const targetPool = require('../../server/src/db/mysql-target').getPool();
  const trackerPool = require('../../server/src/db/mysql-tracker').getPool();

  const targetConn = await targetPool.getConnection();
  const trackerConn = await trackerPool.getConnection();

  try {
    await targetConn.beginTransaction();

    console.log('  [1/6] UPDATE Affiliate SET DefaultSourceId = NULL ...');
    const [r1] = await targetConn.query(`UPDATE Affiliate SET DefaultSourceId = NULL WHERE DefaultSourceId IS NOT NULL`);
    console.log(`        → ${r1.affectedRows} rows`);

    console.log('  [2/6] DELETE FROM Source ...');
    const [r2] = await targetConn.query(`DELETE FROM Source`);
    console.log(`        → ${r2.affectedRows} rows`);

    console.log('  [3/6] SELECT DISTINCT affiliate.UserId ...');
    const [userIdRows] = await targetConn.query(`SELECT DISTINCT UserId FROM Affiliate WHERE UserId IS NOT NULL`);
    const affiliateUserIds = userIdRows.map(r => Number(r.UserId)).filter(n => !isNaN(n));
    console.log(`        → captured ${affiliateUserIds.length} affiliate.UserId values`);

    console.log('  [4/6] DELETE FROM Affiliate ...');
    const [r4] = await targetConn.query(`DELETE FROM Affiliate`);
    console.log(`        → ${r4.affectedRows} rows`);

    console.log('  [5/6] DELETE FROM User where RoleId=3 AND in tracker AffiliateUser ...');
    let usersDeleted = 0;
    if (affiliateUserIds.length > 0 && counts.trackerAffiliateUserIdList.length > 0) {
      const intersectIds = affiliateUserIds.filter(id => counts.trackerAffiliateUserIdList.includes(id));
      if (intersectIds.length > 0) {
        const placeholders = intersectIds.map(() => '?').join(',');
        const [r5] = await targetConn.query(
          `DELETE FROM User WHERE Id IN (${placeholders}) AND RoleId = 3`,
          intersectIds
        );
        usersDeleted = r5.affectedRows;
      }
    }
    console.log(`        → ${usersDeleted} rows`);

    await targetConn.commit();
    console.log('  ✓ Target DB transaction committed.');

    console.log('\n  [6/6] DELETE FROM tracker.id_mappings WHERE entity_type IN (...) ...');
    await trackerConn.beginTransaction();
    for (const et of TRACKER_ENTITY_TYPES) {
      const [r] = await trackerConn.query(`DELETE FROM id_mappings WHERE entity_type = ?`, [et]);
      console.log(`        ${et.padEnd(18)} → ${r.affectedRows} rows`);
    }
    await trackerConn.commit();
    console.log('  ✓ Tracker DB transaction committed.');

    console.log('\n✅ Cleanup complete.\n');
  } catch (err) {
    console.error('\n❌ Error during cleanup:', err.message);
    try { await targetConn.rollback(); } catch (e) {}
    try { await trackerConn.rollback(); } catch (e) {}
    throw err;
  } finally {
    targetConn.release();
    trackerConn.release();
  }
}

async function main() {
  const opts = parseArgs();

  console.log('Connecting to databases...');
  await db.connect();
  console.log('Connected.');

  const counts = await gatherCounts();
  printPlan(counts);

  if (opts.dryRun) {
    console.log('(Dry-run mode — no changes made. Use --execute --confirm=' + CONFIRM_VALUE + ' to apply.)\n');
    await db.closeAll();
    return;
  }

  if (opts.confirm !== CONFIRM_VALUE) {
    console.error(`\n❌ Execute mode requires --confirm=${CONFIRM_VALUE}`);
    console.error('   Aborting to prevent accidental data loss.\n');
    await db.closeAll();
    process.exit(2);
  }

  await executeCleanup(counts);
  await db.closeAll();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
