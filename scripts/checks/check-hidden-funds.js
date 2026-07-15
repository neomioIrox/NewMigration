/**
 * Check if hidden funds from source (MSSQL) would be displayed after migration
 * Analyzes Hide/ShowMainPage fields and simulates the DisplayInSite expression
 */
const path = require('path');
const serverModules = path.resolve(__dirname, '../../server/node_modules');
require(path.join(serverModules, 'dotenv')).config({ path: path.resolve(__dirname, '../../.env') });
const sql = require(path.join(serverModules, 'mssql/msnodesqlv8'));
const mysql = require(path.join(serverModules, 'mysql2/promise'));

async function main() {
  // Connect to MSSQL source
  console.log('Connecting to MSSQL source...');
  const mssqlPool = await sql.connect({
    connectionString: process.env.MSSQL_CONNECTION_STRING,
    database: process.env.MSSQL_DATABASE,
    requestTimeout: 300000
  });

  // 1. Get all funds (Terminal=4) from source with their visibility fields
  console.log('\n========================================');
  console.log('  MSSQL Source: Products (Terminal=4 / Funds)');
  console.log('========================================');
  const sourceResult = await mssqlPool.request().query(`
    SELECT productsid, Name, Hide, Hide_en, Hide_fr, ShowMainPage, Terminal, EndDate
    FROM products
    WHERE Terminal = 4
    ORDER BY productsid
  `);

  const products = sourceResult.recordset;
  console.log(`Total funds in source: ${products.length}`);

  // 2. Simulate the migration expression for each product
  console.log('\n--- Simulating DisplayInSite expression ---');
  console.log('Expression: (!row.Hide && row.ShowMainPage) ? 1 : 0\n');

  let stats = {
    he: { shouldShow: 0, shouldHide: 0 },
    en: { shouldShow: 0, shouldHide: 0 },
    fr: { shouldShow: 0, shouldHide: 0 }
  };

  let hiddenButWouldShow = [];
  let visibleButWouldHide = [];

  for (const row of products) {
    const displayHe = (!row.Hide && row.ShowMainPage) ? 1 : 0;
    const displayEn = (!row.Hide_en && row.ShowMainPage) ? 1 : 0;
    const displayFr = (!row.Hide_fr && row.ShowMainPage) ? 1 : 0;

    if (displayHe) stats.he.shouldShow++; else stats.he.shouldHide++;
    if (displayEn) stats.en.shouldShow++; else stats.en.shouldHide++;
    if (displayFr) stats.fr.shouldShow++; else stats.fr.shouldHide++;

    // Check for potential issues:
    // A) Hide=1 but expression still gives 1 (should NOT happen with correct expression)
    if (row.Hide === 1 && displayHe === 1) {
      hiddenButWouldShow.push({ ...row, lang: 'Hebrew', display: displayHe });
    }
    if (row.Hide_en === 1 && displayEn === 1) {
      hiddenButWouldShow.push({ ...row, lang: 'English', display: displayEn });
    }
    if (row.Hide_fr === 1 && displayFr === 1) {
      hiddenButWouldShow.push({ ...row, lang: 'French', display: displayFr });
    }
  }

  console.log('Language    | DisplayInSite=1 (Show) | DisplayInSite=0 (Hide)');
  console.log('------------|------------------------|------------------------');
  console.log(`Hebrew      | ${String(stats.he.shouldShow).padStart(22)} | ${stats.he.shouldHide}`);
  console.log(`English     | ${String(stats.en.shouldShow).padStart(22)} | ${stats.en.shouldHide}`);
  console.log(`French      | ${String(stats.fr.shouldShow).padStart(22)} | ${stats.fr.shouldHide}`);

  // 3. Detailed breakdown of source fields
  console.log('\n--- Source field value distribution ---');
  const hideValues = {};
  const showMainValues = {};
  products.forEach(p => {
    hideValues[p.Hide] = (hideValues[p.Hide] || 0) + 1;
    showMainValues[p.ShowMainPage] = (showMainValues[p.ShowMainPage] || 0) + 1;
  });
  console.log('Hide field values:', hideValues);
  console.log('ShowMainPage field values:', showMainValues);

  // 4. Check for expression bugs
  console.log('\n========================================');
  console.log('  BUG CHECK: Hidden products that would show');
  console.log('========================================');
  if (hiddenButWouldShow.length === 0) {
    console.log('✅ No bugs found - no hidden product would incorrectly show');
  } else {
    console.log(`❌ ${hiddenButWouldShow.length} hidden products would incorrectly show!`);
    hiddenButWouldShow.forEach(p => {
      console.log(`  ProductId=${p.productsid} [${p.lang}] Hide=${p.Hide} ShowMainPage=${p.ShowMainPage} "${(p.Name || '').substring(0, 40)}"`);
    });
  }

  // 5. Check ShowMainPage=0 products - these should be hidden but might not be obvious
  console.log('\n========================================');
  console.log('  Products with Hide=0 but ShowMainPage=0');
  console.log('  (Hidden only via ShowMainPage - easy to miss)');
  console.log('========================================');
  const hiddenViaShowMainPage = products.filter(p => p.Hide === 0 && p.ShowMainPage === 0);
  console.log(`Count: ${hiddenViaShowMainPage.length}`);
  if (hiddenViaShowMainPage.length > 0) {
    console.log('\nFirst 15:');
    hiddenViaShowMainPage.slice(0, 15).forEach(p => {
      console.log(`  ProductId=${p.productsid} Hide=${p.Hide} Hide_en=${p.Hide_en} Hide_fr=${p.Hide_fr} ShowMainPage=${p.ShowMainPage} "${(p.Name || '').substring(0, 50)}"`);
    });
    console.log('\n⚠️  These products are NOT hidden via the Hide flag but are hidden via ShowMainPage=0.');
    console.log('   The migration expression correctly handles these (DisplayInSite=0).');
    console.log('   BUT: If the OLD Hebrew expression was "row.Hide ? 0 : 1" (without ShowMainPage check),');
    console.log('   these would have been INCORRECTLY shown as DisplayInSite=1 in Hebrew!');
  }

  // 6. Check expired projects
  console.log('\n========================================');
  console.log('  Expired funds (EndDate in the past) with RecordStatus=2');
  console.log('========================================');
  const expired = products.filter(p => p.EndDate && new Date(p.EndDate) < new Date());
  console.log(`Count: ${expired.length}`);
  if (expired.length > 0) {
    const expiredAndVisible = expired.filter(p => (!p.Hide && p.ShowMainPage));
    console.log(`Expired AND DisplayInSite=1 (Hebrew): ${expiredAndVisible.length}`);
    console.log('\n⚠️  These expired projects get RecordStatus=2 (Active) in the migration.');
    console.log('   If the website shows all Active projects, these expired funds will appear!');
    console.log('\nFirst 15 expired+visible:');
    expiredAndVisible.slice(0, 15).forEach(p => {
      console.log(`  ProductId=${p.productsid} EndDate=${p.EndDate ? new Date(p.EndDate).toISOString().split('T')[0] : 'null'} Hide=${p.Hide} ShowMainPage=${p.ShowMainPage} "${(p.Name || '').substring(0, 50)}"`);
    });
  }

  // 7. Try to check target MySQL
  console.log('\n========================================');
  console.log('  Checking MySQL target database...');
  console.log('========================================');
  try {
    const mysqlConn = await mysql.createConnection({
      host: process.env.MYSQL_TARGET_HOST,
      user: process.env.MYSQL_TARGET_USER,
      password: process.env.MYSQL_TARGET_PASSWORD,
      database: process.env.MYSQL_TARGET_DATABASE,
      connectTimeout: 10000
    });

    const [targetLoc] = await mysqlConn.execute(`
      SELECT pl.ProjectId, pl.Language, pl.DisplayInSite, pl.Title, p.KupatFundNo, p.RecordStatus
      FROM ProjectLocalization pl
      JOIN Project p ON pl.ProjectId = p.Id
      WHERE p.ProjectType = 1
      ORDER BY pl.ProjectId, pl.Language
    `);

    console.log(`Total project localizations (Funds): ${targetLoc.length}`);

    const displayedHe = targetLoc.filter(l => l.Language === 1 && l.DisplayInSite === 1);
    const hiddenHe = targetLoc.filter(l => l.Language === 1 && l.DisplayInSite === 0);
    console.log(`Hebrew: DisplayInSite=1: ${displayedHe.length}, DisplayInSite=0: ${hiddenHe.length}`);

    await mysqlConn.end();
  } catch (e) {
    console.log(`⚠️  Cannot connect to MySQL target: ${e.message}`);
    console.log('   (This is expected if you are not on VPN or AWS network)');
    console.log('   Analysis above is based on source data + migration expression simulation.');
  }

  // 8. Try local tracker
  console.log('\n========================================');
  console.log('  Checking local tracker database...');
  console.log('========================================');
  try {
    const trackerConn = await mysql.createConnection({
      host: process.env.MYSQL_TRACKER_HOST,
      user: process.env.MYSQL_TRACKER_USER,
      password: process.env.MYSQL_TRACKER_PASSWORD,
      database: process.env.MYSQL_TRACKER_DATABASE,
      connectTimeout: 5000
    });

    const [runs] = await trackerConn.execute(`
      SELECT id, mapping_name, status, total_rows, processed_rows, failed_rows, created_at
      FROM migration_runs
      WHERE mapping_name LIKE '%Fund%' OR mapping_name LIKE '%Project%'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (runs.length > 0) {
      console.log('Recent fund/project migration runs:');
      runs.forEach(r => {
        console.log(`  Run ${r.id}: ${r.mapping_name} | ${r.status} | ${r.processed_rows}/${r.total_rows} rows | ${r.failed_rows} failed | ${new Date(r.created_at).toISOString()}`);
      });
    } else {
      console.log('No fund migration runs found in tracker.');
    }

    await trackerConn.end();
  } catch (e) {
    console.log(`⚠️  Cannot connect to tracker: ${e.message}`);
  }

  // Summary
  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  console.log(`\nTotal funds in source: ${products.length}`);
  console.log(`Should be VISIBLE (Hebrew): ${stats.he.shouldShow}`);
  console.log(`Should be HIDDEN (Hebrew): ${stats.he.shouldHide}`);
  console.log(`\nExpired funds that would still show: ${products.filter(p => p.EndDate && new Date(p.EndDate) < new Date() && !p.Hide && p.ShowMainPage).length}`);
  console.log(`\nPotential issues:`);
  console.log(`1. RecordStatus is hardcoded to 2 (Active) for ALL migrated projects`);
  console.log(`2. ${products.filter(p => p.EndDate && new Date(p.EndDate) < new Date() && !p.Hide && p.ShowMainPage).length} expired funds have DisplayInSite=1 + RecordStatus=2`);
  console.log(`3. If the migration ran BEFORE the DisplayInSite fix (Dec 31, 2025),`);
  console.log(`   ${hiddenViaShowMainPage.length} funds with ShowMainPage=0 may have incorrect Hebrew DisplayInSite=1`);

  await mssqlPool.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
