/**
 * Check RecruitersGroups 233 and 234 in OLD DB
 */

const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkGroups() {
  try {
    console.log('🔍 Checking RecruitersGroups 233 and 234 in OLD DB...\n');

    await sql.connect(mssqlConfig);

    const result = await sql.query`
      SELECT ID, GroupName, ProductId
      FROM RecruitersGroups
      WHERE ID IN (233, 234)
    `;

    console.log(`Found ${result.recordset.length} groups:\n`);
    console.table(result.recordset);

    // Check if these groups exist in new DB
    const mysql = require('mysql2/promise');
    const { mysqlConfig } = require('../../config/database');
    const conn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    console.log('\nChecking if these groups were migrated to NEW DB...\n');

    for (const group of result.recordset) {
      const oldId = group.ID;
      const [newGroups] = await conn.query(
        'SELECT Id, Name, ProjectId FROM recruitersgroup WHERE Id = ?',
        [oldId]
      );

      if (newGroups.length > 0) {
        console.log(`✅ Group ${oldId} found in new DB as recruitersgroup ${newGroups[0].Id}`);
      } else {
        console.log(`❌ Group ${oldId} NOT found in new DB`);
        console.log(`   GroupName: "${group.GroupName}"`);
        console.log(`   ProductId: ${group.ProductId}`);
        console.log(`   → This is why RecruiterGroupId is NULL for Sharlin recruiters!`);
      }
    }

    await conn.end();
    await sql.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkGroups();
