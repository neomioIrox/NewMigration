/**
 * Check recruitersgroup table schema
 */

const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkSchema() {
  try {
    const conn = await mysql.createConnection({...mysqlConfig, charset: 'utf8mb4'});

    console.log('🔍 Checking recruitersgroup table schema...\n');

    const [columns] = await conn.query('DESCRIBE recruitersgroup');

    console.table(columns);

    // Focus on ProjectId column
    const projectIdCol = columns.find(c => c.Field === 'ProjectId');
    if (projectIdCol) {
      console.log('\n📌 ProjectId column details:');
      console.log('   Type:', projectIdCol.Type);
      console.log('   Null:', projectIdCol.Null);
      console.log('   Key:', projectIdCol.Key);
      console.log('   Default:', projectIdCol.Default);
      console.log('   Extra:', projectIdCol.Extra);

      if (projectIdCol.Null === 'NO') {
        console.log('\n❌ PROBLEM: ProjectId does NOT allow NULL!');
        console.log('   This is why 188 groups with ProjectId=NULL failed to insert.\n');
        console.log('💡 Solution: ALTER TABLE to allow NULL:');
        console.log('   ALTER TABLE recruitersgroup MODIFY COLUMN ProjectId INT NULL;');
      } else {
        console.log('\n✅ ProjectId allows NULL');
      }
    }

    await conn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkSchema();
