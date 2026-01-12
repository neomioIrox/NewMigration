/**
 * Rebuild ProjectId.json from database by matching Products to project table
 *
 * This fixes the fundamental problem where AUTO_INCREMENT causes:
 * ProductsId 1957 → ProjectId 1401 (not 1957!)
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function rebuildProjectIdMapping() {
  console.log('🔧 Rebuilding ProjectId.json from database...\n');

  let mssqlConn, mysqlConn;

  try {
    // Connect to databases
    console.log('📡 Connecting to databases...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ Connected\n');

    // Get all Products from old DB
    console.log('📊 Reading all Products from old DB...');
    const productsResult = await sql.query`
      SELECT ProductsId, Name
      FROM Products
      ORDER BY ProductsId
    `;
    const products = productsResult.recordset;
    console.log(`✅ Found ${products.length} Products\n`);

    // Get all projects from new DB
    console.log('📊 Reading all projects from new DB...');
    const [projects] = await mysqlConn.query('SELECT ProjectId as Id, Title as Name FROM projectlocalization WHERE Language = 1');
    console.log(`✅ Found ${projects.length} projects\n`);

    // Build name-based lookup (Name → ProjectId)
    console.log('🗺️  Building name-based lookup...');
    const projectByName = {};
    for (const proj of projects) {
      // Normalize name for better matching
      const normalizedName = (proj.Name || '').trim();
      if (normalizedName) {
        projectByName[normalizedName] = proj.Id;
      }
    }
    console.log(`✅ Built lookup with ${Object.keys(projectByName).length} unique names\n`);

    // Map Products to Projects
    console.log('🔄 Mapping Products → Projects...');
    const mappings = {};
    let matched = 0;
    let notFound = 0;

    for (const product of products) {
      const productsId = String(product.ProductsId);
      const productName = (product.Name || '').trim();

      // Try exact name match
      if (projectByName[productName]) {
        mappings[productsId] = projectByName[productName];
        matched++;
      } else {
        // Try fuzzy match (substring, case-insensitive, etc.)
        const fuzzyMatch = Object.keys(projectByName).find(name =>
          name.includes(productName) || productName.includes(name)
        );

        if (fuzzyMatch) {
          mappings[productsId] = projectByName[fuzzyMatch];
          matched++;
        } else {
          notFound++;
          if (notFound <= 10) {
            console.log(`  ⚠️  No match for ProductsId ${productsId}: ${productName.substring(0, 60)}`);
          }
        }
      }
    }

    console.log(`\n✅ Matching complete:`);
    console.log(`   Matched: ${matched}`);
    console.log(`   Not Found: ${notFound}`);
    console.log('');

    // Sample verification - check ProductsId 1957
    if (mappings['1957']) {
      console.log(`🎯 ProductsId 1957 → ProjectId ${mappings['1957']}`);
    } else {
      console.log('❌ ProductsId 1957 NOT FOUND in mappings!');
    }
    console.log('');

    // Save to ProjectId.json
    console.log('💾 Saving to ProjectId.json...');
    const projectIdMappingPath = path.join(__dirname, '../../data/fk-mappings/ProjectId.json');

    const projectIdMappingData = {
      columnName: 'ProjectId',
      sourceTable: 'Products',
      targetTable: 'project',
      keyColumn: 'productsid',
      description: 'Mapping from old Products.ProductsId to new project.Id (rebuilt from database)',
      totalMappings: Object.keys(mappings).length,
      mappings: mappings,
      createdAt: new Date().toISOString(),
      method: 'NAME_MATCH'
    };

    fs.writeFileSync(projectIdMappingPath, JSON.stringify(projectIdMappingData, null, 2), 'utf-8');
    console.log(`✅ Saved: ${projectIdMappingPath}`);
    console.log(`   Total mappings: ${Object.keys(mappings).length}\n`);

    // Sample mappings
    const sampleMappings = Object.entries(mappings).slice(0, 10);
    console.log('📋 Sample mappings:');
    sampleMappings.forEach(([old, newId]) => {
      console.log(`   ${old} → ${newId}`);
    });
    console.log('');

    console.log('🎉 Done!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    throw err;
  } finally {
    if (mssqlConn) await sql.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

// Run if called directly
if (require.main === module) {
  rebuildProjectIdMapping()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { rebuildProjectIdMapping };
