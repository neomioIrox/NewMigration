const sql = require('mssql');
const mysql = require('mysql2/promise');
const { mssqlConfig, mysqlConfig } = require('../../config/database');

async function analyzeOrdersCurrencyMapping() {
  let mysqlConn;

  try {
    console.log('🔍 Analyzing Orders → donation + donationcurrencyvalue mapping\n');
    console.log('='.repeat(100));

    // Connect to both databases
    await sql.connect(mssqlConfig);
    mysqlConn = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });

    // STEP 1: Examine Orders table structure for currency fields
    console.log('\n📋 STEP 1: Orders Table Currency Fields');
    console.log('-'.repeat(100));

    const columnsResult = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Orders'
      AND (
        COLUMN_NAME LIKE '%Currency%'
        OR COLUMN_NAME LIKE '%Total%'
        OR COLUMN_NAME LIKE '%Rate%'
        OR COLUMN_NAME LIKE '%Amount%'
      )
      ORDER BY ORDINAL_POSITION
    `;

    console.log('Currency-related columns in Orders table:');
    console.table(columnsResult.recordset);

    // STEP 2: Get Order 1 (which created donation.Id=2 that WORKS)
    console.log('\n\n📦 STEP 2: Order 1 (Maps to donation.Id=2 - WORKS)');
    console.log('-'.repeat(100));

    const order1Result = await sql.query`SELECT * FROM Orders WHERE OrdersId = 1`;
    const order1 = order1Result.recordset[0];

    console.log('Order 1 Currency Data:');
    const order1Currency = {
      OrdersId: order1.OrdersId,
      Currency: order1.Currency,
      ChargeCurrency: order1.ChargeCurrency,
      TotalInILS: order1.TotalInILS,
      TotalInUSD: order1.TotalInUSD,
      TotalInEUR: order1.TotalInEUR,
      USDRate: order1.USDRate,
      EURRate: order1.EURRate,
      Total: order1.Total,
      ChargeTotal: order1.ChargeTotal,
      ReferenceCode: order1.ReferenceCode
    };
    console.log(JSON.stringify(order1Currency, null, 2));

    // STEP 3: Get donation.Id=2 from NEW DB
    console.log('\n\n💰 STEP 3: donation.Id=2 (NEW DB)');
    console.log('-'.repeat(100));

    const [donations] = await mysqlConn.query('SELECT * FROM donation WHERE Id = 2');
    if (donations.length === 0) {
      console.log('❌ donation.Id=2 not found in NEW DB');
    } else {
      const donation2 = donations[0];
      console.log('donation.Id=2 Data:');
      const donation2Data = {
        Id: donation2.Id,
        ItemId: donation2.ItemId,
        Currency: donation2.Currency,
        TotalSum: donation2.TotalSum,
        Status: donation2.Status,
        ReferenceNum: donation2.ReferenceNum
      };
      console.log(JSON.stringify(donation2Data, null, 2));
    }

    // STEP 4: Get donationcurrencyvalue rows for donation.Id=2
    console.log('\n\n💱 STEP 4: donationcurrencyvalue for DonationId=2');
    console.log('-'.repeat(100));

    const [currencyValues] = await mysqlConn.query(
      'SELECT * FROM donationcurrencyvalue WHERE DonationId = 2 ORDER BY Currency, Id'
    );

    if (currencyValues.length === 0) {
      console.log('❌ No donationcurrencyvalue rows found for DonationId=2');
    } else {
      console.log(`Found ${currencyValues.length} currency value rows:`);
      console.table(currencyValues);
    }

    // STEP 5: Sample more Orders to understand pattern
    console.log('\n\n📊 STEP 5: Sample 5 Orders with Currency Data');
    console.log('-'.repeat(100));

    const sampleResult = await sql.query`
      SELECT TOP 5
        OrdersId,
        Currency,
        ChargeCurrency,
        TotalInILS,
        TotalInUSD,
        TotalInEUR,
        USDRate,
        EURRate,
        Total,
        ChargeTotal,
        ReferenceCode
      FROM Orders
      WHERE ChargeStatus = 'OrderFinished'
      ORDER BY OrdersId
    `;

    console.table(sampleResult.recordset);

    // STEP 6: Analyze pattern
    console.log('\n\n🔍 STEP 6: Mapping Pattern Analysis');
    console.log('-'.repeat(100));

    console.log('\n📝 RELATIONSHIP STRUCTURE:');
    console.log('   Orders (OLD DB)');
    console.log('   └─→ Maps to 2 tables in NEW DB:');
    console.log('       ├─→ donation (1 row)');
    console.log('       │   └─ Stores: ItemId, Status, Currency, TotalSum, ReferenceNum');
    console.log('       └─→ donationcurrencyvalue (multiple rows - one per currency)');
    console.log('           └─ Stores: DonationId, Currency, RateInILS, TotalSum');

    console.log('\n💡 CURRENCY MAPPING LOGIC (HYPOTHESIS):');
    console.log('   For each Order:');
    console.log('   1. Create 1 donation row');
    console.log('   2. Create donationcurrencyvalue rows for EACH currency that has data:');
    console.log('      - If TotalInILS > 0 → Create row with Currency=1, RateInILS=1, TotalSum=TotalInILS');
    console.log('      - If TotalInUSD > 0 → Create row with Currency=2, RateInILS=USDRate, TotalSum=TotalInUSD');
    console.log('      - If TotalInEUR > 0 → Create row with Currency=3, RateInILS=EURRate, TotalSum=TotalInEUR');
    console.log('      - If TotalInGBP > 0 → Create row with Currency=4, RateInILS=GBPRate, TotalSum=TotalInGBP');

    // STEP 7: Check currency codes mapping
    console.log('\n\n💱 STEP 7: Currency Code Mapping (lutcurrency table)');
    console.log('-'.repeat(100));

    const [currencies] = await mysqlConn.query('SELECT * FROM lutcurrency ORDER BY Id');
    console.log('Currency lookup table:');
    console.table(currencies);

    // STEP 8: Find which Order created donation.Id=2
    console.log('\n\n✅ STEP 8: Find Which Order Created donation.Id=2');
    console.log('-'.repeat(100));

    // Find Order by matching ReferenceNum
    const donation2ReferenceNum = donations[0].ReferenceNum;
    console.log(`donation.Id=2 has ReferenceNum: ${donation2ReferenceNum}`);

    const matchingOrderResult = await sql.query`
      SELECT * FROM Orders WHERE ReferenceCode = ${donation2ReferenceNum}
    `;

    let matchingOrder = null;
    if (matchingOrderResult.recordset.length === 0) {
      console.log('❌ No matching Order found for this ReferenceNum!');
      console.log('   Using Order 1 for comparison instead...');
      matchingOrder = order1;
    } else {
      matchingOrder = matchingOrderResult.recordset[0];
      console.log(`\n✅ Found matching Order: OrdersId = ${matchingOrder.OrdersId}`);

      console.log('\nMatching Order Currency Data:');
      const matchingOrderCurrency = {
        OrdersId: matchingOrder.OrdersId,
        Currency: matchingOrder.Currency,
        ChargeCurrency: matchingOrder.ChargeCurrency,
        TotalInILS: matchingOrder.TotalInILS,
        TotalInUSD: matchingOrder.TotalInUSD,
        TotalInEUR: matchingOrder.TotalInEUR,
        USDRate: matchingOrder.USDRate,
        EURRate: matchingOrder.EURRate,
        Total: matchingOrder.Total,
        ChargeTotal: matchingOrder.ChargeTotal,
        ReferenceCode: matchingOrder.ReferenceCode
      };
      console.log(JSON.stringify(matchingOrderCurrency, null, 2));
    }

    console.log('\nExpected donationcurrencyvalue rows (ONE per currency, NO DUPLICATES):');
    if (matchingOrder.TotalInILS && matchingOrder.TotalInILS > 0) {
      console.log(`   ✓ Currency=1 (ILS), Rate=1, TotalSum=${matchingOrder.TotalInILS}`);
    }
    if (matchingOrder.TotalInUSD && matchingOrder.TotalInUSD > 0) {
      console.log(`   ✓ Currency=2 (USD), Rate=${matchingOrder.USDRate}, TotalSum=${matchingOrder.TotalInUSD}`);
    }
    if (matchingOrder.TotalInEUR && matchingOrder.TotalInEUR > 0) {
      console.log(`   ✓ Currency=3 (EUR), Rate=${matchingOrder.EURRate}, TotalSum=${matchingOrder.TotalInEUR}`);
    }

    console.log('\nActual donationcurrencyvalue rows (from STEP 4):');
    console.log('⚠️  WARNING: This data contains DUPLICATES (user confirmed this is a BUG)');
    if (currencyValues.length > 0) {
      currencyValues.forEach(cv => {
        console.log(`   → Currency=${cv.Currency}, Rate=${cv.RateInILS}, TotalSum=${cv.TotalSum}`);
      });

      // Check if hypothesis matches (accounting for possible duplicates in actual data)
      console.log('\n🎯 PATTERN VERIFICATION:');
      const expectedRows = [];
      if (matchingOrder.TotalInILS > 0) expectedRows.push({ Currency: 1, Rate: 1, TotalSum: matchingOrder.TotalInILS });
      if (matchingOrder.TotalInUSD > 0) expectedRows.push({ Currency: 2, Rate: matchingOrder.USDRate, TotalSum: matchingOrder.TotalInUSD });
      if (matchingOrder.TotalInEUR > 0) expectedRows.push({ Currency: 3, Rate: matchingOrder.EURRate, TotalSum: matchingOrder.TotalInEUR });

      console.log(`   Expected ${expectedRows.length} unique currencies`);
      console.log(`   Found ${currencyValues.length} total rows (includes duplicates)`);

      // Get unique currencies from actual data
      const uniqueCurrencies = [...new Set(currencyValues.map(cv => cv.Currency))];
      console.log(`   Unique currencies in actual data: ${uniqueCurrencies.length}`);
    }

    // STEP 9: Summary and migration plan
    console.log('\n\n📋 STEP 9: Migration Plan Summary');
    console.log('='.repeat(100));

    console.log('\n🎯 WHAT NEEDS TO BE DONE:');
    console.log('   1. Update migrate-donations.js to create donationcurrencyvalue rows');
    console.log('   2. For each Order, after inserting donation row:');
    console.log('      - Get the new donation.Id (AUTO_INCREMENT result)');
    console.log('      - For EACH currency field that has value > 0:');
    console.log('        → INSERT INTO donationcurrencyvalue (DonationId, Currency, RateInILS, TotalSum)');
    console.log('      ⚠️  IMPORTANT: Create ONE row per currency (NO DUPLICATES!)');
    console.log('   3. Currency mapping:');
    console.log('      - TotalInILS > 0 → Currency=1, Rate=1, TotalSum=TotalInILS');
    console.log('      - TotalInUSD > 0 → Currency=2, Rate=USDRate, TotalSum=TotalInUSD');
    console.log('      - TotalInEUR > 0 → Currency=3, Rate=EURRate, TotalSum=TotalInEUR');

    console.log('\n✅ Next Steps:');
    console.log('   1. Clear existing donations (892 rows with wrong Ids)');
    console.log('   2. Update migration script to handle currency values');
    console.log('   3. Re-run migration with complete logic');

    await sql.close();
    await mysqlConn.end();

  } catch (err) {
    console.error('\n❌ Error:', err);
    if (sql) await sql.close();
    if (mysqlConn) await mysqlConn.end();
    throw err;
  }
}

analyzeOrdersCurrencyMapping()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
