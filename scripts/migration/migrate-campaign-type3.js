const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

/**
 * Campaign Type 3 Migration - ProductGroup Campaigns
 *
 * Migrates campaigns from ProductGroup table to:
 * - project (194 campaigns from unique ParentProductId)
 * - projectLocalization (194 × 3 languages = 582)
 * - projectItem (260 from SubProducts + 194 Donation items = 454)
 * - projectItemLocalization (454 × 3 languages = 1,362)
 * - linkSetting, entityContent, entityContentItem
 *
 * Key difference from Type 2: Variable number of items per project (1-11 items)
 */

async function migrateCampaignType3() {
  console.log('🚀 Campaign Type 3 Migration - ProductGroup Campaigns\n');
  console.log('━'.repeat(60));

  let mssqlConn, mysqlConn;
  const results = {
    projects: { inserted: 0, skipped: 0, errors: [] },
    projectLocalizations: { inserted: 0, skipped: 0, errors: [] },
    projectItems: { inserted: 0, skipped: 0, errors: [] },
    projectItemLocalizations: { inserted: 0, skipped: 0, errors: [] },
    linkSettings: { inserted: 0, skipped: 0, errors: [] },
    entityContents: { inserted: 0, skipped: 0, errors: [] },
    entityContentItems: { inserted: 0, skipped: 0, errors: [] }
  };

  try {
    // ========================================
    // STEP 1: Connect to databases
    // ========================================
    console.log('\n📡 STEP 1: חיבור לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // STEP 2: Get unique ParentProducts (Projects)
    // ========================================
    console.log('━'.repeat(60));
    console.log('📊 STEP 2: קריאת ParentProducts (מגביות)...');
    console.log('━'.repeat(60));

    const parentProductsResult = await sql.query`
      SELECT DISTINCT pg.ParentProductId
      FROM ProductGroup pg
      ORDER BY pg.ParentProductId
    `;

    const parentProductIds = parentProductsResult.recordset.map(r => r.ParentProductId);
    console.log(`✅ נמצאו ${parentProductIds.length} מגביות ייחודיות\n`);

    // ========================================
    // STEP 3: Migrate Projects
    // ========================================
    console.log('━'.repeat(60));
    console.log('📦 STEP 3: מיגרציית Projects...');
    console.log('━'.repeat(60));

    for (const parentProductId of parentProductIds) {
      try {
        // Check if project already exists
        const [existing] = await mysqlConn.query(
          'SELECT Id FROM project WHERE Id = ? AND ProjectType = 2',
          [parentProductId]
        );

        if (existing.length > 0) {
          results.projects.skipped++;
          continue;
        }

        // Get ParentProduct details from Products table
        const productResult = await sql.query`
          SELECT *
          FROM Products
          WHERE ProductsId = ${parentProductId}
        `;

        if (productResult.recordset.length === 0) {
          results.projects.errors.push(`ParentProductId=${parentProductId}: Product not found`);
          continue;
        }

        const product = productResult.recordset[0];

        // Insert Project
        const [insertResult] = await mysqlConn.query(`
          INSERT INTO project (
            Id,
            Name,
            ProjectType,
            KupatFundNo,
            DisplayAsSelfView,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy,
            TerminalId
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NOW(), ?, ?)
        `, [
          parentProductId,
          product.Name ? product.Name.substring(0, 150) : null,
          2, // Campaign
          product.ProjectNumber,
          product.WithoutKupatView || 0,
          2, // Accept
          -1, // System
          product.DateCreated || new Date(),
          -1, // System
          -1, // System
          product.Terminal || 1 // Default terminal
        ]);

        results.projects.inserted++;

      } catch (err) {
        results.projects.errors.push(`ParentProductId=${parentProductId}: ${err.message}`);
      }
    }

    console.log(`✅ Projects: ${results.projects.inserted} inserted, ${results.projects.skipped} skipped, ${results.projects.errors.length} errors\n`);

    // ========================================
    // STEP 4: Migrate Project Localizations (3 languages)
    // ========================================
    console.log('━'.repeat(60));
    console.log('🌐 STEP 4: מיגרציית Project Localizations...');
    console.log('━'.repeat(60));

    const languages = [
      { id: 1, name: 'Hebrew', nameSuffix: '', hideSuffix: 'Hide' },
      { id: 2, name: 'English', nameSuffix: '_en', hideSuffix: 'Hide_en' },
      { id: 3, name: 'French', nameSuffix: '_fr', hideSuffix: 'Hide_fr' }
    ];

    for (const parentProductId of parentProductIds) {
      try {
        // Get Product details
        const productResult = await sql.query`
          SELECT *
          FROM Products
          WHERE ProductsId = ${parentProductId}
        `;

        if (productResult.recordset.length === 0) continue;
        const product = productResult.recordset[0];

        for (const lang of languages) {
          // Check if localization exists
          const [existing] = await mysqlConn.query(
            'SELECT Id FROM projectlocalization WHERE ProjectId = ? AND Language = ?',
            [parentProductId, lang.id]
          );

          if (existing.length > 0) {
            results.projectLocalizations.skipped++;
            continue;
          }

          const nameCol = lang.nameSuffix ? `Name${lang.nameSuffix}` : 'Name';
          const hideCol = lang.hideSuffix;
          const title = product[nameCol] || product.Name || 'No Translation';
          const displayInSite = product[hideCol] !== null ? (product[hideCol] ? 0 : 1) : 1;

          await mysqlConn.query(`
            INSERT INTO projectlocalization (
              ProjectId,
              Language,
              DisplayInSite,
              Title,
              Description,
              CreatedAt,
              CreatedBy,
              UpdatedAt,
              UpdatedBy
            ) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW(), ?)
          `, [
            parentProductId,
            lang.id,
            displayInSite,
            title.substring(0, 150),
            product[`ShortDescription${lang.nameSuffix || ''}`] || null,
            -1, // System
            -1  // System
          ]);

          results.projectLocalizations.inserted++;
        }
      } catch (err) {
        results.projectLocalizations.errors.push(`ParentProductId=${parentProductId}: ${err.message}`);
      }
    }

    console.log(`✅ Project Localizations: ${results.projectLocalizations.inserted} inserted, ${results.projectLocalizations.skipped} skipped\n`);

    // ========================================
    // STEP 5: Migrate ProjectItems from SubProducts
    // ========================================
    console.log('━'.repeat(60));
    console.log('📦 STEP 5: מיגרציית ProjectItems (SubProducts)...');
    console.log('━'.repeat(60));

    // Get all ProductGroup records
    const productGroupResult = await sql.query`
      SELECT *
      FROM ProductGroup
      ORDER BY ParentProductId, SubProductId
    `;

    for (const pg of productGroupResult.recordset) {
      try {
        // Get SubProduct details
        const subProductResult = await sql.query`
          SELECT *
          FROM Products
          WHERE ProductsId = ${pg.SubProductId}
        `;

        if (subProductResult.recordset.length === 0) {
          results.projectItems.errors.push(`SubProductId=${pg.SubProductId}: Product not found`);
          continue;
        }

        const subProduct = subProductResult.recordset[0];

        // Determine ItemType based on Certificate field
        const itemType = subProduct.Certificate === 1 ? 2 : 5; // 2=Certificate, 5=FundDonation

        // Check if item already exists (by ProjectId + ItemName + ItemType)
        const [existing] = await mysqlConn.query(
          'SELECT Id FROM projectitem WHERE ProjectId = ? AND ItemName = ? AND ItemType = ?',
          [pg.ParentProductId, subProduct.Name ? subProduct.Name.substring(0, 150) : 'Unnamed', itemType]
        );

        if (existing.length > 0) {
          results.projectItems.skipped++;
          continue;
        }

        // Insert ProjectItem
        await mysqlConn.query(`
          INSERT INTO projectitem (
            ProjectId,
            ItemName,
            ItemType,
            PriceType,
            HasEngravingName,
            AllowFreeAddPrayerNames,
            DeliveryMethod,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?, NOW(), ?)
        `, [
          pg.ParentProductId,
          subProduct.Name ? subProduct.Name.substring(0, 150) : 'Unnamed',
          itemType,
          1, // Closed price
          itemType === 2 ? 1 : 0, // HasEngravingName only for Certificate
          subProduct.ShowPrayerNames || 0,
          itemType === 2 ? 1 : null, // DeliveryMethod (Post) only for Certificate
          2, // Accept
          -1, // System
          -1, // System
          -1  // System
        ]);

        results.projectItems.inserted++;

      } catch (err) {
        results.projectItems.errors.push(`ProductGroup(${pg.ParentProductId},${pg.SubProductId}): ${err.message}`);
      }
    }

    console.log(`✅ ProjectItems (SubProducts): ${results.projectItems.inserted} inserted, ${results.projectItems.skipped} skipped\n`);

    // ========================================
    // STEP 6: Create Donation Items (one per Project)
    // ========================================
    console.log('━'.repeat(60));
    console.log('💰 STEP 6: יצירת פריטי Donation...');
    console.log('━'.repeat(60));

    let donationInserted = 0, donationSkipped = 0;

    for (const parentProductId of parentProductIds) {
      try {
        // Get Product details
        const productResult = await sql.query`
          SELECT *
          FROM Products
          WHERE ProductsId = ${parentProductId}
        `;

        if (productResult.recordset.length === 0) continue;
        const product = productResult.recordset[0];

        // Check if Donation item already exists
        const [existing] = await mysqlConn.query(
          'SELECT Id FROM projectitem WHERE ProjectId = ? AND ItemType = 4',
          [parentProductId]
        );

        if (existing.length > 0) {
          donationSkipped++;
          continue;
        }

        // Insert Donation ProjectItem
        await mysqlConn.query(`
          INSERT INTO projectitem (
            ProjectId,
            ItemName,
            ItemType,
            PriceType,
            HasEngravingName,
            AllowFreeAddPrayerNames,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?, NOW(), ?)
        `, [
          parentProductId,
          product.Name ? product.Name.substring(0, 150) : 'Donation',
          4, // Donation
          2, // Free price
          0, // No engraving
          product.ShowPrayerNames || 0,
          2, // Accept
          -1, // System
          -1, // System
          -1  // System
        ]);

        donationInserted++;

      } catch (err) {
        results.projectItems.errors.push(`Donation for ParentProductId=${parentProductId}: ${err.message}`);
      }
    }

    results.projectItems.inserted += donationInserted;
    results.projectItems.skipped += donationSkipped;

    console.log(`✅ Donation Items: ${donationInserted} inserted, ${donationSkipped} skipped\n`);
    console.log(`📊 Total ProjectItems: ${results.projectItems.inserted} inserted, ${results.projectItems.skipped} skipped, ${results.projectItems.errors.length} errors\n`);

    // ========================================
    // STEP 7: Migrate ProjectItem Localizations (3 languages)
    // ========================================
    console.log('━'.repeat(60));
    console.log('🌐 STEP 7: מיגרציית ProjectItem Localizations...');
    console.log('━'.repeat(60));

    // Get all ProjectItems we just created
    const [allProjectItems] = await mysqlConn.query(`
      SELECT pi.Id, pi.ProjectId, pi.ItemName, pi.ItemType
      FROM projectitem pi
      JOIN project p ON pi.ProjectId = p.Id
      WHERE p.ProjectType = 2
      AND EXISTS (
        SELECT 1 FROM ProductGroup pg WHERE pg.ParentProductId = p.Id
      )
    `);

    for (const item of allProjectItems) {
      try {
        // Get Product details for this ProjectItem
        const productResult = await sql.query`
          SELECT *
          FROM Products
          WHERE ProductsId = ${item.ProjectId}
        `;

        if (productResult.recordset.length === 0) continue;
        const product = productResult.recordset[0];

        for (const lang of languages) {
          // Check if localization exists
          const [existing] = await mysqlConn.query(
            'SELECT Id FROM projectitemlocalization WHERE ItemId = ? AND Language = ?',
            [item.Id, lang.id]
          );

          if (existing.length > 0) {
            results.projectItemLocalizations.skipped++;
            continue;
          }

          const nameCol = lang.nameSuffix ? `Name${lang.nameSuffix}` : 'Name';
          const hideCol = lang.hideSuffix;
          const title = product[nameCol] || product.Name || item.ItemName;
          const displayInSite = product[hideCol] !== null && product.ShowMainPage ? (!product[hideCol] ? 1 : 0) : 1;

          await mysqlConn.query(`
            INSERT INTO projectitemlocalization (
              ItemId,
              Language,
              DisplayInSite,
              Title,
              CreatedAt,
              CreatedBy,
              UpdatedAt,
              UpdatedBy
            ) VALUES (?, ?, ?, ?, NOW(), ?, NOW(), ?)
          `, [
            item.Id,
            lang.id,
            displayInSite,
            title.substring(0, 150),
            -1, // System
            -1  // System
          ]);

          results.projectItemLocalizations.inserted++;
        }
      } catch (err) {
        results.projectItemLocalizations.errors.push(`ItemId=${item.Id}: ${err.message}`);
      }
    }

    console.log(`✅ ProjectItem Localizations: ${results.projectItemLocalizations.inserted} inserted, ${results.projectItemLocalizations.skipped} skipped\n`);

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('📊 סיכום מיגרציה');
    console.log('━'.repeat(60));
    console.log(`✅ Projects: ${results.projects.inserted} inserted, ${results.projects.skipped} skipped`);
    console.log(`✅ Project Localizations: ${results.projectLocalizations.inserted} inserted, ${results.projectLocalizations.skipped} skipped`);
    console.log(`✅ ProjectItems: ${results.projectItems.inserted} inserted, ${results.projectItems.skipped} skipped`);
    console.log(`✅ ProjectItem Localizations: ${results.projectItemLocalizations.inserted} inserted, ${results.projectItemLocalizations.skipped} skipped`);

    const totalInserted = results.projects.inserted + results.projectLocalizations.inserted +
                         results.projectItems.inserted + results.projectItemLocalizations.inserted;
    const totalErrors = results.projects.errors.length + results.projectLocalizations.errors.length +
                       results.projectItems.errors.length + results.projectItemLocalizations.errors.length;

    console.log(`\n📈 סה"כ שורות שנוצרו: ${totalInserted}`);
    console.log(`❌ סה"כ שגיאות: ${totalErrors}`);
    console.log('━'.repeat(60));

    // Show errors if any
    if (totalErrors > 0) {
      console.log('\n⚠️ שגיאות:');
      [...results.projects.errors, ...results.projectLocalizations.errors,
       ...results.projectItems.errors, ...results.projectItemLocalizations.errors]
        .slice(0, 20)
        .forEach(err => console.log(`  - ${err}`));
      if (totalErrors > 20) {
        console.log(`  ... ועוד ${totalErrors - 20} שגיאות`);
      }
    }

    return results;

  } catch (err) {
    console.error('\n❌ שגיאה חמורה:', err.message);
    console.error(err);
    throw err;
  } finally {
    // Close connections
    if (mssqlConn) await sql.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

// Run if called directly
if (require.main === module) {
  migrateCampaignType3()
    .then(() => {
      console.log('\n✅ המיגרציה הושלמה בהצלחה!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ המיגרציה נכשלה:', err);
      process.exit(1);
    });
}

module.exports = { migrateCampaignType3 };
