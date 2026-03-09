/**
 * Updates the TerminalId column in MSSQL products table
 * based on the TerminalProducts.xlsx mapping file.
 *
 * Usage: node scripts/fixes/update-terminal-from-excel.js [--dry-run]
 */

const XLSX = require('xlsx');
const odbc = require('odbc');
const path = require('path');
const config = require('../../server/src/config/database');

const EXCEL_PATH = path.join(__dirname, '../../legacy/data/TerminalProducts.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('Reading Excel file:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log('Total rows in Excel:', rows.length);

  // Only process Terminal 1 and 4
  const validRows = rows.filter(r => r.Terminal === 1 || r.Terminal === 4);
  console.log('Valid rows (Terminal 1 or 4):', validRows.length);
  console.log('Skipped rows:', rows.length - validRows.length);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN - no changes will be made ===\n');
    const dist = {};
    validRows.forEach(r => { dist[r.Terminal] = (dist[r.Terminal] || 0) + 1; });
    console.log('Distribution:', dist);
    console.log('Sample updates:');
    validRows.slice(0, 5).forEach(r => {
      console.log(`  UPDATE products SET TerminalId = ${r.Terminal} WHERE productsid = ${r.productsid}`);
    });
    return;
  }

  console.log('Connecting to MSSQL...');
  const conn = await odbc.connect(config.mssql.connectionString);

  let updated = 0;
  let errors = 0;

  for (const row of validRows) {
    try {
      const result = await conn.query(
        'UPDATE products SET TerminalId = ? WHERE productsid = ?',
        [row.Terminal, row.productsid]
      );
      updated++;
    } catch (err) {
      errors++;
      console.error(`Error updating productsid ${row.productsid}:`, err.message);
    }
  }

  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`);
  await conn.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
