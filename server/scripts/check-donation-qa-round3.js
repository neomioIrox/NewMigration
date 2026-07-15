// Read-only round 3: CardExp format, ClearingProvider x language, FK constraints on Donation
const targetDb = require('../src/db/mysql-target');
const mssqlDb = require('../src/db/mssql');

async function mq(title, sql, params) {
  try { const [r] = await targetDb.query(sql, params); console.log('\n=== ' + title + ' ===\n' + JSON.stringify(r, null, 1)); }
  catch (e) { console.log('\n=== ' + title + ' === ERR: ' + e.message); }
}
async function sq(title, sql) {
  try { const r = await mssqlDb.query(sql); console.log('\n=== ' + title + ' ===\n' + JSON.stringify(r.recordset, null, 1)); }
  catch (e) { console.log('\n=== ' + title + ' === ERR: ' + e.message); }
}

async function main() {
  try {
    await sq('CardExp format sample',
      "SELECT TOP 10 CardExp FROM Orders WITH (NOLOCK) WHERE ISNULL(CardExp,'')<>'' AND ChargeStatus='OrderFinished' ORDER BY OrdersId DESC");
    await sq('CardValidity sample',
      "SELECT TOP 5 CardValidityMonth, CardValidityYear FROM Orders WITH (NOLOCK) WHERE ISNULL(CardValidityMonth,'')<>'' AND ChargeStatus='OrderFinished' ORDER BY OrdersId DESC");
    await sq('ClearingProvider x language x currency',
      "SELECT ClearingProvider, OrderLaguage, ISNULL(ChargeCurrency,'') ChargeCurrency, PaymentMethod, COUNT(*) cnt FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND ISNULL(ClearingProvider,'')<>'' GROUP BY ClearingProvider, OrderLaguage, ChargeCurrency, PaymentMethod ORDER BY cnt DESC");
    await mq('Donation FK constraints',
      "SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Donation' AND REFERENCED_TABLE_NAME IS NOT NULL");
    await mq('DonationActionLog FK constraints',
      "SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DonationActionLog' AND REFERENCED_TABLE_NAME IS NOT NULL");
    await mq('Migrated MoreProviderDetails w/ cardExp sample',
      "SELECT Id, MoreProviderDetails FROM Donation WHERE MoreProviderDetails LIKE '%cardExp%' LIMIT 3");
    await mq('Address referenced by other tables?',
      "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='Address'");
    // How many migrated donations would get each ClearingMethodArea after the NedarimIFRAME fix
    await mq('CMA 5 exists (NedarimIFRAME he)', "SELECT Id, ClearingMethodId, Area, ReceiptBy, RecordStatus FROM ClearingMethodArea WHERE ClearingMethodId IN (1,5)");
  } catch (err) {
    console.error('FATAL:', err.message);
  } finally {
    await targetDb.close(); await mssqlDb.close(); process.exit(0);
  }
}
main();
