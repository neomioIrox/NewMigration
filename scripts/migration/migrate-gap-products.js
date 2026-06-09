#!/usr/bin/env node
/**
 * LIVE WRITE (authorized). Migrates the 22 previously-NULL-Terminal in-scope products
 * that now have Terminal set (12 Funds, 10 Collections). Runs the SAME production mappings
 * (Funds_Fixed + Collections_Fixed) but scoped to these 22 ids via an extra whereClause,
 * so already-migrated products are untouched (no PK collisions on preserveSourceId).
 *
 * A future FULL run needs no special handling: these ids are now in TerminalProducts.xlsx
 * and in scope-products.json, so the normal Terminal=1/4 filter will pick them up.
 *
 * Usage: node scripts/migration/migrate-gap-products.js
 */
const path = require("path");
const MigrationEngine = require("../../server/src/engine/migration-engine");

const IDS = [3, 19, 82, 109, 142, 162, 168, 268, 277, 315];
const INLIST = IDS.join(",");

function loadMapping(file) {
  const m = JSON.parse(JSON.stringify(require(path.join(__dirname, "../../server/mappings/", file))));
  m.whereClause = "(" + m.whereClause + ") AND productsid IN (" + INLIST + ")";
  return m;
}

async function runMapping(file, label) {
  const m = loadMapping(file);
  const eng = new MigrationEngine(m, { batchSize: 500 });
  eng.on("started", (d) => console.log("[" + label + "] started run=" + d.runId + " matched=" + d.totalRows));
  eng.on("error", (d) => console.log("[" + label + "] ENGINE ERROR: " + d.error));
  const res = await eng.run();
  console.log("[" + label + "] " + res.status + " counters=" + JSON.stringify(res.counters));
  return res;
}

(async () => {
  console.log("Migrating 22 gap products (scoped). IDs: " + INLIST + "\n");
  const fr = await runMapping("ProjectMapping_Funds_Fixed.json", "Funds");
  const cr = await runMapping("ProjectMapping_Collections_Fixed.json", "Collections");
  console.log("\nTOTAL inserted: " + ((fr.counters.inserted || 0) + (cr.counters.inserted || 0)) +
    " | errors: " + ((fr.counters.errors || 0) + (cr.counters.errors || 0)) +
    " | skipped: " + ((fr.counters.skipped || 0) + (cr.counters.skipped || 0)));
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e.message, "\n", e.stack); process.exit(1); });
