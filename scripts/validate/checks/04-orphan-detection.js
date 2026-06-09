/**
 * Orphan Detection - Records in target without valid parent or stale from failed runs
 */
module.exports = {
  id: 'orphan-detection',
  name: 'Orphan Record Detection',
  severity: 'warning',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];

    // Check target records not tracked in id_mappings (stale from failed runs)
    const entityChecks = [
      { table: 'Affiliate', entityType: 'Affiliate' },
      { table: 'Source', entityType: 'Source' },
      { table: 'LutFundCategory', entityType: 'LutFundCategory' },
      { table: 'Recruiter', entityType: 'Recruiter' },
      { table: 'RecruitersGroup', entityType: 'RecruitersGroup' },
      { table: 'Gallery', entityType: 'Gallery' },
      { table: 'FundCategory', entityType: 'FundCategory' },
      { table: 'AsakimDonation', entityType: 'AsakimDonation' }
    ];

    for (const ec of entityChecks) {
      if (ctx.options.entity && ec.entityType !== ctx.options.entity) continue;

      try {
        const rows = await ctx.target(`
          SELECT COUNT(*) as cnt FROM \`${ec.table}\` t
          WHERE NOT EXISTS (
            SELECT 1 FROM migration_tracker.id_mappings m
            WHERE m.entity_type = ? AND m.target_id = t.Id
          )
        `, [ec.entityType]);

        // Fallback: just compare counts
        const targetRows = await ctx.target(`SELECT COUNT(*) as cnt FROM \`${ec.table}\``);
        const mapRows = await ctx.tracker(
          'SELECT COUNT(*) as cnt FROM id_mappings WHERE entity_type = ?',
          [ec.entityType]
        );

        const targetCount = targetRows[0].cnt;
        const mapCount = mapRows[0].cnt;
        const orphans = targetCount - mapCount;

        if (orphans <= 0) {
          results.push({
            status: 'PASS',
            entity: ec.entityType,
            message: `No orphan records (target: ${targetCount}, mapped: ${mapCount})`
          });
        } else {
          results.push({
            status: orphans > targetCount * 0.05 ? 'FAIL' : 'WARNING',
            entity: ec.entityType,
            message: `${orphans} records in target not tracked in id_mappings (target: ${targetCount}, mapped: ${mapCount})`,
            details: { targetCount, mappedCount: mapCount, orphans }
          });
        }
      } catch (err) {
        if (err.message.includes("doesn't exist")) {
          results.push({ status: 'SKIP', entity: ec.entityType, message: `Table ${ec.table} not found` });
        } else {
          results.push({ status: 'FAIL', entity: ec.entityType, message: `Error: ${err.message}` });
        }
      }
    }

    // Check child records without valid parent in target
    const parentChecks = [
      { child: 'ProjectItem', parent: 'Project', fk: 'ProjectId' },
      { child: 'ProjectLocalization', parent: 'Project', fk: 'ProjectId' },
      { child: 'ProjectItemLocalization', parent: 'ProjectItem', fk: 'ItemId' },
      { child: 'RecruiterLocalization', parent: 'Recruiter', fk: 'RecruiterId' },
      { child: 'GalleryLocalization', parent: 'Gallery', fk: 'GalleryId' },
      { child: 'GalleryMedia', parent: 'Gallery', fk: 'GalleryId' }
    ];

    for (const pc of parentChecks) {
      try {
        const rows = await ctx.target(`
          SELECT COUNT(*) as cnt FROM \`${pc.child}\` c
          LEFT JOIN \`${pc.parent}\` p ON c.\`${pc.fk}\` = p.Id
          WHERE p.Id IS NULL
        `);

        const orphans = rows[0].cnt;
        if (orphans === 0) {
          results.push({
            status: 'PASS',
            entity: `${pc.child} → ${pc.parent}`,
            message: 'No orphan child records'
          });
        } else {
          results.push({
            status: 'FAIL',
            entity: `${pc.child} → ${pc.parent}`,
            message: `${orphans} ${pc.child} records without valid ${pc.parent} parent`,
            details: { orphans, childTable: pc.child, parentTable: pc.parent, fkColumn: pc.fk }
          });
        }
      } catch (err) {
        if (err.message.includes("doesn't exist")) {
          results.push({ status: 'SKIP', entity: `${pc.child} → ${pc.parent}`, message: 'Table not found' });
        } else {
          results.push({ status: 'FAIL', entity: `${pc.child} → ${pc.parent}`, message: `Error: ${err.message}` });
        }
      }
    }

    return results;
  }
};
