// Read-only round 2: raw datetime strings, ClearingProvider/TerminalNumber distributions,
// LutTaxesByCardDonation, report views (timezone convention), affected-row counts.
const targetDb = require('../src/db/mysql-target');
const mssqlDb = require('../src/db/mssql');

const ID = 1834815;

async function mq(title, sql, params) {
  try {
    const [r] = await targetDb.query(sql, params);
    console.log('\n=== ' + title + ' ===');
    console.log(JSON.stringify(r, null, 1));
  } catch (e) { console.log('\n=== ' + title + ' === ERR: ' + e.message); }
}
async function sq(title, sql) {
  try {
    const r = await mssqlDb.query(sql);
    console.log('\n=== ' + title + ' ===');
    console.log(JSON.stringify(r.recordset, null, 1));
  } catch (e) { console.log('\n=== ' + title + ' === ERR: ' + e.message); }
}

// In-scope completed orders approximation for counts: same rule as engine (project in target OR recent).
// For distribution queries we just use ALL OrderFinished rows — good enough to enumerate values.
async function main() {
  try {
    // --- raw datetime strings, no driver conversion ---
    await sq('SOURCE raw DateCreated (1834815)',
      "SELECT CONVERT(varchar(23), DateCreated, 121) AS DateCreatedRaw FROM Orders WITH (NOLOCK) WHERE OrdersId=" + ID);
    await mq('TARGET raw CreatedAt/StatusChangedAt/UpdatedAt (1834815)',
      "SELECT CAST(CreatedAt AS CHAR) c, CAST(StatusChangedAt AS CHAR) s, CAST(UpdatedAt AS CHAR) u FROM Donation WHERE Id=?", [ID]);
    await mq('TARGET raw DonationActionLog times (1834815)',
      "SELECT Id, ActionId, CAST(CreatedAt AS CHAR) c, CreatedBy FROM DonationActionLog WHERE DonationId=?", [ID]);
    await mq('CONVERT_TZ availability',
      "SELECT CONVERT_TZ('2026-06-07 02:00:06','Asia/Jerusalem','UTC') AS summer, CONVERT_TZ('2026-01-15 02:00:06','Asia/Jerusalem','UTC') AS winter");

    // --- native rows (written by the new app, not migration) to learn the app's storage convention ---
    await mq('Native donations (CreatedBy<>-1) sample',
      "SELECT Id, CAST(CreatedAt AS CHAR) c, CreatedBy, SourceApp, Status FROM Donation WHERE CreatedBy<>-1 ORDER BY Id DESC LIMIT 10");
    await mq('Native donations count', "SELECT COUNT(*) cnt FROM Donation WHERE CreatedBy<>-1");
    await mq('Report view definition (vw_ExtendedDonationsReport)', "SHOW CREATE VIEW vw_ExtendedDonationsReport");

    // --- LutTaxesByCardDonation for snTaxesByCard mapping ---
    await mq('LutTaxesByCardDonation', 'SELECT * FROM LutTaxesByCardDonation');

    // --- source distributions (all finished orders) ---
    await sq('ClearingProvider distribution (OrderFinished)',
      "SELECT ISNULL(ClearingProvider,'<NULL>') AS ClearingProvider, PaymentMethod, COUNT(*) cnt FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' GROUP BY ClearingProvider, PaymentMethod ORDER BY cnt DESC");
    await sq('TerminalNumber distribution (OrderFinished)',
      "SELECT ISNULL(TerminalNumber,'<NULL>') AS TerminalNumber, COUNT(*) cnt FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' GROUP BY TerminalNumber ORDER BY cnt DESC");
    await sq('snTaxesByCard distribution (OrderFinished)',
      "SELECT snTaxesByCard, COUNT(*) cnt FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' GROUP BY snTaxesByCard");
    await sq('DonorIdentity non-empty count (OrderFinished)',
      "SELECT COUNT(*) cnt FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND DonorIdentity IS NOT NULL AND LTRIM(RTRIM(DonorIdentity))<>''");
    await sq('CardValidity present + CardExp empty (OrderFinished)',
      "SELECT COUNT(*) cnt FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND ISNULL(CardExp,'')='' AND ISNULL(CardValidityMonth,'')<>'' AND ISNULL(CardValidityYear,'')<>''");
    await sq('AsakimInvoiceID non-numeric sample',
      "SELECT TOP 5 OrdersId, AsakimInvoiceID FROM Orders WITH (NOLOCK) WHERE ISNULL(AsakimInvoiceID,'')<>'' AND TRY_CAST(AsakimInvoiceID AS bigint) IS NULL");
    await sq('source terminals table', 'SELECT * FROM terminals');

    // --- target-side affected counts (migrated donations only: CreatedBy=-1) ---
    await mq('Donations by ClearingMethodAreaId (migrated)',
      "SELECT ClearingMethodAreaId, COUNT(*) cnt FROM Donation WHERE CreatedBy=-1 GROUP BY ClearingMethodAreaId ORDER BY cnt DESC");
    await mq('Migrated donations w/ ClearingMethodTerminalNum values',
      "SELECT ClearingMethodTerminalNum, COUNT(*) cnt FROM Donation WHERE CreatedBy=-1 GROUP BY ClearingMethodTerminalNum ORDER BY cnt DESC LIMIT 20");
    await mq('TerminalId state (migrated)',
      "SELECT TerminalId, COUNT(*) cnt FROM Donation WHERE CreatedBy=-1 GROUP BY TerminalId");
    await mq('Empty Address rows referenced as ShippingAddress',
      "SELECT COUNT(*) cnt FROM Donation d JOIN Address a ON a.Id=d.ShippingAddress WHERE d.CreatedBy=-1 AND IFNULL(a.Street,'')='' AND IFNULL(a.City,'')='' AND IFNULL(a.ZipCode,'')=''");
    await mq('Empty Address rows referenced as ReceiptAddress',
      "SELECT COUNT(*) cnt FROM Donation d JOIN Address a ON a.Id=d.ReceiptAddress WHERE d.CreatedBy=-1 AND IFNULL(a.Street,'')='' AND IFNULL(a.City,'')='' AND IFNULL(a.ZipCode,'')=''");
    await mq('Donation totals (migrated vs all)',
      "SELECT (SELECT COUNT(*) FROM Donation) total, (SELECT COUNT(*) FROM Donation WHERE CreatedBy=-1) migrated");
    await mq('ReceiptNum filled count (migrated)',
      "SELECT COUNT(*) cnt FROM Donation WHERE CreatedBy=-1 AND ReceiptNum IS NOT NULL");
    await mq('GlobalConfig (timezone hints)',
      "SELECT * FROM GlobalConfig LIMIT 30");
  } catch (err) {
    console.error('FATAL:', err.message);
  } finally {
    await targetDb.close();
    await mssqlDb.close();
    process.exit(0);
  }
}

main();
