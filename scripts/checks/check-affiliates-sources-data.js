const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkAffiliatesSourcesData() {
  let pool;

  try {
    console.log('🔍 Checking affiliate/source data in old database...\n');

    // Connect to MSSQL
    pool = await sql.connect(mssqlConfig);

    // 1. Count ParentSources
    const parentSourcesCount = await pool.request()
      .query('SELECT COUNT(*) as count FROM ParentSources');
    console.log(`📊 ParentSources: ${parentSourcesCount.recordset[0].count} rows`);

    // 2. Sample ParentSources data
    const parentSourcesSample = await pool.request()
      .query('SELECT TOP 5 * FROM ParentSources ORDER BY Id');
    console.log('\n📋 Sample ParentSources data:');
    console.table(parentSourcesSample.recordset);

    // 3. Count UserSources
    const userSourcesCount = await pool.request()
      .query('SELECT COUNT(*) as count FROM UserSources');
    console.log(`\n📊 UserSources: ${userSourcesCount.recordset[0].count} rows`);

    // 4. Count UserSources with ParentSourcesId
    const userSourcesWithParent = await pool.request()
      .query('SELECT COUNT(*) as count FROM UserSources WHERE ParentSourcesId IS NOT NULL');
    console.log(`📊 UserSources with ParentSourcesId: ${userSourcesWithParent.recordset[0].count} rows`);

    // 5. Sample UserSources data
    const userSourcesSample = await pool.request()
      .query('SELECT TOP 5 * FROM UserSources WHERE ParentSourcesId IS NOT NULL ORDER BY UserSourcesId');
    console.log('\n📋 Sample UserSources data (with ParentSourcesId):');
    console.table(userSourcesSample.recordset);

    // 6. Check relationship distribution
    const relationshipStats = await pool.request()
      .query(`
        SELECT
          ps.Id as ParentSourceId,
          ps.Name as ParentSourceName,
          ps.Code as ParentSourceCode,
          COUNT(us.UserSourcesId) as ChildSourcesCount
        FROM ParentSources ps
        LEFT JOIN UserSources us ON ps.Id = us.ParentSourcesId
        GROUP BY ps.Id, ps.Name, ps.Code
        ORDER BY ChildSourcesCount DESC
      `);
    console.log('\n📊 Relationship distribution (ParentSource → UserSources):');
    console.table(relationshipStats.recordset);

    // 7. Check for Code → Name matching (for DefaultSourceId logic)
    const codeNameMatching = await pool.request()
      .query(`
        SELECT
          ps.Id,
          ps.Name as ParentName,
          ps.Code as ParentCode,
          us.Name as UserSourceName,
          us.Title as UserSourceTitle,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM UserSources us2
              WHERE us2.ParentSourcesId = ps.Id
              AND us2.Name = ps.Code
            ) THEN 'MATCH FOUND'
            ELSE 'NO MATCH'
          END as CodeNameMatch
        FROM ParentSources ps
        LEFT JOIN UserSources us ON ps.Id = us.ParentSourcesId
        WHERE ps.Code IS NOT NULL
        ORDER BY ps.Id, us.UserSourcesId
      `);
    console.log('\n🔗 Code → Name matching (for DefaultSourceId):');
    console.table(codeNameMatching.recordset.slice(0, 10));

    // 8. Check for NULL/empty values
    const nullChecks = await pool.request()
      .query(`
        SELECT
          COUNT(*) as Total,
          SUM(CASE WHEN Name IS NULL OR Name = '' THEN 1 ELSE 0 END) as NullName,
          SUM(CASE WHEN Code IS NULL OR Code = '' THEN 1 ELSE 0 END) as NullCode,
          SUM(CASE WHEN UserName IS NULL OR UserName = '' THEN 1 ELSE 0 END) as NullUserName,
          SUM(CASE WHEN Password IS NULL OR Password = '' THEN 1 ELSE 0 END) as NullPassword
        FROM ParentSources
      `);
    console.log('\n⚠️ NULL/Empty checks for ParentSources:');
    console.table(nullChecks.recordset);

    const userSourcesNullChecks = await pool.request()
      .query(`
        SELECT
          COUNT(*) as Total,
          SUM(CASE WHEN Name IS NULL OR Name = '' THEN 1 ELSE 0 END) as NullName,
          SUM(CASE WHEN Title IS NULL OR Title = '' THEN 1 ELSE 0 END) as NullTitle,
          SUM(CASE WHEN ParentSourcesId IS NULL THEN 1 ELSE 0 END) as NullParentId
        FROM UserSources
      `);
    console.log('\n⚠️ NULL/Empty checks for UserSources:');
    console.table(userSourcesNullChecks.recordset);

    console.log('\n✅ Data check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

// Run the check
checkAffiliatesSourcesData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
