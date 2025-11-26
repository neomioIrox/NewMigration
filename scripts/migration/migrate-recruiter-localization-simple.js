/**
 * Simple RecruiterLocalization Migration
 *
 * Logic:
 * 1. Get all recruiters from new DB
 * 2. For each recruiter, find matching ProductStock by Name
 * 3. Check which languages have data (Name not empty/null)
 * 4. Insert localization row for each language with data
 */

const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

// Helper: check if value is empty (including "null" string)
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str === 'null';
};

async function migrateLocalization() {
  console.log('Starting RecruiterLocalization migration...\n');

  try {
    // Connect
    const mssqlPool = await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Get all recruiters from new DB
    const [newRecruiters] = await mysqlConn.query('SELECT Id, Name FROM recruiter');
    console.log(`Found ${newRecruiters.length} recruiters in new DB\n`);

    // Get all ProductStock data
    const oldRecruiters = await mssqlPool.request().query(`
      SELECT Name, Hide, Hide_en, Hide_fr, Name_en, Name_fr
      FROM ProductStock
      WHERE GroupId IS NOT NULL
    `);
    console.log(`Found ${oldRecruiters.recordset.length} ProductStock in old DB\n`);

    // Create lookup: Name -> ProductStock data
    const productStockLookup = {};
    for (const ps of oldRecruiters.recordset) {
      productStockLookup[ps.Name] = ps;
    }

    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    const langCounts = { he: 0, en: 0, fr: 0 };

    console.log('Processing recruiters...\n');

    for (const recruiter of newRecruiters) {
      const oldData = productStockLookup[recruiter.Name];

      if (!oldData) {
        skipped++;
        if (skipped <= 5) {
          console.log(`⚠️  No ProductStock data for: ${recruiter.Name}`);
        }
        continue;
      }

      // Hebrew - always exists (Name is from recruiter table)
      try {
        const displayInSite = (oldData.Hide === 0 || oldData.Hide === null) ? 1 : 0;
        await mysqlConn.execute(
          'INSERT INTO recruiterlocalization (RecruiterId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [recruiter.Id, 1, recruiter.Name, null, displayInSite]
        );
        inserted++;
        langCounts.he++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`❌ Hebrew error for ${recruiter.Name}: ${err.message}`);
        }
      }

      // English - check if Name_en has real value
      if (!isEmpty(oldData.Name_en)) {
        try {
          const displayInSite = (oldData.Hide_en === 0 || oldData.Hide_en === null) ? 1 : 0;
          await mysqlConn.execute(
            'INSERT INTO recruiterlocalization (RecruiterId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
            [recruiter.Id, 2, oldData.Name_en, null, displayInSite]
          );
          inserted++;
          langCounts.en++;
        } catch (err) {
          errors++;
          if (errors <= 5) {
            console.error(`❌ English error for ${recruiter.Name}: ${err.message}`);
          }
        }
      }

      // French - check if Name_fr has real value
      if (!isEmpty(oldData.Name_fr)) {
        try {
          const displayInSite = (oldData.Hide_fr === 0 || oldData.Hide_fr === null) ? 1 : 0;
          await mysqlConn.execute(
            'INSERT INTO recruiterlocalization (RecruiterId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
            [recruiter.Id, 3, oldData.Name_fr, null, displayInSite]
          );
          inserted++;
          langCounts.fr++;
        } catch (err) {
          errors++;
          if (errors <= 5) {
            console.error(`❌ French error for ${recruiter.Name}: ${err.message}`);
          }
        }
      }
    }

    await mssqlPool.close();
    await mysqlConn.end();

    console.log('\n✅ Migration completed!');
    console.log(`   Inserted: ${inserted} rows`);
    console.log(`   Hebrew: ${langCounts.he}, English: ${langCounts.en}, French: ${langCounts.fr}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Skipped: ${skipped}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

migrateLocalization();
