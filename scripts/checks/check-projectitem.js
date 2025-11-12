const mysql = require('mysql2/promise');

async function checkProjectItem() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairtest'
  });

  try {
    // Get total counts
    const [rows] = await connection.execute(`
      SELECT
        COUNT(*) as total_rows,
        SUM(CASE WHEN AllowFreeAddPrayerNames IS NULL THEN 1 ELSE 0 END) as null_count,
        SUM(CASE WHEN AllowFreeAddPrayerNames IS NOT NULL THEN 1 ELSE 0 END) as non_null_count
      FROM projectItem
    `);

    console.log('=== projectItem Table Status ===');
    console.log('Total rows:', rows[0].total_rows);
    console.log('Rows with NULL AllowFreeAddPrayerNames:', rows[0].null_count);
    console.log('Rows with non-NULL AllowFreeAddPrayerNames:', rows[0].non_null_count);
    console.log('');

    // If there are NULL values, get some examples
    if (rows[0].null_count > 0) {
      const [nullRows] = await connection.execute(`
        SELECT ProjectId, ItemName, AllowFreeAddPrayerNames
        FROM projectItem
        WHERE AllowFreeAddPrayerNames IS NULL
        LIMIT 10
      `);

      console.log('=== Sample rows with NULL AllowFreeAddPrayerNames ===');
      console.table(nullRows);
    }

    // Get distribution of AllowFreeAddPrayerNames values
    const [distribution] = await connection.execute(`
      SELECT
        AllowFreeAddPrayerNames,
        COUNT(*) as count
      FROM projectItem
      GROUP BY AllowFreeAddPrayerNames
      ORDER BY AllowFreeAddPrayerNames
    `);

    console.log('=== AllowFreeAddPrayerNames Value Distribution ===');
    console.table(distribution);

  } finally {
    await connection.end();
  }
}

checkProjectItem().catch(console.error);
