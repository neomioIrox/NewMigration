/**
 * Truncation Warnings - Data that was silently truncated during migration
 */
const mappingLoader = require('../lib/mapping-loader');

module.exports = {
  id: 'truncation-warnings',
  name: 'Truncation Warnings',
  severity: 'info',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];
    const truncations = mappingLoader.getStringTruncations();

    // Group by source table for efficient querying
    const bySource = new Map();
    for (const t of truncations) {
      const entity = ctx.mappings.entities.find(e => e.mappingName === t.mappingName);
      if (!entity) continue;

      const key = entity.sourceTable;
      if (!bySource.has(key)) bySource.set(key, { entity, checks: [] });
      bySource.get(key).checks.push(t);
    }

    for (const [sourceTable, { entity, checks }] of bySource) {
      if (ctx.options.entity && entity.entityType !== ctx.options.entity) continue;

      for (const check of checks) {
        if (!check.sourceColumn) continue;

        try {
          let sql;
          if (entity.sourceQuery) {
            sql = `WITH src AS (${entity.sourceQuery}) SELECT COUNT(*) as cnt FROM src WHERE LEN([${check.sourceColumn}]) > ${check.maxLength}`;
          } else {
            const where = entity.whereClause ? `WHERE ${entity.whereClause} AND` : 'WHERE';
            sql = `SELECT COUNT(*) as cnt FROM [${sourceTable}] WITH (NOLOCK) ${where} LEN([${check.sourceColumn}]) > ${check.maxLength}`;
          }

          const rows = await ctx.mssql(sql);
          const truncatedCount = rows[0].cnt;

          // Get total for context
          let totalSql;
          if (entity.sourceQuery) {
            totalSql = `WITH src AS (${entity.sourceQuery}) SELECT COUNT(*) as cnt FROM src WHERE [${check.sourceColumn}] IS NOT NULL`;
          } else {
            const where = entity.whereClause ? `WHERE ${entity.whereClause} AND` : 'WHERE';
            totalSql = `SELECT COUNT(*) as cnt FROM [${sourceTable}] WITH (NOLOCK) ${where} [${check.sourceColumn}] IS NOT NULL`;
          }
          const totalRows = await ctx.mssql(totalSql);
          const total = totalRows[0].cnt;

          const lang = check.language ? ` (${check.language})` : '';
          const label = `${entity.entityType}.${check.field}${lang}`;

          if (truncatedCount === 0) {
            results.push({
              status: 'PASS',
              entity: label,
              message: `No values exceeded ${check.maxLength} chars (${total} total)`
            });
          } else {
            const pct = total > 0 ? ((truncatedCount / total) * 100).toFixed(1) : '0';
            results.push({
              status: truncatedCount > total * 0.1 ? 'WARNING' : 'PASS',
              entity: label,
              message: `${truncatedCount}/${total} values truncated at ${check.maxLength} chars (${pct}%)`,
              details: { truncatedCount, total, maxLength: check.maxLength, sourceColumn: check.sourceColumn }
            });
          }
        } catch (err) {
          // Some columns might not exist in source
          if (!err.message.includes('Invalid column')) {
            results.push({
              status: 'SKIP',
              entity: `${entity.entityType}.${check.field}`,
              message: `Could not check: ${err.message}`
            });
          }
        }
      }
    }

    // Also check known truncations not auto-discovered
    const manualChecks = [
      { source: 'AsakimDonations', col: 'CardName', maxLen: 100, label: 'AsakimDonation.CardName' },
      { source: 'ParentSources', col: 'UserName', maxLen: 20, label: 'User.UserName (from Affiliate)' }
    ];

    for (const mc of manualChecks) {
      try {
        const rows = await ctx.mssql(
          `SELECT COUNT(*) as cnt FROM [${mc.source}] WITH (NOLOCK) WHERE LEN([${mc.col}]) > ${mc.maxLen}`
        );
        const truncated = rows[0].cnt;

        results.push({
          status: truncated === 0 ? 'PASS' : 'WARNING',
          entity: mc.label,
          message: truncated === 0
            ? `No values exceed ${mc.maxLen} chars`
            : `${truncated} values would be truncated at ${mc.maxLen} chars`
        });
      } catch (err) {
        // Skip
      }
    }

    return results;
  }
};
