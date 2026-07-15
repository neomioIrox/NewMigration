#!/usr/bin/env node
/**
 * LIVE WRITE (authorized): updates source MSSQL products.Terminal for the 22 in-scope
 * products, matching the assignments added to TerminalProducts.xlsx.
 * Records before/after state. Before-state is uniform NULL, so reversible by setting back to NULL.
 *
 * Usage: node scripts/migration/apply-terminal-updates.js
 */
const mssql = require("../../server/src/db/mssql");

// Batch 2: 10 Terminal=null products (user-supplied Terminals)
const ASSIGN = [
  [3, 4], [19, 1], [82, 1], [109, 4], [142, 4], [162, 4], [168, 4], [268, 4], [277, 4], [315, 4],
];

(async () => {
  const ids = ASSIGN.map((a) => a[0]).join(",");
  const before = (await mssql.query(
    "SELECT productsid, CASE WHEN Terminal IS NULL THEN 'NULL' ELSE CAST(Terminal AS varchar) END t" +
    " FROM Products WITH (NOLOCK) WHERE productsid IN (" + ids + ")")).recordset;
  const beforeMap = new Map(before.map((r) => [Number(r.productsid), r.t]));
  console.log("BEFORE: " + before.length + " products found; terminal values: " +
    JSON.stringify([...beforeMap.values()].reduce((a, v) => { a[v] = (a[v] || 0) + 1; return a; }, {})));

  const pool = await mssql.getPool();
  let updated = 0, errors = 0;
  for (const [pid, t] of ASSIGN) {
    try {
      const r = await pool.request().input("t", t).input("pid", pid)
        .query("UPDATE products SET Terminal=@t WHERE productsid=@pid");
      updated += r.rowsAffected[0];
    } catch (e) { errors++; console.log("  ERROR pid=" + pid + ": " + e.message); }
  }
  console.log("UPDATE done: rowsAffected=" + updated + " errors=" + errors);

  const after = (await mssql.query(
    "SELECT productsid, Terminal FROM Products WITH (NOLOCK) WHERE productsid IN (" + ids + ")")).recordset;
  const afterMap = new Map(after.map((r) => [Number(r.productsid), r.Terminal]));
  let ok = 0;
  ASSIGN.forEach(([pid, t]) => { if (afterMap.get(pid) === t) ok++; else console.log("  MISMATCH pid=" + pid + " want=" + t + " got=" + afterMap.get(pid)); });
  console.log("AFTER: verified " + ok + "/22 now have the assigned Terminal");
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
