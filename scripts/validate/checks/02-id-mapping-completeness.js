/**
 * ID Mapping Completeness - All source IDs should have target mappings
 */
module.exports = {
  id: 'id-mapping-completeness',
  name: 'ID Mapping Completeness',
  severity: 'critical',
  category: 'completeness',
  entities: ['all'],

  async run(ctx) {
    const results = [];
    const entities = ctx.mappings.entities;

    for (const entity of entities) {
      if (ctx.options.entity && entity.entityType !== ctx.options.entity) continue;

      try {
        // Get sample of source IDs that should exist
        const sampleSize = ctx.options.sampleSize;
        let sampleIds;

        if (entity.sourceQuery) {
          const rows = await ctx.mssql(
            `WITH src AS (${entity.sourceQuery}) SELECT TOP ${sampleSize} [${entity.sourceIdColumn}] FROM src ORDER BY NEWID()`
          );
          sampleIds = rows.map(r => r[entity.sourceIdColumn]);
        } else {
          const where = entity.whereClause ? `WHERE ${entity.whereClause}` : '';
          const rows = await ctx.mssql(
            `SELECT TOP ${sampleSize} [${entity.sourceIdColumn}] FROM [${entity.sourceTable}] WITH (NOLOCK) ${where} ORDER BY NEWID()`
          );
          sampleIds = rows.map(r => r[entity.sourceIdColumn]);
        }

        if (sampleIds.length === 0) {
          results.push({
            status: 'SKIP',
            entity: entity.entityType,
            message: 'No source rows found'
          });
          continue;
        }

        // Check which ones have mappings
        const placeholders = sampleIds.map(() => '?').join(',');
        const mapped = await ctx.tracker(
          `SELECT source_id FROM id_mappings WHERE entity_type = ? AND source_id IN (${placeholders})`,
          [entity.entityType, ...sampleIds.map(String)]
        );

        const mappedSet = new Set(mapped.map(r => String(r.source_id)));
        const unmapped = sampleIds.filter(id => !mappedSet.has(String(id)));
        const unmappedPct = ((unmapped.length / sampleIds.length) * 100).toFixed(1);

        if (unmapped.length === 0) {
          results.push({
            status: 'PASS',
            entity: entity.entityType,
            message: `All ${sampleIds.length} sampled source IDs found in id_mappings`
          });
        } else if (unmapped.length === sampleIds.length) {
          results.push({
            status: 'FAIL',
            entity: entity.entityType,
            message: `No sampled IDs found in id_mappings (${unmapped.length}/${sampleIds.length})`,
            details: { unmappedSample: unmapped.slice(0, 10) }
          });
        } else {
          results.push({
            status: unmapped.length > sampleIds.length * 0.05 ? 'FAIL' : 'WARNING',
            entity: entity.entityType,
            message: `${unmapped.length}/${sampleIds.length} sampled IDs missing from id_mappings (${unmappedPct}%)`,
            details: { unmappedSample: unmapped.slice(0, 10), total: unmapped.length }
          });
        }
      } catch (err) {
        results.push({
          status: 'FAIL',
          entity: entity.entityType,
          message: `Error checking: ${err.message}`
        });
      }
    }

    return results;
  }
};
