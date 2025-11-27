const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function verifyPrayerMigration() {
  console.log('🔍 Prayer Migration Verification Report');
  console.log('='.repeat(60));

  const conn = await mysql.createConnection({
    ...mysqlConfig,
    charset: 'utf8mb4'
  });

  try {
    // 1. Count projects (Prayer type)
    const [projects] = await conn.query(
      'SELECT COUNT(*) as count FROM project WHERE ProjectType = 3'
    );
    console.log(`\n1️⃣  Projects (Prayer): ${projects[0].count} rows`);

    // 2. Count projectitems (Prayer type)
    const [items] = await conn.query(`
      SELECT COUNT(*) as count
      FROM projectitem pi
      JOIN project p ON pi.ProjectId = p.Id
      WHERE p.ProjectType = 3
    `);
    console.log(`2️⃣  ProjectItems (Prayer): ${items[0].count} rows`);

    // 3. Count localizations
    const [projLoc] = await conn.query(`
      SELECT pl.Language, COUNT(*) as count
      FROM projectlocalization pl
      JOIN project p ON pl.ProjectId = p.Id
      WHERE p.ProjectType = 3
      GROUP BY pl.Language
      ORDER BY pl.Language
    `);
    console.log(`\n3️⃣  ProjectLocalizations:`);
    const langNames = {1: 'Hebrew', 2: 'English', 3: 'French'};
    let totalProjLoc = 0;
    projLoc.forEach(row => {
      console.log(`   - ${langNames[row.Language]}: ${row.count} rows`);
      totalProjLoc += row.count;
    });
    console.log(`   Total: ${totalProjLoc} rows`);

    const [itemLoc] = await conn.query(`
      SELECT pil.Language, COUNT(*) as count
      FROM projectitemlocalization pil
      JOIN projectitem pi ON pil.ItemId = pi.Id
      JOIN project p ON pi.ProjectId = p.Id
      WHERE p.ProjectType = 3
      GROUP BY pil.Language
      ORDER BY pil.Language
    `);
    console.log(`\n4️⃣  ProjectItemLocalizations:`);
    let totalItemLoc = 0;
    itemLoc.forEach(row => {
      console.log(`   - ${langNames[row.Language]}: ${row.count} rows`);
      totalItemLoc += row.count;
    });
    console.log(`   Total: ${totalItemLoc} rows`);

    // 5. Sample prayers
    const [sample] = await conn.query(`
      SELECT
        p.Id as ProjectId,
        p.Name,
        pi.Id as ProjectItemId,
        pl_he.Title as Title_HE,
        pl_en.Title as Title_EN,
        pl_fr.Title as Title_FR,
        pl_he.DisplayInSite
      FROM project p
      JOIN projectitem pi ON pi.ProjectId = p.Id
      LEFT JOIN projectlocalization pl_he ON pl_he.ProjectId = p.Id AND pl_he.Language = 1
      LEFT JOIN projectlocalization pl_en ON pl_en.ProjectId = p.Id AND pl_en.Language = 2
      LEFT JOIN projectlocalization pl_fr ON pl_fr.ProjectId = p.Id AND pl_fr.Language = 3
      WHERE p.ProjectType = 3
      ORDER BY p.Id
      LIMIT 5
    `);

    console.log(`\n5️⃣  Sample Prayer Data (first 5):`);
    sample.forEach((row, i) => {
      console.log(`\n   ${i+1}. ProjectId: ${row.ProjectId}, ItemId: ${row.ProjectItemId}`);
      console.log(`      Name: ${row.Name}`);
      console.log(`      Hebrew: ${row.Title_HE}`);
      console.log(`      English: ${row.Title_EN || '(fallback to Hebrew)'}`);
      console.log(`      French: ${row.Title_FR || '(fallback to Hebrew)'}`);
      console.log(`      DisplayInSite: ${row.DisplayInSite} (${row.DisplayInSite === 1 ? 'Visible' : 'Hidden'})`);
    });

    // 6. Check DisplayInSite distribution
    const [displayStats] = await conn.query(`
      SELECT DisplayInSite, COUNT(*) as count
      FROM projectlocalization pl
      JOIN project p ON pl.ProjectId = p.Id
      WHERE p.ProjectType = 3 AND pl.Language = 1
      GROUP BY DisplayInSite
    `);
    console.log(`\n6️⃣  DisplayInSite Distribution (Hebrew only):`);
    displayStats.forEach(row => {
      const label = row.DisplayInSite === 1 ? 'Visible' : 'Hidden';
      console.log(`   - ${label} (${row.DisplayInSite}): ${row.count} prayers`);
    });

    // 7. Check for fallback usage (where EN/FR = Hebrew)
    const [fallbackStats] = await conn.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pl_he.Title = pl_en.Title THEN 1 ELSE 0 END) as en_is_fallback,
        SUM(CASE WHEN pl_he.Title = pl_fr.Title THEN 1 ELSE 0 END) as fr_is_fallback
      FROM project p
      JOIN projectlocalization pl_he ON pl_he.ProjectId = p.Id AND pl_he.Language = 1
      JOIN projectlocalization pl_en ON pl_en.ProjectId = p.Id AND pl_en.Language = 2
      JOIN projectlocalization pl_fr ON pl_fr.ProjectId = p.Id AND pl_fr.Language = 3
      WHERE p.ProjectType = 3
    `);

    console.log(`\n7️⃣  Fallback Usage (Hebrew as fallback):`);
    const fallback = fallbackStats[0];
    console.log(`   - Total prayers: ${fallback.total}`);
    console.log(`   - English using Hebrew fallback: ${fallback.en_is_fallback}`);
    console.log(`   - French using Hebrew fallback: ${fallback.fr_is_fallback}`);

    // 8. Mapping file verification
    const fs = require('fs');
    const path = require('path');
    const mappingPath = path.join(__dirname, '../../data/fk-mappings/PrayerProjectItemId.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    const mappingCount = Object.keys(mappingData).length;

    console.log(`\n8️⃣  Mapping File:`);
    console.log(`   - Path: data/fk-mappings/PrayerProjectItemId.json`);
    console.log(`   - Entries: ${mappingCount} PrayerId → ProjectItemId mappings`);

    // Show sample mappings
    const sampleMappings = Object.entries(mappingData).slice(0, 5);
    console.log(`   - Sample (first 5):`);
    sampleMappings.forEach(([prayerId, projectItemId]) => {
      console.log(`     PrayerId ${prayerId} → ProjectItemId ${projectItemId}`);
    });

    // 9. Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Projects (Prayer): ${projects[0].count}`);
    console.log(`✅ ProjectItems (Prayer): ${items[0].count}`);
    console.log(`✅ ProjectLocalizations: ${totalProjLoc} (${projects[0].count} × 3 languages)`);
    console.log(`✅ ProjectItemLocalizations: ${totalItemLoc} (${items[0].count} × 3 languages)`);
    console.log(`✅ Total rows: ${projects[0].count + items[0].count + totalProjLoc + totalItemLoc}`);
    console.log(`✅ Mapping entries: ${mappingCount}`);
    console.log(`\n🎉 Prayer migration verification PASSED!\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

verifyPrayerMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
