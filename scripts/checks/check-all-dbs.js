const mysql = require('mysql2/promise');

async function check() {
  const databases = ['kupathairtest', 'kupathairnew', 'kupathairnewtest'];

  for (const db of databases) {
    console.log(`\n=== ${db} ===`);
    try {
      const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '1234',
        database: db
      });

      const [projectCount] = await conn.execute(`SELECT COUNT(*) as count, MAX(Id) as max_id FROM project`);
      console.log('project:', projectCount[0]);

      const [project1373] = await conn.execute(`SELECT Id, Name, ProjectType FROM project WHERE Id = 1373`);
      if (project1373.length > 0) {
        console.log('פרויקט 1373 נמצא!');
        console.table(project1373);

        const [items] = await conn.execute(`SELECT * FROM projectitem WHERE ProjectId = 1373`);
        console.log(`projectitem עבור 1373: ${items.length} שורות`);
        if (items.length > 0) console.table(items);
      } else {
        console.log('פרויקט 1373 לא קיים');
      }

      await conn.end();
    } catch (err) {
      console.log('שגיאה:', err.message);
    }
  }
}

check().catch(console.error);
