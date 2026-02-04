const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

/**
 * Full Affiliates & Sources Migration
 *
 * STEP 0.5: Create user records for each ParentSource
 * STEP 1: Migrate ParentSources → affiliate (78 rows) with UserId
 * STEP 2: Generate AffiliateId FK mapping
 * STEP 3: Migrate UserSources → source (1,902 rows with ParentSourcesId)
 */

const AFFILIATE_ROLE_ID = 1; // Role "מנהל מערכת" (using existing role)

async function migrateAffiliatesAndSources() {
  const results = {
    step0_5_users: { inserted: 0, skipped: 0, total: 0, errors: [], truncated: [] },
    step1_affiliates: { inserted: 0, skipped: 0, total: 0, errors: [] },
    step2_mapping: { matched: 0, total: 0 },
    step3_sources: { inserted: 0, skipped: 0, total: 0, errors: [] }
  };

  let mssqlPool;
  let mysqlConn;

  try {
    console.log('='.repeat(70));
    console.log('🚀 STARTING FULL AFFILIATES & SOURCES MIGRATION');
    console.log('='.repeat(70));

    // ======================================================
    // STEP 0.5: Create user records
    // ======================================================
    console.log('\n📌 STEP 0.5: Creating user records for affiliates...');

    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Fetch all ParentSources
    const parentSourcesQuery = `
      SELECT
        Id,
        Name,
        Code,
        UserName,
        Password
      FROM ParentSources
      ORDER BY Id
    `;

    const parentSourcesResult = await mssqlPool.request().query(parentSourcesQuery);
    const parentSources = parentSourcesResult.recordset;
    results.step0_5_users.total = parentSources.length;

    console.log(`   Found ${parentSources.length} ParentSources rows`);
    console.log('   ℹ️  Will skip existing users (no deletion)\n');

    // Create user records (skip if already exists)
    let usersInserted = 0;
    let usersSkipped = 0;
    const usersErrors = [];
    const truncatedUsernames = [];
    const userIdMapping = {}; // ParentSources.Id → user.Id

    for (const row of parentSources) {
      try {
        // Prepare UserName (max 20 chars)
        let userName = row.UserName || row.Name;
        if (userName.length > 20) {
          truncatedUsernames.push({
            id: row.Id,
            original: userName,
            truncated: userName.substring(0, 20)
          });
          userName = userName.substring(0, 20);
        }

        // Check if user already exists
        const [existingUser] = await mysqlConn.query(
          'SELECT Id FROM user WHERE UserName = ?',
          [userName]
        );

        if (existingUser.length > 0) {
          // User already exists - skip and use existing Id
          userIdMapping[row.Id] = existingUser[0].Id;
          usersSkipped++;
          continue;
        }

        // Prepare FirstName/LastName from Name
        let firstName = row.Name;
        let lastName = 'Affiliate';

        // If Name has spaces, split it
        const nameParts = row.Name.trim().split(/\s+/);
        if (nameParts.length > 1) {
          firstName = nameParts.slice(0, -1).join(' ');
          lastName = nameParts[nameParts.length - 1];
        }

        // Limit FirstName to 100 chars
        if (firstName.length > 100) {
          firstName = firstName.substring(0, 100);
        }

        // Limit LastName to 300 chars (already safe, but just in case)
        if (lastName.length > 300) {
          lastName = lastName.substring(0, 300);
        }

        const insertQuery = `
          INSERT INTO user (
            FirstName,
            LastName,
            Email,
            UserName,
            Password,
            RoleId,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          firstName,                   // FirstName
          lastName,                    // LastName
          null,                        // Email = NULL
          userName,                    // UserName (truncated if needed)
          row.Password || '',          // Password (copy as-is, no encryption yet)
          AFFILIATE_ROLE_ID,           // RoleId = 3 (שותף)
          2,                           // RecordStatus = 2 (Accept)
          new Date(),                  // StatusChangedAt
          -1,                          // StatusChangedBy
          new Date(),                  // CreatedAt
          -1,                          // CreatedBy
          new Date(),                  // UpdatedAt
          -1                           // UpdatedBy
        ];

        const [result] = await mysqlConn.query(insertQuery, values);
        userIdMapping[row.Id] = result.insertId; // Store mapping
        usersInserted++;

      } catch (error) {
        usersErrors.push({ id: row.Id, name: row.Name, error: error.message });
        console.error(`   ❌ Error creating user for ${row.Id} (${row.Name}):`, error.message);
      }
    }

    results.step0_5_users.inserted = usersInserted;
    results.step0_5_users.skipped = usersSkipped;
    results.step0_5_users.errors = usersErrors;
    results.step0_5_users.truncated = truncatedUsernames;

    console.log(`   ✅ Step 0.5 completed: ${usersInserted} new users, ${usersSkipped} skipped (already exist)`);
    if (truncatedUsernames.length > 0) {
      console.log(`   ⚠️  ${truncatedUsernames.length} UserNames truncated to 20 chars`);
    }
    if (usersErrors.length > 0) {
      console.log(`   ⚠️  ${usersErrors.length} errors occurred`);
    }

    // ======================================================
    // STEP 1: Migrate ParentSources → affiliate
    // ======================================================
    console.log('\n📌 STEP 1: Migrating ParentSources → affiliate...');

    results.step1_affiliates.total = parentSources.length;
    console.log('   ℹ️  Will skip existing affiliates (no deletion)\n');

    // Insert affiliates (skip if already exists)
    let affiliatesInserted = 0;
    let affiliatesSkipped = 0;
    const affiliatesErrors = [];

    for (const row of parentSources) {
      try {
        const userId = userIdMapping[row.Id]; // Get user.Id from mapping

        if (!userId) {
          throw new Error(`No user found for ParentSource Id=${row.Id}`);
        }

        // Check if affiliate already exists
        const [existingAffiliate] = await mysqlConn.query(
          'SELECT Id FROM affiliate WHERE Id = ?',
          [row.Id]
        );

        if (existingAffiliate.length > 0) {
          // Affiliate already exists - skip
          affiliatesSkipped++;
          continue;
        }

        const insertQuery = `
          INSERT INTO affiliate (
            Id,
            Name,
            DefaultSourceId,
            UserId,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          row.Id,                      // Id (direct from old)
          row.Name,                    // Name
          null,                        // DefaultSourceId = NULL (will update later)
          userId,                      // UserId (from user table)
          2,                           // RecordStatus = 2 (Accept)
          new Date(),                  // StatusChangedAt
          -1,                          // StatusChangedBy (system user)
          new Date(),                  // CreatedAt
          -1,                          // CreatedBy
          new Date(),                  // UpdatedAt
          -1                           // UpdatedBy
        ];

        await mysqlConn.query(insertQuery, values);
        affiliatesInserted++;

      } catch (error) {
        affiliatesErrors.push({ id: row.Id, name: row.Name, error: error.message });
        console.error(`   ❌ Error inserting affiliate ${row.Id} (${row.Name}):`, error.message);
      }
    }

    results.step1_affiliates.inserted = affiliatesInserted;
    results.step1_affiliates.skipped = affiliatesSkipped;
    results.step1_affiliates.errors = affiliatesErrors;

    console.log(`   ✅ Step 1 completed: ${affiliatesInserted} new affiliates, ${affiliatesSkipped} skipped (already exist)`);
    if (affiliatesErrors.length > 0) {
      console.log(`   ⚠️  ${affiliatesErrors.length} errors occurred`);
    }

    await mssqlPool.close();
    await mysqlConn.end();

    // ======================================================
    // STEP 2: Generate AffiliateId FK Mapping
    // ======================================================
    console.log('\n📌 STEP 2: Generating AffiliateId FK mapping...');

    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });

    // Get ParentSources.Id from old DB
    const oldAffiliatesQuery = 'SELECT Id, Name FROM ParentSources ORDER BY Id';
    const oldAffiliatesResult = await mssqlPool.request().query(oldAffiliatesQuery);

    // Get affiliate.Id from new DB
    const [newAffiliates] = await mysqlConn.query('SELECT Id, Name FROM affiliate ORDER BY Id');

    // Create lookup by Name (best matching strategy from recruiters migration)
    const newAffiliatesLookup = {};
    for (const affiliate of newAffiliates) {
      newAffiliatesLookup[affiliate.Name] = affiliate.Id;
    }

    // Build FK mapping: oldId → newId
    const affiliateIdMapping = {};
    let matched = 0;

    for (const oldAffiliate of oldAffiliatesResult.recordset) {
      const newId = newAffiliatesLookup[oldAffiliate.Name];
      if (newId !== undefined) {
        affiliateIdMapping[oldAffiliate.Id] = newId;
        matched++;
      } else {
        console.log(`   ⚠️  No match found for old affiliate: ${oldAffiliate.Id} (${oldAffiliate.Name})`);
      }
    }

    results.step2_mapping.matched = matched;
    results.step2_mapping.total = oldAffiliatesResult.recordset.length;

    // Save mapping file
    const mappingPath = path.join(__dirname, '../../data/fk-mappings/AffiliateId.json');
    fs.writeFileSync(mappingPath, JSON.stringify(affiliateIdMapping, null, 2));

    console.log(`   ✅ Step 2 completed: ${matched}/${oldAffiliatesResult.recordset.length} AffiliateId mappings created`);
    console.log(`   💾 Mapping saved to: ${mappingPath}`);

    await mssqlPool.close();
    await mysqlConn.end();

    // ======================================================
    // STEP 3: Migrate UserSources → source
    // ======================================================
    console.log('\n📌 STEP 3: Migrating UserSources → source...');

    mssqlPool = await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Fetch UserSources with ParentSourcesId (excluding NULL and orphaned 0)
    const userSourcesQuery = `
      SELECT
        UserSourcesId,
        Name,
        ParentSourcesId,
        Title,
        ExpirationNum
      FROM UserSources
      WHERE ParentSourcesId IS NOT NULL
        AND ParentSourcesId <> 0
      ORDER BY UserSourcesId
    `;

    const userSourcesResult = await mssqlPool.request().query(userSourcesQuery);
    const userSources = userSourcesResult.recordset;
    results.step3_sources.total = userSources.length;

    console.log(`   Found ${userSources.length} UserSources rows (with valid ParentSourcesId)`);
    console.log('   ℹ️  Will skip existing sources (no deletion)\n');

    // Load FK mapping
    const affiliateMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    // Insert sources (skip if already exists)
    let sourcesInserted = 0;
    let sourcesSkipped = 0;
    const sourcesErrors = [];

    for (const row of userSources) {
      try {
        // Get mapped AffiliateId
        const affiliateId = affiliateMapping[row.ParentSourcesId];

        if (!affiliateId) {
          sourcesErrors.push({
            id: row.UserSourcesId,
            name: row.Name,
            error: `No FK mapping found for ParentSourcesId=${row.ParentSourcesId}`
          });
          continue;
        }

        // Check if source already exists (same AffiliateId + SourceCode)
        const [existingSource] = await mysqlConn.query(
          'SELECT Id FROM source WHERE AffiliateId = ? AND SourceCode = ?',
          [affiliateId, row.Name]
        );

        if (existingSource.length > 0) {
          // Source already exists - skip
          sourcesSkipped++;
          continue;
        }

        // Prepare Description (limit to 100 chars)
        let description = null;
        if (row.Title && row.Title.trim() !== '' && row.Title.toLowerCase() !== 'null') {
          description = row.Title.substring(0, 100);
        }

        const insertQuery = `
          INSERT INTO source (
            AffiliateId,
            SourceCode,
            Description,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          affiliateId,                 // AffiliateId (FK mapping)
          row.Name,                    // SourceCode = Name
          description,                 // Description = LEFT(Title, 100)
          2,                           // RecordStatus = 2 (Accept)
          new Date(),                  // StatusChangedAt
          -1,                          // StatusChangedBy
          new Date(),                  // CreatedAt
          -1,                          // CreatedBy
          new Date(),                  // UpdatedAt
          -1                           // UpdatedBy
        ];

        await mysqlConn.query(insertQuery, values);
        sourcesInserted++;

      } catch (error) {
        sourcesErrors.push({
          id: row.UserSourcesId,
          name: row.Name,
          error: error.message
        });
        console.error(`   ❌ Error inserting source ${row.UserSourcesId} (${row.Name}):`, error.message);
      }
    }

    results.step3_sources.inserted = sourcesInserted;
    results.step3_sources.skipped = sourcesSkipped;
    results.step3_sources.errors = sourcesErrors;

    console.log(`   ✅ Step 3 completed: ${sourcesInserted} new sources, ${sourcesSkipped} skipped (already exist)`);
    if (sourcesErrors.length > 0) {
      console.log(`   ⚠️  ${sourcesErrors.length} errors occurred`);
    }

    await mssqlPool.close();
    await mysqlConn.end();

    // ======================================================
    // SUMMARY
    // ======================================================
    console.log('\n' + '='.repeat(70));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log(`\n📊 Results Summary:`);
    console.log(`   Step 0.5 - Users:       ${results.step0_5_users.inserted} new, ${results.step0_5_users.skipped} skipped (${results.step0_5_users.total} total)`);
    console.log(`   Step 1 - Affiliates:    ${results.step1_affiliates.inserted} new, ${results.step1_affiliates.skipped} skipped (${results.step1_affiliates.total} total)`);
    console.log(`   Step 2 - FK Mapping:    ${results.step2_mapping.matched}/${results.step2_mapping.total} mappings`);
    console.log(`   Step 3 - Sources:       ${results.step3_sources.inserted} new, ${results.step3_sources.skipped} skipped (${results.step3_sources.total} total)`);
    console.log(`\n   Total Inserted:         ${results.step0_5_users.inserted + results.step1_affiliates.inserted + results.step3_sources.inserted} rows`);
    console.log(`   Total Skipped:          ${results.step0_5_users.skipped + results.step1_affiliates.skipped + results.step3_sources.skipped} rows (already existed)`);
    console.log(`   Total Errors:           ${results.step0_5_users.errors.length + results.step1_affiliates.errors.length + results.step3_sources.errors.length} errors\n`);

    if (results.step0_5_users.truncated.length > 0) {
      console.log(`\n⚠️  Truncated UserNames (${results.step0_5_users.truncated.length}):`);
      results.step0_5_users.truncated.forEach(t => {
        console.log(`   - ID ${t.id}: "${t.original}" → "${t.truncated}"`);
      });
    }

    if (results.step0_5_users.errors.length > 0) {
      console.log(`\n⚠️  User Errors (${results.step0_5_users.errors.length}):`);
      results.step0_5_users.errors.forEach(err => {
        console.log(`   - ID ${err.id} (${err.name}): ${err.error}`);
      });
    }

    if (results.step1_affiliates.errors.length > 0) {
      console.log(`\n⚠️  Affiliate Errors (${results.step1_affiliates.errors.length}):`);
      results.step1_affiliates.errors.forEach(err => {
        console.log(`   - ID ${err.id} (${err.name}): ${err.error}`);
      });
    }

    if (results.step3_sources.errors.length > 0) {
      console.log(`\n⚠️  Source Errors (${results.step3_sources.errors.length}):`);
      results.step3_sources.errors.forEach(err => {
        console.log(`   - ID ${err.id} (${err.name}): ${err.error}`);
      });
    }

    console.log('\n🎉 Done!\n');

    return results;

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    // Cleanup connections
    if (mssqlPool) {
      try {
        await mssqlPool.close();
      } catch (e) {
        // Ignore
      }
    }
    if (mysqlConn) {
      try {
        await mysqlConn.end();
      } catch (e) {
        // Ignore
      }
    }
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateAffiliatesAndSources()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAffiliatesAndSources };
