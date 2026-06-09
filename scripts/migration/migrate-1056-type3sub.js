#!/usr/bin/env node
/**
 * LIVE WRITE (authorized). Migrates ProductGroup sub-product 1056 via the Type3_Subs mapping,
 * collapsing it as a ProjectItem under its parent's existing Project (1055, "קרן חרום לסיוע
 * לתושבי הדרום", already migrated as a Fund). This routes 1056's 52 orphan donations to the
 * parent campaign. The Type3 freeze skipped this group because the parent is Terminal=4 (its
 * freeze only covered Terminal=1 parents).
 *
 * Usage: node scripts/migration/migrate-1056-type3sub.js
 */
const path = require("path");
const MigrationEngine = require("../../server/src/engine/migration-engine");

(async () => {
  const m = JSON.parse(JSON.stringify(require(path.join(__dirname, "../../server/mappings/ProjectMapping_Type3_Subs.json"))));
  m.scopeFilter = null;                 // bypass the frozen type3-subs list
  m.whereClause = "productsid = 1056";  // only this sub (src CTE exposes productsid)
  const eng = new MigrationEngine(m, { batchSize: 100 });
  eng.on("started", (d) => console.log("Type3_Subs[1056] started run=" + d.runId + " matched=" + d.totalRows));
  eng.on("error", (d) => console.log("ENGINE ERROR: " + d.error));
  const res = await eng.run();
  console.log("Type3_Subs[1056] " + res.status + " counters=" + JSON.stringify(res.counters));
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e.message, "\n", e.stack); process.exit(1); });
