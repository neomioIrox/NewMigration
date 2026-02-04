/**
 * Check donation 915 - what ClearingMethodAreaId it should get
 */

const mysql = require('mysql2/promise');
const mssql = require('mssql');
const config = require('../../config/database');

async function checkDonation915() {
  try {
    // Connect to new DB (MySQL)
    const mysqlConn = await mysql.createConnection(config.mysqlConfig);

    console.log('=== DONATION 915 IN NEW DB (MySQL) ===\n');
    const [newDonation] = await mysqlConn.query(`
      SELECT
        d.Id,
        d.ClearingMethodAreaId,
        cma.ClearingMethodId,
        cm.Name as ClearingMethodName,
        cma.Area,
        d.Currency,
        d.MonthlySum,
        d.CreatedAt
      FROM donation d
      LEFT JOIN clearingmethodarea cma ON cma.Id = d.ClearingMethodAreaId
      LEFT JOIN clearingmethod cm ON cm.Id = cma.ClearingMethodId
      WHERE d.Id = 915
    `);

    if (newDonation.length > 0) {
      console.table(newDonation);
    } else {
      console.log('Donation 915 not found in new DB');
    }

    await mysqlConn.end();

    // Connect to old DB (SQL Server)
    console.log('\n=== ORDER 915 IN OLD DB (SQL Server) ===\n');
    const mssqlConn = await mssql.connect(config.mssqlConfig);

    const oldOrder = await mssqlConn.request().query(`
      SELECT
        OrdersId,
        PaymentMethod,
        OrderLaguage,
        ChargeCurrency,
        Currency,
        Total,
        Payments,
        DateCreated
      FROM Orders
      WHERE OrdersId = 915
    `);

    if (oldOrder.recordset.length > 0) {
      console.table(oldOrder.recordset);

      const order = oldOrder.recordset[0];

      // Calculate what ClearingMethodId SHOULD be (with fixed code)
      console.log('\n=== CALCULATING CORRECT ClearingMethodAreaId ===\n');

      let clearingMethodId;
      const pm = order.PaymentMethod;
      const lang = order.OrderLaguage;
      const curr = order.ChargeCurrency;

      // Use FIXED mapping logic
      if (pm === 'CreditCard') {
        if (lang === 'en' && curr === '£') {
          clearingMethodId = 1;  // Stripe
        } else if (lang === 'en') {
          clearingMethodId = 3;  // Authorize
        } else if (lang === 'he') {
          clearingMethodId = 2;  // CardCom
        } else if (lang === 'fr') {
          clearingMethodId = 4;  // PayLine
        } else {
          clearingMethodId = 24;  // Other
        }
      } else if (pm === 'PayPal' || pm === ' PayPal') {
        clearingMethodId = 7;  // FIXED
      } else if (pm === 'NedarimPlus') {
        clearingMethodId = 8;  // FIXED
      } else if (pm === 'AsserBishvil') {
        clearingMethodId = 10;  // FIXED
      } else if (pm === 'Broom') {
        clearingMethodId = 11;  // FIXED
      } else if (pm === 'ThreePillars') {
        clearingMethodId = 12;  // FIXED
      } else if (pm === 'Cash') {
        clearingMethodId = 13;  // FIXED
      } else if (pm === 'Check') {
        clearingMethodId = 14;  // FIXED
      } else if (pm === 'BusinessCredit' && lang === 'he') {
        clearingMethodId = 18;  // FIXED
      } else if (pm === 'BankTransfer') {
        clearingMethodId = 21;  // FIXED
      } else if (pm === 'BankStandingOrder') {
        clearingMethodId = 22;  // FIXED
      } else if (pm === 'Bit') {
        clearingMethodId = 23;  // FIXED
      } else {
        clearingMethodId = 24;  // Other
      }

      // Calculate Area (with fixed UK/USA)
      let area;
      if (lang === 'he') {
        area = 1;  // Israel
      } else if (lang === 'en' && curr === '£') {
        area = 2;  // UK (FIXED)
      } else if (lang === 'en') {
        area = 3;  // USA (FIXED)
      } else if (lang === 'fr') {
        area = 4;  // France
      } else {
        area = 1;  // Default: Israel
      }

      console.log('Source Data:');
      console.log('  PaymentMethod:', pm);
      console.log('  OrderLanguage:', lang);
      console.log('  ChargeCurrency:', curr);
      console.log('');
      console.log('Calculated (AFTER FIX):');
      console.log('  ClearingMethodId:', clearingMethodId);
      console.log('  Area:', area);

      // Lookup what ClearingMethodAreaId should be
      const mysqlConn2 = await mysql.createConnection(config.mysqlConfig);
      const [lookup] = await mysqlConn2.query(`
        SELECT
          cma.Id as ClearingMethodAreaId,
          cm.Name as ClearingMethodName,
          cma.Area,
          cma.ReceiptBy
        FROM clearingmethodarea cma
        JOIN clearingmethod cm ON cm.Id = cma.ClearingMethodId
        WHERE cma.ClearingMethodId = ? AND cma.Area = ?
      `, [clearingMethodId, area]);

      console.log('');
      if (lookup.length > 0) {
        console.log('✅ FOUND in clearingmethodarea:');
        console.table(lookup);
      } else {
        console.log('❌ NOT FOUND in clearingmethodarea');
        console.log('   This combination does not exist!');
        console.log('   ClearingMethodAreaId will be NULL');
      }

      await mysqlConn2.end();
    } else {
      console.log('Order 915 not found in old DB');
    }

    await mssqlConn.close();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

checkDonation915();
