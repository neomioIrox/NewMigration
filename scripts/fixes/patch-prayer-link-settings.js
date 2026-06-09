/**
 * One-off patch: add per-item "Donate" LinkSettings (mainButton + footerButton) to
 * already-migrated Prayer items that were created WITHOUT them.
 *
 * Mirrors the engine's _processLinkSettings + _updateItemLocalizationLinks exactly:
 *   - For each prayer ProjectItem, for each existing ProjectItemLocalization language:
 *       * INSERT LinkSetting mainButton  (LinkType=1, LinkTargetType=3, ProjectId=<item's project>, ItemId=<item>)
 *       * INSERT LinkSetting footerButton (same)
 *       * UPDATE ProjectItemLocalization SET MainButtonLinkSettingId, ProjectFooterLinkSettingId
 *       * record id_mappings LinkSetting_<btn>_<lang> keyed by PrayersId (engine convention)
 *
 * ITEM-LEVEL ONLY — does not touch any Project / ProjectLocalization row.
 * Idempotent: skips localization rows that already have MainButtonLinkSettingId.
 *
 * Usage:
 *   node scripts/fixes/patch-prayer-link-settings.js            # DRY-RUN (no writes)
 *   node scripts/fixes/patch-prayer-link-settings.js --execute  # apply
 */
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

const DRY_RUN = !process.argv.includes("--execute");
const NOW = new Date();

// Language number -> { lang string (for id_mappings key), LinkText per the Collections mapping }
const LANGS = {
  1: { name: "hebrew",  text: "לתרומה" },
  2: { name: "english", text: "Donate" },
  3: { name: "french",  text: "Pour faire un don" }
};
const MAIN = { LinkType: 1, LinkTargetType: 3 };
const FOOTER = { LinkType: 1, LinkTargetType: 3 };

async function insertRow(conn, table, data) {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(",");
  const vals = cols.map(c => data[c] === undefined ? null : data[c]);
  const sql = "INSERT INTO `" + table + "` (" + cols.map(c => "`" + c + "`").join(",") + ") VALUES (" + placeholders + ")";
  const [r] = await conn.query(sql, vals);
  return r.insertId;
}

function linkSettingRow(projectId, itemId, langDef, btn) {
  return {
    LinkType: btn.LinkType,
    LinkTargetType: btn.LinkTargetType,
    ProjectId: projectId,
    ItemId: itemId,
    LinkText: langDef.text,
    CreatedAt: NOW, CreatedBy: -1,
    UpdatedAt: NOW, UpdatedBy: -1
  };
}

async function run() {
  console.log("=== Patch: prayer item Donate LinkSettings ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN (no writes)" : "EXECUTE");
  console.log("");

  // 1. PrayersId -> ProjectItem.Id (canonical)
  const [pm] = await trackerDb.query(
    "SELECT source_id, CAST(target_id AS UNSIGNED) AS itemId FROM id_mappings WHERE entity_type='ProjectItem_prayerName'");
  if (!pm.length) { console.log("No prayer items found. Nothing to do."); return finish(); }
  const itemToPrayer = new Map(pm.map(r => [Number(r.itemId), String(r.source_id)]));
  const itemIds = [...itemToPrayer.keys()];
  const inList = itemIds.join(",");
  console.log("Prayer items:", itemIds.length);

  // 2. ItemId -> ProjectId (current structure; one project per item in old form)
  const [items] = await targetDb.query("SELECT Id, ProjectId FROM `ProjectItem` WHERE Id IN (" + inList + ")");
  const itemProject = new Map(items.map(r => [Number(r.Id), Number(r.ProjectId)]));

  // 3. Localization rows + current button state (idempotency)
  const [pil] = await targetDb.query(
    "SELECT ItemId, Language, MainButtonLinkSettingId FROM `ProjectItemLocalization` WHERE ItemId IN (" + inList + ") ORDER BY ItemId, Language");

  const todo = pil.filter(r => r.MainButtonLinkSettingId == null && LANGS[r.Language]);
  const alreadyDone = pil.length - todo.length;
  console.log("Localization rows total:", pil.length, "| already have button:", alreadyDone, "| to patch:", todo.length);

  // Per-language preview
  const byLang = {};
  todo.forEach(r => { byLang[r.Language] = (byLang[r.Language] || 0) + 1; });
  console.log("To patch by Language:", Object.keys(byLang).map(l => "L" + l + "=" + byLang[l]).join(", ") || "(none)");
  console.log("Will create LinkSetting rows:", todo.length * 2, "(main+footer per localization)");
  console.log("");

  if (!todo.length) { console.log("Nothing to patch."); return finish(); }

  if (DRY_RUN) {
    const sample = todo.slice(0, 4);
    console.log("--- sample (first 4) ---");
    sample.forEach(r => {
      const pid = itemProject.get(Number(r.ItemId));
      console.log(`  Item ${r.ItemId} (Project ${pid}) Lang L${r.Language} -> main+footer "${LANGS[r.Language].text}"`);
    });
    console.log("\nDRY-RUN — no writes. Re-run with --execute.");
    return finish();
  }

  console.log("--- EXECUTING ---");
  let patched = 0, lsCreated = 0, errors = 0;
  for (const r of todo) {
    const itemId = Number(r.ItemId);
    const projectId = itemProject.get(itemId);
    const prayerId = itemToPrayer.get(itemId);
    const langDef = LANGS[r.Language];
    const conn = await targetDb.getConnection();
    try {
      await conn.beginTransaction();
      const mainId = await insertRow(conn, "LinkSetting", linkSettingRow(projectId, itemId, langDef, MAIN));
      const footerId = await insertRow(conn, "LinkSetting", linkSettingRow(projectId, itemId, langDef, FOOTER));
      await conn.query(
        "UPDATE `ProjectItemLocalization` SET MainButtonLinkSettingId=?, ProjectFooterLinkSettingId=? WHERE ItemId=? AND Language=?",
        [mainId, footerId, itemId, r.Language]);
      await conn.commit();
      lsCreated += 2;
      // tracker id_mappings (engine convention) — outside the target txn
      await trackerDb.query(
        "INSERT INTO id_mappings (entity_type,source_id,target_id) VALUES (?,?,?),(?,?,?) " +
        "ON DUPLICATE KEY UPDATE target_id=VALUES(target_id)",
        ["LinkSetting_mainButton_" + langDef.name, prayerId, String(mainId),
         "LinkSetting_footerButton_" + langDef.name, prayerId, String(footerId)]);
      patched++;
    } catch (e) {
      await conn.rollback();
      errors++;
      console.error(`  ERROR Item ${itemId} Lang L${r.Language}: ${e.message}`);
    } finally {
      conn.release();
    }
  }
  console.log(`\nPatched localizations: ${patched} | LinkSetting rows created: ${lsCreated} | errors: ${errors}`);
  return finish();
}

async function finish() {
  try { await targetDb.close(); } catch (e) {}
  try { await trackerDb.close(); } catch (e) {}
}

run().catch(e => { console.error("FATAL:", e.message); finish().then(() => process.exit(1)); });
