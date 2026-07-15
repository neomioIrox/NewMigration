/**
 * One-off patch: add EN/FR rows for videos where the translated Name is empty but
 * the language is visible (Hide_X = 0). The old site shows these with a Hebrew
 * fallback title — the initial migration skipped them.
 *
 * Usage:
 *   node scripts/migration/patch-video-gallery-media-fallback.js [--dry-run] [--execute]
 *
 * Safe: only inserts rows where a VGM does NOT already exist for (LinkSettingId, LanguageId).
 */
const mssqlDb = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

const DRY_RUN = !process.argv.includes("--execute");

const DEFAULT_SOURCE_TYPE = 1;
const DEFAULT_MEDIA_TYPE = 2;
const DEFAULT_MATCH_PLATFORM = 3;
const DEFAULT_RECORD_STATUS = 2;
const DEFAULT_USER = -1;
const NOW = new Date();

function isValidUrl(v) {
  if (!v) return false;
  const s = String(v).trim();
  return s !== "" && /^https?:\/\//i.test(s);
}
function truncate(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.substring(0, max) : s;
}
function cleanStr(v, max) {
  if (v === null || v === undefined) return null;
  return truncate(String(v).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""), max);
}

async function insertRow(conn, table, data) {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(",");
  const vals = cols.map(c => data[c] === undefined ? null : data[c]);
  const sql = "INSERT INTO `" + table + "` (" + cols.map(c => "`" + c + "`").join(",") + ") VALUES (" + placeholders + ")";
  if (DRY_RUN) return Math.floor(Math.random() * 1e6);
  const [r] = await conn.query(sql, vals);
  return r.insertId;
}

async function run() {
  console.log("=== Patch: add Hebrew-fallback rows for EN/FR videos ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN (no writes)" : "EXECUTE");
  console.log("");

  const pool = await mssqlDb.getPool();

  // Find the candidate source rows: Hide_X=0 AND Name_X empty, for each of en/fr
  const cand = await pool.request().query(`
    SELECT VideosId, Name, Description, Link, ShowHomePage,
           Name_en, Description_en, Link_en, Hide_en,
           Name_fr, Description_fr, Link_fr, Hide_fr
    FROM Videos
    WHERE Link IS NOT NULL AND Link != ''
      AND (
        (Hide_en = 0 AND (Name_en IS NULL OR Name_en = ''))
        OR
        (Hide_fr = 0 AND (Name_fr IS NULL OR Name_fr = ''))
      )
    ORDER BY VideosId
  `);
  console.log(`Candidate source videos: ${cand.recordset.length}`);

  // Load the existing LinkSetting + Media mappings from the tracker
  const [lsMap] = await trackerDb.query(
    "SELECT source_id, target_id FROM id_mappings WHERE entity_type = 'VideoGallery_LinkSetting'"
  );
  const lsBySource = new Map(lsMap.map(r => [r.source_id, Number(r.target_id)]));

  // Also load existing Media by (source_id, lang) so we can reuse when URLs match
  const [mediaMap] = await trackerDb.query(
    "SELECT entity_type, source_id, target_id FROM id_mappings WHERE entity_type LIKE 'VideoGallery_Media_%'"
  );
  const mediaBySourceLang = new Map();
  for (const r of mediaMap) {
    const lang = r.entity_type.split("_").pop();
    mediaBySourceLang.set(`${r.source_id}|${lang}`, Number(r.target_id));
  }

  const plan = [];
  for (const v of cand.recordset) {
    const lsId = lsBySource.get(String(v.VideosId));
    if (!lsId) {
      console.log(`  SKIP VideosId=${v.VideosId}: no existing LinkSetting in tracker`);
      continue;
    }
    const langs = [
      { id: 2, label: "en", name: v.Name_en, desc: v.Description_en, link: v.Link_en, hide: v.Hide_en },
      { id: 3, label: "fr", name: v.Name_fr, desc: v.Description_fr, link: v.Link_fr, hide: v.Hide_fr }
    ];
    for (const lang of langs) {
      if (lang.hide !== 0) continue;
      const hasName = lang.name && String(lang.name).trim() !== "";
      if (hasName) continue; // already handled by main migration
      plan.push({
        VideosId: v.VideosId,
        LinkSettingId: lsId,
        LanguageId: lang.id,
        label: lang.label,
        title: v.Name,                          // Hebrew fallback
        description: v.Description,             // Hebrew fallback
        showHomePage: v.ShowHomePage,
        langLink: isValidUrl(lang.link) ? lang.link.trim() : v.Link.trim(),
        heLink: v.Link.trim()
      });
    }
  }
  console.log(`Planned inserts: ${plan.length}\n`);

  if (!plan.length) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // For each planned insert, check if a VGM already exists (idempotency)
  for (const p of plan) {
    const [ex] = await targetDb.query(
      "SELECT Id FROM VideoGalleryMedia WHERE LinkSettingId = ? AND LanguageId = ?",
      [p.LinkSettingId, p.LanguageId]
    );
    p.exists = ex.length > 0 ? ex[0].Id : null;
  }

  const skipExists = plan.filter(p => p.exists !== null);
  const toInsert = plan.filter(p => p.exists === null);
  console.log(`Already exist (skipped): ${skipExists.length}`);
  console.log(`Will insert:             ${toInsert.length}`);

  // For each row, determine Media to use:
  //  - If langLink == heLink → reuse the Hebrew Media (VideoGallery_Media_he)
  //  - Else if there's already a Media for (VideosId, label) in tracker → reuse it
  //  - Else create a new Media
  for (const p of toInsert) {
    const heMediaId = mediaBySourceLang.get(`${p.VideosId}|he`);
    if (p.langLink === p.heLink && heMediaId) {
      p.mediaId = heMediaId;
      p.mediaAction = "reuse-hebrew";
    } else {
      const existingLangMedia = mediaBySourceLang.get(`${p.VideosId}|${p.label}`);
      if (existingLangMedia) {
        p.mediaId = existingLangMedia;
        p.mediaAction = "reuse-lang";
      } else {
        p.mediaAction = "create";
      }
    }
  }

  console.log("\n--- Insert plan detail ---");
  for (const p of toInsert) {
    console.log(`  VideosId=${p.VideosId} Lang=${p.LanguageId}(${p.label}) title="${(p.title || "").substring(0,30)}..." media=${p.mediaAction}${p.mediaId ? "("+p.mediaId+")" : ""}`);
  }

  if (DRY_RUN) {
    console.log("\nDRY-RUN — no writes. Re-run with --execute.");
    process.exit(0);
  }

  console.log("\n--- EXECUTING ---");
  let inserted = 0, mediaCreated = 0;
  for (const p of toInsert) {
    const conn = await targetDb.getConnection();
    try {
      await conn.beginTransaction();
      let mediaId = p.mediaId;
      if (!mediaId) {
        mediaId = await insertRow(conn, "Media", {
          YearDirectory: "legacy",
          MonthDirectory: "videoGallery",
          RelativePath: truncate(p.langLink, 500),
          SourceType: DEFAULT_SOURCE_TYPE,
          MediaType: DEFAULT_MEDIA_TYPE,
          FriendlyName: cleanStr(p.title, 100),
          MatchToPlatform: DEFAULT_MATCH_PLATFORM,
          RecordStatus: DEFAULT_RECORD_STATUS,
          StatusChangedAt: NOW, StatusChangedBy: DEFAULT_USER,
          CreatedAt: NOW, CreatedBy: DEFAULT_USER,
          UpdatedAt: NOW, UpdatedBy: DEFAULT_USER
        });
        mediaCreated++;
        await trackerDb.query(
          "INSERT INTO id_mappings (entity_type,source_id,target_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
          [`VideoGallery_Media_${p.label}`, String(p.VideosId), String(mediaId)]
        );
      }
      const vgmId = await insertRow(conn, "VideoGalleryMedia", {
        LanguageId: p.LanguageId,
        MediaId: mediaId,
        LinkSettingId: p.LinkSettingId,
        Title: cleanStr(p.title, 200),
        Description: cleanStr(p.description, 500),
        DisplayInGallery: 1, // Hide_X = 0 for all patched rows
        DisplayInMainPage: (p.showHomePage === 1 ? 1 : 0),
        RecordStatus: DEFAULT_RECORD_STATUS,
        StatusChangedAt: NOW, StatusChangedBy: DEFAULT_USER,
        CreatedAt: NOW, CreatedBy: DEFAULT_USER,
        UpdatedAt: NOW, UpdatedBy: DEFAULT_USER
      });
      await trackerDb.query(
        "INSERT INTO id_mappings (entity_type,source_id,target_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
        [`VideoGallery_VGM_${p.label}`, String(p.VideosId), String(vgmId)]
      );
      await conn.commit();
      inserted++;
    } catch (e) {
      await conn.rollback();
      console.error(`  ERROR VideosId=${p.VideosId} Lang=${p.LanguageId}: ${e.message}`);
    } finally {
      conn.release();
    }
  }

  console.log(`\nInserted: ${inserted} VGM rows  (Media rows created: ${mediaCreated})`);
  process.exit(0);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
