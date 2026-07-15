/**
 * Duplicate Detection - Unexpected duplicates in target tables
 */
module.exports = {
  id: 'duplicate-detection',
  name: 'Duplicate Detection',
  severity: 'warning',
  category: 'integrity',
  entities: ['all'],

  async run(ctx) {
    const results = [];

    // id_mappings duplicates (same source_id + entity_type)
    try {
      const dupes = await ctx.tracker(`
        SELECT entity_type, source_id, COUNT(*) as cnt
        FROM id_mappings
        GROUP BY entity_type, source_id
        HAVING cnt > 1
        LIMIT 20
      `);

      results.push({
        status: dupes.length === 0 ? 'PASS' : 'FAIL',
        entity: 'id_mappings',
        message: dupes.length === 0
          ? 'No duplicate source_id mappings'
          : `${dupes.length} duplicate source_id+entity_type entries`,
        details: dupes.length > 0 ? { samples: dupes.slice(0, 5) } : undefined
      });
    } catch (err) {
      results.push({ status: 'FAIL', entity: 'id_mappings', message: err.message });
    }

    // User duplicates (UserName should be unique)
    try {
      const dupes = await ctx.target(`
        SELECT UserName, COUNT(*) as cnt
        FROM \`user\`
        WHERE UserName IS NOT NULL
        GROUP BY UserName
        HAVING cnt > 1
        LIMIT 20
      `);

      results.push({
        status: dupes.length === 0 ? 'PASS' : 'WARNING',
        entity: 'User.UserName',
        message: dupes.length === 0
          ? 'No duplicate usernames'
          : `${dupes.length} duplicate UserName values`,
        details: dupes.length > 0 ? { samples: dupes.slice(0, 5) } : undefined
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'User.UserName', message: err.message });
      }
    }

    // Project KupatFundNo duplicates within same ProjectType
    try {
      const dupes = await ctx.target(`
        SELECT KupatFundNo, ProjectType, COUNT(*) as cnt
        FROM Project
        WHERE KupatFundNo IS NOT NULL
        GROUP BY KupatFundNo, ProjectType
        HAVING cnt > 1
        LIMIT 20
      `);

      results.push({
        status: dupes.length === 0 ? 'PASS' : 'FAIL',
        entity: 'Project.KupatFundNo',
        message: dupes.length === 0
          ? 'No duplicate KupatFundNo per ProjectType'
          : `${dupes.length} duplicate KupatFundNo+ProjectType combinations`,
        details: dupes.length > 0 ? { samples: dupes.slice(0, 5) } : undefined
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'Project.KupatFundNo', message: err.message });
      } else {
        results.push({ status: 'SKIP', entity: 'Project.KupatFundNo', message: 'Table not found' });
      }
    }

    // LinkSetting: check expected count per Project+Language
    try {
      const unexpected = await ctx.target(`
        SELECT ProjectId, Language, COUNT(*) as cnt
        FROM LinkSetting
        WHERE ProjectId IS NOT NULL
        GROUP BY ProjectId, Language
        HAVING cnt > 6
        LIMIT 10
      `);

      results.push({
        status: unexpected.length === 0 ? 'PASS' : 'WARNING',
        entity: 'LinkSetting per Project',
        message: unexpected.length === 0
          ? 'No projects with excessive LinkSettings'
          : `${unexpected.length} projects with >6 LinkSettings per language`,
        details: unexpected.length > 0 ? { samples: unexpected.slice(0, 5) } : undefined
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'LinkSetting', message: err.message });
      } else {
        results.push({ status: 'SKIP', entity: 'LinkSetting', message: 'Table not found' });
      }
    }

    // Donation ID duplicates (since ID preservation is used)
    try {
      const dupes = await ctx.target(`
        SELECT Id, COUNT(*) as cnt
        FROM Donation
        GROUP BY Id
        HAVING cnt > 1
        LIMIT 10
      `);

      results.push({
        status: dupes.length === 0 ? 'PASS' : 'FAIL',
        entity: 'Donation.Id',
        message: dupes.length === 0
          ? 'No duplicate Donation IDs'
          : `${dupes.length} duplicate Donation IDs found`,
        details: dupes.length > 0 ? { samples: dupes.slice(0, 5) } : undefined
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'Donation.Id', message: err.message });
      } else {
        results.push({ status: 'SKIP', entity: 'Donation.Id', message: 'Table not found' });
      }
    }

    return results;
  }
};
