const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

/**
 * Create Products Mapping - ProductsId → { ProjectId, ProjectType, ProjectItemIds }
 *
 * This mapping is critical for Donation migration:
 * - Orders.ProjectId → Products.ProductsId in old DB
 * - donation.ItemId → projectitem.Id in new DB
 *
 * Output: data/fk-mappings/ProductsMapping.json
 */

async function createProductsMapping() {
  console.log('🗺️  יצירת מיפוי Products → Project + ProjectItems\n');
  console.log('='.repeat(70));

  try {
    // ========================================
    // STEP 1: Connect to databases
    // ========================================
    console.log('\n📡 STEP 1: חיבור לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // STEP 2: Get all Products from old DB
    // ========================================
    console.log('━'.repeat(70));
    console.log('📊 STEP 2: קריאת כל Products מבסיס הנתונים הישן...');
    console.log('━'.repeat(70));

    const productsResult = await sql.query`
      SELECT ProductsId, Name
      FROM Products
      ORDER BY ProductsId
    `;

    const allProducts = productsResult.recordset;
    console.log(`✅ נמצאו ${allProducts.length} Products ב-DB הישן\n`);

    // ========================================
    // STEP 3: Create mapping for each Product
    // ========================================
    console.log('━'.repeat(70));
    console.log('🗺️  STEP 3: יצירת מיפוי עבור כל Product...');
    console.log('━'.repeat(70));

    const mapping = {};
    const stats = {
      total: allProducts.length,
      mapped: 0,
      notMigrated: 0,
      type1: 0,  // Funds
      type2: 0,  // Campaign
      type3: 0,  // Campaign Type 3 (future)
      multipleItems: 0,
      errors: []
    };

    for (const product of allProducts) {
      try {
        const productsId = product.ProductsId;

        // Check if this Product was migrated to project table
        const [projectRows] = await mysqlConn.query(
          'SELECT Id, ProjectType FROM project WHERE Id = ?',
          [productsId]
        );

        if (projectRows.length === 0) {
          // Product not migrated yet
          stats.notMigrated++;
          mapping[productsId] = {
            ProductsId: productsId,
            Name: product.Name,
            ProjectId: null,
            ProjectType: null,
            ProjectItemIds: [],
            Status: 'NOT_MIGRATED',
            Note: 'Product not found in project table'
          };
          continue;
        }

        const project = projectRows[0];
        const projectId = project.Id;
        const projectType = project.ProjectType;

        // Get all ProjectItems for this Project
        const [itemRows] = await mysqlConn.query(
          'SELECT Id, ItemName, ItemType FROM projectitem WHERE ProjectId = ? ORDER BY Id',
          [projectId]
        );

        const projectItemIds = itemRows.map(item => ({
          Id: item.Id,
          ItemName: item.ItemName,
          ItemType: item.ItemType
        }));

        // Save mapping
        mapping[productsId] = {
          ProductsId: productsId,
          Name: product.Name,
          ProjectId: projectId,
          ProjectType: projectType,
          ProjectItemIds: projectItemIds,
          Status: 'MIGRATED',
          Note: `${itemRows.length} items, ProjectType=${projectType}`
        };

        stats.mapped++;

        // Count by ProjectType
        if (projectType === 1) stats.type1++;
        else if (projectType === 2) stats.type2++;
        else if (projectType === 3) stats.type3++;

        // Count Products with multiple items
        if (itemRows.length > 1) {
          stats.multipleItems++;
        }

      } catch (err) {
        stats.errors.push(`ProductsId=${product.ProductsId}: ${err.message}`);
      }
    }

    console.log(`✅ מיפוי הושלם: ${stats.mapped}/${stats.total} products\n`);

    // ========================================
    // STEP 4: Save mapping to JSON file
    // ========================================
    console.log('━'.repeat(70));
    console.log('💾 STEP 4: שמירת מיפוי ל-JSON...');
    console.log('━'.repeat(70));

    const outputPath = path.join(__dirname, '../../data/fk-mappings/ProductsMapping.json');

    // Create directory if doesn't exist
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const output = {
      metadata: {
        createdAt: new Date().toISOString(),
        totalProducts: stats.total,
        mapped: stats.mapped,
        notMigrated: stats.notMigrated,
        byProjectType: {
          type1_Funds: stats.type1,
          type2_Campaign: stats.type2,
          type3_Campaign_ProductGroup: stats.type3
        },
        productsWithMultipleItems: stats.multipleItems,
        errors: stats.errors.length
      },
      mapping: mapping
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');

    console.log(`✅ נשמר בהצלחה: ${outputPath}`);
    console.log(`   גודל קובץ: ${Object.keys(mapping).length} products\n`);

    // ========================================
    // STEP 5: Statistics and Examples
    // ========================================
    console.log('\n' + '━'.repeat(70));
    console.log('📊 סטטיסטיקות');
    console.log('━'.repeat(70));
    console.log(`סה"כ Products בבסיס הישן: ${stats.total}`);
    console.log(`✅ מוגדרים (Migrated): ${stats.mapped} (${((stats.mapped/stats.total)*100).toFixed(1)}%)`);
    console.log(`❌ לא מוגדרים (Not Migrated): ${stats.notMigrated} (${((stats.notMigrated/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    console.log('פילוח לפי ProjectType:');
    console.log(`   ProjectType=1 (Funds): ${stats.type1}`);
    console.log(`   ProjectType=2 (Campaign): ${stats.type2}`);
    console.log(`   ProjectType=3 (Campaign Type 3): ${stats.type3}`);
    console.log('');
    console.log(`Products עם יותר מפריט אחד: ${stats.multipleItems}`);
    console.log(`שגיאות: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  שגיאות (10 ראשונות):');
      stats.errors.slice(0, 10).forEach(err => {
        console.log(`   ${err}`);
      });
      if (stats.errors.length > 10) {
        console.log(`   ... ועוד ${stats.errors.length - 10} שגיאות`);
      }
    }

    // Show examples
    console.log('\n━'.repeat(70));
    console.log('🔍 דוגמאות (5 ראשונים שמופו):');
    console.log('━'.repeat(70));

    const mappedProducts = Object.values(mapping).filter(m => m.Status === 'MIGRATED');
    mappedProducts.slice(0, 5).forEach(m => {
      console.log(`\nProductsId: ${m.ProductsId}`);
      console.log(`  Name: "${m.Name.substring(0, 50)}"`);
      console.log(`  → ProjectId: ${m.ProjectId} (ProjectType=${m.ProjectType})`);
      console.log(`  → ProjectItems: ${m.ProjectItemIds.length} items`);
      m.ProjectItemIds.forEach((item, idx) => {
        console.log(`     ${idx+1}. ItemId=${item.Id}, ItemType=${item.ItemType}, Name="${item.ItemName.substring(0, 40)}"`);
      });
    });

    // Show example of NOT_MIGRATED
    const notMigrated = Object.values(mapping).filter(m => m.Status === 'NOT_MIGRATED');
    if (notMigrated.length > 0) {
      console.log('\n━'.repeat(70));
      console.log('⚠️  דוגמאות Products שלא מוגדרים (5 ראשונים):');
      console.log('━'.repeat(70));
      notMigrated.slice(0, 5).forEach(m => {
        console.log(`  ProductsId: ${m.ProductsId} - "${m.Name.substring(0, 50)}"`);
        console.log(`    Note: ${m.Note}`);
      });
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(70));
    console.log('✅ סיכום');
    console.log('='.repeat(70));
    console.log(`קובץ נשמר: ${outputPath}`);
    console.log(`גודל: ${Object.keys(mapping).length} products`);
    console.log(`\nשימוש במיגרציית Donation:`);
    console.log(`  const productsMapping = require('./data/fk-mappings/ProductsMapping.json');`);
    console.log(`  const oldProjectId = order.ProjectId;  // מה-Orders table`);
    console.log(`  const mapping = productsMapping.mapping[oldProjectId];`);
    console.log(`  const newProjectId = mapping.ProjectId;`);
    console.log(`  const projectItems = mapping.ProjectItemIds;`);
    console.log(`  // Choose correct ItemId based on PrayerId/ItemType logic`);
    console.log('='.repeat(70));

    await mysqlConn.end();
    await sql.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  }
}

// Run if called directly
if (require.main === module) {
  createProductsMapping();
}

module.exports = { createProductsMapping };
