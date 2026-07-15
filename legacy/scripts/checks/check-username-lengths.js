const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkUsernameLengths() {
  let pool;

  try {
    console.log('🔍 Checking UserName lengths in ParentSources...\n');

    pool = await sql.connect(mssqlConfig);

    // Get UserName length distribution
    const lengthQuery = `
      SELECT
        Id,
        Name,
        UserName,
        LEN(UserName) as UsernameLength
      FROM ParentSources
      ORDER BY LEN(UserName) DESC
    `;

    const result = await pool.request().query(lengthQuery);

    console.log('📊 UserName length statistics:');
    console.log(`   Total: ${result.recordset.length}`);
    console.log(`   Max length: ${Math.max(...result.recordset.map(r => r.UsernameLength))}`);
    console.log(`   Min length: ${Math.min(...result.recordset.map(r => r.UsernameLength))}`);

    const over20 = result.recordset.filter(r => r.UsernameLength > 20);
    console.log(`   Over 20 chars: ${over20.length}\n`);

    if (over20.length > 0) {
      console.log('⚠️  UserNames that will be truncated (> 20 chars):');
      console.table(over20.map(r => ({
        Id: r.Id,
        Name: r.Name,
        UserName: r.UserName,
        Length: r.UsernameLength,
        Truncated: r.UserName.substring(0, 20)
      })));
    }

    // Check for duplicate UserNames after truncation
    const truncatedUsernames = result.recordset.map(r => r.UserName.substring(0, 20));
    const duplicates = truncatedUsernames.filter((item, index) => truncatedUsernames.indexOf(item) !== index);

    if (duplicates.length > 0) {
      console.log('\n🚨 WARNING: Duplicate UserNames after truncation!');
      console.log('   These will cause UNIQUE constraint violations:\n');

      const uniqueDuplicates = [...new Set(duplicates)];
      for (const dup of uniqueDuplicates) {
        const matches = result.recordset.filter(r => r.UserName.substring(0, 20) === dup);
        console.log(`   "${dup}" (${matches.length} occurrences):`);
        matches.forEach(m => {
          console.log(`      - Id=${m.Id}, Name="${m.Name}", UserName="${m.UserName}"`);
        });
      }
    } else {
      console.log('\n✅ No duplicate UserNames after truncation!');
    }

    await pool.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (e) {
        // Ignore
      }
    }
  }
}

checkUsernameLengths()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
