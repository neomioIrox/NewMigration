#!/usr/bin/env node
/**
 * Manual wrapper around the seed-project1 PRE-RUNNER.
 *
 * You normally do NOT need this: the engine runs the same seed automatically
 * (mapping.preMigrationRunners includes "seed-project1" on every Project-producing
 * mapping — Funds_Fixed, Collections_Fixed, Type3_Parents, Type3_Subs, PrayerMapping),
 * so a fresh migration seeds Project 1 by itself, whichever mapping runs first.
 *
 * Kept for ad-hoc use: checking the seed status, or planting the row without
 * starting a migration. Logic lives in server/src/engine/pre-runners/seed-project1.js.
 *
 * Usage: node scripts/migration/seed-project1.js          (dry-run: status only)
 *        node scripts/migration/seed-project1.js --apply  (insert if missing)
 */
const seeder = require("../../server/src/engine/pre-runners/seed-project1");

const APPLY = process.argv.includes("--apply");

(async () => {
  try {
    const st = await seeder.status();
    if (st.projectExists) {
      console.log("Project Id=1 already exists — nothing to do.");
      process.exit(0);
    }
    if (st.itemTaken || st.linkTaken) {
      console.error("ABORT: ProjectItem Id=1 or LinkSetting Id=1 already taken by another row while " +
        "Project Id=1 does not exist — the DB was not cleaned properly.");
      process.exit(1);
    }
    if (!APPLY) {
      console.log("DRY RUN (pass --apply to insert). Would seed:");
      console.log("  Project 1:        " + seeder.SEED.Project.Name + " (ProjectType=2, KupatFundNo=110)");
      console.log("  ProjectItem 1:    " + seeder.SEED.ProjectItem.ItemName + " (ItemType=4 Donation, PriceType=2 Free)");
      console.log("  LinkSetting 1:    " + seeder.SEED.LinkSetting.LinkText);
      console.log("  ProjectLocalization: 3 rows (he/en/fr, hidden) | ProjectItemLocalization: 3 rows");
      console.log("NOTE: the migration engine seeds this automatically (preMigrationRunners) — manual run is optional.");
      process.exit(0);
    }
    const result = await seeder.run();
    console.log(result.seeded ? "✅ Seeded Project 1 + ProjectItem 1 + LinkSetting 1 + 6 localization rows."
                              : "Skipped: " + result.reason);
    process.exit(0);
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
