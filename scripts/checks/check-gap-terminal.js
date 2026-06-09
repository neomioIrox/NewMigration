#!/usr/bin/env node
/** READ-ONLY. Exact Terminal value for each unresolved in-scope product. */
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

  const rows = (await mssql.query(
    "SELECT productsid, Terminal, ProjectType," +
    " CASE WHEN Terminal IS NULL THEN 'NULL' ELSE '['+CAST(Terminal AS varchar)+']' END AS termRaw" +
    " FROM Products WITH (NOLOCK) WHERE productsid IN (" + unresolved.join(",") + ") ORDER BY productsid")).recordset;
  console.log("Terminal value per unmigrated in-scope product:");
  rows.forEach((p) => console.log("  id=" + String(p.productsid).padStart(6) + "  Terminal=" + p.termRaw + "  ProjectType=" + (p.ProjectType === null ? "NULL" : p.ProjectType)));

  const nullT = rows.filter((r) => r.Terminal === null).length;
  console.log("\n  Terminal IS NULL: " + nullT + " / " + rows.length);
  console.log("  Terminal NOT NULL: " + (rows.length - nullT) + " (these had a terminal but still didn't migrate)");

  // context: overall Terminal distribution across ALL products, and how migration filters see them
  const dist = (await mssql.query(
    "SELECT CASE WHEN Terminal IS NULL THEN 'NULL' ELSE CAST(Terminal AS varchar) END AS t, COUNT(*) cnt" +
    " FROM Products WITH (NOLOCK) GROUP BY Terminal ORDER BY COUNT(*) DESC")).recordset;
  console.log("\nTerminal distribution across ALL products (migration keeps only 1 and 4):");
  dist.forEach((r) => console.log("  Terminal=" + String(r.t).padEnd(6) + " : " + r.cnt));
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
