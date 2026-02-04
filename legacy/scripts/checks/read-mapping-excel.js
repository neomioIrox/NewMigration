/**
 * Read Mapping -Vs.xlsx to find ClearingMethodAreaId specification
 */

const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../data', 'Mapping -Vs.xlsx');
console.log('Reading Excel file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);
  console.log('\nSheet Names:', workbook.SheetNames);

  // Read each sheet
  workbook.SheetNames.forEach(sheetName => {
    console.log('\n' + '='.repeat(80));
    console.log('SHEET:', sheetName);
    console.log('='.repeat(80));

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    console.log(`Total rows in sheet: ${data.length}`);

    // Show first 5 rows to understand structure
    console.log('\nFirst 5 rows:');
    data.slice(0, 5).forEach((row, index) => {
      console.log(`Row ${index + 1}:`, JSON.stringify(row.slice(0, 15)));
    });

    // Look for ClearingMethodAreaId or ClearingMethod related rows
    console.log('\nRows mentioning "Clearing" or "Donation":');
    data.forEach((row, index) => {
      const rowStr = row.join('|').toLowerCase();
      if (rowStr.includes('clearing') ||
          (rowStr.includes('donation') && index < 50)) {
        console.log(`Row ${index + 1}:`, JSON.stringify(row.slice(0, 15)));
      }
    });
  });
} catch (error) {
  console.error('Error reading Excel file:', error.message);
  console.error(error.stack);
}
