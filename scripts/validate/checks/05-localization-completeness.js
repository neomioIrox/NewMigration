/**
 * Localization Completeness - Hebrew must always exist, EN/FR per conditions
 */
module.exports = {
  id: 'localization-completeness',
  name: 'Localization Completeness',
  severity: 'critical',
  category: 'completeness',
  entities: ['Project', 'Recruiter', 'Gallery'],

  async run(ctx) {
    const results = [];
    const LANG = { hebrew: 1, english: 2, french: 3 };

    // === Project Localizations ===
    if (!ctx.options.entity || ctx.options.entity === 'Project') {
      // Hebrew must exist for ALL projects
      try {
        const missing = await ctx.target(`
          SELECT p.Id FROM Project p
          LEFT JOIN ProjectLocalization pl ON p.Id = pl.ProjectId AND pl.Language = 1
          WHERE pl.Id IS NULL
        `);

        results.push({
          status: missing.length === 0 ? 'PASS' : 'FAIL',
          entity: 'Project → Hebrew Localization',
          message: missing.length === 0
            ? 'All projects have Hebrew localization'
            : `${missing.length} projects missing Hebrew localization`,
          details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => r.Id) } : undefined
        });
      } catch (err) {
        results.push({ status: 'FAIL', entity: 'Project → Hebrew', message: err.message });
      }

      // Duplicate localizations check
      try {
        const dupes = await ctx.target(`
          SELECT ProjectId, Language, COUNT(*) as cnt
          FROM ProjectLocalization
          GROUP BY ProjectId, Language
          HAVING cnt > 1
        `);

        results.push({
          status: dupes.length === 0 ? 'PASS' : 'FAIL',
          entity: 'ProjectLocalization duplicates',
          message: dupes.length === 0
            ? 'No duplicate localizations'
            : `${dupes.length} duplicate ProjectLocalization entries`,
          details: dupes.length > 0 ? { samples: dupes.slice(0, 5) } : undefined
        });
      } catch (err) {
        results.push({ status: 'FAIL', entity: 'ProjectLocalization duplicates', message: err.message });
      }

      // ProjectItem must have Hebrew localization
      try {
        const missing = await ctx.target(`
          SELECT pi.Id, pi.ProjectId FROM ProjectItem pi
          LEFT JOIN ProjectItemLocalization pil ON pi.Id = pil.ItemId AND pil.Language = 1
          WHERE pil.Id IS NULL
        `);

        results.push({
          status: missing.length === 0 ? 'PASS' : 'FAIL',
          entity: 'ProjectItem → Hebrew Localization',
          message: missing.length === 0
            ? 'All items have Hebrew localization'
            : `${missing.length} items missing Hebrew localization`,
          details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => r.Id) } : undefined
        });
      } catch (err) {
        results.push({ status: 'FAIL', entity: 'ProjectItem → Hebrew', message: err.message });
      }

      // Duplicate ProjectItemLocalization
      try {
        const dupes = await ctx.target(`
          SELECT ItemId, Language, COUNT(*) as cnt
          FROM ProjectItemLocalization
          GROUP BY ItemId, Language
          HAVING cnt > 1
        `);

        results.push({
          status: dupes.length === 0 ? 'PASS' : 'FAIL',
          entity: 'ProjectItemLocalization duplicates',
          message: dupes.length === 0
            ? 'No duplicates'
            : `${dupes.length} duplicate ProjectItemLocalization entries`,
          details: dupes.length > 0 ? { samples: dupes.slice(0, 5) } : undefined
        });
      } catch (err) {
        results.push({ status: 'FAIL', entity: 'ProjectItemLocalization duplicates', message: err.message });
      }

      // EN/FR localization counts sanity check
      for (const [lang, langId] of Object.entries(LANG)) {
        if (lang === 'hebrew') continue;
        try {
          const countRows = await ctx.target(
            'SELECT COUNT(*) as cnt FROM ProjectLocalization WHERE Language = ?',
            [langId]
          );
          const hebrewCountRows = await ctx.target(
            'SELECT COUNT(*) as cnt FROM ProjectLocalization WHERE Language = 1'
          );

          const langCount = countRows[0].cnt;
          const hebrewCount = hebrewCountRows[0].cnt;
          const pct = hebrewCount > 0 ? ((langCount / hebrewCount) * 100).toFixed(1) : 0;

          results.push({
            status: langCount > 0 ? 'PASS' : 'WARNING',
            entity: `Project → ${lang} Localization`,
            message: `${langCount} records (${pct}% of Hebrew count ${hebrewCount})`
          });
        } catch (err) {
          results.push({ status: 'FAIL', entity: `Project → ${lang}`, message: err.message });
        }
      }
    }

    // === Gallery Localizations ===
    if (!ctx.options.entity || ctx.options.entity === 'Gallery') {
      try {
        const missing = await ctx.target(`
          SELECT g.Id FROM Gallery g
          LEFT JOIN GalleryLocalization gl ON g.Id = gl.GalleryId AND gl.Language = 1
          WHERE gl.Id IS NULL
        `);

        results.push({
          status: missing.length === 0 ? 'PASS' : 'FAIL',
          entity: 'Gallery → Hebrew Localization',
          message: missing.length === 0
            ? 'All galleries have Hebrew localization'
            : `${missing.length} galleries missing Hebrew localization`,
          details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => r.Id) } : undefined
        });
      } catch (err) {
        if (!err.message.includes("doesn't exist")) {
          results.push({ status: 'FAIL', entity: 'Gallery → Hebrew', message: err.message });
        } else {
          results.push({ status: 'SKIP', entity: 'Gallery → Hebrew', message: 'Table not found' });
        }
      }
    }

    // === Recruiter Localizations ===
    if (!ctx.options.entity || ctx.options.entity === 'Recruiter') {
      try {
        const missing = await ctx.target(`
          SELECT r.Id FROM Recruiter r
          LEFT JOIN RecruiterLocalization rl ON r.Id = rl.RecruiterId AND rl.Language = 1
          WHERE rl.Id IS NULL
        `);

        results.push({
          status: missing.length === 0 ? 'PASS' : 'FAIL',
          entity: 'Recruiter → Hebrew Localization',
          message: missing.length === 0
            ? 'All recruiters have Hebrew localization'
            : `${missing.length} recruiters missing Hebrew localization`,
          details: missing.length > 0 ? { missingIds: missing.slice(0, 10).map(r => r.Id) } : undefined
        });
      } catch (err) {
        if (!err.message.includes("doesn't exist")) {
          results.push({ status: 'FAIL', entity: 'Recruiter → Hebrew', message: err.message });
        } else {
          results.push({ status: 'SKIP', entity: 'Recruiter → Hebrew', message: 'Table not found' });
        }
      }
    }

    return results;
  }
};
