/**
 * Find Donation table ClearingMethodAreaId specification in Excel
 */

const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../data', 'Mapping -Vs.xlsx');
console.log('Searching for Donation.ClearingMethodAreaId in Excel file...\n');

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = 'הגדרות הסבה'; // The main mapping sheet

  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  console.log(`Total rows in sheet: ${data.length}\n`);

  // Find rows related to Donation table
  console.log('='.repeat(80));
  console.log('DONATION TABLE ROWS');
  console.log('='.repeat(80));

  let inDonationSection = false;
  let donationRows = [];

  data.forEach((row, index) => {
    const tableName = String(row[1] || '').trim();
    const columnName = String(row[2] || '').trim();

    // Check if we're entering Donation section
    if (tableName.toLowerCase() === 'donation') {
      inDonationSection = true;
    }
    // Check if we've left Donation section (new table starts)
    else if (inDonationSection && tableName && tableName.toLowerCase() !== 'donation') {
      inDonationSection = false;
    }

    // Collect Donation rows
    if (inDonationSection || tableName.toLowerCase() === 'donation') {
      donationRows.push({
        rowNum: index + 1,
        step: row[0],
        table: row[1],
        column: row[2],
        dataType: row[3],
        nullable: row[4],
        maxLength: row[5],
        convertType: row[7],
        oldTable: row[8],
        oldColumn: row[9],
        comments: row[10]
      });
    }
  });

  console.log(`\nFound ${donationRows.length} rows for Donation table\n`);

  // Show all Donation rows
  donationRows.forEach(row => {
    console.log(`Row ${row.rowNum}:`);
    console.log(`  Column: ${row.column}`);
    console.log(`  Type: ${row.convertType} | DataType: ${row.dataType} | Nullable: ${row.nullable}`);
    console.log(`  Source: ${row.oldTable}.${row.oldColumn}`);
    console.log(`  Comments: ${row.comments}`);
    console.log('');
  });

  // Specifically look for ClearingMethodAreaId
  const clearingMethodRow = donationRows.find(r =>
    String(r.column).toLowerCase().includes('clearing')
  );

  if (clearingMethodRow) {
    console.log('='.repeat(80));
    console.log('FOUND: ClearingMethodAreaId ROW');
    console.log('='.repeat(80));
    console.log(JSON.stringify(clearingMethodRow, null, 2));
  } else {
    console.log('⚠️  WARNING: No ClearingMethodAreaId row found in Donation table!');
  }

  // Also look for ClearingMethodArea table definition
  console.log('\n' + '='.repeat(80));
  console.log('CLEARINGMETHODAREA TABLE (Junction Table)');
  console.log('='.repeat(80));

  data.forEach((row, index) => {
    const tableName = String(row[1] || '').toLowerCase();
    if (tableName === 'clearingmethodcountrydefinition' ||
        tableName === 'clearingmethodarea') {
      console.log(`\nRow ${index + 1}:`);
      console.log(`  Table: ${row[1]}`);
      console.log(`  Column: ${row[2]}`);
      console.log(`  Type: ${row[7]} | Value/Source: ${row[9]} | Comments: ${row[10]}`);
    }
  });

} catch (error) {
  console.error('Error reading Excel file:', error.message);
  console.error(error.stack);
}
