const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkExisting() {
  try {
    const conn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    const [rows] = await conn.query(`
      SELECT rl.RecruiterId, r.Name, rl.LanguageId
      FROM recruiterlocalization rl
      JOIN recruiter r ON rl.RecruiterId = r.Id
      ORDER BY rl.Id
    `);

    console.log(`Total existing rows: ${rows.length}\n`);
    console.log('First 15 rows:');
    rows.slice(0, 15).forEach((r, i) => {
      const lang = r.LanguageId === 1 ? 'HE' : r.LanguageId === 2 ? 'EN' : 'FR';
      console.log(`${i+1}. RecruiterId=${r.RecruiterId} (${r.Name}), Lang=${lang}`);
    });

    // Check for unique constraint
    console.log('\nChecking for duplicates by RecruiterId+LanguageId:');
    const [dups] = await conn.query(`
      SELECT RecruiterId, LanguageId, COUNT(*) as count
      FROM recruiterlocalization
      GROUP BY RecruiterId, LanguageId
      HAVING count > 1
    `);

    if (dups.length > 0) {
      console.log(`Found ${dups.length} duplicate combinations!`);
      dups.slice(0, 5).forEach(d => {
        console.log(`  RecruiterId=${d.RecruiterId}, Lang=${d.LanguageId}: ${d.count} times`);
      });
    } else {
      console.log('No duplicates found.');
    }

    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkExisting();
