/**
 * READ-ONLY diagnostic: how much does the abandoned ProductGroup (Type-3) logic
 * actually matter for TODAY's migration scope?
 *
 * For the 1,179 frozen scope products, checks:
 *   1. How many are ProductGroup parents / subs / either
 *   2. Terminal distribution of the scoped parents (are they even migrated as collections?)
 *   3. Per-parent SubProduct counts (= items old logic would create) vs flat 2 today
 *
 * No writes. Source = MSSQL.
 */
const path = require("path");
const mssql = require(path.resolve(__dirname, "../../server/src/db/mssql"));

function loadScopeIds() {
  const s = require(path.resolve(__dirname, "../../server/data/scope-products.json"));
  return (s.productIds || []).map(Number).filter(n => !isNaN(n));
}

async function main() {
  const ids = loadScopeIds();
  const inList = ids.join(",");
  console.log(`Scope size: ${ids.length} products\n`);

  // 1. Scoped products that are ProductGroup parents / subs
  const parents = await mssql.query(
    `SELECT COUNT(DISTINCT ParentProductId) AS c
     FROM ProductGroup WITH (NOLOCK)
     WHERE ParentProductId IN (${inList})`);
  const subs = await mssql.query(
    `SELECT COUNT(DISTINCT SubProductId) AS c
     FROM ProductGroup WITH (NOLOCK)
     WHERE SubProductId IN (${inList})`);
  const either = await mssql.query(
    `SELECT COUNT(*) AS c FROM (
       SELECT productsid FROM Products WITH (NOLOCK)
       WHERE productsid IN (${inList})
         AND EXISTS (SELECT 1 FROM ProductGroup g WITH (NOLOCK)
                     WHERE g.ParentProductId = Products.productsid
                        OR g.SubProductId = Products.productsid)
     ) t`);

  console.log("=== ProductGroup membership WITHIN scope ===");
  console.log(`  Scoped products that are PARENTS (campaigns): ${parents.recordset[0].c}`);
  console.log(`  Scoped products that are SUBS (would-be items): ${subs.recordset[0].c}`);
  console.log(`  Scoped products in ProductGroup at all (parent OR sub): ${either.recordset[0].c}\n`);

  if (parents.recordset[0].c === 0 && subs.recordset[0].c === 0) {
    console.log("✅ No scoped product touches ProductGroup. The abandoned Type-3 logic is IRRELEVANT to this scope.");
    return;
  }

  // 2. Terminal distribution of scoped parents (1=collection today, 4=fund today)
  const termDist = await mssql.query(
    `SELECT p.Terminal, COUNT(*) AS c
     FROM Products p WITH (NOLOCK)
     WHERE p.productsid IN (${inList})
       AND EXISTS (SELECT 1 FROM ProductGroup g WITH (NOLOCK) WHERE g.ParentProductId = p.productsid)
     GROUP BY p.Terminal ORDER BY p.Terminal`);
  console.log("=== Terminal of scoped ProductGroup PARENTS (1=collection, 4=fund today) ===");
  termDist.recordset.forEach(r => console.log(`  Terminal=${r.Terminal}: ${r.c}`));
  console.log("");

  // 3. Per-parent SubProduct counts = items old logic would create (old: nSubs + 1 donation; today: 2)
  const perParent = await mssql.query(
    `SELECT g.ParentProductId, COUNT(*) AS subCount
     FROM ProductGroup g WITH (NOLOCK)
     WHERE g.ParentProductId IN (${inList})
     GROUP BY g.ParentProductId
     ORDER BY subCount DESC`);
  const rows = perParent.recordset;
  if (rows.length) {
    const dist = {};
    let totalOldItems = 0;
    rows.forEach(r => {
      dist[r.subCount] = (dist[r.subCount] || 0) + 1;
      totalOldItems += r.subCount + 1; // +1 fixed donation item per campaign
    });
    const totalTodayItems = rows.length * 2;
    console.log("=== Per-campaign item count: OLD (nSubs + 1 donation) vs TODAY (flat 2) ===");
    console.log("  SubProducts-per-campaign distribution (how many campaigns have N subs):");
    Object.keys(dist).sort((a, b) => a - b).forEach(k =>
      console.log(`    ${k} subs -> ${dist[k]} campaigns`));
    console.log(`\n  Scoped campaigns (parents): ${rows.length}`);
    console.log(`  Items OLD logic would create:   ${totalOldItems}`);
    console.log(`  Items TODAY creates (2 each):   ${totalTodayItems}`);
    console.log(`  >>> Net item delta (lost):      ${totalOldItems - totalTodayItems}`);
    console.log(`\n  Top 10 campaigns by sub count:`);
    rows.slice(0, 10).forEach(r => console.log(`    Parent ${r.ParentProductId}: ${r.subCount} subs`));
  }
}

main()
  .then(() => mssql.close())
  .then(() => process.exit(0))
  .catch(err => { console.error("ERROR:", err.message); process.exit(1); });
