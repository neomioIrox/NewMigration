/**
 * Check status of 111 recruiters for Products 1957
 * and verify if they migrated to new DB
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function checkRecruiters() {
  let mssqlPool;
  let mysqlConn;

  try {
    console.log('🔍 Checking 111 recruiters for Products 1957...\n');

    // Connect
    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Get all ProductStock rows for Products 1957
    console.log('📊 Step 1: Getting ProductStock rows from OLD DB...');
    console.log('='.repeat(100));

    const oldRecruiters = await mssqlPool.request()
      .input('ProductId', sql.Int, 1957)
      .query(`
        SELECT
          ProductStockId,
          Name,
          Name_en,
          Name_fr,
          ProductId,
          GroupId
        FROM ProductStock
        WHERE ProductId = @ProductId
        ORDER BY ProductStockId
      `);

    console.log(`Found ${oldRecruiters.recordset.length} ProductStock rows\n`);

    if (oldRecruiters.recordset.length === 0) {
      console.log('❌ No ProductStock rows found!');
      return;
    }

    // Show first 10
    console.log('First 10 ProductStock rows:');
    console.table(oldRecruiters.recordset.slice(0, 10));

    // Get all ProductStockIds
    const productStockIds = oldRecruiters.recordset.map(r => r.ProductStockId);
    console.log(`\nProductStockId range: ${Math.min(...productStockIds)} - ${Math.max(...productStockIds)}\n`);

    // ========================================================================
    // Step 2: Check if these ProductStockIds exist in recruiter table
    // ========================================================================
    console.log('📊 Step 2: Checking if these recruiters migrated to NEW DB...');
    console.log('='.repeat(100));

    const [migratedRecruiters] = await mysqlConn.query(`
      SELECT
        Id,
        Name,
        RecruiterGroupId
      FROM recruiter
      WHERE Id IN (${productStockIds.join(',')})
      ORDER BY Id
    `);

    console.log(`Found ${migratedRecruiters.length}/${oldRecruiters.recordset.length} recruiters in NEW DB\n`);

    if (migratedRecruiters.length === 0) {
      console.log('❌ CRITICAL: ZERO recruiters migrated!');
      console.log('   All 111 recruiters are MISSING from new DB!\n');
    } else if (migratedRecruiters.length < oldRecruiters.recordset.length) {
      console.log(`⚠️  WARNING: Only ${migratedRecruiters.length} out of 111 migrated!\n`);

      console.log('Migrated recruiters (first 10):');
      console.table(migratedRecruiters.slice(0, 10));

      const migratedIds = new Set(migratedRecruiters.map(r => r.Id));
      const missingRecruiters = oldRecruiters.recordset.filter(r => !migratedIds.has(r.ProductStockId));

      console.log(`\nMissing recruiters: ${missingRecruiters.length}`);
      console.log('First 10 missing:');
      console.table(missingRecruiters.slice(0, 10));
    } else {
      console.log('✅ All 111 recruiters migrated successfully!\n');
      console.log('Migrated recruiters (first 10):');
      console.table(migratedRecruiters.slice(0, 10));
    }

    // ========================================================================
    // Step 3: Check WHERE clause that might have excluded them
    // ========================================================================
    console.log('\n📊 Step 3: Analyzing WHY recruiters might be excluded...');
    console.log('='.repeat(100));

    // Check for NULL names
    const nullNames = oldRecruiters.recordset.filter(r =>
      !r.Name || r.Name.trim() === '' || r.Name === 'null'
    );
    console.log(`Recruiters with NULL/empty Name: ${nullNames.length}`);

    // Check ProductId
    const wrongProductId = oldRecruiters.recordset.filter(r => r.ProductId !== 1957);
    console.log(`Recruiters with ProductId != 1957: ${wrongProductId.length}`);

    // Check GroupId
    const nullGroupId = oldRecruiters.recordset.filter(r => !r.GroupId);
    console.log(`Recruiters with NULL GroupId: ${nullGroupId.length}`);

    // ========================================================================
    // Step 4: Sample data analysis
    // ========================================================================
    console.log('\n📊 Step 4: Sample data from 111 recruiters...');
    console.log('='.repeat(100));

    console.log('\nSample recruiter (first one):');
    console.log(JSON.stringify(oldRecruiters.recordset[0], null, 2));

    // ========================================================================
    // Step 5: FINAL SUMMARY
    // ========================================================================
    console.log('\n' + '='.repeat(100));
    console.log('🎯 SUMMARY');
    console.log('='.repeat(100));
    console.log();
    console.log(`Products 1957 → project 1401 ("שרה שרלין")`);
    console.log(`  - Recruiters in OLD DB: ${oldRecruiters.recordset.length}`);
    console.log(`  - Recruiters in NEW DB: ${migratedRecruiters.length}`);
    console.log(`  - Missing: ${oldRecruiters.recordset.length - migratedRecruiters.length}`);
    console.log();

    if (migratedRecruiters.length === 0) {
      console.log('🔴 ROOT CAUSE: Migration skipped ALL 111 recruiters');
      console.log();
      console.log('Possible reasons:');
      console.log('  1. WHERE clause excluded ProductId=1957 (check migration script)');
      console.log('  2. Migration happened BEFORE Products 1957 was migrated (timing issue)');
      console.log('  3. ProductStock.ProductId column had different values during migration');
      console.log('  4. Data quality issue (NULL names, invalid data)');
      console.log();
      console.log('Next steps:');
      console.log('  1. Check recruiter migration script WHERE clause');
      console.log('  2. Check migration logs for errors');
      console.log('  3. Check if there\'s a filter on ProductId in migration');
      console.log('  4. Re-run migration specifically for ProductId=1957');
    }
    console.log();
    console.log('='.repeat(100));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (mssqlPool) await mssqlPool.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

checkRecruiters();
