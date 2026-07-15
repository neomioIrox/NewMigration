/**
 * Fix donation QA issues found on donation 1834815 (2026-07-14) across ALL migrated donations.
 *
 * Sections (each independently idempotent, run with --only to pick a subset):
 *   times     - migrated datetimes were written shifted (+IL offset, some doubled).
 *               Target convention is UTC (FE converts for display). Corrects:
 *               Donation.CreatedAt (double conv), StatusChangedAt/UpdatedAt (single conv),
 *               DonationActionLog.CreatedAt (double) / UpdatedAt (single),
 *               DonationCurrencyValue.CreatedAt/UpdatedAt (single).
 *               Gated by a sentinel check on donation 1834815 so it can never run twice.
 *   clearing  - ClearingMethodAreaId: Orders.ClearingProvider is authoritative.
 *               NedarimIFRAME+CreditCard: CMA 2 (CardCom) -> 5 (NedarimIFRAME IL).
 *               Stripe+fr: CMA 4 (PayLine) -> 7 (Stripe FR), ReceiptBy 6 -> 10.
 *   cardexp   - card expiry: source CardValidityMonth/Year (split) -> MoreProviderDetails
 *               JSON "cardExp":"MMYY" where CardExp was empty.
 *   taxes     - TaxesByCard (Orders.snTaxesByCard 1-4) + DonorIdNumber (Orders.DonorIdentity).
 *   terminal  - TerminalId 1/2 derived from ClearingMethodTerminalNum
 *               (39114/7012535/7016222 -> 1 kupat; 75101/7012536/7016223 -> 2 kranot).
 *   addresses - delete meaningless Address rows (Street/City/Zip all empty, country only)
 *               referenced by Donation.ShippingAddress, and NULL the reference.
 *   receipts  - ReceiptNum gap-fill from current Orders.AsakimInvoiceID (receipts issued
 *               after the migration snapshot).
 *   action    - add LutDonationAction 14 'ReceivedFromMigration' and retag migrated
 *               DonationActionLog rows from ActionId 1 (RedirectToPaymentPage).
 *
 * Usage:
 *   node scripts/fixes/fix-donation-qa-issues.js                 # dry-run, reports counts only
 *   node scripts/fixes/fix-donation-qa-issues.js --apply         # execute all sections
 *   node scripts/fixes/fix-donation-qa-issues.js --only=times,terminal [--apply]
 *
 * Only touches migration-created rows (CreatedBy=-1 / UpdatedBy=-1 guards everywhere),
 * so anything already edited via the new management UI is preserved.
 */
const targetDb = require('../../server/src/db/mysql-target');
const mssqlDb = require('../../server/src/db/mssql');

const APPLY = process.argv.includes('--apply');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.replace('--only=', '').split(',').map(s => s.trim()) : null;

const SENTINEL_ID = 1834815;
const SENTINEL_BEFORE = '2026-06-07 05:00:06';
const SENTINEL_AFTER = '2026-06-06 23:00:06';

const CHUNK = 5000;

function log(msg) { console.log(msg); }
function section(name) { return !ONLY || ONLY.includes(name); }

async function loadTemp(conn, name, ddlCols, rows, width) {
  await conn.query('DROP TEMPORARY TABLE IF EXISTS ' + name);
  await conn.query('CREATE TEMPORARY TABLE ' + name + ' (' + ddlCols + ') ENGINE=InnoDB');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '(' + Array(width).fill('?').join(',') + ')').join(',');
    const vals = [];
    for (const r of chunk) vals.push(...r);
    await conn.query('INSERT INTO ' + name + ' VALUES ' + placeholders, vals);
  }
}

// ---------------------------------------------------------------- times
async function fixTimes(conn) {
  log('\n--- [times] datetime correction to UTC ---');
  const [[sent]] = await conn.query('SELECT CAST(CreatedAt AS CHAR) c FROM Donation WHERE Id=?', [SENTINEL_ID]);
  if (!sent) { log('SKIP: sentinel donation ' + SENTINEL_ID + ' not found'); return; }
  if (sent.c === SENTINEL_AFTER) { log('SKIP: times fix already applied (sentinel=' + sent.c + ')'); return; }
  if (sent.c !== SENTINEL_BEFORE) { log('ABORT times: sentinel CreatedAt=' + sent.c + ' matches neither before (' + SENTINEL_BEFORE + ') nor after (' + SENTINEL_AFTER + ') state'); return; }

  // Sanity: CONVERT_TZ must know Asia/Jerusalem (RDS tz tables)
  const [[tz]] = await conn.query("SELECT CONVERT_TZ('2026-06-07 05:00:06','Asia/Jerusalem','UTC') v");
  if (!tz.v) { log('ABORT times: CONVERT_TZ returned NULL - timezone tables missing'); return; }

  const counts = {};
  counts.donCreated = (await conn.query('SELECT COUNT(*) n FROM Donation WHERE CreatedBy=-1'))[0][0];
  counts.donStatus = (await conn.query('SELECT COUNT(*) n FROM Donation WHERE CreatedBy=-1 AND StatusChangedBy=-1'))[0][0];
  counts.donUpdated = (await conn.query('SELECT COUNT(*) n FROM Donation WHERE CreatedBy=-1 AND UpdatedBy=-1'))[0][0];
  counts.dalCreated = (await conn.query('SELECT COUNT(*) n FROM DonationActionLog WHERE CreatedBy=-1'))[0][0];
  counts.dalUpdated = (await conn.query('SELECT COUNT(*) n FROM DonationActionLog WHERE CreatedBy=-1 AND UpdatedBy=-1'))[0][0];
  counts.dcv = (await conn.query('SELECT COUNT(*) n FROM DonationCurrencyValue WHERE CreatedBy=-1'))[0][0];
  log('Would fix: Donation.CreatedAt=' + counts.donCreated.n + ', StatusChangedAt=' + counts.donStatus.n
    + ', UpdatedAt=' + counts.donUpdated.n + ' | ActionLog.CreatedAt=' + counts.dalCreated.n
    + ', UpdatedAt=' + counts.dalUpdated.n + ' | CurrencyValue=' + counts.dcv.n);

  // Rows whose source DateCreated was NULL got "now" (single shift) as CreatedAt; the double
  // conversion below would overshoot them by the IL offset. Report how many exist (expected 0).
  const nullDc = await mssqlDb.query("SELECT COUNT(*) n FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND DateCreated IS NULL");
  if (nullDc.recordset[0].n > 0) log('WARNING: ' + nullDc.recordset[0].n + ' source orders have NULL DateCreated (their CreatedAt will overshoot by 2-3h)');

  if (!APPLY) return;
  await conn.query('START TRANSACTION');
  try {
    // stored = wall + offset(wall) == CONVERT_TZ(trueUTC,'UTC','Asia/Jerusalem') applied twice,
    // so the exact inverse is Jerusalem->UTC applied twice.
    await conn.query("UPDATE Donation SET CreatedAt=CONVERT_TZ(CONVERT_TZ(CreatedAt,'Asia/Jerusalem','UTC'),'Asia/Jerusalem','UTC') WHERE CreatedBy=-1");
    // StatusChangedAt/UpdatedAt were written as IL-local "now" strings: single conversion.
    await conn.query("UPDATE Donation SET StatusChangedAt=CONVERT_TZ(StatusChangedAt,'Asia/Jerusalem','UTC') WHERE CreatedBy=-1 AND StatusChangedBy=-1");
    await conn.query("UPDATE Donation SET UpdatedAt=CONVERT_TZ(UpdatedAt,'Asia/Jerusalem','UTC') WHERE CreatedBy=-1 AND UpdatedBy=-1");
    await conn.query("UPDATE DonationActionLog SET CreatedAt=CONVERT_TZ(CONVERT_TZ(CreatedAt,'Asia/Jerusalem','UTC'),'Asia/Jerusalem','UTC') WHERE CreatedBy=-1");
    await conn.query("UPDATE DonationActionLog SET UpdatedAt=CONVERT_TZ(UpdatedAt,'Asia/Jerusalem','UTC') WHERE CreatedBy=-1 AND UpdatedBy=-1");
    await conn.query("UPDATE DonationCurrencyValue SET CreatedAt=CONVERT_TZ(CreatedAt,'Asia/Jerusalem','UTC'), UpdatedAt=CONVERT_TZ(UpdatedAt,'Asia/Jerusalem','UTC') WHERE CreatedBy=-1");
    await conn.query('COMMIT');
  } catch (e) { await conn.query('ROLLBACK'); throw e; }
  const [[after]] = await conn.query('SELECT CAST(CreatedAt AS CHAR) c FROM Donation WHERE Id=?', [SENTINEL_ID]);
  log('APPLIED. Sentinel now: ' + after.c + ' (expected ' + SENTINEL_AFTER + ')');
}

// ---------------------------------------------------------------- clearing
async function fixClearing(conn) {
  log('\n--- [clearing] ClearingMethodAreaId per Orders.ClearingProvider ---');
  const ned = await mssqlDb.query("SELECT OrdersId FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND ClearingProvider='NedarimIFRAME' AND PaymentMethod='CreditCard'");
  const strFr = await mssqlDb.query("SELECT OrdersId FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND ClearingProvider='Stripe' AND PaymentMethod='CreditCard' AND OrderLaguage='fr'");
  log('Source: NedarimIFRAME/CreditCard=' + ned.recordset.length + ', Stripe/fr=' + strFr.recordset.length);

  await loadTemp(conn, 'tmp_cma_fix', 'Id INT PRIMARY KEY, cma INT, receiptBy INT',
    ned.recordset.map(r => [r.OrdersId, 5, null]).concat(strFr.recordset.map(r => [r.OrdersId, 7, 10])), 3);

  const [[cnt]] = await conn.query(
    'SELECT COUNT(*) n FROM Donation d JOIN tmp_cma_fix t ON t.Id=d.Id WHERE d.CreatedBy=-1 AND (d.ClearingMethodAreaId IS NULL OR d.ClearingMethodAreaId<>t.cma)');
  log('Would update ' + cnt.n + ' donations');
  if (!APPLY) return;
  const [r] = await conn.query(
    'UPDATE Donation d JOIN tmp_cma_fix t ON t.Id=d.Id SET d.ClearingMethodAreaId=t.cma, d.ReceiptBy=COALESCE(t.receiptBy,d.ReceiptBy) WHERE d.CreatedBy=-1 AND (d.ClearingMethodAreaId IS NULL OR d.ClearingMethodAreaId<>t.cma)');
  log('APPLIED: ' + r.affectedRows + ' rows');
}

// ---------------------------------------------------------------- cardexp
function normalizeExp(m, y) {
  m = m ? String(m).trim() : ''; y = y ? String(y).trim() : '';
  if (!m || !y) return null;
  if (m.length === 1) m = '0' + m;
  if (y.length === 4) y = y.substring(2);
  if (m.length !== 2 || y.length !== 2 || isNaN(Number(m)) || isNaN(Number(y))) return null;
  return m + y;
}

async function fixCardExp(conn) {
  log('\n--- [cardexp] MoreProviderDetails.cardExp from CardValidityMonth/Year ---');
  const src = await mssqlDb.query(
    "SELECT OrdersId, CardValidityMonth, CardValidityYear FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND ISNULL(CardExp,'')='' AND ISNULL(CardValidityMonth,'')<>'' AND ISNULL(CardValidityYear,'')<>''");
  const rows = [];
  for (const r of src.recordset) {
    const exp = normalizeExp(r.CardValidityMonth, r.CardValidityYear);
    if (exp) rows.push([r.OrdersId, exp]);
  }
  log('Source rows with derivable expiry: ' + rows.length + ' (of ' + src.recordset.length + ')');

  await loadTemp(conn, 'tmp_cardexp', 'Id INT PRIMARY KEY, exp CHAR(4)', rows, 2);
  const cond = "d.CreatedBy=-1 AND (d.MoreProviderDetails IS NULL OR d.MoreProviderDetails='' OR JSON_UNQUOTE(JSON_EXTRACT(d.MoreProviderDetails,'$.cardExp')) IS NULL)";
  const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM Donation d JOIN tmp_cardexp t ON t.Id=d.Id WHERE ' + cond);
  log('Would update ' + cnt.n + ' donations');
  if (!APPLY) return;
  const [r] = await conn.query(
    "UPDATE Donation d JOIN tmp_cardexp t ON t.Id=d.Id SET d.MoreProviderDetails=CASE WHEN d.MoreProviderDetails IS NULL OR d.MoreProviderDetails='' THEN JSON_OBJECT('cardExp',t.exp) ELSE JSON_SET(d.MoreProviderDetails,'$.cardExp',t.exp) END WHERE " + cond);
  log('APPLIED: ' + r.affectedRows + ' rows');
}

// ---------------------------------------------------------------- taxes
async function fixTaxes(conn) {
  log('\n--- [taxes] TaxesByCard + DonorIdNumber ---');
  const src = await mssqlDb.query(
    "SELECT OrdersId, snTaxesByCard, DonorIdentity FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND (snTaxesByCard BETWEEN 1 AND 4 OR (DonorIdentity IS NOT NULL AND LTRIM(RTRIM(DonorIdentity))<>''))");
  const rows = src.recordset.map(r => [
    r.OrdersId,
    (r.snTaxesByCard >= 1 && r.snTaxesByCard <= 4) ? r.snTaxesByCard : null,
    (r.DonorIdentity && String(r.DonorIdentity).trim()) ? String(r.DonorIdentity).trim().substring(0, 100) : null
  ]);
  log('Source rows: ' + rows.length);

  await loadTemp(conn, 'tmp_taxes', 'Id INT PRIMARY KEY, taxes TINYINT NULL, donor VARCHAR(100) NULL', rows, 3);
  const cond = 'd.CreatedBy=-1 AND ((t.taxes IS NOT NULL AND d.TaxesByCard IS NULL) OR (t.donor IS NOT NULL AND d.DonorIdNumber IS NULL))';
  const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM Donation d JOIN tmp_taxes t ON t.Id=d.Id WHERE ' + cond);
  log('Would update ' + cnt.n + ' donations');
  if (!APPLY) return;
  const [r] = await conn.query(
    'UPDATE Donation d JOIN tmp_taxes t ON t.Id=d.Id SET d.TaxesByCard=COALESCE(d.TaxesByCard,t.taxes), d.DonorIdNumber=COALESCE(d.DonorIdNumber,t.donor) WHERE ' + cond);
  log('APPLIED: ' + r.affectedRows + ' rows');
}

// ---------------------------------------------------------------- terminal
const TERMINAL_CASE = "CASE TRIM(ClearingMethodTerminalNum) WHEN '39114' THEN 1 WHEN '7012535' THEN 1 WHEN '7016222' THEN 1 WHEN '75101' THEN 2 WHEN '7012536' THEN 2 WHEN '7016223' THEN 2 ELSE NULL END";

async function fixTerminal(conn) {
  log('\n--- [terminal] TerminalId from ClearingMethodTerminalNum ---');
  const cond = 'CreatedBy=-1 AND TerminalId IS NULL AND (' + TERMINAL_CASE + ') IS NOT NULL';
  const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM Donation WHERE ' + cond);
  const [dist] = await conn.query('SELECT ' + TERMINAL_CASE + ' t, COUNT(*) n FROM Donation WHERE ' + cond + ' GROUP BY 1');
  log('Would set TerminalId on ' + cnt.n + ' donations: ' + JSON.stringify(dist));
  if (!APPLY) return;
  const [r] = await conn.query('UPDATE Donation SET TerminalId=' + TERMINAL_CASE + ' WHERE ' + cond);
  log('APPLIED: ' + r.affectedRows + ' rows');
}

// ---------------------------------------------------------------- addresses
async function fixAddresses(conn) {
  log('\n--- [addresses] remove meaningless country-only shipping addresses ---');
  const emptyCond = "IFNULL(TRIM(a.Street),'')='' AND IFNULL(TRIM(a.City),'')='' AND IFNULL(TRIM(a.ZipCode),'')=''";
  const [ids] = await conn.query(
    'SELECT a.Id id FROM Donation d JOIN Address a ON a.Id=d.ShippingAddress WHERE d.CreatedBy=-1 AND ' + emptyCond);
  log('Empty shipping Address rows referenced by migrated donations: ' + ids.length);
  if (!APPLY) return;

  const [r1] = await conn.query(
    'UPDATE Donation d JOIN Address a ON a.Id=d.ShippingAddress SET d.ShippingAddress=NULL WHERE d.CreatedBy=-1 AND ' + emptyCond);
  log('NULLed ShippingAddress on ' + r1.affectedRows + ' donations');

  // Delete the orphaned Address rows - only ids we detached, only if truly unreferenced anywhere.
  let deleted = 0;
  const idList = ids.map(r => r.id);
  for (let i = 0; i < idList.length; i += CHUNK) {
    const chunk = idList.slice(i, i + CHUNK);
    const ph = chunk.map(() => '?').join(',');
    const [r2] = await conn.query(
      'DELETE a FROM Address a WHERE a.Id IN (' + ph + ')'
      + " AND IFNULL(TRIM(a.Street),'')='' AND IFNULL(TRIM(a.City),'')='' AND IFNULL(TRIM(a.ZipCode),'')=''"
      + ' AND NOT EXISTS (SELECT 1 FROM Donation x WHERE x.ShippingAddress=a.Id OR x.ReceiptAddress=a.Id)'
      + ' AND NOT EXISTS (SELECT 1 FROM CustomerAddress x WHERE x.AddressId=a.Id)'
      + ' AND NOT EXISTS (SELECT 1 FROM Branch x WHERE x.AddressId=a.Id)'
      + ' AND NOT EXISTS (SELECT 1 FROM ClothesCollectionPoint x WHERE x.AddressId=a.Id)'
      + ' AND NOT EXISTS (SELECT 1 FROM ClothesCollectionRequest x WHERE x.AddressId=a.Id)'
      + ' AND NOT EXISTS (SELECT 1 FROM Lead x WHERE x.Address=a.Id)', chunk);
    deleted += r2.affectedRows;
  }
  log('APPLIED: deleted ' + deleted + ' Address rows');
}

// ---------------------------------------------------------------- receipts
async function fixReceipts(conn) {
  log('\n--- [receipts] ReceiptNum gap-fill from current AsakimInvoiceID ---');
  const src = await mssqlDb.query(
    "SELECT OrdersId, AsakimInvoiceID FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND ISNULL(AsakimInvoiceID,'')<>'' AND TRY_CAST(AsakimInvoiceID AS bigint) IS NOT NULL");
  log('Source rows with invoice: ' + src.recordset.length);
  await loadTemp(conn, 'tmp_receipts', 'Id INT PRIMARY KEY, inv BIGINT', src.recordset.map(r => [r.OrdersId, r.AsakimInvoiceID]), 2);
  const cond = 'd.CreatedBy=-1 AND d.ReceiptNum IS NULL';
  const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM Donation d JOIN tmp_receipts t ON t.Id=d.Id WHERE ' + cond);
  log('Would fill ReceiptNum on ' + cnt.n + ' donations (receipts issued after migration snapshot)');
  if (!APPLY) return;
  const [r] = await conn.query('UPDATE Donation d JOIN tmp_receipts t ON t.Id=d.Id SET d.ReceiptNum=t.inv WHERE ' + cond);
  log('APPLIED: ' + r.affectedRows + ' rows');
}

// ---------------------------------------------------------------- action
async function fixAction(conn) {
  log('\n--- [action] LutDonationAction 14 ReceivedFromMigration ---');
  const [[lut]] = await conn.query('SELECT COUNT(*) n FROM LutDonationAction WHERE Id=14');
  const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM DonationActionLog WHERE ActionId=1 AND CreatedBy=-1');
  log('Lut row exists: ' + (lut.n > 0) + '; would retag ' + cnt.n + ' action-log rows from 1 (RedirectToPaymentPage) to 14');
  if (!APPLY) return;
  await conn.query("INSERT IGNORE INTO LutDonationAction (Id,Description,IsSystemValue) VALUES (14,'ReceivedFromMigration',1)");
  const [r] = await conn.query('UPDATE DonationActionLog SET ActionId=14 WHERE ActionId=1 AND CreatedBy=-1');
  log('APPLIED: ' + r.affectedRows + ' rows retagged');
}

// ----------------------------------------------------------------
async function main() {
  log((APPLY ? '*** APPLY MODE ***' : '*** DRY-RUN (no changes; pass --apply to execute) ***')
    + (ONLY ? ' sections: ' + ONLY.join(',') : ' all sections'));
  const conn = await targetDb.getConnection();
  try {
    if (section('times')) await fixTimes(conn);
    if (section('clearing')) await fixClearing(conn);
    if (section('cardexp')) await fixCardExp(conn);
    if (section('taxes')) await fixTaxes(conn);
    if (section('terminal')) await fixTerminal(conn);
    if (section('addresses')) await fixAddresses(conn);
    if (section('receipts')) await fixReceipts(conn);
    if (section('action')) await fixAction(conn);
    log('\nDone.');
  } catch (err) {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await targetDb.close();
    await mssqlDb.close();
    process.exit();
  }
}

main();
