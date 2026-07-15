const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkStatus() {
  try {
    const conn = await mysql.createConnection(mysqlConfig);

    const tables = [
      'Project',
      'ProjectLocalization',
      'ProjectItem',
      'ProjectItemLocalization',
      'Media',
      'LinkSetting',
      'EntityContent',
      'EntityContentItem',
      'RecruitersGroup',
      'RecruitersGroupLanguage',
      'Recruiter',
      'RecruiterLocalization',
      'Affiliate',
      'Source',
      'Donation',
      'Address'
    ];

    console.log('\n=== AWS MySQL Table Counts ===\n');

    for (const table of tables) {
      try {
        const [rows] = await conn.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = rows[0].count;
        const status = count > 0 ? '✅' : '❌';
        console.log(`${status} ${table.padEnd(30)} ${count.toString().padStart(6)} rows`);
      } catch (e) {
        console.log(`❌ ${table.padEnd(30)} Error: ${e.message}`);
      }
    }

    await conn.end();
    console.log('\n================================\n');

  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }
}

checkStatus();
