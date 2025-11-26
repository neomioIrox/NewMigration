const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkCount() {
  try {
    const conn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    console.log('\nRecruiterLocalization Count by Language:\n');

    const [rows] = await conn.query(`
      SELECT LanguageId, COUNT(*) as count
      FROM recruiterlocalization
      GROUP BY LanguageId
      ORDER BY LanguageId
    `);

    rows.forEach(r => {
      const lang = r.LanguageId === 1 ? 'Hebrew' : r.LanguageId === 2 ? 'English' : 'French';
      console.log(`  ${lang} (LanguageId ${r.LanguageId}): ${r.count} rows`);
    });

    const [total] = await conn.query('SELECT COUNT(*) as total FROM recruiterlocalization');
    console.log(`\nTotal: ${total[0].total} rows`);

    // Sample data
    console.log('\nSample localization data:\n');
    const [sample] = await conn.query(`
      SELECT r.Name as RecruiterName, rl.LanguageId, rl.Name, rl.DisplayInSite
      FROM recruiterlocalization rl
      JOIN recruiter r ON rl.RecruiterId = r.Id
      LIMIT 5
    `);

    sample.forEach(s => {
      const lang = s.LanguageId === 1 ? 'HE' : s.LanguageId === 2 ? 'EN' : 'FR';
      console.log(`  ${s.RecruiterName} [${lang}]: "${s.Name}" (DisplayInSite: ${s.DisplayInSite})`);
    });

    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkCount();
