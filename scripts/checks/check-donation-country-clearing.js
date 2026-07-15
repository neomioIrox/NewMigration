#!/usr/bin/env node
/**
 * READ-ONLY. Diagnoses the two "country" concerns in the Donation migration:
 *
 *  (A) מדינת הסליקה / Clearing area  -> Donation.ClearingMethodAreaId + ReceiptForCountry (lutclearingarea 1-5)
 *  (B) מדינת התשלום / Payment country -> Address.Country (lutcountry 1-17)
 *
 * It does NOT guess: it loads the live lookup tables, then runs the ENGINE'S OWN
 * mapping functions (_getClearingMethodAreaIdSync / _mapArea / _mapClearingMethod)
 * against the real source distribution (scoped: OrderFinished AND DateCreated >= cutoff)
 * to quantify exactly how many donations would get a NULL ClearingMethodAreaId and why.
 *
 * No writes. Usage: node scripts/checks/check-donation-country-clearing.js
 */
const mssql = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const DonationEngine = require("../../server/src/engine/donation-engine");
const donScope = require("../../server/data/scope-products.json");

const CUTOFF = donScope.cutoff || "2025-06-01";
const SCOPE = " WHERE ChargeStatus='OrderFinished' AND DateCreated >= '" + CUTOFF + "'";

function pad(v, n) { return String(v === null || v === undefined ? "NULL" : v).padEnd(n); }
function padL(v, n) { return String(v === null || v === undefined ? "NULL" : v).padStart(n); }
function hr(t) { console.log("\n" + "=".repeat(78) + "\n" + t + "\n" + "=".repeat(78)); }

(async () => {
  console.log("Donation country/clearing diagnostic | cutoff: " + CUTOFF);

  // ---------------------------------------------------------------------------
  // 1. Live lookup tables (target)
  // ---------------------------------------------------------------------------
  hr("1. LutClearingArea (אזורי סליקה — היעד של ClearingMethodArea.Area + ReceiptForCountry)");
  const [areas] = await targetDb.query("SELECT Id, Description, DefaultCurrency FROM LutClearingArea ORDER BY Id");
  areas.forEach((a) => console.log("  " + padL(a.Id, 3) + " | " + pad(a.Description, 30) + " | DefaultCurrency=" + a.DefaultCurrency));

  hr("2. LutCountry (מדינות אמיתיות — היעד של Address.Country)");
  const [countries] = await targetDb.query("SELECT Id, Description FROM LutCountry ORDER BY Id");
  countries.forEach((c) => console.log("  " + padL(c.Id, 3) + " | " + c.Description));

  hr("3. ClearingMethod (לאימות מספור ה-ID שבקוד המנוע)");
  const [methods] = await targetDb.query("SELECT Id, Name FROM ClearingMethod ORDER BY Id");
  methods.forEach((m) => console.log("  " + padL(m.Id, 3) + " | " + m.Name));

  hr("4. ClearingMethodArea (הקומבינציות שבאמת קיימות: ClearingMethodId + Area -> Id, ReceiptBy)");
  const [cma] = await targetDb.query(
    "SELECT Id, ClearingMethodId, Area, ReceiptBy FROM ClearingMethodArea ORDER BY ClearingMethodId, Area");
  console.log("  CMA.Id | ClearingMethodId | Area | ReceiptBy");
  cma.forEach((r) => console.log("  " + padL(r.Id, 6) + " | " + padL(r.ClearingMethodId, 16) + " | " + padL(r.Area, 4) + " | " + r.ReceiptBy));

  // ---------------------------------------------------------------------------
  // 2. Run the ENGINE's real mappers over the scoped source distribution
  // ---------------------------------------------------------------------------
  const engine = new DonationEngine({ dryRun: true });
  await engine._preloadClearingMethodAreas(); // fills engine.clearingMethodAreaCache from live DB

  hr("5. סימולציה: התפלגות (PaymentMethod x OrderLaguage x ChargeCurrency) בסקופ");
  const combosSql =
    "SELECT PaymentMethod, OrderLaguage, ChargeCurrency, COUNT(*) AS cnt" +
    " FROM Orders WITH (NOLOCK)" + SCOPE +
    " GROUP BY PaymentMethod, OrderLaguage, ChargeCurrency" +
    " ORDER BY cnt DESC";
  const combos = (await mssql.query(combosSql)).recordset;

  let total = 0, nullCma = 0;
  const nullBreakdown = [];
  console.log("  cnt    | PaymentMethod      | Lang | ChargeCurrency | -> ClearingMethodId | Area | CMAId");
  combos.forEach((c) => {
    total += c.cnt;
    const cmId = engine._mapClearingMethod(c.PaymentMethod, c.OrderLaguage, c.ChargeCurrency);
    const area = engine._mapArea(c.OrderLaguage, c.ChargeCurrency);
    const cmaId = engine._getClearingMethodAreaIdSync(c.PaymentMethod, c.OrderLaguage, c.ChargeCurrency);
    if (cmaId === null) { nullCma += c.cnt; nullBreakdown.push({ c, cmId, area }); }
    // print top 30 rows to keep output readable
    if (combos.indexOf(c) < 30) {
      console.log("  " + padL(c.cnt, 6) + " | " + pad(c.PaymentMethod, 18) + " | " + pad(c.OrderLaguage, 4) +
        " | " + pad(JSON.stringify(c.ChargeCurrency), 14) + " | " + padL(cmId, 18) + " | " + padL(area, 4) + " | " + (cmaId === null ? "NULL ❌" : cmaId));
    }
  });

  hr("6. סיכום ClearingMethodAreaId");
  console.log("  סה\"כ תרומות בסקופ:           " + total);
  console.log("  יקבלו ClearingMethodAreaId:  " + (total - nullCma));
  console.log("  יקבלו NULL (בעיה):           " + nullCma + "  (" + (total ? ((nullCma / total) * 100).toFixed(1) : 0) + "%)");
  if (nullBreakdown.length) {
    console.log("\n  פירוט הקומבינציות שמייצרות NULL (חיפוש " + "ClearingMethodId_Area" + " שלא קיים ב-clearingmethodarea):");
    nullBreakdown.sort((a, b) => b.c.cnt - a.c.cnt).slice(0, 25).forEach((x) =>
      console.log("    " + padL(x.c.cnt, 6) + " | method=" + pad(x.c.PaymentMethod, 16) +
        " lang=" + pad(x.c.OrderLaguage, 4) + " cur=" + pad(JSON.stringify(x.c.ChargeCurrency), 12) +
        " -> needs (" + x.cmId + "," + x.area + ")"));
  }

  // ---------------------------------------------------------------------------
  // 3. Payment-country source values (for building the Address.Country dictionary)
  // ---------------------------------------------------------------------------
  for (const col of ["BillingCountry", "CertificateCountry"]) {
    hr("7. " + col + " — ערכים ייחודיים בסקופ (לבניית מילון -> lutcountry)");
    const rows = (await mssql.query(
      "SELECT LTRIM(RTRIM(ISNULL(" + col + ",'<NULL>'))) AS val, COUNT(*) AS cnt" +
      " FROM Orders WITH (NOLOCK)" + SCOPE +
      " GROUP BY LTRIM(RTRIM(ISNULL(" + col + ",'<NULL>'))) ORDER BY cnt DESC")).recordset;
    console.log("  distinct values: " + rows.length + " (showing top 40)");
    rows.slice(0, 40).forEach((r) => console.log("    " + padL(r.cnt, 7) + " | " + JSON.stringify(r.val)));
  }

  await targetDb.close();
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
