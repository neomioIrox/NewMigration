/**
 * Check LinkSetting and ProjectItem relationship
 */
const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../legacy/config/database');

async function check() {
  const conn = await mysql.createConnection(mysqlConfig);

  // Check how many ProjectItems exist per Project for Collections
  console.log('=== ProjectItems per Collection Project (Type 2) ===');
  const [itemsPerProject] = await conn.execute(`
    SELECT
      p.Id as ProjectId,
      p.ProjectType,
      COUNT(pi.Id) as ItemCount
    FROM project p
    LEFT JOIN projectitem pi ON p.Id = pi.ProjectId
    WHERE p.ProjectType = 2
    GROUP BY p.Id, p.ProjectType
    ORDER BY ItemCount DESC
    LIMIT 10
  `);
  itemsPerProject.forEach(r => console.log('  Project ' + r.ProjectId + ': ' + r.ItemCount + ' items'));

  // Check if any Collection has LinkSettings
  console.log('\n=== Collections with LinkSetting ===');
  const [collectionsWithLS] = await conn.execute(`
    SELECT
      p.Id as ProjectId,
      COUNT(DISTINCT ls.Id) as LSCount,
      COUNT(DISTINCT pi.Id) as ItemCount
    FROM project p
    LEFT JOIN linksetting ls ON p.Id = ls.ProjectId
    LEFT JOIN projectitem pi ON p.Id = pi.ProjectId
    WHERE p.ProjectType = 2 AND ls.Id IS NOT NULL
    GROUP BY p.Id
    LIMIT 10
  `);
  if (collectionsWithLS.length === 0) {
    console.log('  No Collections have LinkSettings!');
  } else {
    collectionsWithLS.forEach(r => console.log('  Project ' + r.ProjectId + ': ' + r.LSCount + ' LinkSettings, ' + r.ItemCount + ' Items'));
  }

  // Check LinkSetting → ProjectItem relationship for Funds
  console.log('\n=== Sample LinkSettings (Funds) - ItemId usage ===');
  const [sampleLS] = await conn.execute(`
    SELECT
      ls.Id, ls.ProjectId, ls.ItemId, ls.LinkType,
      p.ProjectType,
      pi.ItemType as ItemItemType
    FROM linksetting ls
    JOIN project p ON ls.ProjectId = p.Id
    LEFT JOIN projectitem pi ON ls.ItemId = pi.Id
    WHERE p.ProjectType = 1
    ORDER BY ls.ProjectId
    LIMIT 15
  `);
  sampleLS.forEach(r => {
    console.log('  LS ' + r.Id + ' -> Project ' + r.ProjectId + ', Item ' + (r.ItemId || 'NULL') + ', LinkType ' + r.LinkType + ', ItemType ' + (r.ItemItemType || 'N/A'));
  });

  // Check how many items each Fund project has
  console.log('\n=== Fund Projects - Items count ===');
  const [fundsItems] = await conn.execute(`
    SELECT
      p.Id,
      COUNT(pi.Id) as ItemCount
    FROM project p
    LEFT JOIN projectitem pi ON p.Id = pi.ProjectId
    WHERE p.ProjectType = 1
    GROUP BY p.Id
    ORDER BY ItemCount DESC
    LIMIT 10
  `);
  fundsItems.forEach(r => console.log('  Project ' + r.Id + ': ' + r.ItemCount + ' items'));

  // Check ProjectItemLocalization updates
  console.log('\n=== ProjectItemLocalization - LinkSetting References ===');
  const [pilRefs] = await conn.execute(`
    SELECT
      pi.ProjectId,
      p.ProjectType,
      pil.ItemId,
      pil.Language,
      pil.MainButtonLinkSettingId,
      pil.ProjectFooterLinkSettingId
    FROM projectitemlocalization pil
    JOIN projectitem pi ON pil.ItemId = pi.Id
    JOIN project p ON pi.ProjectId = p.Id
    WHERE pil.ProjectFooterLinkSettingId IS NOT NULL
    ORDER BY pi.ProjectId, pil.Language
    LIMIT 15
  `);
  pilRefs.forEach(r => {
    console.log('  Project ' + r.ProjectId + ' (Type ' + r.ProjectType + '), Item ' + r.ItemId + ', Lang ' + r.Language +
      ' -> MainButton: ' + (r.MainButtonLinkSettingId || 'NULL') + ', Footer: ' + (r.ProjectFooterLinkSettingId || 'NULL'));
  });

  // Verify: Does the LinkSetting.ItemId match the ProjectItemLocalization.ItemId?
  console.log('\n=== Verification: LinkSetting.ItemId vs PILocalization.ItemId ===');
  const [verify] = await conn.execute(`
    SELECT
      pil.ItemId as PILItemId,
      pil.ProjectFooterLinkSettingId,
      ls.ItemId as LSItemId,
      CASE WHEN pil.ItemId = ls.ItemId THEN 'MATCH' ELSE 'MISMATCH' END as Status
    FROM projectitemlocalization pil
    JOIN linksetting ls ON pil.ProjectFooterLinkSettingId = ls.Id
    LIMIT 10
  `);
  verify.forEach(r => {
    console.log('  PIL.ItemId=' + r.PILItemId + ', LS.ItemId=' + r.LSItemId + ' -> ' + r.Status);
  });

  await conn.end();
  console.log('\n✅ Check complete!');
}

check();
