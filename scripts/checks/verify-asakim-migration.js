/**
 * READ-ONLY post-migration verification for AsakimDonations -> AsakimDonation.
 * Run AFTER the migration completed. Only SELECTs — no writes.
 *
 * Checks:
 *  1. Aggregate checksums over the FULL in-scope set (sums, counts, date range,
 *     per-Status distribution) — source vs target must match exactly.
 *  2. Field-by-field fidelity on a random sample (default 1000 rows): source row
 *     -> id_mappings -> target row, applying the engine's exact transform
 *     (CardName trunc to 100, ''-to-NULL coercion, Status default 0).
 *  3. Scope correctness: target must contain ONLY in-scope rows and ALL of them.
 *  4. ''->NULL coercion quantification per varchar column (engine uses ||null).
 *  5. CardName truncation count + sample verification.
 *  6. Linkage survival in the NEW database: can AsakimDonation still be joined
 *     back to Donation? (DonationID == Orders.AsakimID lives only in MSSQL...)
 *
 * Usage: node scripts/checks/verify-asakim-migration.js [sampleSize]
 */
const mssqlDb = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

const SAMPLE = parseInt(process.argv[2]) || 1000;
const CUT = "2025-06-01";
const SCOPE = " EXISTS (SELECT 1 FROM Orders o WITH (NOLOCK)" +
  " WHERE o.AsakimID = AsakimDonations.DonationID" +
  " AND o.ChargeStatus='OrderFinished' AND o.DateCreated >= '" + CUT + "')";

// engine transform replicas
function trunc(val, max) {
  if (val === null || val === undefined) return null;
  var s = String(val).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
  return s.length > max ? s.substring(0, max) : s;
}
const orNull = v => v || null;                       // engine: row.X||null
const keep0 = v => (v != null ? v : null);           // engine: row.X!=null?row.X:null

// column -> [transform, comparator]
const eqStr = (a, b) => (a === null && b === null) || String(a) === String(b);
const eqNum = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 1e-6);
const eqDate = (a, b) => (a === null && b === null) || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());
const COLS = {
  CardName:               [v => v ? trunc(v, 100) : null, eqStr],
  DocumentReferenceNumber:[orNull, eqStr],
  ProjectName:            [orNull, eqStr],
  ProjectNumber:          [orNull, eqStr],
  SumPaymentShekel:       [keep0, eqNum],
  SumPaymentCurrency:     [keep0, eqNum],
  DocID:                  [keep0, eqNum],
  DocumentPaymentsID:     [orNull, eqStr],
  DocPaymentDate:         [orNull, eqStr],
  DocValueDate:           [orNull, eqStr],
  DocRegisterDate:        [orNull, eqStr],
  CardID:                 [orNull, eqStr],
  PaymentType:            [orNull, eqStr],
  RecordDate:             [orNull, eqDate],
  CountPayments:          [keep0, eqNum],
  SourceType:             [orNull, eqStr],
  Comments:               [orNull, eqStr],
  ArmyIDNumber:           [keep0, eqNum],
  SalesPersonID:          [keep0, eqNum],
  SalesPersonName:        [orNull, eqStr],
  BillingID:              [keep0, eqNum],
  BillingItemsID:         [keep0, eqNum],
  Status:                 [v => (v != null ? v : 0), eqNum],
  DonationID:             [orNull, eqStr]
};

function line() { console.log("-".repeat(66)); }
async function finish() {
  try { await targetDb.close(); } catch (e) {}
  try { await trackerDb.close(); } catch (e) {}
  try { await mssqlDb.close(); } catch (e) {}
}

async function run() {
  console.log("=== Asakim post-migration verification (READ-ONLY) ===\n");
  let problems = 0;

  // ---------- 1. Aggregate checksums (full set) ----------
  line(); console.log("1) AGGREGATE CHECKSUMS (full in-scope set vs full target)");
  const s = (await mssqlDb.query(
    "SELECT COUNT(*) cnt, SUM(CAST(SumPaymentShekel AS float)) sumShekel, " +
    "SUM(CAST(SumPaymentCurrency AS float)) sumCur, SUM(CAST(CountPayments AS bigint)) sumPay, " +
    "COUNT(DISTINCT DonationID) dDon, MIN(RecordDate) minRD, MAX(RecordDate) maxRD, " +
    "SUM(CAST(DocID AS bigint)) sumDocId " +
    "FROM AsakimDonations WITH (NOLOCK) WHERE" + SCOPE)).recordset[0];
  const [[t]] = [ (await targetDb.query(
    "SELECT COUNT(*) cnt, SUM(SumPaymentShekel) sumShekel, SUM(SumPaymentCurrency) sumCur, " +
    "SUM(CountPayments) sumPay, COUNT(DISTINCT DonationID) dDon, MIN(RecordDate) minRD, MAX(RecordDate) maxRD, " +
    "SUM(DocID) sumDocId FROM `AsakimDonation`"))[0] ];
  function cmp(label, a, b, num) {
    const ok = num ? Math.abs(Number(a) - Number(b)) < 0.01 : String(a) === String(b);
    if (!ok) problems++;
    console.log("   " + label + ": source=" + a + "  target=" + b + "  " + (ok ? "OK" : "*** MISMATCH ***"));
  }
  cmp("row count        ", s.cnt, t.cnt, true);
  cmp("SUM SumPaymentShekel", s.sumShekel && s.sumShekel.toFixed(2), t.sumShekel && Number(t.sumShekel).toFixed(2), true);
  cmp("SUM SumPaymentCurrency", s.sumCur && s.sumCur.toFixed(2), t.sumCur && Number(t.sumCur).toFixed(2), true);
  cmp("SUM CountPayments", s.sumPay, t.sumPay, true);
  cmp("SUM DocID        ", s.sumDocId, t.sumDocId, true);
  cmp("DISTINCT DonationID", s.dDon, t.dDon, true);
  cmp("MIN RecordDate   ", s.minRD && s.minRD.toISOString(), t.minRD && new Date(t.minRD).toISOString(), false);
  cmp("MAX RecordDate   ", s.maxRD && s.maxRD.toISOString(), t.maxRD && new Date(t.maxRD).toISOString(), false);

  // Status distribution
  const sd = (await mssqlDb.query(
    "SELECT Status, COUNT(*) c FROM AsakimDonations WITH (NOLOCK) WHERE" + SCOPE + " GROUP BY Status ORDER BY Status")).recordset;
  const [td] = await targetDb.query("SELECT Status, COUNT(*) c FROM `AsakimDonation` GROUP BY Status ORDER BY Status");
  const tdMap = new Map(td.map(r => [String(r.Status), Number(r.c)]));
  console.log("   Status distribution:");
  let statusOk = true;
  for (const r of sd) {
    const tv = tdMap.get(String(r.Status)) || 0;
    if (tv !== Number(r.c)) { statusOk = false; problems++; }
    console.log("     Status=" + r.Status + ": source=" + r.c + " target=" + tv + (tv === Number(r.c) ? "" : "  *** MISMATCH ***"));
  }
  if (statusOk) console.log("     all status buckets match");

  // ---------- 2. Random-sample field-by-field ----------
  line(); console.log("2) FIELD-BY-FIELD on random sample of " + SAMPLE);
  const srcRows = (await mssqlDb.query(
    "SELECT TOP " + SAMPLE + " * FROM AsakimDonations WITH (NOLOCK) WHERE" + SCOPE + " ORDER BY NEWID()")).recordset;
  const ids = srcRows.map(r => r.Id);
  const [maps] = await trackerDb.query(
    "SELECT source_id, target_id FROM id_mappings WHERE entity_type='AsakimDonation' AND source_id IN (" +
    ids.map(() => "?").join(",") + ")", ids.map(String));
  const s2t = new Map(maps.map(m => [String(m.source_id), Number(m.target_id)]));
  const unmapped = ids.filter(id => !s2t.has(String(id)));
  if (unmapped.length) { problems++; console.log("   *** " + unmapped.length + " sampled source rows have NO id_mapping: " + unmapped.slice(0, 5).join(",")); }

  const tids = [...s2t.values()];
  const [tRows] = await targetDb.query(
    "SELECT * FROM `AsakimDonation` WHERE Id IN (" + tids.join(",") + ")");
  const tMap = new Map(tRows.map(r => [Number(r.Id), r]));

  let rowFail = 0; const colFail = {}; const examples = [];
  for (const src of srcRows) {
    const tid = s2t.get(String(src.Id)); if (!tid) continue;
    const tgt = tMap.get(tid);
    if (!tgt) { rowFail++; problems++; console.log("   *** target row Id=" + tid + " missing (source " + src.Id + ")"); continue; }
    let bad = false;
    for (const [col, [tf, eq]] of Object.entries(COLS)) {
      const expected = tf(src[col]);
      const actual = tgt[col];
      if (!eq(expected, actual)) {
        bad = true; colFail[col] = (colFail[col] || 0) + 1;
        if (examples.length < 8) examples.push("src#" + src.Id + " -> tgt#" + tid + " [" + col + "] expected=" + JSON.stringify(expected) + " actual=" + JSON.stringify(actual));
      }
    }
    if (bad) rowFail++;
  }
  if (rowFail === 0) console.log("   ALL " + srcRows.length + " sampled rows match on all " + Object.keys(COLS).length + " columns ✓");
  else {
    problems++;
    console.log("   *** " + rowFail + "/" + srcRows.length + " rows mismatched. Per-column: " + JSON.stringify(colFail));
    examples.forEach(e => console.log("     " + e));
  }

  // ---------- 3. Scope correctness ----------
  line(); console.log("3) SCOPE both directions");
  const outOfScope = (await mssqlDb.query(
    "SELECT COUNT(*) c FROM AsakimDonations WITH (NOLOCK) WHERE NOT" + SCOPE)).recordset[0].c;
  console.log("   out-of-scope source rows: " + outOfScope + " (expected 14,059)");
  // any out-of-scope row that got migrated? sample out-of-scope ids and look them up
  const oosIds = (await mssqlDb.query(
    "SELECT TOP 2000 Id FROM AsakimDonations WITH (NOLOCK) WHERE NOT" + SCOPE + " ORDER BY NEWID()")).recordset.map(r => String(r.Id));
  const [leak] = await trackerDb.query(
    "SELECT COUNT(*) c FROM id_mappings WHERE entity_type='AsakimDonation' AND source_id IN (" +
    oosIds.map(() => "?").join(",") + ")", oosIds);
  const leaked = Number(leak[0].c);
  if (leaked > 0) problems++;
  console.log("   out-of-scope rows that leaked into target (2000-sample): " + leaked + (leaked ? "  *** LEAK ***" : "  ✓"));

  // ---------- 4. ''->NULL coercion ----------
  line(); console.log("4) EMPTY-STRING -> NULL coercion (engine ||null pattern, by design)");
  const strCols = ["DocumentReferenceNumber","ProjectName","ProjectNumber","DocumentPaymentsID","CardID","PaymentType","SourceType","Comments","SalesPersonName","DonationID"];
  const sel = strCols.map(c =>
    "SUM(CASE WHEN " + c + " IS NULL THEN 1 ELSE 0 END) AS null_" + c +
    ", SUM(CASE WHEN " + c + " = '' THEN 1 ELSE 0 END) AS empty_" + c).join(", ");
  const nn = (await mssqlDb.query("SELECT " + sel + " FROM AsakimDonations WITH (NOLOCK) WHERE" + SCOPE)).recordset[0];
  const tsel = strCols.map(c => "SUM(CASE WHEN `" + c + "` IS NULL THEN 1 ELSE 0 END) AS null_" + c).join(", ");
  const [tn] = await targetDb.query("SELECT " + tsel + " FROM `AsakimDonation`");
  let coerceTotal = 0, coerceBad = 0;
  for (const c of strCols) {
    const srcNull = Number(nn["null_" + c]), srcEmpty = Number(nn["empty_" + c]), tgtNull = Number(tn[0]["null_" + c]);
    const expect = srcNull + srcEmpty;
    coerceTotal += srcEmpty;
    const ok = tgtNull === expect;
    if (!ok) { coerceBad++; problems++; }
    if (srcEmpty > 0 || !ok) console.log("   " + c + ": srcNULL=" + srcNull + " src''=" + srcEmpty + " -> tgtNULL=" + tgtNull + (ok ? "  ✓" : "  *** expected " + expect + " ***"));
  }
  console.log("   total ''-values coerced to NULL: " + coerceTotal + (coerceBad ? "" : "   (all columns consistent ✓)"));

  // ---------- 5. CardName truncation ----------
  line(); console.log("5) CardName TRUNCATION (200 -> 100)");
  const tl = (await mssqlDb.query(
    "SELECT COUNT(*) c FROM AsakimDonations WITH (NOLOCK) WHERE" + SCOPE + " AND LEN(CardName) > 100")).recordset[0].c;
  console.log("   source in-scope rows with CardName > 100 chars (data lost by design): " + tl);

  // ---------- 6. Linkage survival in NEW database ----------
  line(); console.log("6) LINKAGE: can the NEW DB join AsakimDonation -> Donation?");
  // bridge exists only in MSSQL: DonationID == Orders.AsakimID -> OrdersId == Donation.Id (preserveSourceId)
  const br = (await mssqlDb.query(
    "SELECT TOP 5 o.OrdersId, o.AsakimID, o.InternalDealNumber, o.ReferenceCode, o.AsakimInvoiceID " +
    "FROM Orders o WITH (NOLOCK) WHERE o.PaymentMethod='Asakim' AND o.ChargeStatus='OrderFinished' AND o.DateCreated >= '" + CUT + "' ORDER BY o.OrdersId DESC")).recordset;
  console.log("   sample Asakim orders (MSSQL bridge):");
  br.forEach(r => console.log("     OrdersId=" + r.OrdersId + " AsakimID=" + r.AsakimID +
    " InternalDealNumber=" + r.InternalDealNumber + " ReferenceCode=" + r.ReferenceCode + " AsakimInvoiceID=" + r.AsakimInvoiceID));
  // does the new Donation carry AsakimID in any column? check the columns donation-engine fills from these fields
  if (br.length) {
    const ids2 = br.map(r => r.OrdersId).join(",");
    const [dn] = await targetDb.query(
      "SELECT Id, ReferenceNum, ProviderReferenceNum, ReceiptNum, MoreProviderDetails FROM `Donation` WHERE Id IN (" + ids2 + ")");
    console.log("   matching NEW Donation rows:");
    dn.forEach(r => console.log("     Donation.Id=" + r.Id + " ReferenceNum=" + r.ReferenceNum +
      " ProviderReferenceNum=" + r.ProviderReferenceNum + " ReceiptNum=" + r.ReceiptNum +
      " MoreProviderDetails=" + (r.MoreProviderDetails ? String(r.MoreProviderDetails).substring(0, 80) : null)));
    const carries = dn.some(r =>
      br.some(b => [r.ReferenceNum, r.ProviderReferenceNum, r.ReceiptNum].map(x => x == null ? "" : String(x)).includes(String(b.AsakimID))) );
    console.log("   AsakimID present in new Donation columns: " + (carries ? "YES" : "NO  <-- join bridge exists ONLY in old MSSQL Orders.AsakimID"));
  }

  line();
  console.log(problems === 0
    ? "RESULT: all automated checks PASSED ✓ (review sections 4-6 observations above)"
    : "RESULT: " + problems + " problem(s) flagged — see *** markers above");
  return finish();
}

run().catch(e => { console.error("FATAL:", e.message); finish().then(() => process.exit(1)); });
