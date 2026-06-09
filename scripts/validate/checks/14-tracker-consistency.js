/**
 * Tracker Consistency - Verify tracker DB aligns with actual target DB state
 */
module.exports = {
  id: 'tracker-consistency',
  name: 'Tracker DB Consistency',
  severity: 'warning',
  category: 'consistency',
  entities: ['all'],

  async run(ctx) {
    const results = [];

    // === Completed runs should have processed = total ===
    try {
      const runs = await ctx.tracker(`
        SELECT id, mapping_name, status, total_source_rows, processed_rows, inserted_rows, error_rows, skipped_rows
        FROM migration_runs
        WHERE status = 'completed'
        ORDER BY id DESC
      `);

      let incomplete = 0;
      for (const run of runs) {
        const processed = run.processed_rows || 0;
        const total = run.total_source_rows || 0;
        if (total > 0 && processed < total * 0.95) {
          incomplete++;
          if (incomplete <= 3) {
            ctx.log(`Run ${run.id} (${run.mapping_name}): ${processed}/${total} processed`);
          }
        }
      }

      results.push({
        status: incomplete === 0 ? 'PASS' : 'WARNING',
        entity: 'Completed runs',
        message: incomplete === 0
          ? `All ${runs.length} completed runs fully processed`
          : `${incomplete}/${runs.length} completed runs have <95% rows processed`,
        details: incomplete > 0 ? { incompleteCount: incomplete, totalRuns: runs.length } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Completed runs', message: err.message });
    }

    // === No runs stuck in 'running' status ===
    try {
      const stuck = await ctx.tracker(`
        SELECT id, mapping_name, started_at, processed_rows, total_source_rows
        FROM migration_runs
        WHERE status = 'running'
      `);

      results.push({
        status: stuck.length === 0 ? 'PASS' : 'WARNING',
        entity: 'Stuck runs',
        message: stuck.length === 0
          ? 'No runs stuck in running state'
          : `${stuck.length} run(s) still in 'running' status (possible crash)`,
        details: stuck.length > 0 ? { runs: stuck.map(r => ({ id: r.id, mapping: r.mapping_name, started: r.started_at })) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Stuck runs', message: err.message });
    }

    // === id_mappings count matches latest run's inserted_rows ===
    try {
      const entityTypes = await ctx.tracker(`
        SELECT DISTINCT entity_type, COUNT(*) as cnt
        FROM id_mappings
        GROUP BY entity_type
      `);

      for (const et of entityTypes) {
        // Get latest completed run for this entity type
        const latestRun = await ctx.tracker(`
          SELECT mapping_name, inserted_rows, error_rows, skipped_rows
          FROM migration_runs
          WHERE status = 'completed'
          AND mapping_name LIKE ?
          ORDER BY completed_at DESC
          LIMIT 1
        `, [`%${et.entity_type}%`]);

        if (latestRun.length > 0) {
          const run = latestRun[0];
          const diff = Math.abs(et.cnt - run.inserted_rows);

          if (diff === 0) {
            results.push({
              status: 'PASS',
              entity: `${et.entity_type} tracker sync`,
              message: `id_mappings: ${et.cnt}, run inserted: ${run.inserted_rows}`
            });
          } else {
            results.push({
              status: diff > et.cnt * 0.05 ? 'WARNING' : 'PASS',
              entity: `${et.entity_type} tracker sync`,
              message: `id_mappings: ${et.cnt}, run inserted: ${run.inserted_rows} (diff: ${diff})`,
              details: { mappingCount: et.cnt, runInserted: run.inserted_rows, runErrors: run.error_rows }
            });
          }
        }
      }
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Tracker sync', message: err.message });
    }

    // === Error count matches migration_errors ===
    try {
      const runErrors = await ctx.tracker(`
        SELECT mr.id, mr.mapping_name, mr.error_rows,
          (SELECT COUNT(*) FROM migration_errors me WHERE me.run_id = mr.id) as actual_errors
        FROM migration_runs mr
        WHERE mr.status = 'completed' AND mr.error_rows > 0
        ORDER BY mr.id DESC
        LIMIT 10
      `);

      let mismatches = 0;
      for (const r of runErrors) {
        if (r.error_rows !== r.actual_errors) mismatches++;
      }

      results.push({
        status: mismatches === 0 ? 'PASS' : 'WARNING',
        entity: 'Error count sync',
        message: mismatches === 0
          ? `Error counts match for ${runErrors.length} runs with errors`
          : `${mismatches}/${runErrors.length} runs have mismatched error counts`,
        details: mismatches > 0 ? { runs: runErrors.filter(r => r.error_rows !== r.actual_errors).slice(0, 3) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Error count sync', message: err.message });
    }

    // === Orphan tracker records ===
    try {
      const orphanStatus = await ctx.tracker(`
        SELECT COUNT(*) as cnt FROM row_status rs
        LEFT JOIN migration_runs mr ON rs.run_id = mr.id
        WHERE mr.id IS NULL
      `);

      const orphanErrors = await ctx.tracker(`
        SELECT COUNT(*) as cnt FROM migration_errors me
        LEFT JOIN migration_runs mr ON me.run_id = mr.id
        WHERE mr.id IS NULL
      `);

      const totalOrphans = orphanStatus[0].cnt + orphanErrors[0].cnt;
      results.push({
        status: totalOrphans === 0 ? 'PASS' : 'WARNING',
        entity: 'Orphan tracker records',
        message: totalOrphans === 0
          ? 'No orphan records in tracker'
          : `${totalOrphans} orphan records (${orphanStatus[0].cnt} row_status, ${orphanErrors[0].cnt} errors) referencing deleted runs`
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Orphan tracker records', message: err.message });
    }

    // === Overall migration_errors summary ===
    try {
      const errorSummary = await ctx.tracker(`
        SELECT error_type, COUNT(*) as cnt
        FROM migration_errors
        GROUP BY error_type
        ORDER BY cnt DESC
      `);

      if (errorSummary.length === 0) {
        results.push({
          status: 'PASS',
          entity: 'Migration errors summary',
          message: 'No errors recorded in migration_errors table'
        });
      } else {
        const totalErrors = errorSummary.reduce((sum, r) => sum + r.cnt, 0);
        const breakdown = errorSummary.map(r => `${r.error_type}: ${r.cnt}`).join(', ');
        results.push({
          status: totalErrors > 100 ? 'WARNING' : 'PASS',
          entity: 'Migration errors summary',
          message: `${totalErrors} total errors — ${breakdown}`,
          details: { errorsByType: Object.fromEntries(errorSummary.map(r => [r.error_type, r.cnt])) }
        });
      }
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'Errors summary', message: err.message });
    }

    return results;
  }
};
