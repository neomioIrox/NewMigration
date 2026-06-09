/**
 * READ-ONLY inspection: current state of migrated Prayer items and their LinkSettings.
 *
 * Answers:
 *  - How many prayer ProjectItems were migrated (via id_mappings ProjectItem_prayerName)?
 *  - Are they collapsed under one Project (new form) or scattered (old per-prayer form)?
 *  - Do their ProjectItemLocalization rows have MainButton/Footer LinkSettingId set?
 *  - Do any LinkSetting rows already point at prayer items?
 *
 * Usage: node scripts/checks/check-prayer-link-settings.js
 */
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

async function run() {
  console.log("=== Prayer LinkSettings inspection (READ-ONLY) ===\n");

  // 1. Prayer item mappings from tracker (canonical PrayersId -> ProjectItem.Id)
  const [pm] = await trackerDb.query(
    "SELECT COUNT(*) AS cnt, MIN(CAST(target_id AS UNSIGNED)) AS minId, MAX(CAST(target_id AS UNSIGNED)) AS maxId " +
    "FROM id_mappings WHERE entity_type='ProjectItem_prayerName'");
  console.log("ProjectItem_prayerName mappings:", pm[0].cnt, "| target Id range:", pm[0].minId, "-", pm[0].maxId);

  if (!pm[0].cnt) {
    console.log("\n>> No prayer items migrated yet. Nothing to patch.");
    await closeAll();
    return;
  }

  // Collect the prayer ProjectItem ids
  const [ids] = await trackerDb.query(
    "SELECT CAST(target_id AS UNSIGNED) AS id FROM id_mappings WHERE entity_type='ProjectItem_prayerName'");
  const itemIds = ids.map(r => r.id);
  const inList = itemIds.join(",");

  // 2. ProjectId distribution of those items (collapsed => all same ProjectId)
  const [dist] = await targetDb.query(
    "SELECT ProjectId, ItemType, COUNT(*) AS cnt FROM `ProjectItem` WHERE Id IN (" + inList + ") GROUP BY ProjectId, ItemType ORDER BY cnt DESC");
  console.log("\nProjectId / ItemType distribution of prayer items:");
  dist.forEach(r => console.log("  ProjectId=" + r.ProjectId + " ItemType=" + r.ItemType + " -> " + r.cnt + " items"));

  // 3. ProjectItemLocalization button coverage for those items
  const [pil] = await targetDb.query(
    "SELECT COUNT(*) AS rows_, " +
    "SUM(CASE WHEN MainButtonLinkSettingId IS NOT NULL THEN 1 ELSE 0 END) AS withMain, " +
    "SUM(CASE WHEN ProjectFooterLinkSettingId IS NOT NULL THEN 1 ELSE 0 END) AS withFooter " +
    "FROM `ProjectItemLocalization` WHERE ItemId IN (" + inList + ")");
  console.log("\nProjectItemLocalization rows for prayer items:", pil[0].rows_);
  console.log("  with MainButtonLinkSettingId:  ", pil[0].withMain);
  console.log("  with ProjectFooterLinkSettingId:", pil[0].withFooter);

  // Per-language breakdown of localization rows
  const [byLang] = await targetDb.query(
    "SELECT Language, COUNT(*) AS cnt FROM `ProjectItemLocalization` WHERE ItemId IN (" + inList + ") GROUP BY Language ORDER BY Language");
  console.log("  by Language:", byLang.map(r => "L" + r.Language + "=" + r.cnt).join(", "));

  // 4. Existing LinkSetting rows already pointing at prayer items
  const [ls] = await targetDb.query(
    "SELECT COUNT(*) AS cnt FROM `LinkSetting` WHERE ItemId IN (" + inList + ")");
  console.log("\nExisting LinkSetting rows pointing at prayer items:", ls[0].cnt);

  // 5. What Project Id=1 looks like (the collapse target)
  const [p1] = await targetDb.query("SELECT Id, Name, ProjectType FROM `Project` WHERE Id=1");
  console.log("\nProject Id=1:", p1.length ? JSON.stringify(p1[0]) : "DOES NOT EXIST (!)");

  console.log("\n=== Verdict ===");
  const needPatch = Number(pil[0].rows_) - Number(pil[0].withMain);
  console.log("Localization rows still missing a Main button:", needPatch);
  await closeAll();
}

async function closeAll() {
  try { await targetDb.close(); } catch (e) {}
  try { await trackerDb.close(); } catch (e) {}
}

run().catch(e => { console.error("FATAL:", e.message); closeAll().then(() => process.exit(1)); });
