/**
 * Investigation: Why are recruiters missing for project 1401 (גב' שרלין)?
 *
 * This script traces the migration path:
 * 1. Find original ProductsId for project 1401
 * 2. Find ProductStock rows linked to that ProductsId in old DB
 * 3. Check if those ProductStock rows migrated to recruiter table
 * 4. Identify root cause of missing recruiters
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');
const fs = require('fs').promises;
const path = require('path');

async function investigate() {
  let mssqlPool;
  let mysqlConn;

  try {
    console.log('='.repeat(80));
    console.log('🔍 INVESTIGATION: Project 1401 Missing Recruiters');
    console.log('='.repeat(80));
    console.log();

    // Connect to databases
    console.log('📡 Connecting to databases...');
    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ Connected to both databases\n');

    // ========================================================================
    // STEP 1: Get project 1401 details from new DB
    // ========================================================================
    console.log('📋 STEP 1: Getting project 1401 details from NEW DB...');
    console.log('-'.repeat(80));

    const [projectRows] = await mysqlConn.query(`
      SELECT
        p.Id as ProjectId,
        p.ProjectType,
        pl.Title,
        pl.Language
      FROM project p
      LEFT JOIN projectlocalization pl ON p.Id = pl.ProjectId
      WHERE p.Id = 1401 AND pl.Language = 1
    `);

    if (projectRows.length === 0) {
      console.log('❌ ERROR: Project 1401 does not exist in new DB!');
      return;
    }

    const project = projectRows[0];
    console.log(`✅ Found project 1401:`);
    console.log(`   - Title: ${project.Title}`);
    console.log(`   - ProjectType: ${project.ProjectType} (1=Fund, 2=Campaign Type2, 3=Campaign Type3)`);
    console.log();

    // ========================================================================
    // STEP 2: Find original ProductsId from ProductsMapping.json
    // ========================================================================
    console.log('📋 STEP 2: Finding original ProductsId from ProductsMapping.json...');
    console.log('-'.repeat(80));

    const mappingPath = path.join(__dirname, '../../data/fk-mappings/ProductsMapping.json');
    let productsMapping = {};

    try {
      const mappingContent = await fs.readFile(mappingPath, 'utf-8');
      productsMapping = JSON.parse(mappingContent);
    } catch (err) {
      console.log('❌ ERROR: Cannot read ProductsMapping.json:', err.message);
      return;
    }

    // Find ProductsId where ProjectId = 1401
    let originalProductsId = null;
    for (const [productsId, data] of Object.entries(productsMapping)) {
      if (data.ProjectId === 1401) {
        originalProductsId = parseInt(productsId);
        console.log(`✅ Found original ProductsId: ${originalProductsId}`);
        console.log(`   Mapping:`, data);
        break;
      }
    }

    if (!originalProductsId) {
      console.log('❌ ERROR: No ProductsId found for ProjectId 1401 in mapping!');
      return;
    }
    console.log();

    // ========================================================================
    // STEP 3: Get Products details from old DB
    // ========================================================================
    console.log('📋 STEP 3: Getting Products details from OLD DB...');
    console.log('-'.repeat(80));

    const oldProducts = await mssqlPool.request()
      .input('ProductsId', sql.Int, originalProductsId)
      .query(`
        SELECT
          ProductsId,
          Name,
          Name_en,
          ProductType,
          RecordStatus
        FROM Products
        WHERE ProductsId = @ProductsId
      `);

    if (oldProducts.recordset.length === 0) {
      console.log(`❌ ERROR: Products ${originalProductsId} not found in old DB!`);
      return;
    }

    const oldProduct = oldProducts.recordset[0];
    console.log(`✅ Found original Products:`);
    console.log(`   - ProductsId: ${oldProduct.ProductsId}`);
    console.log(`   - Name: ${oldProduct.Name}`);
    console.log(`   - Name_en: ${oldProduct.Name_en}`);
    console.log(`   - ProductType: ${oldProduct.ProductType}`);
    console.log();

    // ========================================================================
    // STEP 4: Find ProductStock rows linked to this ProductsId
    // ========================================================================
    console.log('📋 STEP 4: Finding ProductStock (recruiters) linked to this Products...');
    console.log('-'.repeat(80));

    const oldRecruiters = await mssqlPool.request()
      .input('ProductsId', sql.Int, originalProductsId)
      .query(`
        SELECT
          ProductStockId,
          Name,
          Name_en,
          Name_fr,
          ProductId,
          RecruitersGroupId,
          RecordStatus
        FROM ProductStock
        WHERE ProductId = @ProductsId
        ORDER BY ProductStockId
      `);

    console.log(`📊 Found ${oldRecruiters.recordset.length} ProductStock rows linked to Products ${originalProductsId}\n`);

    if (oldRecruiters.recordset.length === 0) {
      console.log('⚠️  No recruiters found for this Products in old DB!');
      console.log('   This might explain why no recruiters migrated.');
      return;
    }

    console.log('ProductStock rows:');
    console.log('-'.repeat(80));
    for (const recruiter of oldRecruiters.recordset) {
      console.log(`   ${recruiter.ProductStockId}: ${recruiter.Name} (ProductId=${recruiter.ProductId}, GroupId=${recruiter.RecruitersGroupId})`);
    }
    console.log();

    // ========================================================================
    // STEP 5: Check if these ProductStock rows migrated to recruiter table
    // ========================================================================
    console.log('📋 STEP 5: Checking if these recruiters migrated to NEW DB...');
    console.log('-'.repeat(80));

    const productStockIds = oldRecruiters.recordset.map(r => r.ProductStockId);

    // Check recruiter table by Id (should preserve old ProductStockId)
    const [newRecruiters] = await mysqlConn.query(`
      SELECT
        Id,
        Name,
        RecruiterGroupId,
        RecordStatus
      FROM recruiter
      WHERE Id IN (${productStockIds.join(',')})
    `);

    console.log(`📊 Found ${newRecruiters.length}/${oldRecruiters.recordset.length} recruiters in NEW DB\n`);

    if (newRecruiters.length === 0) {
      console.log('❌ CRITICAL: NONE of the recruiters migrated!');
      console.log('   This is the root cause of the problem.\n');
    } else if (newRecruiters.length < oldRecruiters.recordset.length) {
      console.log('⚠️  WARNING: Only SOME recruiters migrated!\n');
      console.log('Migrated recruiters:');
      console.log('-'.repeat(80));
      for (const recruiter of newRecruiters) {
        console.log(`   ${recruiter.Id}: ${recruiter.Name}`);
      }
      console.log();

      const migratedIds = new Set(newRecruiters.map(r => r.Id));
      const missingRecruiters = oldRecruiters.recordset.filter(r => !migratedIds.has(r.ProductStockId));

      console.log('Missing recruiters:');
      console.log('-'.repeat(80));
      for (const recruiter of missingRecruiters) {
        console.log(`   ${recruiter.ProductStockId}: ${recruiter.Name}`);
      }
      console.log();
    } else {
      console.log('✅ All recruiters migrated successfully!\n');
    }

    // ========================================================================
    // STEP 6: Check RecruitersGroup migration
    // ========================================================================
    console.log('📋 STEP 6: Checking RecruitersGroup migration...');
    console.log('-'.repeat(80));

    // Get unique RecruitersGroupIds from old recruiters
    const groupIds = [...new Set(oldRecruiters.recordset
      .map(r => r.RecruitersGroupId)
      .filter(id => id !== null && id !== 0))];

    if (groupIds.length === 0) {
      console.log('⚠️  No RecruitersGroupId found in old recruiters (all NULL or 0)');
      console.log('   This might be expected if recruiters don\'t belong to groups.\n');
    } else {
      console.log(`📊 Found ${groupIds.length} unique RecruitersGroupId values: ${groupIds.join(', ')}\n`);

      // Check if these groups exist in old DB
      const oldGroups = await mssqlPool.request()
        .query(`
          SELECT ID, Name
          FROM RecruitersGroups
          WHERE ID IN (${groupIds.join(',')})
        `);

      console.log('OLD DB RecruitersGroups:');
      console.log('-'.repeat(80));
      for (const group of oldGroups.recordset) {
        console.log(`   ${group.ID}: ${group.Name}`);
      }
      console.log();

      // Check if these groups migrated to new DB
      const [newGroups] = await mysqlConn.query(`
        SELECT Id, Name
        FROM recruitersgroup
        WHERE Id IN (${groupIds.join(',')})
      `);

      console.log(`📊 Found ${newGroups.length}/${oldGroups.recordset.length} groups in NEW DB\n`);

      if (newGroups.length === 0) {
        console.log('❌ CRITICAL: NONE of the recruiter groups migrated!');
      } else if (newGroups.length < oldGroups.recordset.length) {
        console.log('⚠️  WARNING: Only SOME groups migrated!\n');
        console.log('Migrated groups:');
        console.log('-'.repeat(80));
        for (const group of newGroups) {
          console.log(`   ${group.Id}: ${group.Name}`);
        }
        console.log();
      } else {
        console.log('✅ All groups migrated successfully!\n');
      }
    }

    // ========================================================================
    // STEP 7: Summary and Root Cause Analysis
    // ========================================================================
    console.log('='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log();
    console.log(`Project 1401 (${project.Title}):`);
    console.log(`  - Original ProductsId: ${originalProductsId}`);
    console.log(`  - Recruiters in old DB: ${oldRecruiters.recordset.length}`);
    console.log(`  - Recruiters migrated: ${newRecruiters.length}`);
    console.log(`  - Missing recruiters: ${oldRecruiters.recordset.length - newRecruiters.length}`);
    console.log();

    if (newRecruiters.length === 0) {
      console.log('🔴 ROOT CAUSE: Recruiters did NOT migrate from old DB');
      console.log();
      console.log('Possible reasons:');
      console.log('  1. Migration WHERE clause excluded these recruiters (RecordStatus filter?)');
      console.log('  2. Migration script had errors during these specific rows');
      console.log('  3. ProductStock table structure issue (missing columns?)');
      console.log('  4. Data quality issue (NULL names, invalid data?)');
      console.log();
      console.log('Next steps:');
      console.log('  1. Check migration logs for errors');
      console.log('  2. Check WHERE clause in recruiter migration script');
      console.log('  3. Verify data quality of these specific ProductStock rows');
      console.log('  4. Re-run migration for these specific recruiters');
    } else if (newRecruiters.length < oldRecruiters.recordset.length) {
      console.log('🟡 ROOT CAUSE: Only SOME recruiters migrated');
      console.log();
      console.log('Next steps:');
      console.log('  1. Investigate why specific recruiters were skipped');
      console.log('  2. Check for data quality issues in missing recruiters');
      console.log('  3. Re-run migration for missing recruiters only');
    } else {
      console.log('✅ All recruiters migrated successfully!');
      console.log();
      console.log('🤔 If user reports missing recruiters, check:');
      console.log('  1. Are recruiters linked to the correct project?');
      console.log('  2. Is there a UI query filter that excludes them?');
      console.log('  3. Are there additional recruiters expected that aren\'t in old DB?');
    }
    console.log();
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error during investigation:', error);
  } finally {
    // Close connections
    if (mssqlPool) await mssqlPool.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

// Run investigation
investigate();
