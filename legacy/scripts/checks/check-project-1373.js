const mysql = require('mysql2/promise');

async function checkProject1373() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  });

  try {
    console.log('=== בדיקת פרויקט 1373 ===\n');

    // 1. Check if project exists
    const [project] = await connection.execute(`
      SELECT Id, Name, ProjectType, KupatFundNo, RecordStatus, CreatedAt
      FROM project
      WHERE Id = 1373
    `);

    if (project.length === 0) {
      console.log('❌ פרויקט 1373 לא קיים בטבלת project');
      return;
    }

    console.log('✅ פרויקט קיים בטבלת project:');
    console.table(project);

    // 2. Check projectItem for this project
    const [items] = await connection.execute(`
      SELECT Id, ProjectId, ItemName, ItemType, PriceType, RecordStatus
      FROM projectitem
      WHERE ProjectId = 1373
    `);

    if (items.length === 0) {
      console.log('\n❌ אין שורות בטבלת projectItem עבור ProjectId = 1373');
    } else {
      console.log('\n✅ שורות בטבלת projectItem:');
      console.table(items);
    }

    // 3. Check how many projects don't have projectItems
    const [missingItems] = await connection.execute(`
      SELECT p.Id, p.Name, p.ProjectType, p.KupatFundNo
      FROM project p
      LEFT JOIN projectitem pi ON p.Id = pi.ProjectId
      WHERE pi.Id IS NULL
      ORDER BY p.Id
    `);

    console.log(`\n=== פרויקטים ללא projectItem (סה"כ: ${missingItems.length}) ===`);
    if (missingItems.length > 0) {
      console.table(missingItems.slice(0, 20)); // Show first 20
      if (missingItems.length > 20) {
        console.log(`... ועוד ${missingItems.length - 20} פרויקטים`);
      }
    }

    // 4. Check total counts
    const [counts] = await connection.execute(`
      SELECT
        (SELECT COUNT(*) FROM project) as total_projects,
        (SELECT COUNT(DISTINCT ProjectId) FROM projectitem) as projects_with_items
    `);

    console.log('\n=== סיכום ===');
    console.log(`סה"כ פרויקטים: ${counts[0].total_projects}`);
    console.log(`פרויקטים עם projectItem: ${counts[0].projects_with_items}`);
    console.log(`פרויקטים ללא projectItem: ${counts[0].total_projects - counts[0].projects_with_items}`);

  } finally {
    await connection.end();
  }
}

checkProject1373().catch(console.error);
