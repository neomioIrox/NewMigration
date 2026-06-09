/**
 * Cleanup script — removes the WRONG video gallery migration that went into
 * Gallery/GalleryLocalization/GalleryMedia/Media.
 *
 * The app reads videos from VideoGalleryMedia, not Gallery. The earlier
 * migration (run #12 on 2026-03-11) wrote 127 galleries that are invisible
 * to the app and pollute the DB. This cleanup removes them safely.
 *
 * Usage:
 *   node scripts/migration/cleanup-wrong-gallery-videos.js [--dry-run] [--execute]
 *
 * Order of deletion (reverse of FK dependencies):
 *   1. GalleryMedia (referenced Gallery + Media)
 *   2. GalleryLocalization (referenced Gallery)
 *   3. Gallery
 *   4. Media rows that were linked only by the deleted GalleryMedia rows
 *   5. id_mappings entries for entity_type='Gallery_Videos'
 */
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

const DRY_RUN = !process.argv.includes("--execute");

async function run() {
  console.log("=== Cleanup wrong Gallery Videos migration ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN (no deletes)" : "EXECUTE (will delete)");
  console.log("");

  // 1. Find the gallery IDs from the tracker
  const [mappings] = await trackerDb.query(
    "SELECT target_id FROM id_mappings WHERE entity_type = 'Gallery_Videos'"
  );
  const galleryIds = mappings.map(r => Number(r.target_id));
  if (galleryIds.length === 0) {
    console.log("No Gallery_Videos entries in tracker. Nothing to clean.");
    process.exit(0);
  }
  console.log(`Found ${galleryIds.length} gallery IDs in tracker (Gallery_Videos).`);
  console.log(`Range: ${Math.min(...galleryIds)} .. ${Math.max(...galleryIds)}`);

  const inClause = galleryIds.join(",");

  // 2. Find the Media IDs linked only to these galleries (so we delete safely)
  const [mediaLinked] = await targetDb.query(
    `SELECT DISTINCT MediaId FROM GalleryMedia WHERE GalleryId IN (${inClause})`
  );
  const mediaIds = mediaLinked.map(r => r.MediaId);
  console.log(`Media rows linked via GalleryMedia: ${mediaIds.length}`);

  // 3. Safety check: are any of these Media rows also referenced elsewhere?
  //    Check other tables that FK to Media.
  const [otherRefs] = await targetDb.query(`
    SELECT 'LinkSetting.MediaId' AS ref, COUNT(*) AS n FROM LinkSetting
      WHERE MediaId IN (${mediaIds.join(",")})
    UNION ALL
    SELECT 'LinkSetting.MobileMediaId', COUNT(*) FROM LinkSetting
      WHERE MobileMediaId IN (${mediaIds.join(",")})
    UNION ALL
    SELECT 'VideoGalleryMedia.MediaId', COUNT(*) FROM VideoGalleryMedia
      WHERE MediaId IN (${mediaIds.join(",")})
    UNION ALL
    SELECT 'GalleryMedia (other galleries)', COUNT(*) FROM GalleryMedia
      WHERE MediaId IN (${mediaIds.join(",")}) AND GalleryId NOT IN (${inClause})
  `);
  console.log("\nOther references to these Media rows:");
  for (const r of otherRefs) console.log(`  ${r.ref.padEnd(40)}: ${r.n}`);

  const stillReferenced = otherRefs.filter(r => r.n > 0);
  if (stillReferenced.length > 0) {
    console.log("\n⚠️  Some Media rows are still referenced elsewhere. They will be SKIPPED during delete.");
  }

  // 4. Also check: are the galleries referenced elsewhere?
  //    (e.g., no FK pointing to Gallery.Id from a table we forgot)
  const [galleryRefs] = await targetDb.query(`
    SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'Gallery'
  `);
  console.log("\nTables with FK → Gallery:");
  for (const r of galleryRefs) console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME}`);
  // GalleryLocalization and GalleryMedia are the expected ones — already handled.

  // 5. Plan delete counts
  const [glCount] = await targetDb.query(
    `SELECT COUNT(*) n FROM GalleryLocalization WHERE GalleryId IN (${inClause})`
  );
  const [gmCount] = await targetDb.query(
    `SELECT COUNT(*) n FROM GalleryMedia WHERE GalleryId IN (${inClause})`
  );

  console.log("\n--- Delete plan ---");
  console.log(`  GalleryMedia rows:         ${gmCount[0].n}`);
  console.log(`  GalleryLocalization rows:  ${glCount[0].n}`);
  console.log(`  Gallery rows:              ${galleryIds.length}`);
  console.log(`  Media rows:                up to ${mediaIds.length} (skipped if referenced elsewhere)`);
  console.log(`  id_mappings rows:          ${galleryIds.length}`);

  if (DRY_RUN) {
    console.log("\nDRY-RUN mode — no changes made. Re-run with --execute to delete.");
    process.exit(0);
  }

  console.log("\n--- EXECUTING DELETES ---");

  const conn = await targetDb.getConnection();
  try {
    await conn.beginTransaction();

    const [r1] = await conn.query(`DELETE FROM GalleryMedia WHERE GalleryId IN (${inClause})`);
    console.log(`  GalleryMedia deleted:      ${r1.affectedRows}`);

    const [r2] = await conn.query(`DELETE FROM GalleryLocalization WHERE GalleryId IN (${inClause})`);
    console.log(`  GalleryLocalization deleted: ${r2.affectedRows}`);

    const [r3] = await conn.query(`DELETE FROM Gallery WHERE Id IN (${inClause})`);
    console.log(`  Gallery deleted:           ${r3.affectedRows}`);

    if (mediaIds.length > 0) {
      // Only delete media rows that are NOT referenced by other tables now
      const [r4] = await conn.query(
        `DELETE FROM Media WHERE Id IN (${mediaIds.join(",")})
         AND Id NOT IN (SELECT MediaId FROM LinkSetting WHERE MediaId IS NOT NULL)
         AND Id NOT IN (SELECT MobileMediaId FROM LinkSetting WHERE MobileMediaId IS NOT NULL)
         AND Id NOT IN (SELECT MediaId FROM VideoGalleryMedia)
         AND Id NOT IN (SELECT MediaId FROM GalleryMedia)`
      );
      console.log(`  Media deleted:             ${r4.affectedRows}`);
    }

    await conn.commit();
    console.log("  Target DB: committed.");
  } catch (err) {
    await conn.rollback();
    console.error("ERROR — rolled back target DB:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }

  // tracker cleanup
  const [r5] = await trackerDb.query(
    "DELETE FROM id_mappings WHERE entity_type = 'Gallery_Videos'"
  );
  console.log(`  id_mappings deleted:       ${r5.affectedRows}`);

  // mark the old run as obsolete
  await trackerDb.query(
    "UPDATE migration_runs SET status = 'obsolete' WHERE mapping_name = 'GalleryMapping_Videos'"
  );
  console.log("  migration_runs: marked old 'GalleryMapping_Videos' runs as obsolete.");

  console.log("\nCleanup complete.");
  process.exit(0);
}

run().catch(err => { console.error("FATAL:", err.message); console.error(err.stack); process.exit(1); });
