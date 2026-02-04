// Script to verify LinkSetting FK relationships
const mysql = require('mysql2/promise');

async function checkLinkSettingFKs() {
  console.log('🔍 Checking LinkSetting FK Relationships');
  console.log('==========================================\n');

  const mysqlConfig = {
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  };

  try {
    console.log('📡 Connecting to MySQL...');
    const connection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Connected!\n');

    // Get LinkSetting records with their related data
    console.log('📋 LinkSetting Records with FK Validation:\n');
    const [linkSettings] = await connection.execute(`
      SELECT
        ls.Id as LinkSettingId,
        ls.ProjectId,
        ls.ItemId,
        ls.LinkType,
        ls.LinkTargetType,
        ls.LinkText,
        p.Id as ProjectExists,
        pi.Id as ItemExists,
        pi.ProjectId as ItemProjectId
      FROM linksetting ls
      LEFT JOIN project p ON ls.ProjectId = p.Id
      LEFT JOIN projectitem pi ON ls.ItemId = pi.Id
      ORDER BY ls.Id
      LIMIT 10
    `);

    if (linkSettings.length === 0) {
      console.log('   ⚠️  No LinkSetting records found');
    } else {
      linkSettings.forEach(ls => {
        console.log(`📌 LinkSetting ID: ${ls.LinkSettingId}`);
        console.log(`   ProjectId: ${ls.ProjectId} ${ls.ProjectExists ? '✅ (exists)' : '❌ (NOT FOUND!)'}`);
        console.log(`   ItemId: ${ls.ItemId} ${ls.ItemExists ? '✅ (exists)' : '❌ (NOT FOUND!)'}`);

        if (ls.ItemExists && ls.ItemProjectId) {
          if (ls.ProjectId === ls.ItemProjectId) {
            console.log(`   ✅ ProjectId matches Item's ProjectId (${ls.ItemProjectId})`);
          } else {
            console.log(`   ❌ MISMATCH! ProjectId=${ls.ProjectId} but Item's ProjectId=${ls.ItemProjectId}`);
          }
        }

        console.log(`   LinkType: ${ls.LinkType}, TargetType: ${ls.LinkTargetType}`);
        console.log(`   LinkText: "${ls.LinkText}"`);
        console.log('');
      });

      // Count issues
      const projectMissing = linkSettings.filter(ls => !ls.ProjectExists).length;
      const itemMissing = linkSettings.filter(ls => !ls.ItemExists).length;
      const mismatch = linkSettings.filter(ls => ls.ItemExists && ls.ProjectId !== ls.ItemProjectId).length;

      console.log('📊 Summary:');
      console.log(`   Total LinkSettings: ${linkSettings.length}`);
      console.log(`   Projects not found: ${projectMissing} ${projectMissing > 0 ? '❌' : '✅'}`);
      console.log(`   Items not found: ${itemMissing} ${itemMissing > 0 ? '❌' : '✅'}`);
      console.log(`   ProjectId mismatches: ${mismatch} ${mismatch > 0 ? '❌' : '✅'}`);
      console.log('');
    }

    await connection.end();
    console.log('✅ Check complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkLinkSettingFKs();
