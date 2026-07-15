/**
 * Test if recruiter migration actually worked for ANY project
 * or if it failed silently for all
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function testRecruiterSystem() {
  let mssqlPool;
  let mysqlConn;

  try {
    console.log('🔍 Testing Recruiter Migration System\n');
    console.log('='.repeat(80));

    // Connect
    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // ========================================
    // STEP 1: Count total recruiters in old DB
    // ========================================
    console.log('\n📊 STEP 1: Count ProductStock in OLD DB...');
    console.log('-'.repeat(80));

    const totalOldRecruiters = await mssqlPool.request().query(`
      SELECT COUNT(*) as count
      FROM ProductStock
      WHERE ProductId IS NOT NULL
    `);

    console.log(`Total ProductStock rows (with ProductId): ${totalOldRecruiters.recordset[0].count}`);

    // ========================================
    // STEP 2: Count recruiters in new DB
    // ========================================
    console.log('\n📊 STEP 2: Count recruiter in NEW DB...');
    console.log('-'.repeat(80));

    const [totalNewRecruiters] = await mysqlConn.query('SELECT COUNT(*) as count FROM recruiter');
    console.log(`Total recruiter rows: ${totalNewRecruiters[0].count}`);

    // ========================================
    // STEP 3: Sample test - Get 10 random ProductIds
    // ========================================
    console.log('\n📊 STEP 3: Testing 10 random Products with recruiters...');
    console.log('-'.repeat(80));

    const sampleProducts = await mssqlPool.request().query(`
      SELECT TOP 10
        ProductId,
        COUNT(*) as RecruiterCount
      FROM ProductStock
      WHERE ProductId IS NOT NULL
      GROUP BY ProductId
      ORDER BY NEWID()
    `);

    console.log(`\nTesting ${sampleProducts.recordset.length} random Products:\n`);

    let successCount = 0;
    let failCount = 0;

    for (const product of sampleProducts.recordset) {
      const productId = product.ProductId;
      const oldCount = product.RecruiterCount;

      // Check if this ProductId exists in ProjectId.json
      const fs = require('fs');
      const path = require('path');
      const projectIdPath = path.join(__dirname, '../../data/fk-mappings/ProjectId.json');

      let hasMapping = false;
      let mappedProjectId = null;

      if (fs.existsSync(projectIdPath)) {
        const projectIdData = JSON.parse(fs.readFileSync(projectIdPath, 'utf-8'));
        if (projectIdData.mappings && projectIdData.mappings[productId]) {
          hasMapping = true;
          mappedProjectId = projectIdData.mappings[productId];
        }
      }

      // Check if project exists in new DB
      const [projectRows] = await mysqlConn.query(
        'SELECT Id, ProjectType FROM project WHERE Id = ?',
        [mappedProjectId || productId]
      );

      const projectExists = projectRows.length > 0;
      const actualProjectId = projectExists ? projectRows[0].Id : null;

      // Get ProductStockIds for this ProductId
      const oldRecruiterIds = await mssqlPool.request()
        .input('ProductId', sql.Int, productId)
        .query('SELECT ProductStockId FROM ProductStock WHERE ProductId = @ProductId');

      const recruiterIds = oldRecruiterIds.recordset.map(r => r.ProductStockId);

      // Check if these recruiters exist in new DB
      let newCount = 0;
      if (recruiterIds.length > 0) {
        const [newRecruiters] = await mysqlConn.query(`
          SELECT COUNT(*) as count
          FROM recruiter
          WHERE Id IN (${recruiterIds.join(',')})
        `);
        newCount = newRecruiters[0].count;
      }

      const success = (newCount === oldCount);
      if (success) successCount++;
      else failCount++;

      console.log(`ProductId ${productId}:`);
      console.log(`  - Recruiters in OLD DB: ${oldCount}`);
      console.log(`  - Has ProjectId mapping: ${hasMapping ? `YES (→ ${mappedProjectId})` : 'NO ❌'}`);
      console.log(`  - Project exists in new DB: ${projectExists ? `YES (Id=${actualProjectId})` : 'NO ❌'}`);
      console.log(`  - Recruiters in NEW DB: ${newCount}`);
      console.log(`  - Status: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('📊 RESULTS');
    console.log('='.repeat(80));
    console.log(`Success: ${successCount}/${sampleProducts.recordset.length}`);
    console.log(`Failed: ${failCount}/${sampleProducts.recordset.length}`);
    console.log();

    if (failCount > 0) {
      console.log('🚨 CONCLUSION: Recruiter migration has systematic issues!');
      console.log('   Many Products have missing FK mappings in ProjectId.json.');
      console.log('   This causes ALL recruiters for those Products to be skipped.');
    } else {
      console.log('✅ CONCLUSION: All tested Products migrated successfully!');
      console.log('   The issue with Products 1957 might be isolated.');
    }
    console.log('='.repeat(80));

    await mssqlPool.close();
    await mysqlConn.end();

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testRecruiterSystem();
