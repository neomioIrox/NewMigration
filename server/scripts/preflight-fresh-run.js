// Pre-flight for the fresh-from-scratch pipeline run.
//
// Dry-run (default): read-only readiness report — target-wipe verification, tracker
// state, checkpoint rows, scope files, pipeline config, source Terminal gaps.
// --apply: ONLY when every blocker passes (target migration tables empty), wipes the
// TRACKER (clearAllHistory: id_mappings, row_status, migration_runs, migration_errors)
// and clears all MigrationCheckpoint rows on the target. The target DB itself is wiped
// by the user — this tool never deletes target business tables.
//
// Target wipe and tracker wipe MUST land together: VideoGallery is tracker-idempotent
// (target wiped + tracker kept => silently migrates 0 rows), PrayName/Asakim have no
// duplicate protection (tracker wiped + target kept => full duplicates).
//
// Usage: node scripts/preflight-fresh-run.js [--apply]

const fs = require("fs");
const path = require("path");
const mssqlDb = require("../src/db/mssql");
const targetDb = require("../src/db/mysql-target");
const trackerDb = require("../src/db/mysql-tracker");
const tracker = require("../src/services/tracker");
const { loadPipelineConfig } = require("../src/services/pipeline-config");

const APPLY = process.argv.includes("--apply");

// Every table the 19 pipeline steps write. Non-empty = blocker (the run would
// duplicate or dup-PK). Missing table = fine (dropped during wipe; engines recreate
// infra tables like LegacyMapping, the rest exist in the app schema).
const MUST_BE_EMPTY = [
  "Affiliate", "AffiliateUser", "Source", "CustomerUser", "LutFundCategory",
  "Project", "ProjectLocalization", "ProjectItem", "ProjectItemLocalization",
  "EntityContent", "EntityContentItem", "Media", "LinkSetting",
  "RecruitersGroup", "RecruitersGroupLanguage", "Recruiter", "RecruiterLocalization",
  "Gallery", "GalleryMedia", "VideoGalleryMedia", "FundCategory",
  "Donation", "DonationActionLog", "DonationCurrencyValue",
  "PrayName", "AsakimDonation", "LegacyMapping"
];

// App-shared tables: migration inserts rows here but the live app may own rows too.
// Reported as warnings only — the user decides.
const WARN_IF_NONEMPTY = ["Address"];

// Pre-populated LUTs the app needs — must NOT have been wiped.
const MUST_BE_NONEMPTY = ["LutCurrency", "LutRecordStatus", "LutProjectType", "LutPriceType"];

const SCOPE_FILES = ["scope-products.json", "type3-subs.json", "type3-parents.json", "type3-sub-parent.json"];

let blockers = [], warnings = [], infos = [];

async function targetCount(t) {
  try {
    const [rows] = await targetDb.query("SELECT COUNT(*) AS c FROM `" + t + "`");
    return rows[0].c;
  } catch (e) {
    if (/doesn't exist/.test(e.message)) return null; // missing table
    throw e;
  }
}

async function main() {
  console.log("=== Fresh-run preflight (" + (APPLY ? "APPLY" : "dry-run") + ") ===\n");

  // 1. Connectivity
  await mssqlDb.query("SELECT 1 AS ok");
  const [tz] = await targetDb.query("SELECT @@session.time_zone AS tz, DATABASE() AS db");
  await trackerDb.query("SELECT 1");
  console.log("connections OK (target db=" + tz[0].db + ", tz=" + tz[0].tz + ")");
  if (String(tz[0].tz).toUpperCase() !== "UTC" && tz[0].tz !== "+00:00")
    warnings.push("target session time_zone is '" + tz[0].tz + "' — expected UTC");

  // 2. No active runs
  const [active] = await trackerDb.query(
    "SELECT id, mapping_name, status FROM migration_runs WHERE status IN ('running','paused')");
  if (active.length) blockers.push("active/paused migration runs in tracker: " + JSON.stringify(active));
  const [pactive] = await trackerDb.query(
    "SELECT id, status FROM pipeline_runs WHERE status='running'").catch(() => [[]]);
  if (pactive && pactive.length) blockers.push("active pipeline run: " + JSON.stringify(pactive));

  // 3. Target wipe verification
  console.log("\n--- target tables (must be empty) ---");
  for (const t of MUST_BE_EMPTY) {
    const c = await targetCount(t);
    if (c === null) console.log("  " + t + ": missing (ok)");
    else if (c === 0) console.log("  " + t + ": empty");
    else { console.log("  " + t + ": " + c + " rows  <-- BLOCKER"); blockers.push("target." + t + " has " + c + " rows — wipe incomplete"); }
  }
  for (const t of WARN_IF_NONEMPTY) {
    const c = await targetCount(t);
    if (c) { console.log("  " + t + ": " + c + " rows (warning — app-shared table)"); warnings.push("target." + t + " has " + c + " rows (migration also writes here; verify they are app-owned)"); }
  }
  for (const t of MUST_BE_NONEMPTY) {
    const c = await targetCount(t);
    if (!c) { blockers.push("pre-populated LUT target." + t + " is empty/missing — target wipe went too far, app needs it"); console.log("  " + t + ": EMPTY  <-- BLOCKER (must stay populated)"); }
  }

  // 4. Tracker + checkpoint state
  const [[im]] = await trackerDb.query("SELECT COUNT(*) AS c FROM id_mappings");
  const [[mr]] = await trackerDb.query("SELECT COUNT(*) AS c FROM migration_runs");
  let cpRows = null;
  try {
    const [rows] = await targetDb.query("SELECT COUNT(*) AS c FROM MigrationCheckpoint");
    cpRows = rows[0].c;
  } catch (e) { /* table missing — fine */ }
  console.log("\ntracker: id_mappings=" + im.c + ", migration_runs=" + mr.c +
    "; MigrationCheckpoint rows=" + (cpRows === null ? "table missing" : cpRows));
  if (im.c || mr.c) infos.push("tracker holds history from previous runs — cleared by --apply");
  if (cpRows) infos.push(cpRows + " MigrationCheckpoint rows — cleared by --apply (otherwise a continue-mode run would skip everything below the old cursor)");

  // 5. Scope files
  console.log("\n--- scope files (server/data) ---");
  for (const f of SCOPE_FILES) {
    const fp = path.join(__dirname, "../data", f);
    if (!fs.existsSync(fp)) { blockers.push("scope file missing: server/data/" + f); console.log("  " + f + ": MISSING  <-- BLOCKER"); continue; }
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    const n = Array.isArray(j) ? j.length : (j.productIds ? j.productIds.length : Object.keys(j).length);
    console.log("  " + f + ": " + n + " entries");
  }

  // 6. Pipeline config
  const steps = loadPipelineConfig();
  console.log("\npipeline config: " + steps.length + " steps");
  if (steps.some(s => s.name === "ProjectItemLocalizationMapping"))
    blockers.push("pipeline.json still contains ProjectItemLocalizationMapping (no sourceTable — the step crashes)");

  // 7. Terminal gate gaps in source (silent drops) — in-scope products with NULL Terminal
  const scopeFp = path.join(__dirname, "../data/scope-products.json");
  if (fs.existsSync(scopeFp)) {
    const scope = JSON.parse(fs.readFileSync(scopeFp, "utf8"));
    const ids = Array.isArray(scope) ? scope : scope.productIds;
    if (ids && ids.length) {
      // productsid=1 ("משפחת פרץ") is EXCLUDED by design: it must never get Terminal=1
      // (would PK-collide with the seeded general-bucket Project 1); its donations route
      // to the general bucket. See collections-funds memory, locked decision.
      const r = await mssqlDb.query(
        "SELECT COUNT(*) AS c FROM products WITH (NOLOCK) WHERE productsid IN (" + ids.join(",") + ") AND productsid <> 1 AND (Terminal IS NULL OR Terminal NOT IN (1,4))");
      const nullTerm = r.recordset[0].c;
      if (nullTerm) warnings.push(nullTerm + " in-scope products have Terminal NULL/other — they SILENTLY DROP. Run the update-terminals button (TerminalProducts.xlsx) first if these should migrate");
      console.log("in-scope products failing the Terminal gate right now: " + nullTerm);
    }
  }

  // Report
  console.log("\n=== findings ===");
  blockers.forEach(b => console.log("BLOCKER: " + b));
  warnings.forEach(w => console.log("warning: " + w));
  infos.forEach(i => console.log("info:    " + i));

  if (!APPLY) {
    console.log("\n" + (blockers.length ? "NO-GO — fix blockers, re-run." : "GO (dry-run) — run with --apply to wipe tracker + checkpoints."));
    process.exit(blockers.length ? 1 : 0);
  }

  if (blockers.length) {
    console.log("\nREFUSED --apply: blockers present (target not fully wiped or config broken). Nothing was changed.");
    process.exit(1);
  }

  // APPLY: wipe tracker, clear checkpoints
  console.log("\napplying: tracker.clearAllHistory() ...");
  await tracker.clearAllHistory();
  if (cpRows !== null) {
    await targetDb.query("DELETE FROM MigrationCheckpoint");
    console.log("applying: cleared MigrationCheckpoint rows");
  }
  // verify
  const [[im2]] = await trackerDb.query("SELECT COUNT(*) AS c FROM id_mappings");
  const [[rs2]] = await trackerDb.query("SELECT COUNT(*) AS c FROM row_status");
  const [[mr2]] = await trackerDb.query("SELECT COUNT(*) AS c FROM migration_runs");
  const cp2 = cpRows === null ? 0 : (await targetDb.query("SELECT COUNT(*) AS c FROM MigrationCheckpoint"))[0][0].c;
  console.log("verified: id_mappings=" + im2.c + ", row_status=" + rs2.c + ", migration_runs=" + mr2.c + ", checkpoints=" + cp2);
  const clean = im2.c === 0 && rs2.c === 0 && mr2.c === 0 && cp2 === 0;
  console.log(clean ? "\nGO — tracker + checkpoints clean. Start the pipeline in FRESH mode." : "\nERROR — cleanup incomplete, inspect manually.");
  process.exit(clean ? 0 : 1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
