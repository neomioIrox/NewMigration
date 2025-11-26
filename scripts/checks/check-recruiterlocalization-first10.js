const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkFirst10() {
  try {
    const conn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    console.log('\nFirst 10 RecruiterLocalization rows:\n');

    const [rows] = await conn.query(`
      SELECT
        rl.Id,
        rl.RecruiterId,
        r.Name as RecruiterName,
        rl.LanguageId,
        CASE rl.LanguageId
          WHEN 1 THEN 'עברית'
          WHEN 2 THEN 'English'
          WHEN 3 THEN 'Français'
        END as Language,
        rl.Name as LocalizedName,
        rl.Description,
        rl.DisplayInSite
      FROM recruiterlocalization rl
      JOIN recruiter r ON rl.RecruiterId = r.Id
      ORDER BY rl.Id
      LIMIT 10
    `);

    rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ID: ${row.Id}`);
      console.log(`   Recruiter: ${row.RecruiterName} (ID: ${row.RecruiterId})`);
      console.log(`   Language: ${row.Language} (${row.LanguageId})`);
      console.log(`   Localized Name: "${row.LocalizedName}"`);
      console.log(`   Description: ${row.Description || '(null)'}`);
      console.log(`   Display in Site: ${row.DisplayInSite}`);
      console.log('');
    });

    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkFirst10();
