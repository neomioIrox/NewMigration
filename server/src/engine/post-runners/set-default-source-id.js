/**
 * Post-migration runner: populates Affiliate.DefaultSourceId.
 *
 * Invoked by the engine when SourceMapping.postMigrationRunners includes
 * "set-default-source-id". Safe to run repeatedly; only touches rows with
 * DefaultSourceId=NULL.
 *
 * Strategy per Affiliate (resolved via tracker AffiliateMapping):
 *   1. Match by ParentSources.Code = Source.SourceCode (exact match)
 *   2. Fallback: lowest Source.Id for that Affiliate
 *   3. No fallback possible if the Affiliate has zero Sources
 */
const mssqlDb = require('../../db/mssql');
const targetDb = require('../../db/mysql-target');
const trackerDb = require('../../db/mysql-tracker');
const logger = require('../../logger');

async function run() {
  logger.info('post-runner: set-default-source-id starting');

  const [trackerRows] = await trackerDb.query(
    `SELECT source_id, target_id FROM id_mappings WHERE entity_type = 'AffiliateMapping'`
  );
  if (trackerRows.length === 0) {
    logger.warn('post-runner: no AffiliateMapping entries in tracker; nothing to do');
    return { updated: 0, reason: 'no-tracker-entries' };
  }

  const sourceIds = trackerRows.map(r => Number(r.source_id)).filter(n => !isNaN(n));
  const targetIds = trackerRows.map(r => Number(r.target_id)).filter(n => !isNaN(n));
  const sourceToTarget = new Map();
  trackerRows.forEach(r => sourceToTarget.set(Number(r.source_id), Number(r.target_id)));

  const codeResult = await mssqlDb.query(
    `SELECT Id, Code FROM ParentSources WITH (NOLOCK) WHERE Id IN (${sourceIds.join(',')})`
  );
  const codeBySourceId = new Map();
  codeResult.recordset.forEach(r => codeBySourceId.set(Number(r.Id), r.Code));

  const ph = targetIds.map(() => '?').join(',');
  const [srcRows] = await targetDb.query(
    `SELECT Id, AffiliateId, SourceCode FROM Source WHERE AffiliateId IN (${ph})`,
    targetIds
  );
  const sourceByAffCode = new Map();
  const lowestByAff = new Map();
  for (const s of srcRows) {
    const aff = Number(s.AffiliateId);
    const id = Number(s.Id);
    sourceByAffCode.set(`${aff}|${s.SourceCode}`, id);
    if (!lowestByAff.has(aff) || id < lowestByAff.get(aff)) lowestByAff.set(aff, id);
  }

  const [nullAffs] = await targetDb.query(
    `SELECT Id FROM Affiliate WHERE DefaultSourceId IS NULL AND Id IN (${ph})`,
    targetIds
  );
  const nullAffIds = new Set(nullAffs.map(r => Number(r.Id)));

  const stats = { matchedByCode: 0, fallbackLowestId: 0, noSourceAtAll: 0, skippedAlreadySet: 0 };
  let updated = 0;

  for (const tr of trackerRows) {
    const srcId = Number(tr.source_id);
    const tgtId = Number(tr.target_id);
    if (!nullAffIds.has(tgtId)) { stats.skippedAlreadySet++; continue; }

    const code = codeBySourceId.get(srcId);
    let srcRowId = null;
    let reason = null;

    if (code) {
      srcRowId = sourceByAffCode.get(`${tgtId}|${code}`);
      if (srcRowId) reason = 'code-match';
    }
    if (!srcRowId) {
      srcRowId = lowestByAff.get(tgtId);
      if (srcRowId) reason = 'fallback-lowest-id';
    }
    if (!srcRowId) { stats.noSourceAtAll++; continue; }

    await targetDb.query(`UPDATE Affiliate SET DefaultSourceId = ? WHERE Id = ?`, [srcRowId, tgtId]);
    if (reason === 'code-match') stats.matchedByCode++;
    else stats.fallbackLowestId++;
    updated++;
  }

  logger.info('post-runner: set-default-source-id completed', { updated, ...stats });
  return { updated, ...stats };
}

module.exports = { run };
