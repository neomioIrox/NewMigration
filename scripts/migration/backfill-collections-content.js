#!/usr/bin/env node
/**
 * One-off backfill: add the full rich content (EntityContent) to PROJECT-LEVEL collection Projects
 * that were migrated BEFORE entityContentMappings existed on their mapping. Covers two sets:
 *   - Case 2  : ProjectMapping_Collections_Fixed   (in scope, Terminal=1, NOT a ProductGroup member)
 *   - Case 3a : ProjectMapping_Type3_Parents       (server/data/type3-parents.json)
 * Both are normal-mode Projects, so content goes to ProjectLocalization.ContentId.
 *
 * NOT covered: Type3 SUBS (collapse mode -> content lives on ProjectItemLocalization.ContentId).
 * Subs are born correct when run via the (fixed) engine; if they were ever run WITHOUT content a
 * separate item-level backfill would be needed.
 *
 * Mirrors the engine's _processEntityContent. Idempotent (skips a language whose ContentId is set
 * or whose source Description is empty). preserveSourceId => Project.Id == source productsid.
 *
 * Usage:
 *   node scripts/migration/backfill-collections-content.js --dry-run   # report only, no writes
 *   node scripts/migration/backfill-collections-content.js             # apply (live write to target)
 */
const path = require("path");
const mssql = require(path.resolve(__dirname, "../../server/src/db/mssql"));
const targetDb = require(path.resolve(__dirname, "../../server/src/db/mysql-target"));
const { processGetDate } = require(path.resolve(__dirname, "../../server/src/engine/expression-eval"));

const DRY = process.argv.includes("--dry-run");
const LANGS = [
  { id: 1, key: "hebrew", col: "Description" },
  { id: 2, key: "english", col: "Description_en" },
  { id: 3, key: "french", col: "Description_fr" },
];
const DESC_COLS = "CAST(Description AS NVARCHAR(MAX)) AS Description, " +
  "CAST(Description_en AS NVARCHAR(MAX)) AS Description_en, " +
  "CAST(Description_fr AS NVARCHAR(MAX)) AS Description_fr";

function urlReplace(text) {
  return String(text).replace(/href\s*=\s*["'][^"']*["']/gi, () => 'routerLink="/donate"');
}

async function main() {
  console.log((DRY ? "[DRY RUN] " : "[LIVE] ") + "Backfill project-level EntityContent\n");

  // SOURCE-DRIVEN sets (avoids touching prayers / stale ProjectType=2 rows in the target)
  const scopeIds = require(path.resolve(__dirname, "../../server/data/scope-products.json"))
    .productIds.map(Number).filter(n => !isNaN(n));
  const parentIds = require(path.resolve(__dirname, "../../server/data/type3-parents.json"))
    .productIds.map(Number).filter(n => !isNaN(n));
  const notGroup = "NOT EXISTS (SELECT 1 FROM ProductGroup g WITH (NOLOCK) " +
    "WHERE g.ParentProductId = Products.productsid OR g.SubProductId = Products.productsid)";

  const case2 = (await mssql.query(
    "SELECT productsid, " + DESC_COLS + " FROM Products WITH (NOLOCK) " +
    "WHERE productsid IN (" + scopeIds.join(",") + ") AND Terminal = 1 AND " + notGroup
  )).recordset.map(r => ({ ...r, _cat: "collection" }));

  const parents = (await mssql.query(
    "SELECT productsid, " + DESC_COLS + " FROM Products WITH (NOLOCK) " +
    "WHERE productsid IN (" + parentIds.join(",") + ")"
  )).recordset.map(r => ({ ...r, _cat: "type3-parent" }));

  const rows = [...case2, ...parents];
  console.log(`Source-driven sets: ${case2.length} collections + ${parents.length} type3-parents = ${rows.length}\n`);

  const stats = {};
  function bump(cat, k) { (stats[cat] = stats[cat] || { projects: 0, content: 0, skipHas: 0, skipNoSrc: 0, skipNoLoc: 0 })[k]++; }

  for (const src of rows) {
    const pid = Number(src.productsid);
    let touched = false;
    for (const lang of LANGS) {
      const desc = src[lang.col];
      if (!desc || String(desc).trim() === "") { bump(src._cat, "skipNoSrc"); continue; }
      const [loc] = await targetDb.query(
        "SELECT Id, ContentId FROM ProjectLocalization WHERE ProjectId = ? AND Language = ?", [pid, lang.id]);
      if (!loc.length) { bump(src._cat, "skipNoLoc"); continue; }
      if (loc[0].ContentId != null) { bump(src._cat, "skipHas"); continue; }

      const descText = urlReplace(desc);
      if (!DRY) {
        const now = processGetDate();
        const [ec] = await targetDb.query(
          "INSERT INTO `EntityContent` (`Name`,`IsTemplate`,`CreatedAt`,`CreatedBy`) VALUES (?,?,?,?)", [null, 0, now, 1]);
        const contentId = ec.insertId;
        await targetDb.query(
          "INSERT INTO `EntityContentItem` (`ContentId`,`ItemType`,`ItemDefinition`,`Name`,`CreatedAt`,`CreatedBy`,`UpdatedAt`,`UpdatedBy`) VALUES (?,?,?,?,?,?,?,?)",
          [contentId, 11, JSON.stringify({ Text: descText }), null, now, 1, now, 1]);
        await targetDb.query(
          "UPDATE ProjectLocalization SET ContentId = ? WHERE ProjectId = ? AND Language = ? AND ContentId IS NULL",
          [contentId, pid, lang.id]);
      }
      bump(src._cat, "content"); touched = true;
    }
    if (touched) bump(src._cat, "projects");
  }

  console.log("=== Result by category ===");
  for (const cat of Object.keys(stats)) {
    const s = stats[cat];
    console.log(`  ${cat.padEnd(13)} projects:${s.projects}  EntityContent:${s.content}  (skip: hasContent=${s.skipHas}, noSrc=${s.skipNoSrc}, noLoc=${s.skipNoLoc})`);
  }
  const totalContent = Object.values(stats).reduce((a, s) => a + s.content, 0);
  console.log(`\n  TOTAL EntityContent to create: ${totalContent}`);
  if (DRY) console.log("[DRY RUN] No rows written. Re-run without --dry-run to apply.");
}

main()
  .then(() => mssql.close())
  .then(() => process.exit(0))
  .catch(err => { console.error("ERROR:", err.message); process.exit(1); });
