const sql = require('mssql');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function migrateCustomerUsers() {
  console.log('👤 מתחיל מיגרציית Users → customeruser...\n');

  const results = {
    inserted: 0,
    skipped: 0,
    errors: [],
    userMapping: {}  // Old UserId → New CustomerId
  };

  let mysqlConn;

  try {
    // Connect to databases
    console.log('📡 מתחבר לבסיסי נתונים...');
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });
    console.log('✅ חיבור הצליח\n');

    // ========================================
    // Fetch all users from old DB
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 1: שליפת Users מ-DB ישן');
    console.log('━'.repeat(60));

    const usersResult = await sql.query`
      SELECT
        Id,
        FirstName,
        LastName,
        Email,
        UserName,
        PasswordHash,
        PhoneNumber,
        DateCreated
      FROM Users
      ORDER BY Id
    `;

    console.log(`נמצאו ${usersResult.recordset.length} משתמשים\n`);

    // ========================================
    // Insert into new DB
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 2: הכנסת customeruser ל-DB חדש');
    console.log('━'.repeat(60));

    for (const user of usersResult.recordset) {
      try {
        // Check if already exists
        const [existing] = await mysqlConn.query(
          'SELECT Id FROM customeruser WHERE Id = ?',
          [user.Id]
        );

        if (existing.length > 0) {
          results.skipped++;
          console.log(`⏭️  משתמש ${user.Id} כבר קיים`);
          results.userMapping[user.Id] = existing[0].Id;
          continue;
        }

        // Handle NULL names
        const firstName = user.FirstName || 'Unknown';
        const lastName = user.LastName || 'Name';

        // UserName max 40 chars - add suffix if duplicate
        let userName = user.UserName ? user.UserName.substring(0, 35) : `user${user.Id}`;

        // Check for duplicate UserName
        const [dupUserName] = await mysqlConn.query(
          'SELECT Id FROM customeruser WHERE UserName = ?',
          [userName]
        );

        if (dupUserName.length > 0) {
          userName = `${userName}_${user.Id}`;  // Add unique suffix
        }

        // Email - use Id as fallback if missing
        const email = user.Email || `user${user.Id}@unknown.com`;

        // Insert customeruser
        const [result] = await mysqlConn.query(`
          INSERT INTO customeruser (
            Id,
            FirstName,
            LastName,
            Gender,
            Email,
            UserName,
            Password,
            Phone,
            RecordStatus,
            StatusChangedAt,
            StatusChangedBy,
            CreatedAt,
            CreatedBy,
            UpdatedAt,
            UpdatedBy,
            IdNumber,
            IsEmailVerified,
            EmailVerificationToken,
            EmailVerificationTokenExpiry
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          user.Id,
          firstName,
          lastName,
          null,  // Gender
          email,
          userName,
          user.PasswordHash || '',  // Password (hashed)
          user.PhoneNumber || null,
          2,  // RecordStatus = Accept
          new Date(),
          -1,  // System user
          user.DateCreated || new Date(),
          -1,
          new Date(),
          -1,
          null,  // IdNumber
          0,  // IsEmailVerified = false
          null,  // EmailVerificationToken
          null   // EmailVerificationTokenExpiry
        ]);

        results.inserted++;
        results.userMapping[user.Id] = user.Id;  // Same ID in both DBs

        if (results.inserted % 100 === 0) {
          console.log(`✅ הוכנסו ${results.inserted} משתמשים...`);
        }

      } catch (err) {
        console.error(`❌ Error inserting UserId=${user.Id}: ${err.message}`);
        results.errors.push(`UserId=${user.Id}: ${err.message}`);
      }
    }

    console.log(`\n✅ שלב 2 הושלם: ${results.inserted} משתמשים חדשים, ${results.skipped} קיימים\n`);

    // ========================================
    // Save FK mapping
    // ========================================
    console.log('━'.repeat(60));
    console.log('שלב 3: שמירת מיפוי UserId');
    console.log('━'.repeat(60));

    const mappingPath = path.join(__dirname, '../../data/fk-mappings/UserId.json');
    const mappingDir = path.dirname(mappingPath);

    if (!fs.existsSync(mappingDir)) {
      fs.mkdirSync(mappingDir, { recursive: true });
    }

    fs.writeFileSync(mappingPath, JSON.stringify(results.userMapping, null, 2), 'utf-8');

    console.log(`✅ מיפוי נשמר ב: ${mappingPath}`);
    console.log(`   סה"כ ${Object.keys(results.userMapping).length} מיפויים\n`);

    // ========================================
    // Final Summary
    // ========================================
    console.log('━'.repeat(60));
    console.log('סיכום המיגרציה');
    console.log('━'.repeat(60));
    console.log(`✅ משתמשים חדשים: ${results.inserted}`);
    console.log(`⏭️  משתמשים קיימים: ${results.skipped}`);
    console.log(`📝 מיפוי נשמר: UserId.json`);

    if (results.errors.length > 0) {
      console.log(`\n⚠️  ${results.errors.length} שגיאות:`);
      results.errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
      if (results.errors.length > 10) {
        console.log(`   ... ועוד ${results.errors.length - 10} שגיאות`);
      }
    }

    console.log('\n🎉 מיגרציית CustomerUser הושלמה!\n');

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
  migrateCustomerUsers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

// Export for use in server
module.exports = { migrateCustomerUsers };
