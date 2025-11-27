const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkUserSourcesWithoutParent() {
  let pool;

  try {
    console.log('🔍 Checking UserSources WITHOUT ParentSourcesId...\n');

    pool = await sql.connect(mssqlConfig);

    // Get sample of UserSources WITHOUT ParentSourcesId
    const withoutParentQuery = `
      SELECT TOP 20
        UserSourcesId,
        Name,
        ParentSourcesId,
        Title,
        ExpirationNum
      FROM UserSources
      WHERE ParentSourcesId IS NULL
      ORDER BY UserSourcesId
    `;

    const result = await pool.request().query(withoutParentQuery);

    console.log('📋 Sample UserSources WITHOUT ParentSourcesId (20 rows):');
    console.table(result.recordset);

    // Check distribution of NULL vs 0 vs actual NULLconsole.log('\n📊 ParentSourcesId distribution:');
    const distQuery = `
      SELECT
        CASE
          WHEN ParentSourcesId IS NULL THEN 'NULL'
          WHEN ParentSourcesId = 0 THEN 'Zero (0)'
          ELSE 'Has Value'
        END as ParentIdStatus,
        COUNT(*) as Count
      FROM UserSources
      GROUP BY
        CASE
          WHEN ParentSourcesId IS NULL THEN 'NULL'
          WHEN ParentSourcesId = 0 THEN 'Zero (0)'
          ELSE 'Has Value'
        END
      ORDER BY Count DESC
    `;

    const distResult = await pool.request().query(distQuery);
    console.table(distResult.recordset);

    // Check if ParentSourcesId=0 exists in ParentSources
    console.log('\n❓ Does ParentSourcesId=0 exist in ParentSources?');
    const zeroCheckQuery = `
      SELECT Id, Name FROM ParentSources WHERE Id = 0
    `;
    const zeroCheck = await pool.request().query(zeroCheckQuery);

    if (zeroCheck.recordset.length > 0) {
      console.log('✅ Yes! ParentSourcesId=0 exists:');
      console.table(zeroCheck.recordset);
    } else {
      console.log('❌ No! ParentSourcesId=0 does NOT exist in ParentSources');
      console.log('   This means UserSources with ParentSourcesId=0 are orphaned!\n');
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

checkUserSourcesWithoutParent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
