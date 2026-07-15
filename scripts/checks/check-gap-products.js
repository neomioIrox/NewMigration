#!/usr/bin/env node
/** READ-ONLY. Profiles the in-scope products that did NOT migrate (donation gap). */
const mssql = require("../../server/src/db/mssql");
const scope = require("../../server/data/scope-products.json");
const { preloadFKCache } = require("../../server/src/engine/fk-resolver");

(async () => {
  const funds = await preloadFKCache("ProjectItem_funds");
  const cert = await preloadFKCache("ProjectItem_certificate");
  const don = await preloadFKCache("ProjectItem_donation");
  const prayer = await preloadFKCache("ProjectItem_prayerName");
  const resolves = (id) => funds.get(String(id)) || cert.get(String(id)) || don.get(String(id)) || prayer.get(String(id));

  const unresolved = (scope.productIds || []).map(Number).filter((id) => !resolves(id));
  console.log("unresolved in-scope products: " + unresolved.length);

  const rows = (await mssql.query(
    "SELECT productsid, ProjectType, DisplayAsGroup, Terminal, Name, DateCreated" +
    " FROM Products WITH (NOLOCK) WHERE productsid IN (" + unresolved.join(",") + ")" +
    " ORDER BY productsid")).recordset;
  console.log("\nfull list of unmigrated in-scope products:");
  rows.forEach((p) => console.log(
    "  id=" + String(p.productsid).padStart(6) +
    " type=" + String(p.ProjectType).padEnd(4) +
    " grp=" + String(p.DisplayAsGroup).padEnd(6) +
    " term=" + String(p.Terminal).padEnd(5) +
    " created=" + (p.DateCreated ? String(p.DateCreated).slice(0, 10) : "null") +
    " name=" + JSON.stringify((p.Name || "").slice(0, 40))));

  const d = (await mssql.query(
    "SELECT ProjectId, COUNT(*) cnt, SUM(CAST(ISNULL(Total,0) AS float)) total" +
    " FROM Orders WITH (NOLOCK) WHERE ChargeStatus='OrderFinished' AND DateCreated>='2025-06-01'" +
    " AND ProjectId IN (" + unresolved.join(",") + ") GROUP BY ProjectId ORDER BY COUNT(*) DESC")).recordset;
  let totDon = 0, totMoney = 0;
  console.log("\nin-scope completed donations landing in WRONG bucket (general) per gap product:");
  d.forEach((r) => { totDon += r.cnt; totMoney += r.total; console.log("  ProjectId " + String(r.ProjectId).padStart(6) + " -> " + String(r.cnt).padStart(5) + " donations, " + Math.round(r.total) + " total"); });
  console.log("\nTOTAL misrouted: " + totDon + " donations, " + Math.round(totMoney) + " money, across " + d.length + " products");
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
