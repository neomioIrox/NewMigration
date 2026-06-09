/**
 * FK Integrity - All foreign key references point to valid records in target DB
 */
const mappingLoader = require('../lib/mapping-loader');

module.exports = {
  id: 'fk-integrity',
  name: 'Foreign Key Integrity',
  severity: 'critical',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];

    // Auto-discovered FK relationships from mapping files
    const autoFKs = mappingLoader.getFKRelationships();

    // Hardcoded FK checks for relationships not in fkMappings
    // (child tables created during migration)
    const fkChecks = [
      // From mapping auto-discovery
      ...autoFKs.map(fk => ({
        table: fk.targetTable,
        column: fk.column,
        refTable: getTargetTable(fk.referencedEntityType),
        refColumn: 'Id',
        label: `${fk.targetTable}.${fk.column} → ${getTargetTable(fk.referencedEntityType)}`
      })),
      // Localization → Parent
      { table: 'ProjectLocalization', column: 'ProjectId', refTable: 'Project', refColumn: 'Id', label: 'ProjectLocalization.ProjectId → Project' },
      { table: 'ProjectItemLocalization', column: 'ItemId', refTable: 'ProjectItem', refColumn: 'Id', label: 'ProjectItemLocalization.ItemId → ProjectItem' },
      // LinkSetting → Project
      { table: 'LinkSetting', column: 'ProjectId', refTable: 'Project', refColumn: 'Id', label: 'LinkSetting.ProjectId → Project' },
      // Media references
      { table: 'ProjectLocalization', column: 'MainMedia', refTable: 'Media', refColumn: 'Id', label: 'ProjectLocalization.MainMedia → Media' },
      { table: 'ProjectLocalization', column: 'ContentId', refTable: 'EntityContent', refColumn: 'Id', label: 'ProjectLocalization.ContentId → EntityContent' },
      // Gallery
      { table: 'GalleryMedia', column: 'GalleryId', refTable: 'Gallery', refColumn: 'Id', label: 'GalleryMedia.GalleryId → Gallery' },
      { table: 'GalleryMedia', column: 'MediaId', refTable: 'Media', refColumn: 'Id', label: 'GalleryMedia.MediaId → Media' },
      { table: 'GalleryLocalization', column: 'GalleryId', refTable: 'Gallery', refColumn: 'Id', label: 'GalleryLocalization.GalleryId → Gallery' },
      // FundCategory
      { table: 'FundCategory', column: 'FundId', refTable: 'Project', refColumn: 'Id', label: 'FundCategory.FundId → Project' },
      { table: 'FundCategory', column: 'CategoryId', refTable: 'LutFundCategory', refColumn: 'Id', label: 'FundCategory.CategoryId → LutFundCategory' },
      // Recruiter
      { table: 'RecruiterLocalization', column: 'RecruiterId', refTable: 'Recruiter', refColumn: 'Id', label: 'RecruiterLocalization.RecruiterId → Recruiter' },
      // Donation
      { table: 'DonationCurrencyValue', column: 'DonationId', refTable: 'Donation', refColumn: 'Id', label: 'DonationCurrencyValue.DonationId → Donation' },
      { table: 'PrayName', column: 'BelongToEntityId', refTable: 'Donation', refColumn: 'Id', label: 'PrayName.BelongToEntityId → Donation' },
      // Affiliate → User
      { table: 'Affiliate', column: 'UserId', refTable: 'user', refColumn: 'Id', label: 'Affiliate.UserId → User' }
    ];

    // Deduplicate
    const seen = new Set();
    const uniqueFKs = fkChecks.filter(fk => {
      const key = `${fk.table}.${fk.column}->${fk.refTable}.${fk.refColumn}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const fk of uniqueFKs) {
      if (ctx.options.entity) {
        const relevant = fk.table.toLowerCase().includes(ctx.options.entity.toLowerCase()) ||
          fk.refTable.toLowerCase().includes(ctx.options.entity.toLowerCase());
        if (!relevant) continue;
      }

      try {
        const rows = await ctx.target(`
          SELECT COUNT(*) as broken FROM \`${fk.table}\` t
          LEFT JOIN \`${fk.refTable}\` r ON t.\`${fk.column}\` = r.\`${fk.refColumn}\`
          WHERE t.\`${fk.column}\` IS NOT NULL AND r.\`${fk.refColumn}\` IS NULL
        `);

        const broken = rows[0].broken;

        if (broken === 0) {
          results.push({
            status: 'PASS',
            entity: fk.label,
            message: 'All FK references valid'
          });
        } else {
          // Get total for percentage
          const totalRows = await ctx.target(
            `SELECT COUNT(*) as cnt FROM \`${fk.table}\` WHERE \`${fk.column}\` IS NOT NULL`
          );
          const total = totalRows[0].cnt;
          const pct = total > 0 ? ((broken / total) * 100).toFixed(1) : '100';

          // Get sample of broken IDs
          let brokenSample = [];
          if (ctx.options.verbose) {
            const sampleRows = await ctx.target(`
              SELECT t.\`${fk.column}\` as broken_id FROM \`${fk.table}\` t
              LEFT JOIN \`${fk.refTable}\` r ON t.\`${fk.column}\` = r.\`${fk.refColumn}\`
              WHERE t.\`${fk.column}\` IS NOT NULL AND r.\`${fk.refColumn}\` IS NULL
              LIMIT 10
            `);
            brokenSample = sampleRows.map(r => r.broken_id);
          }

          results.push({
            status: broken > total * 0.01 ? 'FAIL' : 'WARNING',
            entity: fk.label,
            message: `${broken} broken FK references out of ${total} (${pct}%)`,
            details: { broken, total, percentage: pct, ...(brokenSample.length > 0 ? { sample: brokenSample } : {}) }
          });
        }
      } catch (err) {
        // Table might not exist yet
        if (err.message.includes("doesn't exist") || err.message.includes('ER_NO_SUCH_TABLE')) {
          results.push({
            status: 'SKIP',
            entity: fk.label,
            message: `Table not found: ${err.message.includes(fk.table) ? fk.table : fk.refTable}`
          });
        } else {
          results.push({
            status: 'FAIL',
            entity: fk.label,
            message: `Error checking FK: ${err.message}`
          });
        }
      }
    }

    return results;
  }
};

function getTargetTable(entityType) {
  const map = {
    'Affiliate': 'Affiliate',
    'Source': 'Source',
    'Project': 'Project',
    'LutFundCategory': 'LutFundCategory',
    'RecruitersGroup': 'RecruitersGroup',
    'Recruiter': 'Recruiter',
    'Gallery': 'Gallery',
    'FundCategory': 'FundCategory',
    'AsakimDonation': 'AsakimDonation',
    'Donation': 'Donation',
    'PrayName': 'PrayName',
    'CustomerUser': 'CustomerUser'
  };
  return map[entityType] || entityType;
}
