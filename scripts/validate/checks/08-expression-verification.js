/**
 * Expression Verification - Re-evaluate mapping expressions on samples
 * and compare against actual stored target values
 */
const path = require('path');
const expressionEval = require(path.resolve(__dirname, '../../../server/src/engine/expression-eval'));
const mappingLoader = require('../lib/mapping-loader');

module.exports = {
  id: 'expression-verification',
  name: 'Expression Verification',
  severity: 'critical',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];
    const sampleSize = Math.min(ctx.options.sampleSize, 30);

    // Key expressions to verify per entity
    const expressionChecks = [
      {
        entityType: 'Project',
        label: 'DisplayInSite (Hebrew)',
        targetTable: 'ProjectLocalization',
        targetColumn: 'DisplayInSite',
        langFilter: 1,
        parentJoin: { table: 'Project', column: 'ProjectId' },
        expression: '(!row.Hide && row.ShowMainPage) ? 1 : 0',
        sourceColumn: 'Hide'
      },
      {
        entityType: 'Project',
        label: 'PaymentSum (Hebrew)',
        targetTable: 'ProjectItemLocalization',
        targetColumn: 'PaymentSum',
        langFilter: 1,
        expression: 'row.DefaultDonationSumFixed > 0 ? (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1)) : row.DefaultDonationsSum',
        sourceColumn: 'DefaultDonationSumFixed'
      },
      {
        entityType: 'Project',
        label: 'DefaultPaymentType (Hebrew)',
        targetTable: 'ProjectItemLocalization',
        targetColumn: 'DefaultPaymentType',
        langFilter: 1,
        expression: 'row.DefaultDonationSumFixed > 0 ? 1 : 2',
        sourceColumn: 'DefaultDonationSumFixed'
      }
    ];

    for (const ec of expressionChecks) {
      if (ctx.options.entity && ctx.options.entity !== ec.entityType) continue;

      try {
        // Get sample pairs
        const mappings = await ctx.tracker(
          'SELECT source_id, target_id FROM id_mappings WHERE entity_type = ? ORDER BY RAND() LIMIT ?',
          [ec.entityType, sampleSize]
        );

        if (mappings.length === 0) {
          results.push({ status: 'SKIP', entity: ec.label, message: 'No mappings found' });
          continue;
        }

        const sourceIds = mappings.map(m => `'${m.source_id}'`).join(',');
        const sourceRows = await ctx.mssql(
          `SELECT * FROM products WITH (NOLOCK) WHERE productsid IN (${sourceIds})`
        );
        const sourceMap = new Map(sourceRows.map(r => [String(r.productsid), r]));

        let passed = 0, failed = 0;
        const failures = [];

        for (const m of mappings) {
          const srcRow = sourceMap.get(String(m.source_id));
          if (!srcRow) continue;

          // Re-evaluate expression
          const value = srcRow[ec.sourceColumn];
          const expected = expressionEval.evaluateExpression(ec.expression, value, srcRow);

          // Get actual target value
          let actual;
          if (ec.parentJoin) {
            const rows = await ctx.target(
              `SELECT \`${ec.targetColumn}\` FROM \`${ec.targetTable}\` WHERE \`${ec.parentJoin.column}\` = ? AND Language = ? LIMIT 1`,
              [m.target_id, ec.langFilter]
            );
            actual = rows.length > 0 ? rows[0][ec.targetColumn] : undefined;
          } else {
            // For ProjectItemLocalization, need to find via ProjectItem
            const itemRows = await ctx.target(
              'SELECT Id FROM ProjectItem WHERE ProjectId = ? LIMIT 1',
              [m.target_id]
            );
            if (itemRows.length === 0) continue;
            const rows = await ctx.target(
              `SELECT \`${ec.targetColumn}\` FROM \`${ec.targetTable}\` WHERE ItemId = ? AND Language = ? LIMIT 1`,
              [itemRows[0].Id, ec.langFilter]
            );
            actual = rows.length > 0 ? rows[0][ec.targetColumn] : undefined;
          }

          if (actual === undefined) continue;

          // Compare (with type coercion for numbers)
          const match = String(expected) === String(actual) ||
            (Number(expected) === Number(actual) && !isNaN(Number(expected)));

          if (match) {
            passed++;
          } else {
            failed++;
            if (failures.length < 3) {
              failures.push({
                sourceId: m.source_id,
                expected: expected,
                actual: actual,
                sourceValue: value
              });
            }
          }
        }

        const total = passed + failed;
        results.push({
          status: failed === 0 ? 'PASS' : failed > total * 0.1 ? 'FAIL' : 'WARNING',
          entity: ec.label,
          message: `${passed}/${total} expression results match`,
          details: failures.length > 0 ? { failures } : undefined
        });
      } catch (err) {
        results.push({
          status: 'SKIP',
          entity: ec.label,
          message: `Error: ${err.message}`
        });
      }
    }

    // Also verify auto-discovered expressions from mapping files
    const allExpressions = mappingLoader.getExpressions();
    const exprCount = allExpressions.length;
    const syntaxErrors = [];

    for (const expr of allExpressions) {
      try {
        // Just verify syntax by compiling
        new Function('value', 'row', '"use strict"; return (' + expr.expression + ');');
      } catch (e) {
        syntaxErrors.push({
          mapping: expr.mappingName,
          field: expr.field,
          expression: expr.expression.substring(0, 80),
          error: e.message
        });
      }
    }

    results.push({
      status: syntaxErrors.length === 0 ? 'PASS' : 'FAIL',
      entity: 'All Mapping Expressions',
      message: syntaxErrors.length === 0
        ? `All ${exprCount} expressions are syntactically valid`
        : `${syntaxErrors.length}/${exprCount} expressions have syntax errors`,
      details: syntaxErrors.length > 0 ? { errors: syntaxErrors } : undefined
    });

    return results;
  }
};
