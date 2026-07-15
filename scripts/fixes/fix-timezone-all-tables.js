/**
 * Timezone backfill for ALL migrated tables (except Donation* — those are handled by
 * scripts/fixes/fix-donation-qa-issues.js --only=times).
 *
 * Background (see server/src/engine/tz.js): the target convention is UTC, but migration
 * writes were shifted. Two corruption classes exist:
 *   'single' - value was written as an Israel-LOCAL string (processGetDate() "now" stamps,
 *              or new Date() instants). Correction: one CONVERT_TZ Jerusalem->UTC.
 *   'double' - value came from a source Date object (MSSQL wall clock) that mysql2
 *              re-shifted on write (stored = wall + IL offset). Correction: CONVERT_TZ
 *              Jerusalem->UTC applied TWICE (exact inverse, DST-aware).
 *
 * Safety:
 *   - Only rows with the matching audit guard (<X>By = -1) are touched, so anything
 *     edited/created via the new app is preserved. Columns without a guard column are
 *     skipped with a warning.
 *   - 'single' columns additionally require value >= 2026-06-09 (the RDS was seeded
 *     2026-06-08 ~20:26 UTC; all migration runs are later) so seed rows written in true
 *     UTC are never double-corrected. 'double' columns hold historical source dates and
 *     rely on the guard alone.
 *   - Idempotency: every applied table.column is recorded in the TRACKER DB table
 *     `applied_fixes` (created on first --apply); a recorded column is never converted
 *     again. Never delete those markers.
 *   - Project.CreatedAt/StatusChangedAt are intentionally NOT listed: those values are
 *     synthetic (ProductCreatedDate.json sort keys / GETDATE for prayer-projects).
 *
 * Usage:
 *   node scripts/fixes/fix-timezone-all-tables.js                # dry-run
 *   node scripts/fixes/fix-timezone-all-tables.js --apply
 *   node scripts/fixes/fix-timezone-all-tables.js --only=PrayName,CustomerUser [--apply]
 */
const targetDb = require('../../server/src/db/mysql-target');
const trackerDb = require('../../server/src/db/mysql-tracker');

const APPLY = process.argv.includes('--apply');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.replace('--only=', '').split(',').map(s => s.trim()) : null;

// Stored 'single' values are IL-local migration stamps; everything the migration wrote
// is after the DB seed (2026-06-08 ~20:26 UTC). Seed rows stay untouched below this line.
const MIGRATION_EPOCH = '2026-06-09 00:00:00';

const GUARD_BY = { CreatedAt: 'CreatedBy', UpdatedAt: 'UpdatedBy', StatusChangedAt: 'StatusChangedBy' };

const S = 'single', D = 'double';
const TABLES = [
  { table: 'Affiliate', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'Source', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'FundCategory', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'CustomerUser', cols: { CreatedAt: D, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'CustomerUserCrdt', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'CustomerUserPrayName', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'PrayName', cols: { CreatedAt: D, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'Recruiter', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'RecruiterLocalization', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'RecruitersGroup', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'RecruitersGroupLanguage', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'Project', cols: { UpdatedAt: S } }, // CreatedAt/StatusChangedAt synthetic - skip
  { table: 'ProjectLocalization', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'ProjectItem', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S }, extraWhere: 'Id<>1' }, // Id=1 seeded general bucket
  { table: 'ProjectItemLocalization', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'ProjectItemQuickDonationLocalization', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'Media', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'EntityMedia', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'EntityContent', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'EntityContentItem', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'LinkSetting', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'Translations', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'Gallery', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'GalleryLocalization', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'GalleryMedia', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
  { table: 'VideoGalleryMedia', cols: { CreatedAt: S, UpdatedAt: S, StatusChangedAt: S } },
];

function convExpr(col, mode) {
  return mode === D
    ? "CONVERT_TZ(CONVERT_TZ(`" + col + "`,'Asia/Jerusalem','UTC'),'Asia/Jerusalem','UTC')"
    : "CONVERT_TZ(`" + col + "`,'Asia/Jerusalem','UTC')";
}

async function main() {
  console.log((APPLY ? '*** APPLY MODE ***' : '*** DRY-RUN (no changes; pass --apply to execute) ***')
    + (ONLY ? ' tables: ' + ONLY.join(',') : ''));
  console.log('NOTE: Donation/DonationActionLog/DonationCurrencyValue are handled by fix-donation-qa-issues.js --only=times\n');

  const conn = await targetDb.getConnection();
  try {
    const [[tzOk]] = await conn.query("SELECT CONVERT_TZ('2026-06-07 05:00:06','Asia/Jerusalem','UTC') v");
    if (!tzOk.v) throw new Error('CONVERT_TZ returned NULL - timezone tables missing on target');

    // Column inventory for all tables at once
    const [colRows] = await conn.query(
      "SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()");
    const tableCols = new Map();
    for (const r of colRows) {
      if (!tableCols.has(r.t)) tableCols.set(r.t, new Set());
      tableCols.get(r.t).add(r.c);
    }

    // Idempotency markers (tracker DB)
    let applied = new Set();
    try {
      const [m] = await trackerDb.query("SELECT fix_key FROM applied_fixes WHERE fix_key LIKE 'tzfix:%'");
      applied = new Set(m.map(r => r.fix_key));
    } catch (e) { /* table not created yet - nothing applied */ }

    for (const spec of TABLES) {
      if (ONLY && !ONLY.includes(spec.table)) continue;
      const cols = tableCols.get(spec.table);
      if (!cols) { console.log(spec.table + ': table not found - skipped'); continue; }

      const [[rc]] = await conn.query('SELECT COUNT(*) n FROM `' + spec.table + '`');
      if (rc.n === 0) { console.log(spec.table + ': empty - nothing to do'); continue; }
      console.log('\n=== ' + spec.table + ' (' + rc.n + ' rows) ===');

      for (const [col, mode] of Object.entries(spec.cols)) {
        if (!cols.has(col)) continue;
        const key = 'tzfix:' + spec.table + '.' + col;
        if (applied.has(key)) { console.log('  ' + col + ': already applied - skipped'); continue; }

        const guardCol = GUARD_BY[col];
        if (!guardCol || !cols.has(guardCol)) {
          console.log('  ' + col + ': no ' + (guardCol || 'guard') + ' column - SKIPPED (review manually)');
          continue;
        }

        let where = '`' + guardCol + '`=-1 AND `' + col + '` IS NOT NULL';
        if (mode === S) where += " AND `" + col + "` >= '" + MIGRATION_EPOCH + "'";
        if (spec.extraWhere) where += ' AND ' + spec.extraWhere;

        const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM `' + spec.table + '` WHERE ' + where);
        const [sample] = await conn.query(
          'SELECT CAST(`' + col + '` AS CHAR) before_val, CAST(' + convExpr(col, mode) + ' AS CHAR) after_val'
          + ' FROM `' + spec.table + '` WHERE ' + where + ' LIMIT 2');
        const sampleStr = sample.map(s => s.before_val + ' -> ' + s.after_val).join(' | ');
        console.log('  ' + col + ' [' + mode + ']: ' + cnt.n + ' rows' + (sampleStr ? '   e.g. ' + sampleStr : ''));

        if (!APPLY || cnt.n === 0) continue;
        const [r] = await conn.query('UPDATE `' + spec.table + '` SET `' + col + '`=' + convExpr(col, mode) + ' WHERE ' + where);
        await trackerDb.query('CREATE TABLE IF NOT EXISTS applied_fixes (fix_key VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await trackerDb.query('INSERT IGNORE INTO applied_fixes (fix_key) VALUES (?)', [key]);
        console.log('  ' + col + ': APPLIED (' + r.affectedRows + ' rows)');
      }
    }
    console.log('\nDone.');
  } catch (err) {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await targetDb.close();
    await trackerDb.close();
    process.exit();
  }
}

main();
