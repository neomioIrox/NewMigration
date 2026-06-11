/**
 * ⚠️ DEPRECATED — DO NOT RUN AGAINST AWS RDS ⚠️
 * 1. Uses lowercase table names (gallery, media, ...) — fails on case-sensitive RDS (PascalCase).
 * 2. Writes RelativePath = filename only — produces broken image URLs (the FE builds
 *    URLs as S3 bucket + RelativePath; legacy files live under 2020/01/).
 * Use the engine mappings instead: GalleryMapping_Images + GalleryMediaMapping_Images
 * (includes the set-gallery-main-media post-runner). See legacy/LESSONS_LEARNED.md.
 *
 * Gallery Images Migration Script
 *
 * Source: Galeries (MSSQL) → gallery + gallerylocalization (MySQL)
 *         GaleryPics (MSSQL) → media + gallerymedia (MySQL)
 *
 * Pattern:
 *   For each Galeries row:
 *     1. INSERT gallery
 *     2. INSERT gallerylocalization x3 (he/en/fr)
 *     3. For each GaleryPics row (WHERE GaleryId = GaleriesId AND Pic IS NOT NULL):
 *        a. INSERT media
 *        b. INSERT gallerymedia (linking gallery ↔ media)
 *
 * Usage:
 *   node scripts/migration/migrate-gallery-images.js [--dry-run] [--limit N]
 */

const mssqlDb = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

// ===== Config =====
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  var idx = process.argv.indexOf("--limit");
  return idx > -1 ? parseInt(process.argv[idx + 1]) : 0;
})();

const ENTITY_TYPE = "Gallery_Images";
const MAPPING_NAME = "GalleryMapping_Images";
const NOW = new Date();

// ===== Helpers =====
async function insertRow(tableName, data) {
  var cols = Object.keys(data);
  var placeholders = cols.map(() => "?").join(",");
  var vals = cols.map(c => { var v = data[c]; return v === undefined ? null : v; });
  var sql = "INSERT INTO `" + tableName + "` (" + cols.map(c => "`" + c + "`").join(",") + ") VALUES (" + placeholders + ")";
  if (DRY_RUN) {
    console.log("  [DRY-RUN] INSERT INTO " + tableName + " (" + cols.join(",") + ")");
    return Math.floor(Math.random() * 100000);
  }
  var [result] = await targetDb.query(sql, vals);
  return result.insertId;
}

async function recordMapping(entityType, sourceId, targetId, runId) {
  await trackerDb.query(
    "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
    [entityType, String(sourceId), String(targetId), runId]
  );
}

async function recordError(runId, sourceId, errorType, errorMessage, sourceData) {
  await trackerDb.query(
    "INSERT INTO migration_errors (run_id,source_id,error_type,error_message,source_data) VALUES (?,?,?,?,?)",
    [runId, String(sourceId), errorType, errorMessage, JSON.stringify(sourceData)]
  );
}

function truncate(val, maxLen) {
  if (!val) return val;
  var s = String(val);
  return s.length > maxLen ? s.substring(0, maxLen) : s;
}

// ===== Main =====
async function run() {
  console.log("=== Gallery Images Migration ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN" : "PRODUCTION");
  if (LIMIT) console.log("Limit:", LIMIT, "galleries");
  console.log("");

  var pool = await mssqlDb.getPool();

  // Count source rows
  var countResult = await pool.request().query("SELECT COUNT(*) as cnt FROM Galeries");
  var totalGalleries = countResult.recordset[0].cnt;
  console.log("Source galleries (Galeries):", totalGalleries);

  var picCountResult = await pool.request().query("SELECT COUNT(*) as cnt FROM GaleryPics WHERE Pic IS NOT NULL AND Pic != ''");
  console.log("Source pics with data (GaleryPics):", picCountResult.recordset[0].cnt);
  console.log("");

  // Create tracker run
  var runId = null;
  if (!DRY_RUN) {
    var [runResult] = await trackerDb.query(
      "INSERT INTO migration_runs (mapping_name,source_table,target_table,status,total_source_rows,batch_size,started_at) VALUES (?,?,?,?,?,?,NOW())",
      [MAPPING_NAME, "Galeries", "gallery", "running", totalGalleries, 500]
    );
    runId = runResult.insertId;
    console.log("Tracker run ID:", runId);
  }

  // Fetch all Galeries
  var limitClause = LIMIT ? "TOP " + LIMIT : "";
  var galeriesResult = await pool.request().query(
    "SELECT " + limitClause + " GaleriesId, Name, Name_en, Name_fr, Hide, Hide_en, Hide_fr, ShowHomePage, Sort " +
    "FROM Galeries ORDER BY GaleriesId ASC"
  );
  var galleries = galeriesResult.recordset;
  console.log("Processing", galleries.length, "galleries...\n");

  var counters = { galleries: 0, localizations: 0, media: 0, galleryMedia: 0, errors: 0 };

  for (var g of galleries) {
    var sourceId = g.GaleriesId;
    try {
      // 1. INSERT gallery
      var galleryData = {
        Name: truncate(g.Name, 200) || "Gallery " + sourceId,
        Order: g.Sort || null,
        RecordStatus: 2,
        StatusChangedAt: NOW,
        StatusChangedBy: -1,
        CreatedAt: NOW,
        CreatedBy: -1,
        UpdatedAt: NOW,
        UpdatedBy: -1
      };
      var newGalleryId = await insertRow("gallery", galleryData);
      counters.galleries++;

      if (!DRY_RUN) {
        await recordMapping(ENTITY_TYPE, sourceId, newGalleryId, runId);
      }

      // 2. INSERT gallerylocalization x3
      var langs = [
        { id: 1, name: "hebrew", title: g.Name, hide: g.Hide },
        { id: 2, name: "english", title: g.Name_en, hide: g.Hide_en },
        { id: 3, name: "french", title: g.Name_fr, hide: g.Hide_fr }
      ];

      for (var lang of langs) {
        var locData = {
          GalleryId: newGalleryId,
          Language: lang.id,
          Title: truncate(lang.title, 200),
          Display: lang.hide ? 0 : 1,
          CreatedAt: NOW,
          CreatedBy: -1,
          UpdatedAt: NOW,
          UpdatedBy: -1
        };
        var locId = await insertRow("gallerylocalization", locData);
        counters.localizations++;

        if (!DRY_RUN) {
          await recordMapping(ENTITY_TYPE + "_loc_" + lang.name, sourceId, locId, runId);
        }
      }

      // 3. Fetch GaleryPics for this gallery
      var picsResult = await pool.request()
        .input("galeryId", sourceId)
        .query("SELECT GaleryPicsId, Pic, Name, Name_en, Name_fr, ShowHomePage FROM GaleryPics WHERE GaleryId = @galeryId AND Pic IS NOT NULL AND Pic != '' ORDER BY GaleryPicsId ASC");
      var pics = picsResult.recordset;

      var isFirst = true;
      for (var pic of pics) {
        // 3a. INSERT media
        var mediaData = {
          YearDirectory: "legacy",
          MonthDirectory: "gallery",
          RelativePath: truncate(pic.Pic, 500),
          SourceType: 2,          // S3
          MediaType: 1,           // Image
          FriendlyName: truncate(pic.Name, 100),
          MatchToPlatform: 3,     // All
          RecordStatus: 2,        // Accept
          StatusChangedAt: NOW,
          StatusChangedBy: -1,
          CreatedAt: NOW,
          CreatedBy: -1,
          UpdatedAt: NOW,
          UpdatedBy: -1
        };
        var newMediaId = await insertRow("media", mediaData);
        counters.media++;

        if (!DRY_RUN) {
          await recordMapping("Media_GalleryImage", pic.GaleryPicsId, newMediaId, runId);
        }

        // 3b. INSERT gallerymedia
        var galleryMediaData = {
          GalleryId: newGalleryId,
          MediaId: newMediaId,
          isMainMedia: isFirst ? 1 : null,
          CreatedAt: NOW,
          CreatedBy: -1
        };
        await insertRow("gallerymedia", galleryMediaData);
        counters.galleryMedia++;
        isFirst = false;
      }

      if ((counters.galleries % 10) === 0) {
        process.stdout.write("\r  Processed " + counters.galleries + "/" + galleries.length + " galleries...");
      }

    } catch (err) {
      counters.errors++;
      console.error("\n  ERROR gallery " + sourceId + ": " + err.message);
      if (!DRY_RUN && runId) {
        await recordError(runId, sourceId, "gallery_insert", err.message, g);
      }
    }
  }

  // Update tracker
  if (!DRY_RUN && runId) {
    await trackerDb.query(
      "UPDATE migration_runs SET status=?,processed_rows=?,inserted_rows=?,error_rows=?,completed_at=NOW() WHERE id=?",
      ["completed", counters.galleries, counters.galleries, counters.errors, runId]
    );
  }

  console.log("\n\n=== Results ===");
  console.log("Galleries:      ", counters.galleries + "/" + galleries.length);
  console.log("Localizations:  ", counters.localizations, "(expected:", galleries.length * 3 + ")");
  console.log("Media:          ", counters.media);
  console.log("GalleryMedia:   ", counters.galleryMedia);
  console.log("Errors:         ", counters.errors);
  if (runId) console.log("Tracker run ID: ", runId);
  console.log("");
}

run()
  .then(() => { console.log("Done."); process.exit(0); })
  .catch(err => { console.error("FATAL:", err); process.exit(1); });
