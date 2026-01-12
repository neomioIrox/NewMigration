/**
 * Test if ProductsIds are preserved as project.Id
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function testIdPreservation() {
  try {
    const mssqlConn = await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection(mysqlConfig);

    // Test range around 1957
    console.log('Testing ProductsId preservation for range 1950-1965:\n');

    const result = await mssqlConn.request()
      .query('SELECT ProductsId, Name FROM Products WHERE ProductsId BETWEEN 1950 AND 1965 ORDER BY ProductsId');

    for (const product of result.recordset) {
      const [projectRows] = await mysqlConn.query(
        'SELECT Id FROM project WHERE Id = ?',
        [product.ProductsId]
      );

      const found = projectRows.length > 0;
      const status = found ? `✅ Id=${projectRows[0].Id}` : '❌ NOT FOUND';
      console.log(`ProductsId ${product.ProductsId}: ${status}`);
    }

    await sql.close();
    await mysqlConn.end();

  } catch (err) {
    console.error('Error:', err);
  }
}

testIdPreservation();
