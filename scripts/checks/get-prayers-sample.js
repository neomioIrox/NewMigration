const sql = require('mssql');
const { mssqlConfig } = require('../../config/database');

async function getPrayersSample() {
  try {
    await sql.connect(mssqlConfig);

    const result = await sql.query`SELECT TOP 3 * FROM Prayers ORDER BY PrayersId`;

    console.log(JSON.stringify(result.recordset, null, 2));

    await sql.close();
  } catch (err) {
    console.error(err);
    await sql.close();
  }
}

getPrayersSample();
