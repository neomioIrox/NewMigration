// Read-only investigation of donation 1834815 (QA findings)
const targetDb = require('../src/db/mysql-target');
const mssqlDb = require('../src/db/mssql');

const ORDER_ID = 1834815;
const target = { query: (sql, params) => targetDb.query(sql, params) };

async function main() {
  try {

    // 1. Source Orders columns (exact names)
    console.log('=== 1. SOURCE Orders columns ===');
    const colsRes = await mssqlDb.query(
      "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Orders' ORDER BY ORDINAL_POSITION");
    console.log(colsRes.recordset.map(c => c.COLUMN_NAME + ' (' + c.DATA_TYPE + ')').join(', '));

    // 2. Source row
    console.log('\n=== 2. SOURCE Orders row ' + ORDER_ID + ' ===');
    const srcRes = await mssqlDb.query('SELECT * FROM Orders WITH (NOLOCK) WHERE OrdersId=' + ORDER_ID);
    const src = srcRes.recordset[0];
    if (!src) { console.log('NOT FOUND'); } else {
      for (const [k, v] of Object.entries(src)) {
        if (v !== null && v !== '' && v !== false) console.log('  ' + k + ' = ' + JSON.stringify(v));
      }
      console.log('  --- explicit nulls/empties of interest:');
      ['ClearingProvider','CardValidityMonth','CardValidityYear','TaxesByCard','DonorIDNumber','AsakimInvoiceID','TerminalNumber','CertificateStreet','CertificateCity','CertificateCountry','CertificateZip','DateCreated','PaymentMethod','OrderLaguage','ChargeCurrency'].forEach(k => {
        console.log('  ' + k + ' = ' + JSON.stringify(src[k]));
      });
    }

    // 3. Target Donation columns
    console.log('\n=== 3. TARGET Donation columns ===');
    const [dcols] = await target.query("SHOW COLUMNS FROM Donation");
    console.log(dcols.map(c => c.Field + ' (' + c.Type + ')').join(', '));

    // 4. Target Donation row
    console.log('\n=== 4. TARGET Donation row ' + ORDER_ID + ' ===');
    const [drows] = await target.query('SELECT * FROM Donation WHERE Id=?', [ORDER_ID]);
    if (!drows.length) { console.log('NOT FOUND'); } else {
      for (const [k, v] of Object.entries(drows[0])) console.log('  ' + k + ' = ' + JSON.stringify(v));
    }

    // 5. Address rows referenced
    if (drows.length) {
      const d = drows[0];
      for (const f of ['ReceiptAddress', 'ShippingAddress']) {
        if (d[f]) {
          const [arows] = await target.query('SELECT * FROM Address WHERE Id=?', [d[f]]);
          console.log('\n=== 5. Address for ' + f + ' (Id=' + d[f] + ') ===');
          console.log(JSON.stringify(arows[0]));
        } else {
          console.log('\n=== 5. ' + f + ' is NULL ===');
        }
      }
    }

    // 6. ClearingMethod + ClearingMethodArea + Terminal + LutDonationAction
    console.log('\n=== 6. ClearingMethod table ===');
    try { const [r] = await target.query('SELECT * FROM ClearingMethod'); console.log(JSON.stringify(r, null, 1)); } catch (e) { console.log('ERR: ' + e.message); }

    console.log('\n=== 7. ClearingMethodArea table ===');
    try { const [r] = await target.query('SELECT * FROM ClearingMethodArea'); console.log(JSON.stringify(r, null, 1)); } catch (e) { console.log('ERR: ' + e.message); }

    console.log('\n=== 8. Terminal-like tables ===');
    const [tbls] = await target.query("SHOW TABLES");
    const names = tbls.map(t => Object.values(t)[0]);
    console.log('All tables: ' + names.join(', '));
    for (const n of names.filter(n => /terminal/i.test(n))) {
      const [r] = await target.query('SELECT * FROM `' + n + '` LIMIT 20');
      console.log('\n--- ' + n + ' ---\n' + JSON.stringify(r, null, 1));
    }

    console.log('\n=== 9. DonationAction lut ===');
    for (const n of names.filter(n => /action/i.test(n) && !/log/i.test(n))) {
      const [r] = await target.query('SELECT * FROM `' + n + '` LIMIT 50');
      console.log('\n--- ' + n + ' ---\n' + JSON.stringify(r, null, 1));
    }

    // 10. DonationActionLog for this donation
    console.log('\n=== 10. DonationActionLog for ' + ORDER_ID + ' ===');
    const [logs] = await target.query('SELECT * FROM DonationActionLog WHERE DonationId=?', [ORDER_ID]);
    console.log(JSON.stringify(logs, null, 1));

    // 11. Timezone context
    console.log('\n=== 11. Time context ===');
    const [tz] = await target.query("SELECT @@global.time_zone AS g, @@session.time_zone AS s, NOW() AS now_val, UTC_TIMESTAMP() AS utc_val");
    console.log(JSON.stringify(tz[0]));
    const msTime = await mssqlDb.query('SELECT GETDATE() AS now_val, GETUTCDATE() AS utc_val');
    console.log(JSON.stringify(msTime.recordset[0]));

  } catch (err) {
    console.error('FATAL:', err.message);
  } finally {
    await targetDb.close();
    await mssqlDb.close();
    process.exit(0);
  }
}

main();
