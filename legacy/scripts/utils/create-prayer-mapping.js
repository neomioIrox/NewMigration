const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

/**
 * Creates PrayerProjectItemId.json mapping file
 * Maps: Prayers.PrayersId (old) → projectitem.Id (new, where ItemType=3)
 *
 * This mapping is CRITICAL for Donation migration:
 * - 38,149 Orders have PrayerId
 * - They need to be mapped to the correct projectitem.Id
 */
async function createPrayerMapping() {
  let mssqlConn, mysqlConn;

  try {
    console.log('🔗 Creating Prayer → ProjectItem mapping...\n');

    // Connect to both databases
    console.log('📡 Connecting to MSSQL...');
    mssqlConn = await sql.connect(mssqlConfig);

    console.log('📡 Connecting to MySQL...');
    mysqlConn = await mysql.createConnection(mysqlConfig);

    // Get all Prayers from old DB
    console.log('\n📊 Fetching Prayers from old DB...');
    const prayersResult = await sql.query`
      SELECT PrayersId, Name
      FROM Prayers
      ORDER BY PrayersId
    `;
    const prayers = prayersResult.recordset;
    console.log(`   Found ${prayers.length} prayers`);

    // Get all Prayer ProjectItems from new DB (ItemType=3, ProjectType=2)
    console.log('\n📊 Fetching Prayer ProjectItems from new DB...');
    const [projectItems] = await mysqlConn.query(`
      SELECT
        pi.Id AS ProjectItemId,
        pi.ItemType,
        pi.KupatFundNo,
        p.Id AS ProjectId,
        p.ProjectType,
        p.KupatFundNo AS ProjectKupatFundNo
      FROM projectitem pi
      INNER JOIN project p ON pi.ProjectId = p.Id
      WHERE pi.ItemType = 3
        AND p.ProjectType = 2
      ORDER BY pi.Id
    `);
    console.log(`   Found ${projectItems.length} prayer items (ItemType=3)`);

    // Create mapping: PrayersId → ProjectItemId
    const mapping = {};
    let mappedCount = 0;
    let notFoundCount = 0;
    const notFound = [];

    for (const prayer of prayers) {
      const prayerId = prayer.PrayersId;

      // Find matching ProjectItem by KupatFundNo (which stores PrayersId)
      const matchingItem = projectItems.find(pi => pi.KupatFundNo === prayerId);

      if (matchingItem) {
        mapping[prayerId] = {
          PrayersId: prayerId,
          PrayerName: prayer.Name,
          ProjectItemId: matchingItem.ProjectItemId,
          ProjectId: matchingItem.ProjectId,
          Status: 'MAPPED'
        };
        mappedCount++;
      } else {
        mapping[prayerId] = {
          PrayersId: prayerId,
          PrayerName: prayer.Name,
          ProjectItemId: null,
          ProjectId: null,
          Status: 'NOT_FOUND'
        };
        notFoundCount++;
        notFound.push(`${prayerId}: ${prayer.Name}`);
      }
    }

    // Create output object
    const output = {
      metadata: {
        createdAt: new Date().toISOString(),
        description: 'Prayers.PrayersId → projectitem.Id mapping for Donation migration',
        totalPrayers: prayers.length,
        mapped: mappedCount,
        notFound: notFoundCount,
        usageInDonation: '38,149 Orders depend on PrayerId'
      },
      mapping
    };

    // Save to file
    const outputPath = path.join(__dirname, '../../data/fk-mappings/PrayerProjectItemId.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log('\n✅ Mapping created successfully!');
    console.log(`   File: ${outputPath}`);
    console.log(`   Total prayers: ${prayers.length}`);
    console.log(`   ✅ Mapped: ${mappedCount}`);
    console.log(`   ❌ Not found: ${notFoundCount}`);

    if (notFoundCount > 0) {
      console.log('\n⚠️  WARNING: Some prayers not found in new DB:');
      notFound.slice(0, 10).forEach(item => console.log(`   - ${item}`));
      if (notFound.length > 10) {
        console.log(`   ... and ${notFound.length - 10} more`);
      }
    }

    // Close connections
    await sql.close();
    await mysqlConn.end();

  } catch (error) {
    console.error('❌ Error creating mapping:', error.message);
    console.error(error.stack);

    if (mssqlConn) await sql.close();
    if (mysqlConn) await mysqlConn.end();

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createPrayerMapping();
}

module.exports = { createPrayerMapping };
