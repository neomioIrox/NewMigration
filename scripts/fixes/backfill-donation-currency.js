#!/usr/bin/env node
/**
 * Backfills currency/amount on EXISTING migrated donations (mirrors the engine fix):
 *  1) Currency label: ChargeCurrency "C$" was unmapped -> stored as 1 (NIS). Correct to 5 (CAD).
 *     (Also corrects Currency/DisplayCurrency for any other row where stored label differs
 *      from _mapCurrency(ChargeCurrency||OrderCurrency) under the NEW mapping.)
 *  2) Amount: where ChargeCurrency is set and ChargeTotal>0 differs from Total, MonthlySum and
 *     DisplayMonthlySum were computed from Total (ORDER currency) — recompute from ChargeTotal
 *     (the amount in the SAME currency as the label): round(ChargeTotal/Payments, 2).
 *
 * DRY-RUN by default. Usage: node scripts/fixes/backfill-donation-currency.js [--apply]
 */
const mssql = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const DonationEngine = require("../../server/src/engine/donation-engine");

const APPLY = process.argv.includes("--apply");
const CHUNK = 1000;
const eng = new DonationEngine({ dryRun: true });

(async () => {
  console.log((APPLY ? "APPLY" : "DRY-RUN") + " | donation currency/amount backfill\n");

  // candidate rows: any non-empty ChargeCurrency (the label source) — 37,398 rows
  const rows = (await mssql.query(
    "SELECT OrdersId, LTRIM(RTRIM(ChargeCurrency)) AS cc, Currency AS oc, Total, ChargeTotal, Payments" +
    " FROM Orders WITH (NOLOCK)" +
    " WHERE ChargeStatus='OrderFinished' AND DateCreated>='2025-06-01' AND LTRIM(RTRIM(ISNULL(ChargeCurrency,'')))<>''")).recordset;
  console.log("source rows with ChargeCurrency: " + rows.length);

  // current stored values for those donations
  const ids = rows.map((r) => r.OrdersId);
  const stored = new Map();
  for (let i = 0; i < ids.length; i += 10000) {
    const [t] = await targetDb.query(
      "SELECT Id, Currency, MonthlySum FROM Donation WHERE Id IN (" + ids.slice(i, i + 10000).join(",") + ")");
    t.forEach((r) => stored.set(Number(r.Id), r));
  }

  const currencyFix = new Map(); // newCurrency -> [ids]
  const amountFix = [];          // {id, newSum}
  for (const r of rows) {
    const t = stored.get(Number(r.OrdersId)); if (!t) continue;
    const wantCur = eng._mapCurrency(r.cc || r.oc);
    if (Number(t.Currency) !== wantCur) {
      if (!currencyFix.has(wantCur)) currencyFix.set(wantCur, []);
      currencyFix.get(wantCur).push(r.OrdersId);
    }
    const amount = eng._authoritativeAmount({ ChargeCurrency: r.cc, ChargeTotal: r.ChargeTotal, Total: r.Total });
    const wantSum = eng._calcMonthlySum(amount, r.Payments);
    if (Math.abs(Number(t.MonthlySum) - wantSum) > 0.05) amountFix.push({ id: r.OrdersId, sum: wantSum });
  }

  console.log("plan: currency-label fixes: " + [...currencyFix.values()].reduce((s, a) => s + a.length, 0) +
    " (" + [...currencyFix.entries()].map(([c, a]) => "->" + c + ":" + a.length).join(", ") + ")");
  console.log("      amount fixes (MonthlySum from ChargeTotal): " + amountFix.length);
  amountFix.slice(0, 5).forEach((f) => console.log("        id=" + f.id + " newMonthlySum=" + f.sum));

  if (!APPLY) { console.log("\nDRY-RUN only. Re-run with --apply to write."); await targetDb.close(); process.exit(0); }

  let updCur = 0, updSum = 0;
  for (const [cur, list] of currencyFix) {
    for (let i = 0; i < list.length; i += 5000) {
      const chunk = list.slice(i, i + 5000);
      const [r] = await targetDb.query(
        "UPDATE Donation SET Currency=" + Number(cur) + ", DisplayCurrency=" + Number(cur) +
        " WHERE Id IN (" + chunk.join(",") + ")");
      updCur += r.affectedRows;
    }
  }
  for (let i = 0; i < amountFix.length; i += CHUNK) {
    const chunk = amountFix.slice(i, i + CHUNK);
    const cases = chunk.map((f) => "WHEN " + Number(f.id) + " THEN " + Number(f.sum)).join(" ");
    const inList = chunk.map((f) => Number(f.id)).join(",");
    const [r] = await targetDb.query(
      "UPDATE Donation SET MonthlySum=CASE Id " + cases + " END, DisplayMonthlySum=CASE Id " + cases + " END" +
      " WHERE Id IN (" + inList + ")");
    updSum += r.affectedRows;
  }
  console.log("updated: currency=" + updCur + " | amounts=" + updSum);

  const [v] = await targetDb.query("SELECT Currency, COUNT(*) c FROM Donation GROUP BY Currency ORDER BY Currency");
  console.log("\nAFTER — Donation by Currency: " + v.map((r) => r.Currency + ":" + r.c).join(" | "));
  await targetDb.close(); process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
