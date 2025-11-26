const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  });

  console.log('=== סטטוס טבלאות ===\n');

  const [projectCount] = await conn.execute(`SELECT COUNT(*) as count, MIN(Id) as min_id, MAX(Id) as max_id FROM project`);
  console.log('project:', projectCount[0]);

  const [itemCount] = await conn.execute(`SELECT COUNT(*) as count, MIN(Id) as min_id, MAX(Id) as max_id FROM projectitem`);
  console.log('projectitem:', itemCount[0]);

  // Show some projects
  const [projects] = await conn.execute(`SELECT Id, Name, ProjectType FROM project ORDER BY Id DESC LIMIT 10`);
  console.log('\n10 פרויקטים אחרונים:');
  console.table(projects);

  // Check databases
  const [dbs] = await conn.execute(`SHOW DATABASES LIKE 'kupat%'`);
  console.log('\nדאטאבייסים זמינים:');
  console.table(dbs);

  await conn.end();
}

check().catch(console.error);
