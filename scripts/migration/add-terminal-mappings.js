#!/usr/bin/env node
/**
 * Adds the 22 in-scope NULL-Terminal products to legacy/data/TerminalProducts.xlsx.
 * - product 427 already exists in the file (Terminal=10) -> updates it to the assigned value.
 * - the other 21 are appended as new rows {productsid, ProjectNumber, Terminal, name, ShortDescription}.
 * Names are pulled live from source Products for accuracy. Backup already made (.bak).
 *
 * Usage: node scripts/migration/add-terminal-mappings.js
 */
const path = require("path");
const XLSX = require(path.join(__dirname, "../../node_modules/xlsx"));
const mssql = require("../../server/src/db/mssql");

// Batch 2: 10 Terminal=null products masked earlier by a prayer-id collision (user-supplied Terminals):
const ASSIGN = [
  [3, 4], [19, 1], [82, 1], [109, 4], [142, 4], [162, 4], [168, 4], [268, 4], [277, 4], [315, 4],
];
const assignMap = new Map(ASSIGN.map((a) => [a[0], a[1]]));
const excelPath = path.join(__dirname, "../../legacy/data/TerminalProducts.xlsx");

(async () => {
  // names from source
  const ids = ASSIGN.map((a) => a[0]);
  const nameRows = (await mssql.query(
    "SELECT productsid, Name, ProjectNumber FROM Products WITH (NOLOCK) WHERE productsid IN (" + ids.join(",") + ")")).recordset;
  const meta = new Map(nameRows.map((r) => [Number(r.productsid), r]));

  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  const existing = new Set(rows.map((r) => Number(r.productsid)));

  let updated = 0, appended = 0;
  // update any already-present pids (e.g. 427)
  rows.forEach((r) => {
    const pid = Number(r.productsid);
    if (assignMap.has(pid)) { r.Terminal = assignMap.get(pid); updated++; }
  });
  // append the rest
  ASSIGN.forEach(([pid, t]) => {
    if (existing.has(pid)) return;
    const m = meta.get(pid) || {};
    rows.push({ productsid: pid, ProjectNumber: m.ProjectNumber || "", Terminal: t, name: (m.Name || "").trim(), ShortDescription: "" });
    appended++;
  });

  const newWs = XLSX.utils.json_to_sheet(rows, { header: ["productsid", "ProjectNumber", "Terminal", "name", "ShortDescription"] });
  wb.Sheets[sheetName] = newWs;
  XLSX.writeFile(wb, excelPath);

  console.log("Excel updated: " + path.relative(process.cwd(), excelPath));
  console.log("  rows now: " + rows.length + " | updated-in-place: " + updated + " | appended: " + appended);
  // verify all 22 present with correct terminal
  const check = XLSX.utils.sheet_to_json(XLSX.readFile(excelPath).Sheets[sheetName]);
  const byId = new Map(check.map((r) => [Number(r.productsid), r.Terminal]));
  let ok = 0; ASSIGN.forEach(([pid, t]) => { if (byId.get(pid) === t) ok++; else console.log("  MISMATCH pid=" + pid + " want=" + t + " got=" + byId.get(pid)); });
  console.log("  verified " + ok + "/22 present with correct Terminal");
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
