/**
 * Affiliate/Source Re-run Validation.
 * Verifies success criteria after running the ParentSources→affiliate and
 * UserSources→source migrations (plus the post-migration DefaultSourceId step).
 */
module.exports = {
  id: 'affiliate-source-rerun',
  name: 'Affiliate / Source Re-run Validation',
  severity: 'critical',
  category: 'completeness',
  entities: ['Affiliate', 'Source', 'all'],

  async run(ctx) {
    const results = [];

    const [psTotal] = await ctx.mssql(`SELECT COUNT(*) AS cnt FROM ParentSources WITH (NOLOCK)`);
    const [affTotal] = await ctx.target(`SELECT COUNT(*) AS cnt FROM Affiliate`);
    if (affTotal.cnt === psTotal.cnt) {
      results.push({ status: 'PASS', entity: 'affiliate', message: `affiliate count = ParentSources count = ${psTotal.cnt}` });
    } else {
      results.push({
        status: 'FAIL',
        entity: 'affiliate',
        message: `affiliate count (${affTotal.cnt}) ≠ ParentSources count (${psTotal.cnt})`,
        details: { affiliate: affTotal.cnt, parentSources: psTotal.cnt }
      });
    }

    const [affNullUser] = await ctx.target(`SELECT COUNT(*) AS cnt FROM Affiliate WHERE UserId IS NULL`);
    if (affNullUser.cnt === 0) {
      results.push({ status: 'PASS', entity: 'affiliate', message: 'All affiliates have UserId set' });
    } else {
      const sample = await ctx.target(`SELECT Id, Name FROM Affiliate WHERE UserId IS NULL ORDER BY Id LIMIT 10`);
      results.push({
        status: 'FAIL',
        entity: 'affiliate',
        message: `${affNullUser.cnt} affiliates have UserId = NULL`,
        details: { count: affNullUser.cnt, sample }
      });
    }

    const [affNullDsi] = await ctx.target(`SELECT COUNT(*) AS cnt FROM Affiliate WHERE DefaultSourceId IS NULL`);
    if (affNullDsi.cnt === 0) {
      results.push({ status: 'PASS', entity: 'affiliate', message: 'All affiliates have DefaultSourceId set' });
    } else {
      const sample = await ctx.target(`SELECT Id, Name FROM Affiliate WHERE DefaultSourceId IS NULL ORDER BY Id LIMIT 10`);
      results.push({
        status: 'WARNING',
        entity: 'affiliate',
        message: `${affNullDsi.cnt} affiliates have DefaultSourceId = NULL (run 03-set-default-source-id.js)`,
        details: { count: affNullDsi.cnt, sample }
      });
    }

    const [usMigratable] = await ctx.mssql(`
      SELECT COUNT(*) AS cnt
      FROM UserSources us WITH (NOLOCK)
      WHERE us.ParentSourcesId IS NOT NULL
        AND EXISTS (SELECT 1 FROM ParentSources ps WITH (NOLOCK) WHERE ps.Id = us.ParentSourcesId)
    `);
    const [srcTotal] = await ctx.target(`SELECT COUNT(*) AS cnt FROM Source`);
    if (srcTotal.cnt === usMigratable.cnt) {
      results.push({ status: 'PASS', entity: 'source', message: `source count = UserSources-migratable count = ${usMigratable.cnt}` });
    } else {
      results.push({
        status: 'FAIL',
        entity: 'source',
        message: `source count (${srcTotal.cnt}) ≠ UserSources-migratable (${usMigratable.cnt})`,
        details: { source: srcTotal.cnt, userSourcesMigratable: usMigratable.cnt }
      });
    }

    const [bothEmpty] = await ctx.mssql(`
      SELECT COUNT(*) AS cnt
      FROM UserSources us WITH (NOLOCK)
      WHERE us.ParentSourcesId IS NOT NULL
        AND EXISTS (SELECT 1 FROM ParentSources ps WITH (NOLOCK) WHERE ps.Id = us.ParentSourcesId)
        AND (us.Title IS NULL OR LTRIM(RTRIM(us.Title))='')
        AND (us.Name  IS NULL OR LTRIM(RTRIM(us.Name))='')
    `);
    const [srcNullDesc] = await ctx.target(`SELECT COUNT(*) AS cnt FROM Source WHERE Description IS NULL`);
    if (srcNullDesc.cnt === bothEmpty.cnt) {
      results.push({
        status: 'PASS',
        entity: 'source',
        message: `source.Description NULLs (${srcNullDesc.cnt}) match UserSources where Title+Name both empty`
      });
    } else if (srcNullDesc.cnt > bothEmpty.cnt) {
      results.push({
        status: 'FAIL',
        entity: 'source',
        message: `source.Description NULLs (${srcNullDesc.cnt}) exceed expected ${bothEmpty.cnt} (Title+Name both empty in source)`,
        details: { descriptionNull: srcNullDesc.cnt, expectedMax: bothEmpty.cnt }
      });
    } else {
      results.push({
        status: 'WARNING',
        entity: 'source',
        message: `source.Description NULLs (${srcNullDesc.cnt}) less than expected ceiling ${bothEmpty.cnt} — unexpected but acceptable`
      });
    }

    const [srcBadFk] = await ctx.target(`
      SELECT COUNT(*) AS cnt FROM Source s
      LEFT JOIN Affiliate a ON a.Id = s.AffiliateId
      WHERE s.AffiliateId IS NOT NULL AND a.Id IS NULL
    `);
    if (srcBadFk.cnt === 0) {
      results.push({ status: 'PASS', entity: 'source', message: 'All source.AffiliateId reference an existing affiliate' });
    } else {
      results.push({
        status: 'FAIL',
        entity: 'source',
        message: `${srcBadFk.cnt} source rows have orphaned AffiliateId`,
        details: { count: srcBadFk.cnt }
      });
    }

    const [affUserOrphan] = await ctx.target(`
      SELECT COUNT(*) AS cnt FROM Affiliate a
      LEFT JOIN User u ON u.Id = a.UserId
      WHERE a.UserId IS NOT NULL AND u.Id IS NULL
    `);
    if (affUserOrphan.cnt === 0) {
      results.push({ status: 'PASS', entity: 'affiliate', message: 'All affiliate.UserId reference an existing user' });
    } else {
      results.push({
        status: 'FAIL',
        entity: 'affiliate',
        message: `${affUserOrphan.cnt} affiliate rows have orphaned UserId`,
        details: { count: affUserOrphan.cnt }
      });
    }

    const trackerCounts = {};
    for (const et of ['AffiliateMapping', 'AffiliateUser', 'SourceMapping']) {
      const rows = await ctx.tracker(`SELECT COUNT(*) AS cnt FROM id_mappings WHERE entity_type = ?`, [et]);
      trackerCounts[et] = rows[0].cnt;
    }
    const missing = Object.entries(trackerCounts).filter(([, n]) => n === 0).map(([k]) => k);
    if (missing.length === 0) {
      results.push({
        status: 'PASS',
        entity: 'tracker',
        message: `id_mappings populated: AffiliateMapping=${trackerCounts.AffiliateMapping}, AffiliateUser=${trackerCounts.AffiliateUser}, SourceMapping=${trackerCounts.SourceMapping}`
      });
    } else {
      results.push({
        status: 'FAIL',
        entity: 'tracker',
        message: `id_mappings empty for: ${missing.join(', ')}`,
        details: trackerCounts
      });
    }

    const affUserIdsRows = await ctx.target(`SELECT DISTINCT UserId FROM Affiliate WHERE UserId IS NOT NULL`);
    const affUserIds = affUserIdsRows.map(r => Number(r.UserId));
    if (affUserIds.length > 0) {
      const placeholders = affUserIds.map(() => '?').join(',');
      const notInTracker = await ctx.tracker(
        `SELECT COUNT(DISTINCT target_id) AS cnt FROM id_mappings WHERE entity_type = 'AffiliateUser' AND target_id IN (${placeholders})`,
        affUserIds
      );
      const trackedUsers = notInTracker[0].cnt;
      if (trackedUsers >= affUserIds.length) {
        results.push({
          status: 'PASS',
          entity: 'user',
          message: `All ${affUserIds.length} affiliate-user links are in tracker`
        });
      } else {
        results.push({
          status: 'WARNING',
          entity: 'user',
          message: `${affUserIds.length - trackedUsers} affiliate users not recorded in tracker AffiliateUser mapping`,
          details: { affiliateUserIds: affUserIds.length, trackedInMappings: trackedUsers }
        });
      }
    }

    return results;
  }
};
