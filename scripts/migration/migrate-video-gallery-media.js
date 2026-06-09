/**
 * Correct Video Gallery migration — targets VideoGalleryMedia (what the app actually reads).
 *
 * Source: Videos (MSSQL) — 127 rows WHERE Link IS NOT NULL AND Link != ''
 *
 * Target structure (per source row):
 *   1. INSERT LinkSetting  (1 per video — LinkType=3 ListItem, ProjectId=1 general fund)
 *   2. INSERT Media        (1 per unique URL, deduped across languages of same video)
 *   3. INSERT VideoGalleryMedia  (1 per language where Name_X is non-empty)
 *
 * Rules (match the old site https://www.kupat.org.il/videos behavior):
 *   - Skip a language row only when BOTH: Name_X is empty AND Hide_X = 1
 *     (i.e. include if it has a name OR if it's supposed to be visible)
 *   - Title fallback: if Name_X is empty → use Name (Hebrew). Same for Description.
 *   - URL fallback: if Link_X is invalid → reuse Hebrew Link
 *   - DisplayInGallery = (Hide_X == 0 ? 1 : 0)
 *   - DisplayInMainPage = ShowHomePage (same for all 3 languages)
 *   - SourceType = 1 (external embed — Youtube/Vimeo/etc)
 *
 * Usage:
 *   node scripts/migration/migrate-video-gallery-media.js [--dry-run] [--limit N]
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

const DEFAULT_PROJECT_ID = 1; // מגבית קופת העיר כללית
const DEFAULT_LINK_TYPE = 3;          // ListItem
const DEFAULT_LINK_TARGET_TYPE = 1;   // ToProjectPage
const DEFAULT_SOURCE_TYPE = 1;        // External embed (Youtube/Vimeo)
const DEFAULT_MEDIA_TYPE = 2;         // Video
const DEFAULT_MATCH_PLATFORM = 3;     // All
const DEFAULT_RECORD_STATUS = 2;      // Accept
const DEFAULT_USER = -1;              // system
const ENTITY_LS = "VideoGallery_LinkSetting";
const ENTITY_MEDIA = "VideoGallery_Media";
const ENTITY_VGM = "VideoGallery_VGM";
const MAPPING_NAME = "VideoGalleryMediaMapping";

const NOW = new Date();

function isValidUrl(v) {
  if (!v) return false;
  const s = String(v).trim();
  if (s === "") return false;
  return /^https?:\/\//i.test(s);
}

function truncate(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.substring(0, max) : s;
}

function cleanStr(v, max) {
  if (v === null || v === undefined) return null;
  // strip surrogate halves (same cleanup as old migration had for Name)
  const s = String(v).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
  return truncate(s, max);
}

async function insertRow(conn, tableName, data) {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(",");
  const vals = cols.map(c => data[c] === undefined ? null : data[c]);
  const sql = "INSERT INTO `" + tableName + "` (" + cols.map(c => "`" + c + "`").join(",") + ") VALUES (" + placeholders + ")";
  if (DRY_RUN) {
    return Math.floor(Math.random() * 1000000);
  }
  const [result] = await conn.query(sql, vals);
  return result.insertId;
}

async function recordMapping(entityType, sourceKey, targetId, runId) {
  if (DRY_RUN) return;
  await trackerDb.query(
    "INSERT INTO id_mappings (entity_type,source_id,target_id,run_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
    [entityType, String(sourceKey), String(targetId), runId]
  );
}

async function recordError(runId, sourceId, errorType, errorMessage, sourceData) {
  if (DRY_RUN) return;
  await trackerDb.query(
    "INSERT INTO migration_errors (run_id,source_id,error_type,error_message,source_data) VALUES (?,?,?,?,?)",
    [runId, String(sourceId), errorType, errorMessage, JSON.stringify(sourceData)]
  );
}

async function run() {
  console.log("=== VideoGalleryMedia Migration ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN" : "PRODUCTION");
  if (LIMIT) console.log("Limit:", LIMIT, "videos");
  console.log("");

  // Pre-flight: ensure Project 1 exists
  const [proj] = await targetDb.query("SELECT Id FROM Project WHERE Id = ?", [DEFAULT_PROJECT_ID]);
  if (!proj.length) {
    console.error(`FATAL: Project.Id=${DEFAULT_PROJECT_ID} not found. LinkSetting.ProjectId is NOT NULL.`);
    process.exit(1);
  }
  console.log(`Default Project.Id=${DEFAULT_PROJECT_ID} exists. OK.`);

  const pool = await mssqlDb.getPool();

  // Count
  const totalResult = await pool.request().query(
    "SELECT COUNT(*) AS cnt FROM Videos WHERE Link IS NOT NULL AND Link != ''"
  );
  const total = totalResult.recordset[0].cnt;
  console.log("Source videos:", total);

  // Start tracker run
  let runId = null;
  if (!DRY_RUN) {
    const [r] = await trackerDb.query(
      "INSERT INTO migration_runs (mapping_name,source_table,target_table,status,total_source_rows,batch_size,started_at) VALUES (?,?,?,?,?,?,NOW())",
      [MAPPING_NAME, "Videos", "VideoGalleryMedia", "running", total, 500]
    );
    runId = r.insertId;
    console.log("Tracker run ID:", runId);
  }

  // Fetch
  const limitClause = LIMIT ? `TOP ${LIMIT}` : "";
  const videosResult = await pool.request().query(`
    SELECT ${limitClause} VideosId, Name, Name_en, Name_fr,
           Link, Link_en, Link_fr,
           Description, Description_en, Description_fr,
           Hide, Hide_en, Hide_fr, ShowHomePage, Sort
    FROM Videos WHERE Link IS NOT NULL AND Link != ''
    ORDER BY VideosId ASC
  `);
  const videos = videosResult.recordset;
  console.log("Processing", videos.length, "videos...\n");

  const counters = { linkSettings: 0, media: 0, vgm: 0, skippedLangs: 0, errors: 0, perLang: { 1: 0, 2: 0, 3: 0 } };

  for (const v of videos) {
    const sourceId = v.VideosId;
    const conn = DRY_RUN ? null : await targetDb.getConnection();
    try {
      if (conn) await conn.beginTransaction();

      // 1. LinkSetting — one per video
      const lsId = await insertRow(conn, "LinkSetting", {
        LinkType: DEFAULT_LINK_TYPE,
        LinkTargetType: DEFAULT_LINK_TARGET_TYPE,
        ProjectId: DEFAULT_PROJECT_ID,
        ItemId: null,
        LinkText: null,
        MediaId: null,
        MobileMediaId: null,
        Description: null,
        DonationPagePaymentType: null,
        DonationPagePaymentSum: null,
        DonationPagePaymentCount: null,
        CreatedAt: NOW, CreatedBy: DEFAULT_USER,
        UpdatedAt: NOW, UpdatedBy: DEFAULT_USER
      });
      counters.linkSettings++;
      await recordMapping(ENTITY_LS, sourceId, lsId, runId);

      const displayInMain = (v.ShowHomePage === 1) ? 1 : 0;

      // Per-language processing. Skip when Name_X is empty.
      const langs = [
        { id: 1, label: "he", name: v.Name,    desc: v.Description,    link: v.Link,    hide: v.Hide },
        { id: 2, label: "en", name: v.Name_en, desc: v.Description_en, link: v.Link_en, hide: v.Hide_en },
        { id: 3, label: "fr", name: v.Name_fr, desc: v.Description_fr, link: v.Link_fr, hide: v.Hide_fr }
      ];

      // Media dedup — same URL across this video's languages uses the same Media row
      const mediaByUrl = {};

      for (const lang of langs) {
        const hasName = lang.name && String(lang.name).trim() !== "";
        // Skip only when the row is both nameless AND hidden — nothing useful to store.
        if (!hasName && lang.hide === 1) {
          counters.skippedLangs++;
          continue;
        }
        // Title fallback: use Hebrew Name when the per-language name is empty.
        const titleSource = hasName ? lang.name : v.Name;
        const cleanName = cleanStr(titleSource, 200);
        // Description fallback: use Hebrew Description when per-language is empty.
        const hasDesc = lang.desc && String(lang.desc).trim() !== "";
        const descSource = hasDesc ? lang.desc : v.Description;

        // URL fallback: invalid Link_X → use Hebrew Link
        const url = isValidUrl(lang.link) ? lang.link.trim() : v.Link.trim();

        // Create or reuse Media
        let mediaId = mediaByUrl[url];
        if (!mediaId) {
          mediaId = await insertRow(conn, "Media", {
            YearDirectory: "legacy",       // tag legacy source so we can find them later
            MonthDirectory: "videoGallery",
            RelativePath: truncate(url, 500),
            SourceType: DEFAULT_SOURCE_TYPE,
            MediaType: DEFAULT_MEDIA_TYPE,
            FriendlyName: cleanStr(titleSource, 100),
            MatchToPlatform: DEFAULT_MATCH_PLATFORM,
            RecordStatus: DEFAULT_RECORD_STATUS,
            StatusChangedAt: NOW, StatusChangedBy: DEFAULT_USER,
            CreatedAt: NOW, CreatedBy: DEFAULT_USER,
            UpdatedAt: NOW, UpdatedBy: DEFAULT_USER
          });
          counters.media++;
          mediaByUrl[url] = mediaId;
          await recordMapping(`${ENTITY_MEDIA}_${lang.label}`, sourceId, mediaId, runId);
        }

        // Insert VideoGalleryMedia
        const vgmId = await insertRow(conn, "VideoGalleryMedia", {
          LanguageId: lang.id,
          MediaId: mediaId,
          LinkSettingId: lsId,
          Title: cleanName,
          Description: cleanStr(descSource, 500),
          DisplayInGallery: (lang.hide === 0 ? 1 : 0),
          DisplayInMainPage: displayInMain,
          RecordStatus: DEFAULT_RECORD_STATUS,
          StatusChangedAt: NOW, StatusChangedBy: DEFAULT_USER,
          CreatedAt: NOW, CreatedBy: DEFAULT_USER,
          UpdatedAt: NOW, UpdatedBy: DEFAULT_USER
        });
        counters.vgm++;
        counters.perLang[lang.id]++;
        await recordMapping(`${ENTITY_VGM}_${lang.label}`, sourceId, vgmId, runId);
      }

      if (conn) await conn.commit();

      if ((counters.linkSettings % 10) === 0) {
        process.stdout.write(`\r  Processed ${counters.linkSettings}/${videos.length} videos...`);
      }
    } catch (err) {
      if (conn) await conn.rollback();
      counters.errors++;
      console.error(`\n  ERROR video ${sourceId}: ${err.message}`);
      if (runId) await recordError(runId, sourceId, "video_insert", err.message, v);
    } finally {
      if (conn) conn.release();
    }
  }

  // Finalize tracker run
  if (!DRY_RUN && runId) {
    await trackerDb.query(
      "UPDATE migration_runs SET status=?,processed_rows=?,inserted_rows=?,error_rows=?,completed_at=NOW() WHERE id=?",
      ["completed", counters.linkSettings, counters.vgm, counters.errors, runId]
    );
  }

  console.log("\n\n=== Results ===");
  console.log("LinkSettings:   ", counters.linkSettings, "(expected:", videos.length + ")");
  console.log("Media:          ", counters.media);
  console.log("VideoGalleryMedia:", counters.vgm);
  console.log("  per language:   he=" + counters.perLang[1] + "  en=" + counters.perLang[2] + "  fr=" + counters.perLang[3]);
  console.log("Skipped langs:  ", counters.skippedLangs, "(both nameless and hidden)");
  console.log("Errors:         ", counters.errors);
  if (runId) console.log("Tracker run:    ", runId);
}

run()
  .then(() => { console.log("\nDone."); process.exit(0); })
  .catch(err => { console.error("FATAL:", err); process.exit(1); });
