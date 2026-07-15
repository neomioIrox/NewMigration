/**
 * READ-ONLY verifier for Case 3 (ProductGroup campaigns). Run AFTER Type3_Parents + Type3_Subs.
 *
 * Confirms:
 *   1. Routing: every active member productsid (parents + subs) has exactly one
 *      `ProjectItem_certificate` row in tracker.id_mappings -> every order resolves to its own item.
 *   2. Structure: per active parent Project (ProjectType=2): 1 hidden donation item (ItemType=4,
 *      DisplayInSite=0) + 1 parent item + 1 item per sub.
 *   3. Totals vs the frozen scope (201 parents, 252 subs -> 201 Projects, 654 ProjectItems).
 */
const fs = require("fs");
const path = require("path");
const targetDb = require(path.resolve(__dirname, "../../server/src/db/mysql-target"));
const trackerDb = require(path.resolve(__dirname, "../../server/src/db/mysql-tracker"));

function loadIds(file) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../server/data", file), "utf8")).productIds.map(Number);
}

async function main() {
  const parents = loadIds("type3-parents.json");
  const subs = loadIds("type3-subs.json");
  const members = Array.from(new Set([...parents, ...subs]));
  console.log(`Frozen scope: ${parents.length} parents, ${subs.length} subs, ${members.length} distinct members\n`);

  // 1. Routing coverage in tracker.id_mappings
  const [certRows] = await trackerDb.query(
    "SELECT source_id FROM id_mappings WHERE entity_type='ProjectItem_certificate' AND source_id IN (" +
    members.map(() => "?").join(",") + ")", members.map(String));
  const covered = new Set(certRows.map(r => String(r.source_id)));
  const missing = members.filter(m => !covered.has(String(m)));
  console.log("=== 1. Donation-routing coverage (ProjectItem_certificate keyed by member productsid) ===");
  console.log(`  members with a routing entry: ${covered.size}/${members.length}`);
  console.log(`  MISSING (would orphan to ItemId=1): ${missing.length}` + (missing.length ? " -> " + missing.slice(0, 20).join(",") : " ✅"));

  // 2. Target structure per parent Project
  const [projCount] = await targetDb.query(
    "SELECT COUNT(*) c FROM Project WHERE ProjectType=2 AND Id IN (" + parents.map(() => "?").join(",") + ")", parents);
  const [itemsByType] = await targetDb.query(
    "SELECT pi.ItemType, COUNT(*) c FROM ProjectItem pi " +
    "JOIN Project p ON p.Id=pi.ProjectId AND p.ProjectType=2 AND p.Id IN (" + parents.map(() => "?").join(",") + ") " +
    "GROUP BY pi.ItemType ORDER BY pi.ItemType", parents);
  console.log("\n=== 2. Target structure (active parent Projects) ===");
  console.log(`  Projects (ProjectType=2) present: ${projCount[0].c}/${parents.length}`);
  const label = { 2: "certificate", 4: "donation", 5: "fund-donation" };
  itemsByType.forEach(r => console.log(`  ItemType=${r.ItemType} (${label[r.ItemType] || "?"}): ${r.c}`));

  // 3. Donation items must be hidden
  const [donHidden] = await targetDb.query(
    "SELECT pil.DisplayInSite, COUNT(*) c FROM ProjectItem pi " +
    "JOIN Project p ON p.Id=pi.ProjectId AND p.Id IN (" + parents.map(() => "?").join(",") + ") " +
    "JOIN ProjectItemLocalization pil ON pil.ItemId=pi.Id AND pil.Language=1 " +
    "WHERE pi.ItemType=4 GROUP BY pil.DisplayInSite", parents);
  console.log("\n=== 3. Donation items visibility (must all be DisplayInSite=0) ===");
  donHidden.forEach(r => console.log(`  DisplayInSite=${r.DisplayInSite}: ${r.c}`));

  const totalItems = itemsByType.reduce((s, r) => s + Number(r.c), 0);
  console.log("\n=== Totals ===");
  console.log(`  Expected: 201 Projects, 654 ProjectItems`);
  console.log(`  Actual:   ${projCount[0].c} Projects, ${totalItems} ProjectItems`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error("ERROR:", err.message); process.exit(1); });
