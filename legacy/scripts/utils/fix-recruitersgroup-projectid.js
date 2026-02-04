/**
 * Fix recruitersgroup.ProjectId to allow NULL
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function fixSchema() {
  try {
    const conn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    console.log('🔧 Fixing recruitersgroup.ProjectId to allow NULL...\n');

    // Check current schema
    const [before] = await conn.query('DESCRIBE recruitersgroup');
    const projectIdBefore = before.find(c => c.Field === 'ProjectId');
    console.log('📌 BEFORE:');
    console.log('   ProjectId Null:', projectIdBefore.Null);

    // ALTER TABLE to allow NULL
    await conn.query('ALTER TABLE recruitersgroup MODIFY COLUMN ProjectId INT NULL');

    // Check after
    const [after] = await conn.query('DESCRIBE recruitersgroup');
    const projectIdAfter = after.find(c => c.Field === 'ProjectId');
    console.log('\n📌 AFTER:');
    console.log('   ProjectId Null:', projectIdAfter.Null);

    if (projectIdAfter.Null === 'YES') {
      console.log('\n✅ SUCCESS! ProjectId now allows NULL');
      console.log('   Now you can run recruiter migration and all 242 groups will be inserted!');
    } else {
      console.log('\n❌ FAILED: ProjectId still does not allow NULL');
    }

    await conn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixSchema();
