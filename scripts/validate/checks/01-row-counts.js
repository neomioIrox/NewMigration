/**
 * Row Count Validation - Compare source vs target counts per entity
 */
module.exports = {
  id: 'row-counts',
  name: 'Row Count Validation',
  severity: 'critical',
  category: 'completeness',
  entities: ['all'],

  async run(ctx) {
    const results = [];
    const entities = ctx.mappings.entities;

    for (const entity of entities) {
      if (ctx.options.entity && entity.entityType !== ctx.options.entity) continue;

      try {
        // Count source rows
        let sourceCount;
        if (entity.sourceQuery) {
          const srcRows = await ctx.mssql(`WITH src AS (${entity.sourceQuery}) SELECT COUNT(*) as cnt FROM src`);
          sourceCount = srcRows[0].cnt;
        } else {
          const where = entity.whereClause ? `WHERE ${entity.whereClause}` : '';
          const srcRows = await ctx.mssql(
            `SELECT COUNT(*) as cnt FROM [${entity.sourceTable}] WITH (NOLOCK) ${where}`
          );
          sourceCount = srcRows[0].cnt;
        }

        // Count target rows - entity-specific for shared tables
        let targetCount;
        if (entity.targetTable === 'Project' && entity.mapping.columnMappings.ProjectType) {
          const projType = entity.mapping.columnMappings.ProjectType.value;
          const rows = await ctx.target(
            'SELECT COUNT(*) as cnt FROM `Project` WHERE ProjectType = ?',
            [projType]
          );
          targetCount = rows[0].cnt;
        } else {
          const rows = await ctx.target(`SELECT COUNT(*) as cnt FROM \`${entity.targetTable}\``);
          targetCount = rows[0].cnt;
        }

        // Count id_mappings
        const mappingRows = await ctx.tracker(
          'SELECT COUNT(*) as cnt FROM id_mappings WHERE entity_type = ?',
          [entity.entityType]
        );
        const mappingCount = mappingRows[0].cnt;

        // Evaluate
        const delta = sourceCount - mappingCount;
        const entityLabel = `${entity.entityType} (${entity.mappingName})`;

        if (mappingCount === 0 && sourceCount > 0) {
          results.push({
            status: 'FAIL',
            entity: entityLabel,
            message: `No rows migrated! Source: ${sourceCount}, Target: ${targetCount}, Mapped: 0`,
            details: { sourceCount, targetCount, mappingCount }
          });
        } else if (delta > 0 && delta > sourceCount * 0.01) {
          results.push({
            status: 'FAIL',
            entity: entityLabel,
            message: `Missing rows: Source: ${sourceCount}, Mapped: ${mappingCount} (${delta} missing, ${((delta / sourceCount) * 100).toFixed(1)}%)`,
            details: { sourceCount, targetCount, mappingCount, missing: delta }
          });
        } else if (delta > 0) {
          results.push({
            status: 'WARNING',
            entity: entityLabel,
            message: `Minor gap: Source: ${sourceCount}, Mapped: ${mappingCount} (${delta} skipped, likely filtered/errors)`,
            details: { sourceCount, targetCount, mappingCount, missing: delta }
          });
        } else {
          results.push({
            status: 'PASS',
            entity: entityLabel,
            message: `Source: ${sourceCount}, Target: ${targetCount}, Mapped: ${mappingCount}`
          });
        }
      } catch (err) {
        results.push({
          status: 'FAIL',
          entity: entity.entityType,
          message: `Error counting: ${err.message}`
        });
      }
    }

    // Special engines: Donation, PrayName, AsakimDonation (counted from tracker)
    const specialEntities = [
      { entityType: 'Donation', targetTable: 'Donation', sourceTable: 'Orders', sourceQuery: "SELECT * FROM Orders WITH (NOLOCK) WHERE ChargeStatus = 'OrderFinished'" },
      { entityType: 'PrayName', targetTable: 'PrayName', sourceTable: 'PrayerNames', sourceQuery: "SELECT pn.* FROM PrayerNames pn WITH (NOLOCK) INNER JOIN Orders o WITH (NOLOCK) ON pn.OrderId = o.OrdersId WHERE o.ChargeStatus = 'OrderFinished'" }
    ];

    for (const sp of specialEntities) {
      if (ctx.options.entity && sp.entityType !== ctx.options.entity) continue;
      try {
        const srcRows = await ctx.mssql(`WITH src AS (${sp.sourceQuery}) SELECT COUNT(*) as cnt FROM src`);
        const sourceCount = srcRows[0].cnt;

        const tgtRows = await ctx.target(`SELECT COUNT(*) as cnt FROM \`${sp.targetTable}\``);
        const targetCount = tgtRows[0].cnt;

        const mapRows = await ctx.tracker(
          'SELECT COUNT(*) as cnt FROM id_mappings WHERE entity_type = ?',
          [sp.entityType]
        );
        const mappingCount = mapRows[0].cnt;

        const delta = sourceCount - targetCount;
        if (targetCount === 0 && sourceCount > 0) {
          results.push({
            status: 'FAIL',
            entity: sp.entityType,
            message: `No rows migrated! Source: ${sourceCount}, Target: 0`,
            details: { sourceCount, targetCount, mappingCount }
          });
        } else if (Math.abs(delta) > sourceCount * 0.01) {
          results.push({
            status: delta > 0 ? 'FAIL' : 'WARNING',
            entity: sp.entityType,
            message: `Count mismatch: Source: ${sourceCount}, Target: ${targetCount} (diff: ${delta})`,
            details: { sourceCount, targetCount, mappingCount }
          });
        } else {
          results.push({
            status: 'PASS',
            entity: sp.entityType,
            message: `Source: ${sourceCount}, Target: ${targetCount}, Mapped: ${mappingCount}`
          });
        }
      } catch (err) {
        results.push({
          status: 'SKIP',
          entity: sp.entityType,
          message: `Could not count: ${err.message}`
        });
      }
    }

    return results;
  }
};
