/**
 * Fix recruitersgroup.ProjectId=NULL by looking at their recruiters
 *
 * Logic:
 * - If recruitersgroup.ProjectId = NULL
 * - Find recruiters linked to this group (recruiter.RecruiterGroupId)
 * - Take the ProjectId from the first recruiter
 * - Update recruitersgroup.ProjectId with this value
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function fixNullProjectIds() {
  try {
    const conn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    console.log('🔍 Finding recruitersgroups with ProjectId=NULL...\n');

    // Step 1: Find all groups with NULL ProjectId
    const [groupsWithNull] = await conn.query(`
      SELECT Id, Name
      FROM recruitersgroup
      WHERE ProjectId IS NULL
    `);

    console.log(`📊 Found ${groupsWithNull.length} groups with ProjectId=NULL\n`);

    if (groupsWithNull.length === 0) {
      console.log('✅ No groups need fixing!');
      await conn.end();
      return;
    }

    let fixed = 0;
    let noRecruiters = 0;
    const updates = [];

    // Step 2: For each group, find its recruiters and get ProjectId
    for (const group of groupsWithNull) {
      const [recruiters] = await conn.query(`
        SELECT ProjectId
        FROM recruiter
        WHERE RecruiterGroupId = ?
        LIMIT 1
      `, [group.Id]);

      if (recruiters.length > 0 && recruiters[0].ProjectId !== null) {
        const projectId = recruiters[0].ProjectId;
        updates.push({
          groupId: group.Id,
          groupName: group.Name,
          projectId: projectId
        });
        console.log(`✅ Group ${group.Id} ("${group.Name}"): ProjectId → ${projectId}`);
        fixed++;
      } else {
        console.log(`⚠️  Group ${group.Id} ("${group.Name}"): No recruiters with ProjectId found`);
        noRecruiters++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Groups to fix: ${fixed}`);
    console.log(`   Groups with no recruiters: ${noRecruiters}`);

    if (updates.length === 0) {
      console.log('\n✅ No groups need fixing!');
      await conn.end();
      return;
    }

    // Step 3: Update the groups
    console.log(`\n🔧 Updating ${updates.length} groups...\n`);

    for (const update of updates) {
      await conn.query(`
        UPDATE recruitersgroup
        SET ProjectId = ?
        WHERE Id = ?
      `, [update.projectId, update.groupId]);

      console.log(`   ✅ Updated group ${update.groupId}: ProjectId=${update.projectId}`);
    }

    // Step 4: Verify
    console.log(`\n✅ Verification:`);
    const [remaining] = await conn.query(`
      SELECT COUNT(*) as count
      FROM recruitersgroup
      WHERE ProjectId IS NULL
    `);

    console.log(`   Groups still with NULL: ${remaining[0].count}`);

    console.log('\n✅ Done! recruitersgroup.ProjectId fixed.');

    await conn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixNullProjectIds();
