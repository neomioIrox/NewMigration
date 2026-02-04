// Compare app-created vs migrated media rows
const mysql = require('mysql2/promise');
const config = require('../src/config/database');

async function compare() {
  const conn = await mysql.createConnection(config.mysqlTarget);

  console.log('=== COMPARING OLD (APP) vs NEW (MIGRATED) MEDIA ===\n');

  // Get one app-created row (2025)
  const [appRow] = await conn.query("SELECT * FROM media WHERE YearDirectory = '2025' LIMIT 1");

  // Get one migrated row (2020)
  const [migratedRow] = await conn.query("SELECT * FROM media WHERE YearDirectory = '2020' LIMIT 1");

  if (appRow.length === 0 || migratedRow.length === 0) {
    console.log('Missing data');
    await conn.end();
    return;
  }

  const app = appRow[0];
  const mig = migratedRow[0];

  // Get all columns
  const cols = Object.keys(app);

  console.log('Column'.padEnd(25) + ' | ' + 'APP (2025)'.padEnd(45) + ' | ' + 'MIGRATED (2020)');
  console.log('-'.repeat(130));

  for (const col of cols) {
    const appVal = JSON.stringify(app[col]);
    const migVal = JSON.stringify(mig[col]);
    const diff = appVal !== migVal ? ' ⚠️ DIFF' : '';
    console.log(
      col.padEnd(25) + ' | ' +
      (appVal || 'null').substring(0,45).padEnd(45) + ' | ' +
      (migVal || 'null').substring(0,45) + diff
    );
  }

  await conn.end();
}

compare();
