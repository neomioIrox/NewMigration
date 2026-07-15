/**
 * READ-ONLY diagnostic for the Asakim (business) donation migration:
 *   AsakimDonations (MSSQL)  ->  AsakimDonation (MySQL)   via asakim-donation-engine.js
 *
 * Only SELECT / INFORMATION_SCHEMA queries — no writes.
 *
 * Verifies:
 *  - target AsakimDonation table EXISTS, its columns + types (date cols, NOT NULL gaps)
 *  - every column the engine inserts exists in target; every target NOT-NULL col is supplied
 *  - source vs target row counts + id_mappings (has it run? fully?)
 *  - DonationID linkage: how many Asakim rows point at a migrated Donation vs dangle
 *  - scope: AsakimDonations has NO cutoff filter (engine migrates the whole table)
 *
 * Usage: node scripts/checks/check-asakim-donation.js
 */
const mssqlDb = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

// The 24 columns asakim-donation-engine.js writes into AsakimDonation.
const ENGINE_COLS = [
  "CardName","DocumentReferenceNumber","ProjectName","ProjectNumber","SumPaymentShekel",
  "SumPaymentCurrency","DocID","DocumentPaymentsID","DocPaymentDate","DocValueDate",
  "DocRegisterDate","CardID","PaymentType","RecordDate","CountPayments","SourceType",
  "Comments","ArmyIDNumber","SalesPersonID","SalesPersonName","BillingID","BillingItemsID",
  "Status","DonationID"
];

function line() { console.log("-".repeat(64)); }

async function finish() {
  try { await targetDb.close(); } catch (e) {}
  try { await trackerDb.close(); } catch (e) {}
  try { await mssqlDb.close(); } catch (e) {}
}

async function run() {
  console.log("=== Asakim donation migration check (READ-ONLY) ===\n");

  // ---------- TARGET: does the table exist? ----------
  line(); console.log("TARGET table AsakimDonation");
  const [cols] = await targetDb.query(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS LEN, IS_NULLABLE AS NULLABLE, " +
    "COLUMN_DEFAULT AS DFLT, EXTRA FROM INFORMATION_SCHEMA.COLUMNS " +
    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AsakimDonation' ORDER BY ORDINAL_POSITION");

  if (!cols.length) {
    console.log("   *** TABLE DOES NOT EXIST in target DB ***");
    console.log("   The engine's INSERT INTO `AsakimDonation` would fail outright.");
    await sourceAndTracker();
    return finish();
  }
  console.log("   exists — " + cols.length + " columns");

  const targetColNames = new Set(cols.map(c => c.COLUMN_NAME));

  // date columns of interest (source stores Doc*Date as nvarchar(30) strings)
  console.log("\n   Date-ish columns (source DocPaymentDate/DocValueDate/DocRegisterDate are nvarchar(30) strings):");
  ["DocPaymentDate","DocValueDate","DocRegisterDate","RecordDate"].forEach(name => {
    const c = cols.find(x => x.COLUMN_NAME === name);
    console.log("     " + name + " -> " + (c ? (c.DATA_TYPE + (c.LEN ? "(" + c.LEN + ")" : "")) : "MISSING in target") +
      (c && (c.DATA_TYPE === "datetime" || c.DATA_TYPE === "date") ? "   <-- string->datetime parse risk" : ""));
  });

  // engine columns missing from target
  const engineMissing = ENGINE_COLS.filter(c => !targetColNames.has(c));
  console.log("\n   Columns the engine writes but target lacks: " + (engineMissing.length ? engineMissing.join(", ") + "   <-- INSERT WOULD FAIL" : "none"));

  // target NOT NULL columns the engine does NOT supply and that have no default / aren't auto_increment
  const notNullGaps = cols.filter(c =>
    c.NULLABLE === "NO" &&
    !ENGINE_COLS.includes(c.COLUMN_NAME) &&
    c.DFLT === null &&
    !/auto_increment/i.test(c.EXTRA || ""));
  console.log("   Target NOT-NULL cols NOT supplied by engine (no default): " +
    (notNullGaps.length ? notNullGaps.map(c => c.COLUMN_NAME).join(", ") + "   <-- INSERT WOULD FAIL" : "none"));

  // audit columns present?
  ["Id","CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","StatusReason"].forEach(name => {
    const c = cols.find(x => x.COLUMN_NAME === name);
    if (c) console.log("   note: target has `" + name + "` " + c.DATA_TYPE +
      " NULLable=" + c.NULLABLE + " default=" + (c.DFLT === null ? "NULL" : c.DFLT) +
      (c.EXTRA ? " [" + c.EXTRA + "]" : ""));
  });

  // ---------- TARGET: row count + sample DonationID linkage ----------
  line(); console.log("TARGET row count + DonationID linkage");
  const [tc] = await targetDb.query("SELECT COUNT(*) AS cnt FROM `AsakimDonation`");
  console.log("   AsakimDonation rows: " + tc[0].cnt);

  if (tc[0].cnt > 0) {
    const [dl] = await targetDb.query(
      "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN a.DonationID IS NULL OR a.DonationID = '' THEN 1 ELSE 0 END) AS nullDon, " +
      "SUM(CASE WHEN d.Id IS NOT NULL THEN 1 ELSE 0 END) AS linked " +
      "FROM `AsakimDonation` a LEFT JOIN `Donation` d ON d.Id = a.DonationID");
    const r = dl[0];
    console.log("   DonationID null/empty: " + r.nullDon);
    console.log("   DonationID linked to a migrated Donation: " + r.linked + " of " + r.total);
    console.log("   DonationID set but NOT matching any migrated Donation (dangling): " +
      (Number(r.total) - Number(r.nullDon) - Number(r.linked)));
  }

  await sourceAndTracker();
  return finish();
}

async function sourceAndTracker() {
  // ---------- SOURCE ----------
  line(); console.log("SOURCE AsakimDonations (MSSQL)");
  const sc = (await mssqlDb.query("SELECT COUNT(*) AS cnt FROM AsakimDonations WITH (NOLOCK)")).recordset[0].cnt;
  console.log("   AsakimDonations rows (whole table — engine has NO scope/cutoff filter): " + sc);

  const don = (await mssqlDb.query(
    "SELECT COUNT(*) AS total, " +
    "SUM(CASE WHEN DonationID IS NULL OR LTRIM(RTRIM(DonationID))='' THEN 1 ELSE 0 END) AS nullDon " +
    "FROM AsakimDonations WITH (NOLOCK)")).recordset[0];
  console.log("   DonationID null/empty in source: " + don.nullDon + " of " + don.total);

  const sample = (await mssqlDb.query(
    "SELECT TOP 5 Id, DonationID FROM AsakimDonations WITH (NOLOCK) WHERE DonationID IS NOT NULL AND LTRIM(RTRIM(DonationID))<>'' ORDER BY Id DESC")).recordset;
  console.log("   sample DonationID values: " + sample.map(s => s.DonationID).join(", "));

  // ---------- TRACKER ----------
  line(); console.log("TRACKER state");
  const [im] = await trackerDb.query("SELECT COUNT(*) AS cnt FROM id_mappings WHERE entity_type='AsakimDonation'");
  console.log("   id_mappings (entity_type='AsakimDonation'): " + im[0].cnt);
  try {
    const [runs] = await trackerDb.query(
      "SELECT id, status, total_rows, processed_rows, inserted_rows, error_rows, started_at, finished_at " +
      "FROM migration_runs WHERE mapping_name='AsakimDonationMapping' ORDER BY id DESC LIMIT 5");
    if (runs.length) {
      console.log("   recent runs:");
      runs.forEach(r => console.log("     run#" + r.id + " " + r.status +
        " processed=" + r.processed_rows + " inserted=" + r.inserted_rows + " errors=" + r.error_rows));
    } else {
      console.log("   no migration_runs rows for AsakimDonationMapping (never started)");
    }
  } catch (e) {
    console.log("   (could not read migration_runs: " + e.message + ")");
  }

  console.log("\n=== done (read-only) ===");
}

run().catch(e => { console.error("FATAL:", e.message); finish().then(() => process.exit(1)); });
