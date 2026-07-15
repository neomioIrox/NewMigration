/**
 * Check how many rows have NULL IDs in source tables
 * This explains why not all rows are migrated
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkNullIds() {
  let mssqlConn;

  try {
    console.log('Connecting to MSSQL...');
    mssqlConn = await sql.connect(mssqlConfig);

    // Check RecruitersGroups
    console.log('\n=== RecruitersGroups Table ===');
    const totalGroupsResult = await mssqlConn.request()
      .query('SELECT COUNT(*) as total FROM RecruitersGroups');
    const totalGroups = totalGroupsResult.recordset[0].total;

    const nullProjectIdResult = await mssqlConn.request()
      .query('SELECT COUNT(*) as nullCount FROM RecruitersGroups WHERE ProjectId IS NULL');
    const nullProjectId = nullProjectIdResult.recordset[0].nullCount;

    const notNullProjectIdResult = await mssqlConn.request()
      .query('SELECT COUNT(*) as notNullCount FROM RecruitersGroups WHERE ProjectId IS NOT NULL');
    const notNullProjectId = notNullProjectIdResult.recordset[0].notNullCount;

    console.log(`Total rows: ${totalGroups}`);
    console.log(`ProjectId IS NOT NULL: ${notNullProjectId} ✅ (will migrate)`);
    console.log(`ProjectId IS NULL: ${nullProjectId} ❌ (will be skipped)`);
    console.log(`Percentage migrated: ${((notNullProjectId / totalGroups) * 100).toFixed(2)}%`);

    // Check ProductStock
    console.log('\n=== ProductStock Table ===');
    const totalStockResult = await mssqlConn.request()
      .query('SELECT COUNT(*) as total FROM ProductStock');
    const totalStock = totalStockResult.recordset[0].total;

    const nullProductIdResult = await mssqlConn.request()
      .query('SELECT COUNT(*) as nullCount FROM ProductStock WHERE ProductId IS NULL');
    const nullProductId = nullProductIdResult.recordset[0].nullCount;

    const notNullProductIdResult = await mssqlConn.request()
      .query('SELECT COUNT(*) as notNullCount FROM ProductStock WHERE ProductId IS NOT NULL');
    const notNullProductId = notNullProductIdResult.recordset[0].notNullCount;

    console.log(`Total rows: ${totalStock}`);
    console.log(`ProductId IS NOT NULL: ${notNullProductId} ✅ (will migrate)`);
    console.log(`ProductId IS NULL: ${nullProductId} ❌ (will be skipped)`);
    console.log(`Percentage migrated: ${((notNullProductId / totalStock) * 100).toFixed(2)}%`);

    // Show sample of NULL rows
    console.log('\n=== Sample of RecruitersGroups with NULL ProjectId ===');
    const sampleGroupsResult = await mssqlConn.request()
      .query('SELECT TOP 5 ID, Name, ProjectId FROM RecruitersGroups WHERE ProjectId IS NULL');
    console.table(sampleGroupsResult.recordset);

    console.log('\n=== Sample of ProductStock with NULL ProductId ===');
    const sampleStockResult = await mssqlConn.request()
      .query('SELECT TOP 5 ProductStockId, Name, ProductId, GroupId FROM ProductStock WHERE ProductId IS NULL');
    console.table(sampleStockResult.recordset);

    console.log('\n=== CONCLUSION ===');
    console.log('The WHERE clauses in the mapping files are filtering out rows with NULL foreign keys.');
    console.log('To migrate ALL rows, you need to:');
    console.log('1. Remove the WHERE clause from RecruitersGroupMapping.json');
    console.log('2. Remove the WHERE clause from RecruiterMapping.json');
    console.log('3. Handle NULL foreign keys appropriately in the migration logic');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (mssqlConn) {
      await mssqlConn.close();
      console.log('\nConnection closed');
    }
  }
}

checkNullIds();
