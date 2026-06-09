/**
 * NULL/Empty Analysis - Fields that should never be NULL
 */
module.exports = {
  id: 'null-analysis',
  name: 'NULL/Empty Field Analysis',
  severity: 'warning',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];

    // Define NOT-NULL expectations per table
    const notNullChecks = [
      { table: 'Project', column: 'Name', label: 'Project.Name' },
      { table: 'Project', column: 'RecordStatus', label: 'Project.RecordStatus' },
      { table: 'Project', column: 'ProjectType', label: 'Project.ProjectType' },
      { table: 'ProjectLocalization', column: 'ProjectId', label: 'ProjectLocalization.ProjectId' },
      { table: 'ProjectLocalization', column: 'Language', label: 'ProjectLocalization.Language' },
      { table: 'ProjectItem', column: 'ProjectId', label: 'ProjectItem.ProjectId' },
      { table: 'ProjectItem', column: 'ItemType', label: 'ProjectItem.ItemType' },
      { table: 'ProjectItemLocalization', column: 'ItemId', label: 'ProjectItemLocalization.ItemId' },
      { table: 'ProjectItemLocalization', column: 'Language', label: 'ProjectItemLocalization.Language' },
      { table: 'Affiliate', column: 'Name', label: 'Affiliate.Name' },
      { table: 'Affiliate', column: 'RecordStatus', label: 'Affiliate.RecordStatus' },
      { table: 'Source', column: 'AffiliateId', label: 'Source.AffiliateId' },
      { table: 'Source', column: 'SourceCode', label: 'Source.SourceCode' },
      { table: 'Recruiter', column: 'ProjectId', label: 'Recruiter.ProjectId' },
      { table: 'Recruiter', column: 'Name', label: 'Recruiter.Name' },
      { table: 'LinkSetting', column: 'ProjectId', label: 'LinkSetting.ProjectId' },
      { table: 'LinkSetting', column: 'Language', label: 'LinkSetting.Language' },
      { table: 'Media', column: 'RelativePath', label: 'Media.RelativePath' },
      { table: 'LutFundCategory', column: 'Description', label: 'LutFundCategory.Description' },
      { table: 'PrayName', column: 'Name', label: 'PrayName.Name' },
      { table: 'PrayName', column: 'BelongToEntityId', label: 'PrayName.BelongToEntityId' },
      { table: 'Donation', column: 'Status', label: 'Donation.Status' }
    ];

    for (const check of notNullChecks) {
      try {
        const totalRows = await ctx.target(
          `SELECT COUNT(*) as cnt FROM \`${check.table}\``
        );
        const nullRows = await ctx.target(
          `SELECT COUNT(*) as cnt FROM \`${check.table}\` WHERE \`${check.column}\` IS NULL`
        );

        const total = totalRows[0].cnt;
        const nullCount = nullRows[0].cnt;

        if (total === 0) {
          results.push({ status: 'SKIP', entity: check.label, message: 'Table is empty' });
        } else if (nullCount === 0) {
          results.push({ status: 'PASS', entity: check.label, message: `0/${total} NULL values` });
        } else {
          const pct = ((nullCount / total) * 100).toFixed(1);
          results.push({
            status: nullCount > total * 0.05 ? 'FAIL' : 'WARNING',
            entity: check.label,
            message: `${nullCount}/${total} NULL values (${pct}%)`,
            details: { nullCount, total, percentage: pct }
          });
        }
      } catch (err) {
        if (err.message.includes("doesn't exist")) {
          results.push({ status: 'SKIP', entity: check.label, message: 'Table not found' });
        } else {
          results.push({ status: 'FAIL', entity: check.label, message: err.message });
        }
      }
    }

    // Suspicious NULLs: fields with unexpectedly high NULL rate
    const suspiciousChecks = [
      { table: 'ProjectLocalization', column: 'Title', threshold: 5 },
      { table: 'ProjectItemLocalization', column: 'Title', threshold: 10 },
      { table: 'Affiliate', column: 'UserId', threshold: 5 },
      { table: 'Recruiter', column: 'RecruiterGroupId', threshold: 50 },
      { table: 'Donation', column: 'ItemId', threshold: 10 }
    ];

    for (const check of suspiciousChecks) {
      try {
        const totalRows = await ctx.target(`SELECT COUNT(*) as cnt FROM \`${check.table}\``);
        const nullRows = await ctx.target(
          `SELECT COUNT(*) as cnt FROM \`${check.table}\` WHERE \`${check.column}\` IS NULL`
        );

        const total = totalRows[0].cnt;
        const nullCount = nullRows[0].cnt;
        if (total === 0) continue;

        const pct = (nullCount / total) * 100;

        if (pct > check.threshold) {
          results.push({
            status: 'WARNING',
            entity: `${check.table}.${check.column} (suspicious)`,
            message: `${pct.toFixed(1)}% NULL (>${check.threshold}% threshold) — ${nullCount}/${total}`,
            details: { nullCount, total, threshold: check.threshold }
          });
        }
      } catch (err) {
        // Skip silently for non-existent tables
      }
    }

    return results;
  }
};
