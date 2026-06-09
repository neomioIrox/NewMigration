/**
 * Known Issues - Check for documented problems from LESSONS_LEARNED
 */
module.exports = {
  id: 'known-issues',
  name: 'Known Issues Check',
  severity: 'warning',
  category: 'known-issues',
  entities: ['all'],

  async run(ctx) {
    const results = [];

    // === Issue: Expired projects showing as active ===
    try {
      // Projects where source EndDate is past but target RecordStatus=2 and DisplayInSite=1
      const expired = await ctx.mssql(`
        SELECT COUNT(*) as cnt FROM products WITH (NOLOCK)
        WHERE EndDate IS NOT NULL AND EndDate < GETDATE() AND Terminal = 4
      `);

      if (expired[0].cnt > 0) {
        // Check if any of these are active in target
        const expiredActive = await ctx.target(`
          SELECT COUNT(*) as cnt FROM Project p
          JOIN ProjectLocalization pl ON p.Id = pl.ProjectId AND pl.Language = 1
          WHERE p.RecordStatus = 2 AND pl.DisplayInSite = 1
        `);

        results.push({
          status: 'WARNING',
          entity: 'Expired Projects',
          message: `${expired[0].cnt} source products have expired EndDate. ${expiredActive[0].cnt} target projects are active+displayed — verify expired ones are handled`,
          details: { expiredInSource: expired[0].cnt, activeInTarget: expiredActive[0].cnt }
        });
      } else {
        results.push({
          status: 'PASS',
          entity: 'Expired Projects',
          message: 'No expired products found in source'
        });
      }
    } catch (err) {
      results.push({ status: 'SKIP', entity: 'Expired Projects', message: err.message });
    }

    // === Issue: Hidden funds incorrectly shown ===
    try {
      // Source products with Hide=1 should have DisplayInSite=0 in target
      const hiddenInSource = await ctx.mssql(`
        SELECT COUNT(*) as cnt FROM products WITH (NOLOCK)
        WHERE Hide = 1 AND Terminal = 4
      `);

      if (hiddenInSource[0].cnt > 0) {
        // Sample check: verify a few hidden products have DisplayInSite=0
        const sample = await ctx.mssql(`
          SELECT TOP 20 productsid FROM products WITH (NOLOCK)
          WHERE Hide = 1 AND Terminal = 4 ORDER BY NEWID()
        `);

        const sampleIds = sample.map(r => r.productsid);
        let incorrectCount = 0;

        for (const srcId of sampleIds) {
          const mapping = await ctx.tracker(
            'SELECT target_id FROM id_mappings WHERE entity_type = ? AND source_id = ?',
            ['Project', String(srcId)]
          );
          if (mapping.length === 0) continue;

          const loc = await ctx.target(
            'SELECT DisplayInSite FROM ProjectLocalization WHERE ProjectId = ? AND Language = 1',
            [mapping[0].target_id]
          );
          if (loc.length > 0 && loc[0].DisplayInSite === 1) {
            incorrectCount++;
          }
        }

        results.push({
          status: incorrectCount === 0 ? 'PASS' : 'FAIL',
          entity: 'Hidden Funds Display',
          message: incorrectCount === 0
            ? `${hiddenInSource[0].cnt} hidden products in source — sampled ${sampleIds.length}, all correctly hidden in target`
            : `${incorrectCount}/${sampleIds.length} sampled hidden products incorrectly show DisplayInSite=1`,
          details: { hiddenInSource: hiddenInSource[0].cnt, sampled: sampleIds.length, incorrect: incorrectCount }
        });
      }
    } catch (err) {
      results.push({ status: 'SKIP', entity: 'Hidden Funds', message: err.message });
    }

    // === Issue: ShowMainPage=0 products ===
    try {
      const noMainPage = await ctx.mssql(`
        SELECT COUNT(*) as cnt FROM products WITH (NOLOCK)
        WHERE ShowMainPage = 0 AND Hide = 0 AND Terminal = 4
      `);

      if (noMainPage[0].cnt > 0) {
        results.push({
          status: 'WARNING',
          entity: 'ShowMainPage=0 Products',
          message: `${noMainPage[0].cnt} non-hidden products have ShowMainPage=0 — these should have DisplayInSite=0 in target`,
          details: { count: noMainPage[0].cnt }
        });
      } else {
        results.push({
          status: 'PASS',
          entity: 'ShowMainPage=0 Products',
          message: 'No ShowMainPage edge cases found'
        });
      }
    } catch (err) {
      results.push({ status: 'SKIP', entity: 'ShowMainPage', message: err.message });
    }

    // === Issue: Affiliate UserId populated ===
    try {
      const nullUserId = await ctx.target(`
        SELECT COUNT(*) as cnt FROM Affiliate WHERE UserId IS NULL
      `);
      const totalAff = await ctx.target('SELECT COUNT(*) as cnt FROM Affiliate');

      const nullCount = nullUserId[0].cnt;
      const total = totalAff[0].cnt;

      results.push({
        status: nullCount === 0 ? 'PASS' : 'FAIL',
        entity: 'Affiliate.UserId',
        message: nullCount === 0
          ? `All ${total} affiliates have UserId populated`
          : `${nullCount}/${total} affiliates have NULL UserId (afterInsertMappings issue?)`,
        details: nullCount > 0 ? { nullCount, total } : undefined
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'Affiliate.UserId', message: err.message });
      }
    }

    // === Issue: Role Id=3 exists ===
    try {
      const role = await ctx.target(
        'SELECT COUNT(*) as cnt FROM `role` WHERE Id = 3'
      );

      results.push({
        status: role[0].cnt > 0 ? 'PASS' : 'FAIL',
        entity: 'Role Id=3 (Partner)',
        message: role[0].cnt > 0
          ? 'Role Id=3 exists'
          : 'Role Id=3 (Partner/שותף) missing — required for affiliate users'
      });
    } catch (err) {
      results.push({ status: 'SKIP', entity: 'Role Id=3', message: err.message });
    }

    return results;
  }
};
