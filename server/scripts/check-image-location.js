// Check where images should be located
const mssqlDb = require('../src/db/mssql');
const mysql = require('mysql2/promise');
const config = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function check() {
  let mysqlConn;

  try {
    console.log('=== IMAGE LOCATION ANALYSIS ===\n');

    // 1. Check source image paths
    console.log('--- 1. SOURCE IMAGE PATHS (MSSQL) ---');
    const result = await mssqlDb.query(`
      SELECT TOP 5 productsid, Name, Pic
      FROM products WITH (NOLOCK)
      WHERE Pic IS NOT NULL AND Pic != ''
      ORDER BY productsid
    `);
    result.recordset.forEach(r => {
      console.log('Product ' + r.productsid + ': ' + r.Pic);
    });

    // 2. Check target media paths
    console.log('\n--- 2. TARGET MEDIA PATHS (MySQL) ---');
    mysqlConn = await mysql.createConnection(config.mysqlTarget);
    const [media] = await mysqlConn.query(`
      SELECT Id, RelativePath, YearDirectory, MonthDirectory
      FROM media
      WHERE RelativePath IS NOT NULL AND RelativePath != ''
      LIMIT 5
    `);
    media.forEach(r => {
      const fullPath = r.YearDirectory + '/' + r.MonthDirectory + '/' + r.RelativePath;
      console.log('Media ' + r.Id + ': ' + fullPath);
    });

    // 3. Check common image storage locations
    console.log('\n--- 3. CHECKING COMMON LOCATIONS ---');
    const possibleLocations = [
      'C:/inetpub/wwwroot/kupat/media',
      'C:/inetpub/wwwroot/kupathair/media',
      'C:/kupat/media',
      'C:/Users/NeomiOs/Documents/NewMigration/media',
      'C:/Users/NeomiOs/Documents/NewMigration/server/media',
      'C:/Users/NeomiOs/Documents/NewMigration/uploads',
      'D:/kupat/media',
      'D:/media',
    ];

    for (const loc of possibleLocations) {
      const exists = fs.existsSync(loc);
      console.log((exists ? 'EXISTS' : 'NOT FOUND') + ': ' + loc);
      if (exists) {
        try {
          const files = fs.readdirSync(loc).slice(0, 5);
          console.log('  Sample files:', files.join(', '));
        } catch (e) {
          console.log('  (cannot read directory)');
        }
      }
    }

    // 4. Check if there's a 2020 folder anywhere
    console.log('\n--- 4. SEARCHING FOR 2020 FOLDER ---');
    const searchPaths = [
      'C:/inetpub',
      'C:/kupat',
      'D:/',
    ];

    for (const searchPath of searchPaths) {
      if (!fs.existsSync(searchPath)) continue;
      const testPath = path.join(searchPath, '2020');
      if (fs.existsSync(testPath)) {
        console.log('FOUND: ' + testPath);
        try {
          const subfolders = fs.readdirSync(testPath);
          console.log('  Contains:', subfolders.join(', '));
        } catch (e) {}
      }
    }

    // 5. What URL pattern does the app use?
    console.log('\n--- 5. EXPECTED URL PATTERN ---');
    console.log('Based on media table structure:');
    console.log('  Full path = /{YearDirectory}/{MonthDirectory}/{RelativePath}');
    console.log('  Example: /2020/1/peretz.PNG');
    console.log('');
    console.log('The application needs to serve these files from somewhere.');
    console.log('Check the web server configuration for:');
    console.log('  - Static file serving path');
    console.log('  - Media/upload directory');

    console.log('\n=== DONE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mssqlDb.close();
    if (mysqlConn) await mysqlConn.end();
  }
}

check();
