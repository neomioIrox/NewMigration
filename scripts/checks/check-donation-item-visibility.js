/**
 * READ-ONLY: is the donation ProjectItem (ItemType=4) hidden in collections?
 * Cross-tabs ItemType vs DisplayInSite (Hebrew localization) for ProjectType=2 (collections).
 * Target = MySQL.
 */
const path = require("path");
const targetDb = require(path.resolve(__dirname, "../../server/src/db/mysql-target"));

async function main() {
  // Item visibility by ItemType for collections (Hebrew localization)
  const [rows] = await targetDb.query(`
    SELECT pi.ItemType,
           pil.DisplayInSite,
           COUNT(*) AS cnt
    FROM ProjectItem pi
    JOIN Project p            ON p.Id = pi.ProjectId AND p.ProjectType = 2
    JOIN ProjectItemLocalization pil ON pil.ItemId = pi.Id AND pil.Language = 1
    GROUP BY pi.ItemType, pil.DisplayInSite
    ORDER BY pi.ItemType, pil.DisplayInSite`);

  console.log("=== Collections (ProjectType=2): ItemType x DisplayInSite (Hebrew) ===");
  if (!rows.length) { console.log("  (no collection items found in target — migration not run for current scope?)"); }
  const label = { 2: "certificate", 4: "donation", 5: "funds" };
  rows.forEach(r =>
    console.log(`  ItemType=${r.ItemType} (${label[r.ItemType] || "?"})  DisplayInSite=${r.DisplayInSite}  ->  ${r.cnt}`));

  // Total collections + donation items for context
  const [[proj]] = await targetDb.query(
    "SELECT COUNT(*) AS c FROM Project WHERE ProjectType=2");
  const [[don]] = await targetDb.query(
    "SELECT COUNT(*) AS c FROM ProjectItem pi JOIN Project p ON p.Id=pi.ProjectId AND p.ProjectType=2 WHERE pi.ItemType=4");
  console.log(`\n  Collections (Project rows): ${proj.c}`);
  console.log(`  Donation items (ItemType=4) in collections: ${don.c}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error("ERROR:", err.message); process.exit(1); });
