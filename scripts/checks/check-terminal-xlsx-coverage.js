#!/usr/bin/env node
/** READ-ONLY (reads Excel only, no DB writes). Checks whether the 22 in-scope
 * Terminal=NULL products are present in legacy/data/TerminalProducts.xlsx. */
const path = require("path");
const XLSX = require(path.join(__dirname, "../../node_modules/xlsx"));

const excelPath = path.join(__dirname, "../../legacy/data/TerminalProducts.xlsx");
const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

console.log("sheet: " + wb.SheetNames[0] + " | rows: " + rows.length);
console.log("columns: " + Object.keys(rows[0] || {}).join(", "));
const dist = {};
rows.forEach((r) => { const t = r.Terminal === undefined ? "<none>" : r.Terminal; dist[t] = (dist[t] || 0) + 1; });
console.log("Terminal distribution in Excel: " + JSON.stringify(dist));

const byPid = new Map();
rows.forEach((r) => byPid.set(Number(r.productsid), r.Terminal));

const target = [685, 28, 570, 427, 30, 892, 893, 616, 623, 676, 2, 506, 354, 363, 665, 422, 486, 1015, 704, 739, 941, 425];
console.log("\nare our 22 null-Terminal products in the Excel?");
let inExcel = 0, withValidTerm = 0;
target.forEach((pid) => {
  const has = byPid.has(pid);
  const t = byPid.get(pid);
  if (has) { inExcel++; if (t === 1 || t === 4) withValidTerm++; }
  console.log("  " + String(pid).padStart(7) + " : " + (has ? "IN excel, Terminal=" + t : "NOT in excel"));
});
console.log("\nsummary: " + inExcel + "/22 present in Excel; " + withValidTerm + "/22 would get a valid Terminal (1 or 4)");
