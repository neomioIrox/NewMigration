/**
 * Data Integrity Spot-Checks - Sample rows and verify field transformations
 */
module.exports = {
  id: 'data-integrity',
  name: 'Data Integrity Spot-Checks',
  severity: 'critical',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];
    const sampleSize = Math.min(ctx.options.sampleSize, 50);

    // === Affiliate: Name transformation ===
    await checkEntity(ctx, results, {
      entityType: 'Affiliate',
      sourceTable: 'ParentSources',
      sourceIdCol: 'Id',
      targetTable: 'Affiliate',
      checks: [
        {
          name: 'Name truncation',
          verify: (src, tgt) => {
            const expected = src.Name ? src.Name.substring(0, 100) : 'ללא שם';
            return tgt.Name === expected;
          },
          format: (src, tgt) => `Source: "${src.Name}" → Target: "${tgt.Name}"`
        },
        {
          name: 'RecordStatus = 2',
          verify: (src, tgt) => String(tgt.RecordStatus) === '2',
          format: (src, tgt) => `RecordStatus: ${tgt.RecordStatus}`
        }
      ],
      sampleSize
    });

    // === Source: AffiliateId FK resolved ===
    await checkEntity(ctx, results, {
      entityType: 'Source',
      sourceTable: 'UserSources',
      sourceIdCol: 'UserSourcesId',
      targetTable: 'Source',
      sourceQuery: "SELECT us.* FROM UserSources us WITH (NOLOCK) WHERE us.ParentSourcesId IS NOT NULL AND EXISTS (SELECT 1 FROM ParentSources ps WHERE ps.Id = us.ParentSourcesId)",
      checks: [
        {
          name: 'AffiliateId resolved (not NULL)',
          verify: (src, tgt) => tgt.AffiliateId != null,
          format: (src, tgt) => `ParentSourcesId: ${src.ParentSourcesId} → AffiliateId: ${tgt.AffiliateId}`
        },
        {
          name: 'SourceCode from Name',
          verify: (src, tgt) => {
            if (!src.Name) return tgt.SourceCode === 'unknown';
            return tgt.SourceCode === src.Name.substring(0, 50);
          },
          format: (src, tgt) => `Name: "${src.Name}" → SourceCode: "${tgt.SourceCode}"`
        }
      ],
      sampleSize
    });

    // === Project: ProjectType and Name ===
    await checkEntity(ctx, results, {
      entityType: 'Project',
      sourceTable: 'products',
      sourceIdCol: 'productsid',
      targetTable: 'Project',
      checks: [
        {
          name: 'Name truncated to 150',
          verify: (src, tgt) => {
            if (!src.Name) return tgt.Name === null;
            return tgt.Name === src.Name.substring(0, 150);
          },
          format: (src, tgt) => `"${src.Name?.substring(0, 30)}..." → "${tgt.Name?.substring(0, 30)}..."`
        },
        {
          name: 'RecordStatus = 2',
          verify: (src, tgt) => String(tgt.RecordStatus) === '2',
          format: (src, tgt) => `RecordStatus: ${tgt.RecordStatus}`
        }
      ],
      sampleSize
    });

    return results;
  }
};

async function checkEntity(ctx, results, config) {
  const { entityType, sourceTable, sourceIdCol, targetTable, checks, sampleSize, sourceQuery } = config;

  if (ctx.options.entity && ctx.options.entity !== entityType) return;

  try {
    const pairs = await ctx.sample.samplePairs(
      entityType, sourceTable, sourceIdCol, targetTable,
      null, sourceQuery, sampleSize
    );

    if (pairs.length === 0) {
      results.push({
        status: 'SKIP',
        entity: entityType,
        message: 'No paired rows found for sampling'
      });
      return;
    }

    for (const check of checks) {
      let passed = 0;
      let failed = 0;
      const failures = [];

      for (const pair of pairs) {
        try {
          if (check.verify(pair.sourceRow, pair.targetRow)) {
            passed++;
          } else {
            failed++;
            if (failures.length < 3) {
              failures.push({
                sourceId: pair.sourceId,
                targetId: pair.targetId,
                detail: check.format(pair.sourceRow, pair.targetRow)
              });
            }
          }
        } catch (e) {
          failed++;
        }
      }

      results.push({
        status: failed === 0 ? 'PASS' : failed > pairs.length * 0.1 ? 'FAIL' : 'WARNING',
        entity: `${entityType} → ${check.name}`,
        message: `${passed}/${pairs.length} passed`,
        details: failures.length > 0 ? { failures } : undefined
      });
    }
  } catch (err) {
    results.push({
      status: 'SKIP',
      entity: entityType,
      message: `Could not verify: ${err.message}`
    });
  }
}
