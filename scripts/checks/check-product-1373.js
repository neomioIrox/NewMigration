const sql = require('mssql');

async function checkProduct1373() {
  const config = {
    server: 'localhost',
    database: 'NewKupatHair',
    options: {
      trustServerCertificate: true,
      encrypt: false
    },
    authentication: {
      type: 'default',
      options: {
        userName: 'sa',
        password: 'sasa'
      }
    }
  };

  try {
    await sql.connect(config);
    console.log('=== בדיקת מוצר 1373 במקור ===\n');

    // 1. Check if product 1373 exists
    const product = await sql.query`
      SELECT Id, Name, ProjectNumber, ProductTypeId, Terminal
      FROM products
      WHERE Id = 1373
    `;

    if (product.recordset.length === 0) {
      console.log('❌ מוצר 1373 לא קיים בטבלת products');
    } else {
      console.log('✅ מוצר קיים בטבלת products:');
      console.table(product.recordset);
    }

    // 2. Check project range in target
    const mysql = require('mysql2/promise');
    const mysqlConn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '1234',
      database: 'kupathairtest'
    });

    const [projectRange] = await mysqlConn.execute(`
      SELECT MIN(Id) as min_id, MAX(Id) as max_id, COUNT(*) as total
      FROM project
    `);

    console.log('\n=== טווח פרויקטים בטבלת היעד ===');
    console.table(projectRange);

    // 3. Check if product 1373 was migrated (by KupatFundNo)
    const [byFundNo] = await mysqlConn.execute(`
      SELECT Id, Name, ProjectType, KupatFundNo
      FROM project
      WHERE KupatFundNo = 1373 OR KupatFundNo = (
        SELECT ProjectNumber FROM (SELECT 1373 as x) t
      )
      LIMIT 5
    `);

    if (byFundNo.length > 0) {
      console.log('\n✅ נמצא פרויקט עם KupatFundNo קשור:');
      console.table(byFundNo);
    }

    // 4. Find projects around 1373
    const [nearby] = await mysqlConn.execute(`
      SELECT Id, Name, ProjectType, KupatFundNo
      FROM project
      WHERE Id BETWEEN 1370 AND 1380
      ORDER BY Id
    `);

    console.log('\n=== פרויקטים באזור 1370-1380 ===');
    if (nearby.length > 0) {
      console.table(nearby);
    } else {
      console.log('אין פרויקטים בטווח זה');
    }

    await mysqlConn.end();
    await sql.close();

  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkProduct1373().catch(console.error);
