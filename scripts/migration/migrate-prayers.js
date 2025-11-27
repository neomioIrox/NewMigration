const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

// Helper: Check if value is empty (NULL, undefined, empty string, or string "null")
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str === 'null';
};

async function migratePrayers() {
  console.log('🙏 מתחיל מיגרציית Prayers...\n');

  const results = {
    step1_projects: 0,
    step2_projectitems: 0,
    step3_localizations: 0,
    step4_item_localizations: 0,
    step5_mapping: null,
    errors: [],
    prayerMapping: {}  // PrayerId → ProjectItemId
  };

  let mssqlConn, mysqlConn;

  try {
    // Connect to databases
    console.log('📡 מתחבר לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    //========================================
    // STEP 1: Create project records (ProjectType=3)
    // ========================================
    console.log('━'.repeat(60));
    console.log('STEP 1: יוצר project records (ProjectType=3)');
    console.log('━'.repeat(60));

    const prayersResult = await sql.query`
      SELECT
        PrayersId,
        Name,
        Name_en,
        Name_fr,
        Hide,
        Price,
        Sort
      FROM Prayers
      ORDER BY PrayersId
    `;

    console.log(`נמצאו ${prayersResult.recordset.length} Prayers\n`);

    for (const prayer of prayersResult.recordset) {
      try {
        // Check if project already exists (by Name)
        const [existingProject] = await mysqlConn.query(
          'SELECT Id FROM project WHERE Name = ? AND ProjectType = 3',
          [prayer.Name]
        );

        let projectId;
        if (existingProject.length > 0) {
          projectId = existingProject[0].Id;
          console.log(`⏭️  Project exists: PrayerId=${prayer.PrayersId} → ProjectId=${projectId}`);
        } else {
          // Insert project
          const [projectResult] = await mysqlConn.query(`
            INSERT INTO project (
              Name,
              ProjectType,
              TerminalId,
              RecordStatus,
              StatusChangedAt,
              StatusChangedBy,
              CreatedAt,
              CreatedBy,
              UpdatedAt,
              UpdatedBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            prayer.Name,
            3,  // ProjectType = Campaign (Prayer)
            1,  // Default terminal
            2,  // RecordStatus = Accept
            new Date(),
            -1,  // System user
            new Date(),
            -1,
            new Date(),
            -1
          ]);

          projectId = projectResult.insertId;
          results.step1_projects++;
          console.log(`✅ Created project: PrayerId=${prayer.PrayersId} → ProjectId=${projectId}`);
        }

        // Store mapping for later use
        prayer.newProjectId = projectId;

      } catch (err) {
        console.error(`❌ Error creating project for PrayerId=${prayer.PrayersId}: ${err.message}`);
        results.errors.push(`Project PrayerId=${prayer.PrayersId}: ${err.message}`);
      }
    }

    console.log(`\n✅ STEP 1 הושלם: ${results.step1_projects} projects נוצרו\n`);

    // ========================================
    // STEP 2: Create projectitem records (ItemType=3)
    // ========================================
    console.log('━'.repeat(60));
    console.log('STEP 2: יוצר projectitem records (ItemType=3)');
    console.log('━'.repeat(60));

    for (const prayer of prayersResult.recordset) {
      if (!prayer.newProjectId) {
        console.log(`⏭️  Skipping ProjectItem for PrayerId=${prayer.PrayersId} (no project created)`);
        continue;
      }

      try {
        // Check if projectitem already exists
        const [existingItem] = await mysqlConn.query(
          'SELECT Id FROM projectitem WHERE ProjectId = ? AND ItemType = 3',
          [prayer.newProjectId]
        );

        let projectItemId;
        if (existingItem.length > 0) {
          projectItemId = existingItem[0].Id;
          console.log(`⏭️  ProjectItem exists: PrayerId=${prayer.PrayersId} → ProjectItemId=${projectItemId}`);
        } else {
          // Insert projectitem
          const [itemResult] = await mysqlConn.query(`
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            prayer.newProjectId,
            prayer.Name,
            3,  // ItemType = PrayerName
            1,  // PriceType = Fixed (assuming)
            0,  // HasEngravingName = false
            0,  // AllowFreeAddPrayerNames = false
            2,  // RecordStatus = Accept
            new Date(),
            -1,
            new Date(),
            -1,
            new Date(),
            -1
          ]);

          projectItemId = itemResult.insertId;
          results.step2_projectitems++;
          console.log(`✅ Created projectitem: PrayerId=${prayer.PrayersId} → ProjectItemId=${projectItemId}`);
        }

        // Store mapping for DONATION migration later
        results.prayerMapping[prayer.PrayersId] = projectItemId;

      } catch (err) {
        console.error(`❌ Error creating projectitem for PrayerId=${prayer.PrayersId}: ${err.message}`);
        results.errors.push(`ProjectItem PrayerId=${prayer.PrayersId}: ${err.message}`);
      }
    }

    console.log(`\n✅ STEP 2 הושלם: ${results.step2_projectitems} projectitems נוצרו\n`);

    // ========================================
    // STEP 3: Create projectLocalization (×3 languages)
    // ========================================
    console.log('━'.repeat(60));
    console.log('STEP 3: יוצר projectLocalization (3 שפות)');
    console.log('━'.repeat(60));

    for (const prayer of prayersResult.recordset) {
      if (!prayer.newProjectId) {
        console.log(`⏭️  Skipping localization for PrayerId=${prayer.PrayersId} (no project created)`);
        continue;
      }

      const languages = [
        { id: 1, name: 'Hebrew', titleField: 'Name' },
        { id: 2, name: 'English', titleField: 'Name_en' },
        { id: 3, name: 'French', titleField: 'Name_fr' }
      ];

      for (const lang of languages) {
        try {
          const title = prayer[lang.titleField];

          // Use Hebrew name as fallback for empty en/fr
          const finalTitle = isEmpty(title) ? prayer.Name : title;

          // Check if localization exists
          const [existing] = await mysqlConn.query(
            'SELECT Id FROM projectlocalization WHERE ProjectId = ? AND Language = ?',
            [prayer.newProjectId, lang.id]
          );

          if (existing.length > 0) {
            console.log(`⏭️  Localization exists: ProjectId=${prayer.newProjectId}, Lang=${lang.name}`);
            continue;
          }

          // DisplayInSite = !Hide (0=visible, 1=hidden)
          const displayInSite = prayer.Hide === 0 ? 1 : 0;

          // Insert projectLocalization
          await mysqlConn.query(`
            INSERT INTO projectlocalization (
              ProjectId,
              Language,
              DisplayInSite,
              Title,
              CreatedAt,
              CreatedBy,
              UpdatedAt,
              UpdatedBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            prayer.newProjectId,
            lang.id,
            displayInSite,
            finalTitle,
            new Date(),
            -1,
            new Date(),
            -1
          ]);

          results.step3_localizations++;

        } catch (err) {
          console.error(`❌ Error creating projectLocalization: PrayerId=${prayer.PrayersId}, Lang=${lang.name}: ${err.message}`);
          results.errors.push(`ProjectLocalization PrayerId=${prayer.PrayersId}, Lang=${lang.name}: ${err.message}`);
        }
      }
    }

    console.log(`\n✅ STEP 3 הושלם: ${results.step3_localizations} projectLocalizations נוצרו\n`);

    // ========================================
    // STEP 4: Create projectItemLocalization (×3 languages)
    // ========================================
    console.log('━'.repeat(60));
    console.log('STEP 4: יוצר projectItemLocalization (3 שxxxx');
    console.log('━'.repeat(60));

    for (const prayer of prayersResult.recordset) {
      const projectItemId = results.prayerMapping[prayer.PrayersId];
      if (!projectItemId) {
        console.log(`⏭️  Skipping item localization for PrayerId=${prayer.PrayersId} (no projectitem)`);
        continue;
      }

      const languages = [
        { id: 1, name: 'Hebrew', titleField: 'Name' },
        { id: 2, name: 'English', titleField: 'Name_en' },
        { id: 3, name: 'French', titleField: 'Name_fr' }
      ];

      for (const lang of languages) {
        try {
          const title = prayer[lang.titleField];
          const finalTitle = isEmpty(title) ? prayer.Name : title;

          // Check if localization exists
          const [existing] = await mysqlConn.query(
            'SELECT Id FROM projectitemlocalization WHERE ProjectItemId = ? AND Language = ?',
            [projectItemId, lang.id]
          );

          if (existing.length > 0) {
            console.log(`⏭️  Item localization exists: ProjectItemId=${projectItemId}, Lang=${lang.name}`);
            continue;
          }

          const displayInSite = prayer.Hide === 0 ? 1 : 0;

          // Insert projectItemLocalization
          await mysqlConn.query(`
            INSERT INTO projectitemlocalization (
              ProjectItemId,
              Language,
              DisplayInSite,
              Title,
              CreatedAt,
              CreatedBy,
              UpdatedAt,
              UpdatedBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectItemId,
            lang.id,
            displayInSite,
            finalTitle,
            new Date(),
            -1,
            new Date(),
            -1
          ]);

          results.step4_item_localizations++;

        } catch (err) {
          console.error(`❌ Error creating projectItemLocalization: PrayerId=${prayer.PrayersId}, Lang=${lang.name}: ${err.message}`);
          results.errors.push(`ProjectItemLocalization PrayerId=${prayer.PrayersId}, Lang=${lang.name}: ${err.message}`);
        }
      }
    }

    console.log(`\n✅ STEP 4 הושלם: ${results.step4_item_localizations} projectItemLocalizations נוצרו\n`);

    // ========================================
    // STEP 5: Save mapping to JSON file
    // ========================================
    console.log('━'.repeat(60));
    console.log('STEP 5: שומר מיפוי PrayerId → ProjectItemId');
    console.log('━'.repeat(60));

    const mappingPath = path.join(__dirname, '../../data/fk-mappings/PrayerProjectItemId.json');
    const mappingDir = path.dirname(mappingPath);

    if (!fs.existsSync(mappingDir)) {
      fs.mkdirSync(mappingDir, { recursive: true });
    }

    fs.writeFileSync(mappingPath, JSON.stringify(results.prayerMapping, null, 2), 'utf-8');
    results.step5_mapping = mappingPath;

    console.log(`✅ מיפוי נשמר ב: ${mappingPath}`);
    console.log(`   סה"כ ${Object.keys(results.prayerMapping).length} מיפויים\n`);

    // ========================================
    // Final Summary
    // ========================================
    console.log('━'.repeat(60));
    console.log('סיכום המיגרציה');
    console.log('━'.repeat(60));
    console.log(`✅ Projects: ${results.step1_projects}`);
    console.log(`✅ ProjectItems: ${results.step2_projectitems}`);
    console.log(`✅ ProjectLocalizations: ${results.step3_localizations}`);
    console.log(`✅ ProjectItemLocalizations: ${results.step4_item_localizations}`);
    console.log(`✅ Mapping file: ${results.step5_mapping ? 'נוצר' : 'לא נוצר'}`);

    if (results.errors.length > 0) {
      console.log(`\n⚠️  ${results.errors.length} שגיאות:`);
      results.errors.forEach(err => console.log(`   - ${err}`));
    }

    console.log('\n🎉 מיגרציית Prayers הושלמה!\n');

    return results;

  } catch (err) {
    console.error('❌ שגיאה כללית:', err.message);
    console.error(err);
    throw err;
  } finally {
    await sql.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

// If run directly (not imported)
if (require.main === module) {
  migratePrayers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

// Export for use in server
module.exports = { migratePrayers };
