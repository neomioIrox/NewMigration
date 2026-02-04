const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  });

  console.log('=== פרויקט 1373 ===\n');

  const [project] = await conn.execute(`
    SELECT Id, Name, ProjectType, KupatFundNo, RecordStatus
    FROM project WHERE Id = 1373
  `);
  console.log('project:');
  console.table(project);

  const [items] = await conn.execute(`
    SELECT Id, ProjectId, ItemName, ItemType
    FROM projectitem WHERE ProjectId = 1373
  `);
  console.log('\nprojectitem:');
  console.table(items.length ? items : [{ result: 'אין שורות' }]);

  // Check ProjectType distribution of projects without items
  const [missing] = await conn.execute(`
    SELECT p.ProjectType, COUNT(*) as count
    FROM project p
    LEFT JOIN projectitem pi ON p.Id = pi.ProjectId
    WHERE pi.Id IS NULL
    GROUP BY p.ProjectType
  `);
  console.log('\nפרויקטים ללא projectitem לפי ProjectType:');
  console.table(missing);

  await conn.end();
}

check().catch(console.error);
