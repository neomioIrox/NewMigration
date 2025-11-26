/**
 * Simple RecruitersGroupLanguage Migration
 *
 * Logic:
 * 1. Get all recruiterGroups from new DB
 * 2. For each group, create 3 localization rows (Hebrew, English, French)
 * 3. All use the same Name (no multilingual data in old DB)
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function migrateLocalization() {
  console.log('Starting RecruitersGroupLanguage migration...\n');

  try {
    // Connect
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Get all recruiter groups from new DB
    const [groups] = await mysqlConn.query('SELECT Id, Name FROM recruitersgroup');
    console.log(`Found ${groups.length} recruiter groups in new DB\n`);

    let inserted = 0;
    let errors = 0;
    const langCounts = { he: 0, en: 0, fr: 0 };

    console.log('Processing groups...\n');

    for (const group of groups) {
      // Hebrew (LanguageId = 1)
      try {
        await mysqlConn.execute(
          'INSERT INTO recruitersgrouplanguage (RecruiterGroupId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [group.Id, 1, group.Name, null, 1]
        );
        inserted++;
        langCounts.he++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`❌ Hebrew error for ${group.Name}: ${err.message}`);
        }
      }

      // English (LanguageId = 2) - same Name
      try {
        await mysqlConn.execute(
          'INSERT INTO recruitersgrouplanguage (RecruiterGroupId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [group.Id, 2, group.Name, null, 1]
        );
        inserted++;
        langCounts.en++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`❌ English error for ${group.Name}: ${err.message}`);
        }
      }

      // French (LanguageId = 3) - same Name
      try {
        await mysqlConn.execute(
          'INSERT INTO recruitersgrouplanguage (RecruiterGroupId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [group.Id, 3, group.Name, null, 1]
        );
        inserted++;
        langCounts.fr++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`❌ French error for ${group.Name}: ${err.message}`);
        }
      }
    }

    await mysqlConn.end();

    console.log('\n✅ Migration completed!');
    console.log(`   Inserted: ${inserted} rows`);
    console.log(`   Hebrew: ${langCounts.he}, English: ${langCounts.en}, French: ${langCounts.fr}`);
    console.log(`   Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

migrateLocalization();
