/**
 * Clear all recruiter-related tables
 * Deletes data from: recruiterlocalization, recruiter, recruitersgroup, recruitersgrouplanguage
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function clearRecruiters() {
  try {
    console.log('Connecting to MySQL...');
    const conn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    console.log('\nClearing recruiter-related tables...\n');

    // Order matters: child tables first
    const tables = [
      'donation',  // Has FK to recruiter
      'recruiterlocalization',
      'recruiter',
      'recruitersgrouplanguage',
      'recruitersgroup'
    ];

    for (const table of tables) {
      try {
        const [rows] = await conn.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = rows[0].count;

        if (count > 0) {
          await conn.query(`DELETE FROM ${table}`);
          console.log(`✅ ${table}: deleted ${count} rows`);
        } else {
          console.log(`⚪ ${table}: already empty`);
        }
      } catch (err) {
        console.error(`❌ Error clearing ${table}: ${err.message}`);
      }
    }

    await conn.end();
    console.log('\n✨ Done!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

clearRecruiters();
