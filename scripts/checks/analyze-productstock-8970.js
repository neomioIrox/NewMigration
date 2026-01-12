/**
 * Deep analysis of ProductStock row 8970
 * Why didn't this row migrate to recruiter table?
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');
const fs = require('fs');
const path = require('path');

async function analyzeProductStock8970() {
  let mssqlConn;
  let mysqlConn;

  try {
    console.log('=== Analyzing ProductStock Row 8970 ===\n');

    // Connect to both databases
    console.log('Connecting to MSSQL (old DB)...');
    mssqlConn = await sql.connect(mssqlConfig);

    console.log('Connecting to MySQL (new DB)...');
    mysqlConn = await mysql.createConnection(mysqlConfig);

    // Step 1: Get the ProductStock row
    console.log('\n📊 STEP 1: ProductStock Row Data');
    console.log('─'.repeat(60));
    const stockResult = await mssqlConn.request()
      .input('stockId', sql.Int, 8970)
      .query(`
        SELECT
          ProductStockId,
          ProductId,
          GroupId,
          Name,
          Name_en,
          Name_fr,
          Price,
          Hide,
          Hide_en,
          Hide_fr
        FROM ProductStock
        WHERE ProductStockId = @stockId
      `);

    if (stockResult.recordset.length === 0) {
      console.log('❌ ProductStock 8970 NOT FOUND in old DB!');
      return;
    }

    const stockRow = stockResult.recordset[0];
    console.log('✅ Found ProductStock row:');
    console.table(stockRow);

    // Step 2: Check if ProductId exists in Products table
    console.log('\n📊 STEP 2: Check Product in Old DB');
    console.log('─'.repeat(60));
    const productResult = await mssqlConn.request()
      .input('productId', sql.Int, stockRow.ProductId)
      .query(`
        SELECT
          ProductsId,
          Name,
          CategoryId,
          SubCategoryId
        FROM Products
        WHERE ProductsId = @productId
      `);

    if (productResult.recordset.length === 0) {
      console.log(`❌ Product ${stockRow.ProductId} NOT FOUND in Products table!`);
      console.log('   This is the problem! ProductStock has invalid ProductId FK.');
    } else {
      console.log(`✅ Found Product ${stockRow.ProductId}:`);
      console.table(productResult.recordset[0]);
    }

    // Step 3: Check if Product was migrated to project table
    console.log('\n📊 STEP 3: Check if Product Migrated to Project');
    console.log('─'.repeat(60));
    const [projectRows] = await mysqlConn.query(
      'SELECT Id, ProjectType FROM project WHERE Id = ?',
      [stockRow.ProductId]
    );

    if (projectRows.length === 0) {
      console.log(`❌ Product ${stockRow.ProductId} NOT MIGRATED to project table!`);
      console.log('   This is why the recruiter migration failed!');
      console.log('   ProductStock.ProductId must exist in project table first.');
    } else {
      console.log(`✅ Product ${stockRow.ProductId} exists in project table:`);
      console.table(projectRows[0]);
    }

    // Step 4: Check FK mapping file
    console.log('\n📊 STEP 4: Check FK Mapping (ProductsMapping.json)');
    console.log('─'.repeat(60));
    const mappingPath = path.join(__dirname, '../../data/fk-mappings/ProductsMapping.json');

    if (!fs.existsSync(mappingPath)) {
      console.log('❌ ProductsMapping.json file NOT FOUND!');
      console.log('   Path:', mappingPath);
    } else {
      const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
      const productMapping = mappingData[stockRow.ProductId];

      if (!productMapping) {
        console.log(`❌ Product ${stockRow.ProductId} NOT FOUND in FK mapping!`);
        console.log(`   The mapping file doesn't have oldId=${stockRow.ProductId}`);
      } else {
        console.log(`✅ Found in FK mapping:`);
        console.log(`   Old Product ID: ${stockRow.ProductId}`);
        console.log(`   New Project ID: ${productMapping.newId}`);
        console.log(`   Project Type: ${productMapping.projectType}`);
      }
    }

    // Step 5: Check if GroupId exists in recruitersgroup
    if (stockRow.GroupId && stockRow.GroupId !== 0) {
      console.log('\n📊 STEP 5: Check RecruiterGroupId FK');
      console.log('─'.repeat(60));

      const [groupRows] = await mysqlConn.query(
        'SELECT Id, Name FROM recruitersgroup WHERE Id = ?',
        [stockRow.GroupId]
      );

      if (groupRows.length === 0) {
        console.log(`⚠️  GroupId ${stockRow.GroupId} NOT FOUND in recruitersgroup table!`);
        console.log('   This FK constraint might cause migration to fail.');
      } else {
        console.log(`✅ GroupId ${stockRow.GroupId} exists in recruitersgroup:`);
        console.table(groupRows[0]);
      }
    } else {
      console.log('\n📊 STEP 5: GroupId is NULL or 0 (no FK check needed)');
    }

    // Step 6: Check if recruiter was actually migrated
    console.log('\n📊 STEP 6: Check if Recruiter Exists in New DB');
    console.log('─'.repeat(60));
    const [recruiterRows] = await mysqlConn.query(
      'SELECT Id, Name, ProjectId, RecruiterGroupId FROM recruiter WHERE Id = ?',
      [stockRow.ProductStockId]
    );

    if (recruiterRows.length === 0) {
      console.log(`❌ Recruiter ${stockRow.ProductStockId} NOT MIGRATED to recruiter table!`);
    } else {
      console.log(`✅ Recruiter ${stockRow.ProductStockId} EXISTS in recruiter table:`);
      console.table(recruiterRows[0]);
    }

    // Final conclusion
    console.log('\n' + '='.repeat(60));
    console.log('📋 CONCLUSION');
    console.log('='.repeat(60));

    if (productResult.recordset.length === 0) {
      console.log('❌ ROOT CAUSE: ProductStock.ProductId is INVALID (orphaned FK)');
      console.log('   Product 1957 does not exist in Products table.');
      console.log('   This row should be cleaned or ProductId should be fixed.');
    } else if (projectRows.length === 0) {
      console.log('❌ ROOT CAUSE: Product NOT MIGRATED to project table');
      console.log(`   Product ${stockRow.ProductId} exists in old DB but not in new DB.`);
      console.log('   You need to migrate this Product first.');
    } else if (recruiterRows.length === 0) {
      console.log('❌ MIGRATION SKIPPED for unknown reason');
      console.log('   Product exists, FK mapping exists, but recruiter not migrated.');
      console.log('   Check migration logs for errors.');
    } else {
      console.log('✅ Everything looks OK - recruiter was migrated successfully!');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (mssqlConn) {
      await mssqlConn.close();
    }
    if (mysqlConn) {
      await mysqlConn.end();
    }
    console.log('\nConnections closed');
  }
}

analyzeProductStock8970();
