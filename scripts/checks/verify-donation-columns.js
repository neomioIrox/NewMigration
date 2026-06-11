#!/usr/bin/env node
/**
 * READ-ONLY. Post-migration column-level verification of Donation.
 * 1) Row-by-row: sample N donations, recompute every mapped field with the ENGINE'S OWN
 *    mappers from the source row, and diff against what is stored in the target.
 * 2) Aggregates: NULL/zero rates per column target-vs-source-expectation.
 *
 * Usage: node scripts/checks/verify-donation-columns.js [sampleSize=2000]
 */
const mssql = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const DonationEngine = require("../../server/src/engine/donation-engine");
const { preloadFKCache } = require("../../server/src/engine/fk-resolver");

const SAMPLE = Number(process.argv[2] || 2000);

(async () => {
  const eng = new DonationEngine({ dryRun: true });
  eng.projectItemFundsCache = await preloadFKCache("ProjectItem_funds");
  eng.projectItemCertCache = await preloadFKCache("ProjectItem_certificate");
  eng.projectItemDonationCache = await preloadFKCache("ProjectItem_donation");
  eng.projectItemPrayerCache = await preloadFKCache("ProjectItem_prayerName");
  eng.userIdCache = await preloadFKCache("CustomerUser");
  eng.recruiterIdCache = await preloadFKCache("RecruiterMapping");
  await eng._preloadClearingMethodAreas();
  await eng._preloadSourceCodes();

  // ---- sample target rows (every Nth id for spread) ----
  const [tRows] = await targetDb.query(
    "SELECT * FROM Donation ORDER BY RAND() LIMIT " + SAMPLE);
  const ids = tRows.map((r) => r.Id);
  const tById = new Map(tRows.map((r) => [Number(r.Id), r]));

  // ---- fetch matching source rows ----
  const src = (await mssql.query(
    "SELECT " + eng._getSelectColumns() + " FROM Orders WITH (NOLOCK) WHERE OrdersId IN (" + ids.join(",") + ")")).recordset;

  const mismatch = {}; const note = (f, sid, want, got) => {
    (mismatch[f] = mismatch[f] || { count: 0, samples: [] }).count++;
    if (mismatch[f].samples.length < 3) mismatch[f].samples.push({ id: sid, want: want, got: got });
  };
  const eq = (a, b) => {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    if (typeof a === "number" || typeof b === "number") return Math.abs(Number(a) - Number(b)) < 0.01;
    return String(a) === String(b);
  };
  const bit = (v) => (v === null || v === undefined) ? null : (Buffer.isBuffer(v) ? v[0] : Number(v));

  let checked = 0;
  for (const row of src) {
    const t = tById.get(Number(row.OrdersId)); if (!t) continue; checked++;
    const cma = eng._getClearingMethodAreaSync(row.PaymentMethod, row.OrderLaguage, row.ChargeCurrency);
    const srcAttr = eng._resolveSource(row.UserSource);
    const amount = eng._authoritativeAmount(row);
    const expect = {
      ItemId: eng._determineItemId(row),
      Status: eng._mapStatus(row.ChargeStatus),
      Currency: eng._mapCurrency(row.ChargeCurrency || row.OrderCurrency),
      LanguageId: eng._mapLanguage(row.OrderLaguage),
      MonthlySum: eng._calcMonthlySum(amount, row.Payments),
      PaymentsCount: row.Payments || 1,
      PaymentType: row.DonationType === "FixedDonation" ? 1 : 2,
      ReferenceNum: eng._trunc(row.ReferenceCode, 50),
      ClearingMethodAreaId: cma ? cma.Id : null,
      ClearingMethodTerminalNum: eng._trunc(row.TerminalNumber, 50),
      ProviderReferenceNum: eng._trunc(row.InternalDealNumber, 50),
      ProviderApprovalNum: eng._trunc(row.TokenApprovalNumber, 100),
      ProviderResultCode: eng._trunc(row.ChargeResultNum, 10),
      ReceiptBy: cma ? cma.ReceiptBy : null,
      ReceiptForCountry: cma ? cma.Area : null,
      ReceiptNum: row.AsakimInvoiceID || null,
      UserId: eng._resolveUserId(row.UserId),
      DonorFirstName: eng._trunc(row.BillingFirstName, 100),
      DonorLastName: eng._trunc(row.BillingLastName, 300),
      DonorEmail: eng._trunc(row.Email, 100),
      DonorPhone: eng._trunc(row.Phone, 100),
      SourceType: srcAttr.type,
      SourceId: srcAttr.id,
      UnknownSourceCode: srcAttr.code,
      RecruiterId: eng._resolveRecruiterId(row.RecruiterId, row.UserSource),
      SourceApp: eng._mapSourceApp(row.IsManualDonation, row.PaymentMethod, row.AsakimID),
      SourceIP: eng._trunc(row.Ip, 200),
      EngravingName: eng._trunc(row.CertificateFullName, 300),
      DisplayName: eng._trunc(row.UserFullName, 30),
      CustomerComments: row.UserComments || null,
      RecordStatus: 2, TreatStatus: 1,
      DisplayCurrency: eng._mapCurrency(row.ChargeCurrency || row.OrderCurrency),
      DisplayMonthlySum: eng._calcMonthlySum(amount, row.Payments),
    };
    for (const f of Object.keys(expect)) {
      if (!eq(expect[f], t[f])) note(f, row.OrdersId, expect[f], t[f]);
    }
    // bit fields
    const wantPost = row.AnonymousUser ? 0 : 1;
    if (bit(t.SendReceiptByPost) !== wantPost) note("SendReceiptByPost", row.OrdersId, wantPost, bit(t.SendReceiptByPost));
    const wantAnon = row.AnonymousUserName ? 1 : 0;
    if (bit(t.DisplayAsAnonymous) !== wantAnon) note("DisplayAsAnonymous", row.OrdersId, wantAnon, bit(t.DisplayAsAnonymous));
  }

  console.log("row-by-row checked: " + checked + " / sample " + SAMPLE);
  const keys = Object.keys(mismatch);
  if (!keys.length) console.log("ALL COLUMNS MATCH on the sample ✅");
  else {
    console.log("MISMATCHED COLUMNS:");
    keys.sort((a, b) => mismatch[b].count - mismatch[a].count).forEach((f) => {
      const m = mismatch[f];
      console.log("  " + f + ": " + m.count + " rows (" + (m.count / checked * 100).toFixed(1) + "%)");
      m.samples.forEach((s) => console.log("     id=" + s.id + " expected=" + JSON.stringify(s.want) + " stored=" + JSON.stringify(s.got)));
    });
  }

  // ---- aggregates on full table ----
  const [agg] = await targetDb.query(
    "SELECT COUNT(*) total," +
    " SUM(ItemId=1) itemDefault, SUM(UserId IS NULL) userNull, SUM(RecruiterId IS NULL) recNull," +
    " SUM(ClearingMethodAreaId IS NULL) cmaNull, SUM(ReceiptForCountry IS NULL) rfcNull," +
    " SUM(LanguageId IS NULL) langNull, SUM(ReceiptAddress IS NOT NULL) hasReceiptAddr," +
    " SUM(ShippingAddress IS NOT NULL) hasShipAddr, SUM(ReceiptNum IS NOT NULL) hasReceiptNum" +
    " FROM Donation");
  const a = agg[0];
  console.log("\nfull-table aggregates (" + a.total + " rows):");
  console.log("  ItemId=1 (general bucket): " + a.itemDefault + "  (expected ~40,248)");
  console.log("  UserId NULL: " + a.userNull + "  | RecruiterId NULL: " + a.recNull);
  console.log("  ClearingMethodAreaId NULL: " + a.cmaNull + "  (expected ~264)");
  console.log("  ReceiptForCountry NULL: " + a.rfcNull + "  (expected ~264)");
  console.log("  LanguageId NULL: " + a.langNull);
  console.log("  has ReceiptAddress: " + a.hasReceiptAddr + " | has ShippingAddress: " + a.hasShipAddr + " | has ReceiptNum: " + a.hasReceiptNum);

  const [cv] = await targetDb.query("SELECT COUNT(*) c FROM DonationCurrencyValue");
  const [al] = await targetDb.query("SELECT COUNT(*) c FROM DonationActionLog");
  const [ad] = await targetDb.query("SELECT COUNT(*) c, SUM(Country<>1) nonIsrael FROM Address");
  console.log("  DonationCurrencyValue: " + cv[0].c + " | DonationActionLog: " + al[0].c + " | Address: " + ad[0].c + " (non-Israel: " + ad[0].nonIsrael + ")");

  await targetDb.close();
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
