/**
 * Investigate why Products with certain IDs exist in project table
 * but are marked as NOT_MIGRATED in ProductsMapping.json
 *
 * Root Question: Why does ProductsId != project.Id for some products?
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function investigateIdPreservation() {
  let mssqlConn;
  let mysqlConn;

  try {
    console.log('=== Investigating ID Preservation in Migration ===\n');

    mssqlConn = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection(mysqlConfig);

    // ========================================
    // STEP 1: Check if IDs are preserved
    // ========================================
    console.log('STEP 1: Checking if ProductsId == project.Id\n');
    console.log('Sample Products: 1-10 and 1950-1965\n');

    const testIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959, 1960, 1961, 1962, 1963, 1964, 1965];

    let preserved = 0;
    let notPreserved = 0;
    let notInOldDb = 0;
    const notPreservedList = [];

    for (const productsId of testIds) {
      // Check if exists in old DB
      const oldResult = await mssqlConn.request()
        .query(`SELECT ProductsId, Name FROM Products WHERE ProductsId = ${productsId}`);

      if (oldResult.recordset.length === 0) {
        console.log(`ProductsId ${productsId}: ⚠️  Does not exist in old DB`);
        notInOldDb++;
        continue;
      }

      // Check if exists in new DB with same Id
      const [newResult] = await mysqlConn.query(
        'SELECT Id FROM project WHERE Id = ?',
        [productsId]
      );

      if (newResult.length > 0) {
        console.log(`ProductsId ${productsId}: ✅ PRESERVED (Id maintained)`);
        preserved++;
      } else {
        console.log(`ProductsId ${productsId}: ❌ NOT PRESERVED (Id changed or not migrated)`);
        notPreserved++;
        notPreservedList.push(productsId);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY:');
    console.log(`✅ Preserved: ${preserved}`);
    console.log(`❌ Not Preserved: ${notPreserved}`);
    console.log(`⚠️  Not in old DB: ${notInOldDb}`);
    console.log('='.repeat(70));

    // ========================================
    // STEP 2: For NOT preserved - find where they went
    // ========================================
    if (notPreservedList.length > 0) {
      console.log('\n\nSTEP 2: Finding where NOT PRESERVED Products migrated to\n');

      for (const productsId of notPreservedList.slice(0, 5)) {
        const oldResult = await mssqlConn.request()
          .query(`SELECT Name FROM Products WHERE ProductsId = ${productsId}`);

        const oldName = oldResult.recordset[0].Name;

        // Try to find by name in projectlocalization
        const [searchResult] = await mysqlConn.query(
          `SELECT p.Id, pl.Title
           FROM project p
           INNER JOIN projectlocalization pl ON p.Id = pl.ProjectId
           WHERE pl.Language = 1 AND pl.Title = ?
           LIMIT 1`,
          [oldName]
        );

        if (searchResult.length > 0) {
          console.log(`ProductsId ${productsId}:`);
          console.log(`  Old Name: "${oldName.substring(0, 60)}"`);
          console.log(`  → Found in project with Id=${searchResult[0].Id} ❌ (ID CHANGED!)`);
          console.log(`  → This is why mapping shows NOT_MIGRATED`);
        } else {
          console.log(`ProductsId ${productsId}: Not found at all (truly not migrated)`);
        }
      }
    }

    // ========================================
    // STEP 3: Check project table structure
    // ========================================
    console.log('\n\nSTEP 3: Checking project table Id column\n');

    const [tableInfo] = await mysqlConn.query('SHOW CREATE TABLE project');
    const createStatement = tableInfo[0]['Create Table'];

    console.log('Checking Id column definition:');
    const idMatch = createStatement.match(/`Id`[^\n,]+/);
    if (idMatch) {
      console.log(idMatch[0]);

      if (idMatch[0].includes('AUTO_INCREMENT')) {
        console.log('\n⚠️  PROBLEM FOUND: Id column has AUTO_INCREMENT');
        console.log('   This means IDs are auto-generated, not preserved from old DB!');
      } else {
        console.log('\n✅ Id does NOT have AUTO_INCREMENT');
        console.log('   Migration should be able to preserve IDs');
      }
    }

    // ========================================
    // STEP 4: Check actual project IDs
    // ========================================
    console.log('\n\nSTEP 4: Sampling actual project IDs\n');

    const [sampleProjects] = await mysqlConn.query(
      'SELECT Id FROM project ORDER BY Id LIMIT 20'
    );

    console.log('First 20 project IDs:', sampleProjects.map(p => p.Id).join(', '));

    const [idStats] = await mysqlConn.query(`
      SELECT
        MIN(Id) as minId,
        MAX(Id) as maxId,
        COUNT(*) as total,
        MAX(Id) - MIN(Id) + 1 as range,
        (MAX(Id) - MIN(Id) + 1) - COUNT(*) as gaps
      FROM project
    `);

    console.log('\nProject ID Statistics:');
    console.table(idStats[0]);

    if (idStats[0].gaps > 0) {
      console.log(`\n⚠️  There are ${idStats[0].gaps} gaps in the ID sequence`);
      console.log('   This suggests IDs were NOT inserted sequentially');
      console.log('   Some Products may have been skipped or IDs not preserved');
    }

    // ========================================
    // FINAL CONCLUSION
    // ========================================
    console.log('\n' + '='.repeat(70));
    console.log('ROOT CAUSE ANALYSIS');
    console.log('='.repeat(70));

    if (notPreserved > 0) {
      console.log('\n❌ PROBLEM: Some ProductsIds are NOT preserved during migration');
      console.log('   - ProductsId in old DB != project.Id in new DB');
      console.log('   - create-products-mapping.js searches: WHERE Id = ProductsId');
      console.log('   - Result: Mapping shows "NOT_MIGRATED" even though product exists\n');

      console.log('POSSIBLE CAUSES:');
      console.log('1. Migration uses AUTO_INCREMENT and doesn\'t set Id explicitly');
      console.log('2. Smart Skip with different ordering');
      console.log('3. Multiple migration runs with overlapping data');
      console.log('4. Migration script doesn\'t preserve Id from Products.ProductsId\n');

      console.log('NEXT STEPS:');
      console.log('1. Check migration script - does it INSERT with explicit Id?');
      console.log('2. Check if AUTO_INCREMENT is preventing Id preservation');
      console.log('3. Review migration logs for any Id-related messages');
    } else {
      console.log('\n✅ All sampled Products have preserved IDs');
      console.log('   The mapping should work correctly');
    }
    console.log('='.repeat(70));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (mssqlConn) await mssqlConn.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

investigateIdPreservation();
