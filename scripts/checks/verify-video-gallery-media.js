/**
 * Verify the VideoGalleryMedia migration.
 *
 * Runs local DB checks AND calls the live API to confirm visibility.
 *
 * Usage:
 *   node scripts/checks/verify-video-gallery-media.js [--api]   # also hit the live API
 */
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");
const https = require("https");

const CHECK_API = process.argv.includes("--api");
const API_HOST = "releaseserver.kupath.click";
const API_PATH = "/api/gallery/getVideoGalleryQuickView/";

function apiCall(langId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ pageIndex: 1, limit: 500 });
    const req = https.request({
      host: API_HOST, path: API_PATH + langId, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "Origin": "https://release.kupath.click",
        "Referer": "https://release.kupath.click/"
      }
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("=== VideoGalleryMedia migration verification ===\n");

  // 1. Tracker counts
  const [track] = await trackerDb.query(`
    SELECT entity_type, COUNT(*) AS n FROM id_mappings
    WHERE entity_type LIKE 'VideoGallery_%'
    GROUP BY entity_type
    ORDER BY entity_type
  `);
  console.log("Tracker entities:");
  for (const r of track) console.log(`  ${r.entity_type.padEnd(36)} ${r.n}`);

  const lsIds = (await trackerDb.query(
    "SELECT target_id FROM id_mappings WHERE entity_type = 'VideoGallery_LinkSetting'"
  ))[0].map(r => Number(r.target_id));

  if (!lsIds.length) {
    console.log("\nNo migrated rows found. Run the migration first.");
    process.exit(0);
  }
  const lsIn = lsIds.join(",");
  console.log(`\nMigrated LinkSetting count: ${lsIds.length}`);

  // 2. LinkSetting sanity
  const [lsStats] = await targetDb.query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN LinkType=3 THEN 1 ELSE 0 END) AS listItem,
           SUM(CASE WHEN LinkTargetType=1 THEN 1 ELSE 0 END) AS toProj,
           SUM(CASE WHEN ProjectId=1 THEN 1 ELSE 0 END) AS proj1
    FROM LinkSetting WHERE Id IN (${lsIn})
  `);
  console.log("\nLinkSetting sanity:", lsStats[0]);

  // 3. VideoGalleryMedia counts per language
  const [vgmPerLang] = await targetDb.query(`
    SELECT LanguageId, COUNT(*) AS n,
           SUM(CASE WHEN Title IS NULL THEN 1 ELSE 0 END) AS nullTitle,
           SUM(CASE WHEN DisplayInGallery=1 THEN 1 ELSE 0 END) AS visible,
           SUM(CASE WHEN DisplayInGallery=0 THEN 1 ELSE 0 END) AS hidden,
           SUM(CASE WHEN DisplayInMainPage=1 THEN 1 ELSE 0 END) AS inMain
    FROM VideoGalleryMedia WHERE LinkSettingId IN (${lsIn})
    GROUP BY LanguageId
  `);
  console.log("\nVideoGalleryMedia per language:");
  for (const r of vgmPerLang) {
    console.log(`  Lang ${r.LanguageId}: total=${r.n}  nullTitle=${r.nullTitle}  visible=${r.visible}  hidden=${r.hidden}  inMain=${r.inMain}`);
  }

  // 4. Orphan check — any VGM without Media or without LinkSetting?
  const [orphans] = await targetDb.query(`
    SELECT COUNT(*) AS orphaned FROM VideoGalleryMedia vgm
    LEFT JOIN Media m ON m.Id = vgm.MediaId
    LEFT JOIN LinkSetting ls ON ls.Id = vgm.LinkSettingId
    WHERE vgm.LinkSettingId IN (${lsIn})
      AND (m.Id IS NULL OR ls.Id IS NULL)
  `);
  console.log(`\nOrphan VGM rows (missing Media or LinkSetting): ${orphans[0].orphaned}`);

  // 5. Media type/source sanity
  const [mediaStats] = await targetDb.query(`
    SELECT SourceType, MediaType, COUNT(*) AS n
    FROM Media
    WHERE YearDirectory='legacy' AND MonthDirectory='videoGallery'
    GROUP BY SourceType, MediaType
  `);
  console.log("\nMigrated Media (legacy/videoGallery):");
  for (const r of mediaStats) console.log(`  SourceType=${r.SourceType} MediaType=${r.MediaType}: ${r.n}`);

  // 6. Duplicate link check — are the same URLs deduplicated within each source video?
  const [dedupeCheck] = await targetDb.query(`
    SELECT vgm.LinkSettingId, COUNT(DISTINCT vgm.MediaId) AS uniqueMedia, COUNT(*) AS totalLangs
    FROM VideoGalleryMedia vgm
    WHERE vgm.LinkSettingId IN (${lsIn})
    GROUP BY vgm.LinkSettingId
    HAVING uniqueMedia > 3
    LIMIT 5
  `);
  if (dedupeCheck.length > 0) {
    console.log("\n⚠️  Some LinkSettings have >3 unique Media — check dedup logic");
    console.log(dedupeCheck);
  } else {
    console.log("\n✓ Media dedup per video looks correct (≤3 unique media per LinkSetting)");
  }

  // 7. Spot check — 3 representative examples matching CASE A/B/C from source
  console.log("\n=== Spot check: 3 source videos ===");
  for (const caseLabel of [
    { sourceId: 1, label: "CASE A (same URL all langs)" },
    { sourceId: 46, label: "CASE B (HE+EN different)" },
    { sourceId: 43, label: "CASE C (HE/EN different, FR broken)" }
  ]) {
    const [ls] = await trackerDb.query(
      "SELECT target_id FROM id_mappings WHERE entity_type='VideoGallery_LinkSetting' AND source_id=?",
      [String(caseLabel.sourceId)]
    );
    if (!ls.length) { console.log(`  ${caseLabel.label}: NOT MIGRATED (source ${caseLabel.sourceId})`); continue; }
    const lsId = ls[0].target_id;

    const [rows] = await targetDb.query(`
      SELECT vgm.LanguageId, vgm.Title, vgm.DisplayInGallery, vgm.DisplayInMainPage,
             m.RelativePath
      FROM VideoGalleryMedia vgm JOIN Media m ON m.Id = vgm.MediaId
      WHERE vgm.LinkSettingId=? ORDER BY vgm.LanguageId
    `, [lsId]);
    console.log(`\n  ${caseLabel.label} — source VideosId=${caseLabel.sourceId}  →  LinkSetting.Id=${lsId}`);
    for (const r of rows) {
      const url = r.RelativePath.length > 60 ? r.RelativePath.substring(0, 57) + "..." : r.RelativePath;
      const disp = Buffer.isBuffer(r.DisplayInGallery) ? r.DisplayInGallery[0] : r.DisplayInGallery;
      const main = Buffer.isBuffer(r.DisplayInMainPage) ? r.DisplayInMainPage[0] : r.DisplayInMainPage;
      console.log(`    Lang ${r.LanguageId}: disp=${disp}  main=${main}  title="${(r.Title || "").substring(0, 40)}"  url=${url}`);
    }
  }

  // 8. Live API check
  if (CHECK_API) {
    console.log("\n=== Live API verification ===");
    for (const lang of [1, 2, 3]) {
      try {
        const res = await apiCall(lang);
        const n = (res.entities || []).length;
        console.log(`  Lang ${lang}: API returned ${n} entities, succeeded=${res.succeeded}`);
      } catch (e) {
        console.log(`  Lang ${lang}: API ERROR — ${e.message}`);
      }
    }
  } else {
    console.log("\n(Run with --api to also query the live API)");
  }

  process.exit(0);
}

run().catch(err => { console.error("FATAL:", err.message); console.error(err.stack); process.exit(1); });
