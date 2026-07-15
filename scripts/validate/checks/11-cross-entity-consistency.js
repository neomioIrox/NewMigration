/**
 * Cross-Entity Consistency - Every Project should have its related records
 */
module.exports = {
  id: 'cross-entity-consistency',
  name: 'Cross-Entity Consistency',
  severity: 'critical',
  category: 'consistency',
  entities: ['Project'],

  async run(ctx) {
    const results = [];

    // === Projects must have ProjectItem ===
    try {
      const missing = await ctx.target(`
        SELECT p.Id, p.Name FROM Project p
        LEFT JOIN ProjectItem pi ON p.Id = pi.ProjectId
        WHERE pi.Id IS NULL
      `);

      results.push({
        status: missing.length === 0 ? 'PASS' : 'FAIL',
        entity: 'Project → ProjectItem',
        message: missing.length === 0
          ? 'All projects have at least one ProjectItem'
          : `${missing.length} projects without any ProjectItem`,
        details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => ({ id: r.Id, name: r.Name })) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Project → ProjectItem', message: err.message });
    }

    // === Projects must have Hebrew ProjectLocalization ===
    try {
      const missing = await ctx.target(`
        SELECT p.Id, p.Name FROM Project p
        LEFT JOIN ProjectLocalization pl ON p.Id = pl.ProjectId AND pl.Language = 1
        WHERE pl.Id IS NULL
      `);

      results.push({
        status: missing.length === 0 ? 'PASS' : 'FAIL',
        entity: 'Project → ProjectLocalization (Hebrew)',
        message: missing.length === 0
          ? 'All projects have Hebrew localization'
          : `${missing.length} projects missing Hebrew ProjectLocalization`,
        details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => r.Id) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Project → ProjectLocalization', message: err.message });
    }

    // === Projects must have Hebrew LinkSettings ===
    try {
      const projectCount = await ctx.target('SELECT COUNT(*) as cnt FROM Project');
      const withLinks = await ctx.target(`
        SELECT COUNT(DISTINCT ProjectId) as cnt FROM LinkSetting WHERE Language = 1
      `);

      const total = projectCount[0].cnt;
      const linked = withLinks[0].cnt;
      const missing = total - linked;

      results.push({
        status: missing === 0 ? 'PASS' : missing > total * 0.05 ? 'FAIL' : 'WARNING',
        entity: 'Project → LinkSetting (Hebrew)',
        message: `${linked}/${total} projects have Hebrew LinkSettings${missing > 0 ? ` (${missing} missing)` : ''}`
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Project → LinkSetting', message: err.message });
    }

    // === Each ProjectItem must have Hebrew ProjectItemLocalization ===
    try {
      const missing = await ctx.target(`
        SELECT pi.Id, pi.ProjectId FROM ProjectItem pi
        LEFT JOIN ProjectItemLocalization pil ON pi.Id = pil.ItemId AND pil.Language = 1
        WHERE pil.Id IS NULL
      `);

      results.push({
        status: missing.length === 0 ? 'PASS' : 'FAIL',
        entity: 'ProjectItem → ProjectItemLocalization (Hebrew)',
        message: missing.length === 0
          ? 'All items have Hebrew localization'
          : `${missing.length} items missing Hebrew ProjectItemLocalization`,
        details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => r.Id) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'ProjectItem → ProjectItemLocalization', message: err.message });
    }

    // === LinkSetting count per project ===
    try {
      // Funds should have 3 button types * languages
      const tooFew = await ctx.target(`
        SELECT p.Id, p.Name, COUNT(ls.Id) as linkCount
        FROM Project p
        LEFT JOIN LinkSetting ls ON p.Id = ls.ProjectId AND ls.Language = 1
        GROUP BY p.Id, p.Name
        HAVING linkCount > 0 AND linkCount < 3
        LIMIT 10
      `);

      results.push({
        status: tooFew.length === 0 ? 'PASS' : 'WARNING',
        entity: 'Project → LinkSetting count',
        message: tooFew.length === 0
          ? 'All projects with links have >= 3 Hebrew LinkSettings'
          : `${tooFew.length} projects with fewer than 3 Hebrew LinkSettings`,
        details: tooFew.length > 0 ? { samples: tooFew.slice(0, 5).map(r => ({ id: r.Id, count: r.linkCount })) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Project → LinkSetting count', message: err.message });
    }

    // === EntityContent for projects with descriptions ===
    try {
      const withContent = await ctx.target(`
        SELECT COUNT(*) as cnt FROM ProjectLocalization
        WHERE ContentId IS NOT NULL AND Language = 1
      `);
      const totalLoc = await ctx.target(`
        SELECT COUNT(*) as cnt FROM ProjectLocalization WHERE Language = 1
      `);

      const contentCount = withContent[0].cnt;
      const totalCount = totalLoc[0].cnt;
      const pct = totalCount > 0 ? ((contentCount / totalCount) * 100).toFixed(1) : 0;

      results.push({
        status: 'PASS',
        entity: 'ProjectLocalization → EntityContent',
        message: `${contentCount}/${totalCount} Hebrew localizations have ContentId (${pct}%)`
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'ProjectLocalization → EntityContent', message: err.message });
    }

    // === Media for projects ===
    try {
      const withMedia = await ctx.target(`
        SELECT COUNT(*) as cnt FROM ProjectLocalization
        WHERE MainMedia IS NOT NULL AND Language = 1
      `);
      const totalLoc = await ctx.target(`
        SELECT COUNT(*) as cnt FROM ProjectLocalization WHERE Language = 1
      `);

      const mediaCount = withMedia[0].cnt;
      const totalCount = totalLoc[0].cnt;
      const pct = totalCount > 0 ? ((mediaCount / totalCount) * 100).toFixed(1) : 0;

      results.push({
        status: 'PASS',
        entity: 'ProjectLocalization → Media',
        message: `${mediaCount}/${totalCount} Hebrew localizations have MainMedia (${pct}%)`
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'ProjectLocalization → Media', message: err.message });
    }

    return results;
  }
};
