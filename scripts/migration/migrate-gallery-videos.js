/**
 * Gallery Videos Migration Script
 *
 * Source: Videos (MSSQL) → gallery + gallerylocalization (MySQL)
 *         Videos (MSSQL) → media + gallerymedia (MySQL)
 *
 * Pattern (each Videos row = 1 gallery + 1 media, 1:1):
 *   For each Videos row (WHERE Link IS NOT NULL):
 *     1. INSERT gallery
 *     2. INSERT gallerylocalization x3 (he/en/fr)
 *     3. INSERT media (from Link field, per language if different links)
 *     4. INSERT gallerymedia (linking gallery ↔ media)
 *
 * Multi-language links:
 *   - Hebrew: Videos.Link
 *   - English: Videos.Link_en (if different from Hebrew, creates separate media)
 *   - French: Videos.Link_fr (if different from Hebrew, creates separate media)
 *
 * Usage:
 *   node scripts/migration/migrate-gallery-videos.js [--dry-run] [--limit N]
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

const ENTITY_TYPE = "Gallery_Videos";
const MAPPING_NAME = "GalleryMapping_Videos";
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
  console.log("=== Gallery Videos Migration ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN" : "PRODUCTION");
  if (LIMIT) console.log("Limit:", LIMIT, "videos");
  console.log("");

  var pool = await mssqlDb.getPool();

  // Count source rows
  var countResult = await pool.request().query(
    "SELECT COUNT(*) as cnt FROM Videos WHERE Link IS NOT NULL AND Link != ''"
  );
  var totalVideos = countResult.recordset[0].cnt;
  console.log("Source videos with Link:", totalVideos);
  console.log("");

  // Create tracker run
  var runId = null;
  if (!DRY_RUN) {
    var [runResult] = await trackerDb.query(
      "INSERT INTO migration_runs (mapping_name,source_table,target_table,status,total_source_rows,batch_size,started_at) VALUES (?,?,?,?,?,?,NOW())",
      [MAPPING_NAME, "Videos", "gallery", "running", totalVideos, 500]
    );
    runId = runResult.insertId;
    console.log("Tracker run ID:", runId);
  }

  // Fetch Videos
  var limitClause = LIMIT ? "TOP " + LIMIT : "";
  var videosResult = await pool.request().query(
    "SELECT " + limitClause + " VideosId, Name, Name_en, Name_fr, " +
    "Link, Link_en, Link_fr, " +
    "Description, Description_en, Description_fr, " +
    "Hide, Hide_en, Hide_fr, ShowHomePage, Sort " +
    "FROM Videos WHERE Link IS NOT NULL AND Link != '' " +
    "ORDER BY VideosId ASC"
  );
  var videos = videosResult.recordset;
  console.log("Processing", videos.length, "videos...\n");

  var counters = { galleries: 0, localizations: 0, media: 0, galleryMedia: 0, errors: 0 };

  for (var v of videos) {
    var sourceId = v.VideosId;
    try {
      // 1. INSERT gallery
      var galleryData = {
        Name: truncate(v.Name, 200) || "Video " + sourceId,
        Order: v.Sort || null,
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
        { id: 1, name: "hebrew", title: v.Name, hide: v.Hide },
        { id: 2, name: "english", title: v.Name_en, hide: v.Hide_en },
        { id: 3, name: "french", title: v.Name_fr, hide: v.Hide_fr }
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

      // 3. INSERT media for each unique link
      // Hebrew link is always created. EN/FR only if they have a different URL.
      var createdLinks = {};

      var linkEntries = [
        { link: v.Link, name: v.Name, langLabel: "hebrew" },
        { link: v.Link_en, name: v.Name_en || v.Name, langLabel: "english" },
        { link: v.Link_fr, name: v.Name_fr || v.Name, langLabel: "french" }
      ];

      for (var entry of linkEntries) {
        if (!entry.link || entry.link.trim() === "") continue;

        var linkKey = entry.link.trim();
        // Skip if we already created media for this exact URL
        if (createdLinks[linkKey]) continue;

        var mediaData = {
          YearDirectory: "legacy",
          MonthDirectory: "gallery",
          RelativePath: truncate(linkKey, 500),
          SourceType: 1,          // Youtube/External
          MediaType: 2,           // Video
          FriendlyName: truncate(entry.name, 100),
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
        createdLinks[linkKey] = newMediaId;

        if (!DRY_RUN) {
          await recordMapping("Media_GalleryVideo_" + entry.langLabel, sourceId, newMediaId, runId);
        }

        // 4. INSERT gallerymedia
        var galleryMediaData = {
          GalleryId: newGalleryId,
          MediaId: newMediaId,
          isMainMedia: Object.keys(createdLinks).length === 1 ? 1 : null,
          CreatedAt: NOW,
          CreatedBy: -1
        };
        await insertRow("gallerymedia", galleryMediaData);
        counters.galleryMedia++;
      }

      if ((counters.galleries % 10) === 0) {
        process.stdout.write("\r  Processed " + counters.galleries + "/" + videos.length + " videos...");
      }

    } catch (err) {
      counters.errors++;
      console.error("\n  ERROR video " + sourceId + ": " + err.message);
      if (!DRY_RUN && runId) {
        await recordError(runId, sourceId, "video_insert", err.message, v);
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
  console.log("Galleries:      ", counters.galleries + "/" + videos.length);
  console.log("Localizations:  ", counters.localizations, "(expected:", videos.length * 3 + ")");
  console.log("Media:          ", counters.media, "(unique links, may be < galleries if EN/FR share same URL)");
  console.log("GalleryMedia:   ", counters.galleryMedia);
  console.log("Errors:         ", counters.errors);
  if (runId) console.log("Tracker run ID: ", runId);
  console.log("");
}

run()
  .then(() => { console.log("Done."); process.exit(0); })
  .catch(err => { console.error("FATAL:", err); process.exit(1); });
