/**
 * Check LinkSetting records for Projects
 * Compares old migration vs new migration
 */
const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../legacy/config/database');

async function checkLinkSettingForProjects() {
  console.log('🔍 Checking LinkSetting Records for Projects');
  console.log('='.repeat(60) + '\n');

  const connection = await mysql.createConnection(mysqlConfig);

  try {
    // 1. Count total LinkSetting records
    const [[{ totalLinkSettings }]] = await connection.execute(`
      SELECT COUNT(*) as totalLinkSettings FROM linksetting
    `);
    console.log(`📊 Total LinkSetting records: ${totalLinkSettings}\n`);

    // 2. Count total Projects
    const [[{ totalProjects }]] = await connection.execute(`
      SELECT COUNT(*) as totalProjects FROM project
    `);
    console.log(`📊 Total Project records: ${totalProjects}\n`);

    // 3. Check how many Projects have at least one LinkSetting
    const [[{ projectsWithLinkSetting }]] = await connection.execute(`
      SELECT COUNT(DISTINCT ProjectId) as projectsWithLinkSetting
      FROM linksetting
    `);
    console.log(`📊 Projects with LinkSetting: ${projectsWithLinkSetting}`);
    console.log(`📊 Projects WITHOUT LinkSetting: ${totalProjects - projectsWithLinkSetting}\n`);

    // 4. Check LinkSetting per LinkType
    console.log('📋 LinkSettings by LinkType:');
    const [byLinkType] = await connection.execute(`
      SELECT
        LinkType,
        CASE LinkType
          WHEN 1 THEN 'Button'
          WHEN 2 THEN 'Banner'
          WHEN 3 THEN 'ListItem'
          ELSE 'Unknown'
        END as TypeName,
        COUNT(*) as Count
      FROM linksetting
      GROUP BY LinkType
      ORDER BY LinkType
    `);
    byLinkType.forEach(row => {
      console.log(`   ${row.LinkType} (${row.TypeName}): ${row.Count}`);
    });
    console.log('');

    // 5. Check LinkSetting per LinkTargetType
    console.log('📋 LinkSettings by LinkTargetType:');
    const [byTargetType] = await connection.execute(`
      SELECT
        LinkTargetType,
        CASE LinkTargetType
          WHEN 1 THEN 'ToProjectPage'
          WHEN 2 THEN 'ToItemPage'
          WHEN 3 THEN 'ToExecutionPage'
          ELSE 'Unknown'
        END as TargetName,
        COUNT(*) as Count
      FROM linksetting
      GROUP BY LinkTargetType
      ORDER BY LinkTargetType
    `);
    byTargetType.forEach(row => {
      console.log(`   ${row.LinkTargetType} (${row.TargetName}): ${row.Count}`);
    });
    console.log('');

    // 6. Check ProjectLocalization LinkSetting references
    console.log('📋 ProjectLocalization LinkSetting References:');
    // Check actual columns in projectlocalization table
    const [[plStats]] = await connection.execute(`
      SELECT
        COUNT(*) as totalPL,
        SUM(CASE WHEN MainLinkButtonSettingId IS NOT NULL THEN 1 ELSE 0 END) as hasMainButton,
        SUM(CASE WHEN LinkSettingIdInListView IS NOT NULL THEN 1 ELSE 0 END) as hasListView,
        SUM(CASE WHEN LinkSettingIdInButtonListView IS NOT NULL THEN 1 ELSE 0 END) as hasButtonListView
      FROM projectlocalization
    `);
    console.log(`   Total ProjectLocalization: ${plStats.totalPL}`);
    console.log(`   With MainLinkButtonSettingId: ${plStats.hasMainButton}`);
    console.log(`   With LinkSettingIdInListView: ${plStats.hasListView}`);
    console.log(`   With LinkSettingIdInButtonListView: ${plStats.hasButtonListView}`);
    console.log('');

    // 7. Find Projects WITHOUT any LinkSetting - grouped by ProjectType
    console.log('📋 Projects WITHOUT LinkSetting - by ProjectType:');
    const [noLSByType] = await connection.execute(`
      SELECT
        p.ProjectType,
        pt.Description as TypeName,
        COUNT(*) as Count
      FROM project p
      LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
      LEFT JOIN lutprojecttype pt ON p.ProjectType = pt.Id
      WHERE ls.Id IS NULL
      GROUP BY p.ProjectType, pt.Description
      ORDER BY Count DESC
    `);
    noLSByType.forEach(row => {
      console.log(`   Type ${row.ProjectType} (${row.TypeName || 'Unknown'}): ${row.Count} projects`);
    });
    console.log('');

    // 7b. Find Projects WITHOUT any LinkSetting (first 20)
    console.log('📋 Projects WITHOUT any LinkSetting (first 20):');
    const [projectsNoLinkSetting] = await connection.execute(`
      SELECT p.Id, p.ProjectType, p.CreatedAt
      FROM project p
      LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
      WHERE ls.Id IS NULL
      ORDER BY p.Id
      LIMIT 20
    `);

    if (projectsNoLinkSetting.length === 0) {
      console.log('   ✅ All projects have LinkSetting records!');
    } else {
      projectsNoLinkSetting.forEach(p => {
        console.log(`   ⚠️  Project ${p.Id} (Type: ${p.ProjectType}) - No LinkSetting`);
      });

      // Count total
      const [[{ countNoLS }]] = await connection.execute(`
        SELECT COUNT(*) as countNoLS
        FROM project p
        LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
        WHERE ls.Id IS NULL
      `);
      console.log(`\n   Total projects without LinkSetting: ${countNoLS}`);
    }
    console.log('');

    // 8. Check for orphan LinkSettings (ProjectId doesn't exist)
    console.log('📋 Orphan LinkSettings (invalid ProjectId):');
    const [orphanLS] = await connection.execute(`
      SELECT ls.Id, ls.ProjectId, ls.LinkType, ls.LinkTargetType
      FROM linksetting ls
      LEFT JOIN project p ON ls.ProjectId = p.Id
      WHERE p.Id IS NULL
      LIMIT 20
    `);

    if (orphanLS.length === 0) {
      console.log('   ✅ No orphan LinkSettings found!');
    } else {
      orphanLS.forEach(ls => {
        console.log(`   ❌ LinkSetting ${ls.Id} - ProjectId ${ls.ProjectId} NOT FOUND`);
      });
    }
    console.log('');

    // 9. Check LinkSetting with ItemId - verify Item exists and belongs to same Project
    console.log('📋 LinkSettings with ItemId - Validation:');
    const [lsWithItem] = await connection.execute(`
      SELECT
        ls.Id as LinkSettingId,
        ls.ProjectId,
        ls.ItemId,
        pi.Id as ItemExists,
        pi.ProjectId as ItemProjectId,
        CASE WHEN pi.Id IS NULL THEN 'ItemNotFound'
             WHEN pi.ProjectId != ls.ProjectId THEN 'ProjectMismatch'
             ELSE 'OK' END as Status
      FROM linksetting ls
      LEFT JOIN projectitem pi ON ls.ItemId = pi.Id
      WHERE ls.ItemId IS NOT NULL
      LIMIT 20
    `);

    const itemNotFound = lsWithItem.filter(ls => ls.Status === 'ItemNotFound');
    const projectMismatch = lsWithItem.filter(ls => ls.Status === 'ProjectMismatch');
    const ok = lsWithItem.filter(ls => ls.Status === 'OK');

    console.log(`   ✅ OK: ${ok.length}`);
    if (itemNotFound.length > 0) {
      console.log(`   ❌ Item Not Found: ${itemNotFound.length}`);
      itemNotFound.slice(0, 5).forEach(ls => {
        console.log(`      LinkSetting ${ls.LinkSettingId}: ItemId ${ls.ItemId} not found`);
      });
    }
    if (projectMismatch.length > 0) {
      console.log(`   ❌ Project Mismatch: ${projectMismatch.length}`);
      projectMismatch.slice(0, 5).forEach(ls => {
        console.log(`      LinkSetting ${ls.LinkSettingId}: ProjectId=${ls.ProjectId} but Item.ProjectId=${ls.ItemProjectId}`);
      });
    }
    console.log('');

    // 10. Sample LinkSettings for visual inspection
    console.log('📋 Sample LinkSetting Records (first 10):');
    const [sampleLS] = await connection.execute(`
      SELECT
        ls.Id, ls.ProjectId, ls.ItemId, ls.LinkType, ls.LinkTargetType,
        ls.LinkText, ls.CreatedAt
      FROM linksetting ls
      ORDER BY ls.Id
      LIMIT 10
    `);

    sampleLS.forEach(ls => {
      console.log(`   ID: ${ls.Id} | Project: ${ls.ProjectId} | Item: ${ls.ItemId || 'NULL'} | Type: ${ls.LinkType} | Target: ${ls.LinkTargetType} | Text: "${ls.LinkText || ''}"`);
    });
    console.log('');

    // 11. LinkSettings per Project - count distribution
    console.log('📋 LinkSettings per Project Distribution:');
    const [lsPerProject] = await connection.execute(`
      SELECT
        ls.ProjectId,
        COUNT(*) as LinkSettingCount,
        COUNT(DISTINCT ls.ItemId) as UniqueItems
      FROM linksetting ls
      GROUP BY ls.ProjectId
      ORDER BY LinkSettingCount DESC
      LIMIT 10
    `);
    lsPerProject.forEach(row => {
      console.log(`   Project ${row.ProjectId}: ${row.LinkSettingCount} LinkSettings, ${row.UniqueItems} unique Items`);
    });
    console.log('');

    // 12. Check LinkSettings by LinkText language pattern
    console.log('📋 LinkSettings by Language (based on LinkText):');
    const [lsByLang] = await connection.execute(`
      SELECT
        CASE
          WHEN LinkText LIKE '%לתרומה%' OR LinkText LIKE '%עוד%' THEN 'Hebrew'
          WHEN LinkText LIKE '%Donate%' OR LinkText LIKE '%More%' THEN 'English'
          WHEN LinkText LIKE '%Pour%' OR LinkText LIKE '%don%' THEN 'French'
          WHEN LinkText IS NULL OR LinkText = '' THEN 'Empty/NULL'
          ELSE 'Other'
        END as Language,
        COUNT(*) as Count
      FROM linksetting
      GROUP BY 1
      ORDER BY Count DESC
    `);
    lsByLang.forEach(row => {
      console.log(`   ${row.Language}: ${row.Count}`);
    });
    console.log('');

    // 13. Check ProjectItemLocalization LinkSetting references
    console.log('📋 ProjectItemLocalization LinkSetting References:');
    const [[pilStats]] = await connection.execute(`
      SELECT
        COUNT(*) as totalPIL,
        SUM(CASE WHEN MainButtonLinkSettingId IS NOT NULL THEN 1 ELSE 0 END) as hasMainButton,
        SUM(CASE WHEN ItemsViewLinkSettingId IS NOT NULL THEN 1 ELSE 0 END) as hasItemsView,
        SUM(CASE WHEN ProjectFooterLinkSettingId IS NOT NULL THEN 1 ELSE 0 END) as hasFooter
      FROM projectitemlocalization
    `);
    console.log(`   Total ProjectItemLocalization: ${pilStats.totalPIL}`);
    console.log(`   With MainButtonLinkSettingId: ${pilStats.hasMainButton}`);
    console.log(`   With ItemsViewLinkSettingId: ${pilStats.hasItemsView}`);
    console.log(`   With ProjectFooterLinkSettingId: ${pilStats.hasFooter}`);
    console.log('');

    // 14. Expected vs Actual LinkSettings per project type
    console.log('📋 Projects WITH LinkSetting - by ProjectType:');
    const [withLSByType] = await connection.execute(`
      SELECT
        p.ProjectType,
        pt.Description as TypeName,
        COUNT(DISTINCT p.Id) as ProjectCount,
        COUNT(ls.Id) as TotalLinkSettings,
        ROUND(COUNT(ls.Id) / COUNT(DISTINCT p.Id), 1) as AvgLSPerProject
      FROM project p
      INNER JOIN linksetting ls ON p.Id = ls.ProjectId
      LEFT JOIN lutprojecttype pt ON p.ProjectType = pt.Id
      GROUP BY p.ProjectType, pt.Description
      ORDER BY ProjectCount DESC
    `);
    withLSByType.forEach(row => {
      console.log(`   Type ${row.ProjectType} (${row.TypeName || 'Unknown'}): ${row.ProjectCount} projects, ${row.TotalLinkSettings} LinkSettings (avg: ${row.AvgLSPerProject}/project)`);
    });

    await connection.end();
    console.log('\n✅ Check complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await connection.end();
    throw error;
  }
}

checkLinkSettingForProjects();
