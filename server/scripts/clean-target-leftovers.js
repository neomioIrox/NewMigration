// Clean the LAST leftovers on an almost-wiped target before the first fresh pipeline run.
// User-ordered 2026-07-15 ("להתחיל נקי לגמרי"): the target was wiped manually; what
// remained (inspected row-by-row before writing this script) is:
//   1. The Project-1 seed chain (Project 1 "קופת העיר" + ProjectItem 1 + LinkSetting 1
//      + 3+3 localizations) — safe to delete: the engine's seed-project1 pre-runner
//      recreates it automatically on the first Project mapping.
//   2. Orphan LinkSettings (LinkType=2, ProjectId pointing at projects that don't exist)
//      + the DEMO Banner rows that FK them (Banner names "אחד".."שש", seeded with the app
//      baseline; only product 3 of their targets 3-8 is even in the migration scope, so
//      the links stay broken either way — user-approved delete 2026-07-15).
// App-owned rows that are NOT touched: EntityContent IsTemplate=1 (email templates) +
// their EntityContentItem bodies, Address rows, and any Banner whose LinkSetting points
// at a real Project.
//
// Dry-run by default; --apply performs the deletes. Every delete is guarded by a content
// check — if the rows don't look exactly like the inspected leftovers, the script refuses.
//
// Usage: node scripts/clean-target-leftovers.js [--apply]

const targetDb = require("../src/db/mysql-target");

const APPLY = process.argv.includes("--apply");

async function q(sql, params) { const [rows] = await targetDb.query(sql, params || []); return rows; }

(async () => {
  console.log("=== clean-target-leftovers (" + (APPLY ? "APPLY" : "dry-run") + ") ===\n");
  const actions = [];

  // 1. Seed chain — only if Project 1 is really the seed (name check), and it is the ONLY project
  const projects = await q("SELECT Id, Name FROM Project");
  const seedProj = projects.find(p => Number(p.Id) === 1);
  if (projects.length > 1) {
    console.log("REFUSE: Project table has " + projects.length + " rows — this tool only cleans the seed leftover on an otherwise-empty target.");
    process.exit(1);
  }
  if (seedProj) {
    if (seedProj.Name !== "קופת העיר") {
      console.log("REFUSE: Project Id=1 is named '" + seedProj.Name + "' (expected the seed 'קופת העיר') — will not delete an unknown row.");
      process.exit(1);
    }
    actions.push({ sql: "DELETE FROM ProjectItemLocalization WHERE ItemId=1", why: "seed item localizations" });
    actions.push({ sql: "DELETE FROM ProjectLocalization WHERE ProjectId=1", why: "seed project localizations" });
    actions.push({ sql: "DELETE FROM LinkSetting WHERE Id=1 AND ProjectId=1", why: "seed link setting" });
    actions.push({ sql: "DELETE FROM ProjectItem WHERE Id=1 AND ProjectId=1", why: "seed project item" });
    actions.push({ sql: "DELETE FROM Project WHERE Id=1", why: "seed project (re-seeded automatically by the engine)" });
  } else {
    console.log("Project 1 seed: not present");
  }

  // 2. Orphan LinkSettings — rows whose ProjectId points at a Project that does not exist
  //    (excluding the seed row handled above)
  const orphans = await q(
    "SELECT ls.Id, ls.ProjectId FROM LinkSetting ls LEFT JOIN Project p ON p.Id = ls.ProjectId " +
    "WHERE ls.Id <> 1 AND ls.ProjectId IS NOT NULL AND p.Id IS NULL");
  if (orphans.length) {
    console.log("orphan LinkSettings (ProjectId has no Project): " + orphans.map(o => o.Id + "->" + o.ProjectId).join(", "));
    const orphanIds = orphans.map(o => Number(o.Id)).join(",");
    // Banner FKs LinkSetting (FK_Banner_LinkSetting) — the demo banners must go first
    const banners = await q("SELECT Id, Name, LinkSettingId FROM Banner WHERE LinkSettingId IN (" + orphanIds + ")");
    if (banners.length) {
      console.log("demo Banners referencing them: " + banners.map(b => b.Id + " '" + b.Name + "'->" + b.LinkSettingId).join(", "));
      actions.push({
        sql: "DELETE FROM Banner WHERE LinkSettingId IN (" + orphanIds + ")",
        why: "demo banners whose link points at a nonexistent project"
      });
    }
    actions.push({
      sql: "DELETE FROM LinkSetting WHERE Id IN (" + orphanIds + ")",
      why: "orphan link settings referencing nonexistent projects"
    });
  } else {
    console.log("orphan LinkSettings: none");
  }

  if (!actions.length) { console.log("\nNothing to clean."); process.exit(0); }

  console.log("\nplanned deletes:");
  actions.forEach(a => console.log("  " + a.sql + "   -- " + a.why));

  if (!APPLY) { console.log("\ndry-run only — re-run with --apply to execute."); process.exit(0); }

  for (const a of actions) {
    const [r] = await targetDb.query(a.sql);
    console.log("applied: " + a.sql + " -> " + r.affectedRows + " rows");
  }

  // verify
  const left = await q(
    "SELECT (SELECT COUNT(*) FROM Project) p, (SELECT COUNT(*) FROM ProjectItem) pi, " +
    "(SELECT COUNT(*) FROM ProjectLocalization) pl, (SELECT COUNT(*) FROM ProjectItemLocalization) pil, " +
    "(SELECT COUNT(*) FROM LinkSetting) ls");
  console.log("\nverified counts after clean: " + JSON.stringify(left[0]));
  const ok = Object.values(left[0]).every(v => Number(v) === 0);
  console.log(ok ? "CLEAN" : "NOT fully clean — inspect manually");
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
