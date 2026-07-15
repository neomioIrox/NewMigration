#!/usr/bin/env node
/** READ-ONLY. Verifies the user's productsid->Terminal assignments against source Products. */
const mssql = require("../../server/src/db/mssql");
const scope = require("../../server/data/scope-products.json");
const scopeSet = new Set((scope.productIds || []).map(Number));
const gap22 = new Set([685, 28, 570, 427, 30, 892, 893, 616, 623, 676, 2, 506, 354, 363, 665, 422, 486, 1015, 704, 739, 941, 425]);

// user's list:
const assign = [[685,1],[28,1],[570,4],[427,4],[30,1],[892,4],[893,4],[616,4],[623,4],[676,1],[2,4],[406,4],[354,1],[363,1],[665,1],[422,4],[484,4],[1015,4],[704,1],[739,1],[941,1],[425,4]];
const suspects = [406, 506, 484, 486];

(async () => {
  const all = [...new Set([...assign.map((a) => a[0]), ...suspects])];
  const rows = (await mssql.query(
    "SELECT productsid, Terminal, Name, CASE WHEN Terminal IS NULL THEN 'NULL' ELSE CAST(Terminal AS varchar) END termRaw" +
    " FROM Products WITH (NOLOCK) WHERE productsid IN (" + all.join(",") + ")")).recordset;
  const byId = new Map(rows.map((r) => [Number(r.productsid), r]));

  console.log("user's assignments vs source:");
  console.log("  pid  | ->T | exists | curTerm | inScope | inGap22 | name");
  assign.forEach(([pid, t]) => {
    const r = byId.get(pid);
    console.log("  " + String(pid).padStart(5) + " |  " + t + "  | " + (r ? "  Y   " : "  N   ") +
      " | " + (r ? r.termRaw.padEnd(5) : "  -  ") + "   | " + (scopeSet.has(pid) ? "Y" : ".") +
      "       | " + (gap22.has(pid) ? "Y" : ".") + "       | " + (r ? (r.Name || "").trim().slice(0, 35) : "<<NOT FOUND>>"));
  });

  console.log("\nsuspect comparison (typo check):");
  suspects.forEach((pid) => {
    const r = byId.get(pid);
    console.log("  " + String(pid).padStart(5) + " : exists=" + (r ? "Y" : "N") +
      " curTerm=" + (r ? r.termRaw : "-") + " inScope=" + (scopeSet.has(pid) ? "Y" : ".") +
      " inGap22=" + (gap22.has(pid) ? "Y" : ".") + " name=" + (r ? (r.Name || "").trim().slice(0, 35) : "-"));
  });
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
