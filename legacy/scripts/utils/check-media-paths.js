const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../config/database');

async function checkMediaPaths() {
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);

    // Count different path formats
    const [stats] = await connection.query(`
      SELECT
        SUM(CASE WHEN RelativePath LIKE '2020/01/%' THEN 1 ELSE 0 END) as with_2020,
        SUM(CASE WHEN RelativePath LIKE '2025/01/%' AND RelativePath NOT LIKE '2020/01/%' THEN 1 ELSE 0 END) as with_2025_only,
        SUM(CASE WHEN RelativePath LIKE '2020/01/2025/%' THEN 1 ELSE 0 END) as duplicate_prefix,
        COUNT(*) as total
      FROM Media
      WHERE RelativePath IS NOT NULL AND RelativePath != ''
    `);

    console.log('\n📊 Media RelativePath Statistics:');
    console.log(`  Total records: ${stats[0].total}`);
    console.log(`  ✅ With '2020/01/' prefix: ${stats[0].with_2020}`);
    console.log(`  ⚠️  With '2025/01/' only: ${stats[0].with_2025_only}`);
    console.log(`  ❌ Duplicate '2020/01/2025/': ${stats[0].duplicate_prefix}`);

    // Show samples of each type
    console.log('\n📋 Sample paths with 2020/01/:');
    const [samples2020] = await connection.query(`
      SELECT RelativePath
      FROM Media
      WHERE RelativePath LIKE '2020/01/%'
        AND RelativePath NOT LIKE '2020/01/2025/%'
      LIMIT 3
    `);
    samples2020.forEach(row => console.log(`  ${row.RelativePath}`));

    if (stats[0].with_2025_only > 0) {
      console.log('\n📋 Sample paths with 2025/01/ only:');
      const [samples2025] = await connection.query(`
        SELECT RelativePath
        FROM Media
        WHERE RelativePath LIKE '2025/01/%'
          AND RelativePath NOT LIKE '2020/01/%'
        LIMIT 3
      `);
      samples2025.forEach(row => console.log(`  ${row.RelativePath}`));
    }

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkMediaPaths();
