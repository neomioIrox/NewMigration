/**
 * Backfill VideoGalleryMedia.Description from Title where Description is empty.
 *
 * Background (QA 2026-06-10): the new site's FE renders the `description` field
 * as the video card text (not `title`), so the ~98/127 videos whose source had
 * no Description show blank cards. Filling Description with the Title makes the
 * cards display correctly without touching rows that have a real description.
 *
 * Scope: ALL VideoGalleryMedia rows (the table is populated solely by our
 * migration). Safe to re-run — only touches empty descriptions.
 *
 * Usage:
 *   node scripts/fixes/backfill-vgm-description-from-title.js            # dry-run
 *   node scripts/fixes/backfill-vgm-description-from-title.js --execute  # apply
 */
const targetDb = require("../../server/src/db/mysql-target");

const EXECUTE = process.argv.includes("--execute");

async function run() {
  console.log("=== Backfill VideoGalleryMedia.Description from Title ===");
  console.log("Mode:", EXECUTE ? "EXECUTE" : "DRY-RUN");
  console.log("");

  const [before] = await targetDb.query(`
    SELECT LanguageId,
           COUNT(*) AS total,
           SUM(CASE WHEN Description IS NULL OR Description = '' THEN 1 ELSE 0 END) AS emptyDesc,
           SUM(CASE WHEN (Description IS NULL OR Description = '') AND (Title IS NULL OR Title = '') THEN 1 ELSE 0 END) AS bothEmpty
    FROM VideoGalleryMedia GROUP BY LanguageId ORDER BY LanguageId
  `);
  console.log("Current state per language:");
  for (const r of before) {
    console.log(`  Lang ${r.LanguageId}: total=${r.total}  emptyDescription=${r.emptyDesc}  (of which title also empty: ${r.bothEmpty})`);
  }

  if (!EXECUTE) {
    console.log("\nDRY-RUN — no changes. Re-run with --execute to apply.");
    process.exit(0);
  }

  const [result] = await targetDb.query(`
    UPDATE VideoGalleryMedia
    SET Description = Title, UpdatedAt = NOW(), UpdatedBy = -1
    WHERE (Description IS NULL OR Description = '')
      AND Title IS NOT NULL AND Title != ''
  `);
  console.log(`\nUpdated rows: ${result.affectedRows}`);

  const [after] = await targetDb.query(`
    SELECT COUNT(*) AS stillEmpty FROM VideoGalleryMedia
    WHERE Description IS NULL OR Description = ''
  `);
  console.log(`Still empty descriptions (title was empty too): ${after[0].stillEmpty}`);
  console.log("\nDone.");
  process.exit(0);
}

run().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
