const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function checkSample() {
  try {
    const pool = await sql.connect(mssqlConfig);

    const result = await pool.request().query(`
      SELECT TOP 20
        ProductStockId, Name, Hide, Price,
        Name_en, Hide_en, Price_en,
        Name_fr, Hide_fr, Price_fr
      FROM ProductStock
      WHERE GroupId IS NOT NULL
    `);

    console.log('Sample ProductStock records:\n');
    for (const row of result.recordset) {
      console.log(`ID: ${row.ProductStockId}`);
      console.log(`  Hebrew: Name="${row.Name}" Hide=${row.Hide} Price=${row.Price}`);
      console.log(`  English: Name_en="${row.Name_en}" Hide_en=${row.Hide_en} Price_en=${row.Price_en}`);
      console.log(`  French: Name_fr="${row.Name_fr}" Hide_fr=${row.Hide_fr} Price_fr=${row.Price_fr}`);
      console.log('---');
    }

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkSample();
