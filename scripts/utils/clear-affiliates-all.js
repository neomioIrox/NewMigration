const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mysqlConfig } = require('../../config/database');

/**
 * Clear all affiliate/source migration data
 * - Delete from source table
 * - Delete from affiliate table
 * - Delete from user table (RoleId = 3 only)
 * - Delete FK mapping file
 */

async function clearAffiliatesAll() {
  let connection;

  try {
    console.log('🧹 Clearing all affiliates & sources data...\n');

    connection = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Disable foreign key checks temporarily
    console.log('⚙️  Disabling foreign key checks temporarily...\n');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Step 1: Clear source table
    console.log('📌 Step 1: Clearing source table...');
    const [sourceResult] = await connection.query('DELETE FROM source');
    console.log(`   ✅ Deleted ${sourceResult.affectedRows} rows from source\n`);

    // Step 2: Clear affiliate table
    console.log('📌 Step 2: Clearing affiliate table...');
    const [affiliateResult] = await connection.query('DELETE FROM affiliate');
    console.log(`   ✅ Deleted ${affiliateResult.affectedRows} rows from affiliate\n`);

    // Step 3: Clear user table (RoleId = 3 only - affiliates)
    console.log('📌 Step 3: Clearing user table (RoleId = 3 - affiliates only)...');
    const [userResult] = await connection.query('DELETE FROM user WHERE RoleId = 3');
    console.log(`   ✅ Deleted ${userResult.affectedRows} rows from user\n`);

    // Step 4: Delete FK mapping file
    console.log('📌 Step 4: Deleting AffiliateId.json mapping file...');
    const mappingPath = path.join(__dirname, '../../data/fk-mappings/AffiliateId.json');
    if (fs.existsSync(mappingPath)) {
      fs.unlinkSync(mappingPath);
      console.log(`   ✅ Deleted ${mappingPath}\n`);
    } else {
      console.log(`   ℹ️  File doesn't exist (already clean)\n`);
    }

    // Re-enable foreign key checks
    console.log('⚙️  Re-enabling foreign key checks...\n');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('✅ All data cleared successfully!\n');

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        // Ignore
      }
    }
  }
}

// Run if executed directly
if (require.main === module) {
  clearAffiliatesAll()
    .then(() => {
      console.log('🎉 Done!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

module.exports = { clearAffiliatesAll };
