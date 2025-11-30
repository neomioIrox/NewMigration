const mysql = require('mysql2/promise');
const sql = require('mssql');
const { mysqlConfig, mssqlConfig } = require('../../config/database');

async function check() {
  try {
    // Connect to MySQL (new DB)
    const mysqlConn = await mysql.createConnection(mysqlConfig);

    // Count ALL Type 2 projects
    const [allType2] = await mysqlConn.query(`
      SELECT COUNT(*) as count
      FROM project
      WHERE ProjectType = 2
    `);
    console.log('━'.repeat(60));
    console.log('📊 All Type 2 Projects in new DB:', allType2[0].count);

    // Check specific IDs that had Duplicate errors
    const [specificProjects] = await mysqlConn.query(`
      SELECT Id, Name, ProjectType, RecordStatus
      FROM project
      WHERE Id IN (811, 812, 813, 897)
      ORDER BY Id
    `);

    console.log('\n❌ Projects with Duplicate errors (811, 812, 813, 897):');
    if (specificProjects.length > 0) {
      specificProjects.forEach(p => {
        console.log(`  ID ${p.Id}: "${p.Name.substring(0, 40)}" (ProjectType=${p.ProjectType})`);
      });
    } else {
      console.log('  לא נמצאו!');
    }

    // Connect to old DB and check ProductGroup
    console.log('\n━'.repeat(60));
    console.log('🔍 Checking old DB ProductGroup...');
    await sql.connect(mssqlConfig);

    const result = await sql.query`
      SELECT DISTINCT ParentProductId
      FROM ProductGroup
      WHERE ParentProductId IN (811, 812, 813, 897)
      ORDER BY ParentProductId
    `;

    console.log(`\nProductGroup entries for these IDs: ${result.recordset.length}`);
    result.recordset.forEach(r => {
      console.log(`  ParentProductId: ${r.ParentProductId}`);
    });

    // Count total ProductGroup projects
    const totalResult = await sql.query`
      SELECT COUNT(DISTINCT ParentProductId) as total
      FROM ProductGroup
    `;
    console.log(`\nTotal unique ParentProductId in ProductGroup: ${totalResult.recordset[0].total}`);

    await mysqlConn.end();
    await sql.close();

    console.log('━'.repeat(60));
    console.log('\n✅ Done!');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

check();
