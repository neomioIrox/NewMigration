#!/usr/bin/env node
/** READ-ONLY. Lists the in-scope products with Terminal=NULL that did not migrate,
 * with name + completed in-scope donation count + money. Writes a CSV to reports/. */
const fs = require("fs");
const path = require("path");
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
  const IN = unresolved.join(",");

  const rows = (await mssql.query(
    "SELECT p.productsid, p.Name, p.Name_en," +
    " (SELECT COUNT(*) FROM Orders o WITH (NOLOCK) WHERE o.ProjectId=p.productsid AND o.ChargeStatus='OrderFinished' AND o.DateCreated>='" + (scope.cutoff || "2025-06-01") + "') AS donations," +
    " (SELECT SUM(CAST(ISNULL(o.Total,0) AS float)) FROM Orders o WITH (NOLOCK) WHERE o.ProjectId=p.productsid AND o.ChargeStatus='OrderFinished' AND o.DateCreated>='" + (scope.cutoff || "2025-06-01") + "') AS money" +
    " FROM Products p WITH (NOLOCK) WHERE p.productsid IN (" + IN + ") AND p.Terminal IS NULL" +
    " ORDER BY money DESC")).recordset;

  console.log("In-scope products with Terminal=NULL (did not migrate): " + rows.length + "\n");
  console.log("ProductId | donations |    money | Name");
  let td = 0, tm = 0;
  rows.forEach((r) => {
    td += Number(r.donations || 0); tm += Number(r.money || 0);
    console.log("  " + String(r.productsid).padStart(7) + " | " + String(r.donations || 0).padStart(9) + " | " + String(Math.round(r.money || 0)).padStart(8) + " | " + (r.Name || "").trim());
  });
  console.log("\n  TOTAL: " + rows.length + " products | " + td + " donations | " + Math.round(tm) + " money");

  // write CSV
  const csv = ["productsid,donations,money,name,name_en"]
    .concat(rows.map((r) => [r.productsid, r.donations || 0, Math.round(r.money || 0),
      '"' + String(r.Name || "").trim().replace(/"/g, '""') + '"',
      '"' + String(r.Name_en || "").trim().replace(/"/g, '""') + '"'].join(","))).join("\n");
  const out = path.join(__dirname, "../../reports/null-terminal-products.csv");
  fs.writeFileSync(out, "﻿" + csv, "utf8");
  console.log("\nCSV written: reports/null-terminal-products.csv");
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
