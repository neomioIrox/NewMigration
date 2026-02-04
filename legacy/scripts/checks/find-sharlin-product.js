/**
 * Find the original Products for "שרלין" fund
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function findProduct() {
  let mssqlPool;
  let mysqlConn;

  try {
    console.log('🔍 Searching for "שרלין" Products in OLD DB...\n');

    // Connect to databases
    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Search for Products with "שרלין" in name
    const searchResults = await mssqlPool.request()
      .query(`
        SELECT TOP 20
          productsid,
          Name,
          Name_en,
          ProjectType
        FROM Products
        WHERE Name LIKE N'%שרלין%'
        ORDER BY productsid
      `);

    console.log(`Found ${searchResults.recordset.length} Products with "שרלין" in name:\n`);
    console.table(searchResults.recordset);

    // For each product, check if it exists in new DB and count recruiters
    console.log('\nChecking migration status for each Product:\n');
    console.log('='.repeat(100));

    for (const product of searchResults.recordset) {
      console.log(`\nProducts ${product.productsid}: ${product.Name}`);
      console.log('-'.repeat(100));

      // Check if it exists in new DB (try by Id)
      const [newProjects] = await mysqlConn.query(
        'SELECT Id, ProjectType FROM project WHERE Id = ?',
        [product.productsid]
      );

      if (newProjects.length > 0) {
        console.log(`  ✅ Found in NEW DB as project ${newProjects[0].Id} (ProjectType=${newProjects[0].ProjectType})`);
      } else {
        console.log(`  ❌ NOT found in NEW DB with Id=${product.productsid}`);
      }

      // Count recruiters in old DB
      const recruitersOld = await mssqlPool.request()
        .input('ProductId', sql.Int, product.productsid)
        .query(`
          SELECT COUNT(*) as count
          FROM ProductStock
          WHERE ProductId = @ProductId
        `);

      const oldCount = recruitersOld.recordset[0].count;
      console.log(`  📊 Recruiters in OLD DB: ${oldCount}`);
    }

    console.log('\n' + '='.repeat(100));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (mssqlPool) await mssqlPool.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

findProduct();
