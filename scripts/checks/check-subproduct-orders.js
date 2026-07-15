/**
 * READ-ONLY: does the flattened ProductGroup hierarchy carry LIVE donations,
 * and does today's flat-2-items logic break donation->item linkage?
 *
 * Orders carry only Orders.ProjectId (= products.productsid). The donation engine
 * resolves ItemId by ProjectId lookup in the migrated ProjectItem caches.
 *
 * Checks (source = MSSQL):
 *   A. Of the 172 in-scope SUBS, how many have a finished order since cutoff (sanity).
 *   B. Order VOLUME (finished, since cutoff) on scoped subs vs scoped parents.
 *   C. ORPHAN RISK: finished orders (ANY date — matches donation-engine WHERE) whose
 *      ProjectId is a ProductGroup member NOT in scope => product never migrated =>
 *      donation resolves to ItemId=1 fallback / dangling Project FK.
 */
const path = require("path");
const mssql = require(path.resolve(__dirname, "../../server/src/db/mssql"));

const CUTOFF = "2025-06-01";

function scopeIds() {
  const s = require(path.resolve(__dirname, "../../server/data/scope-products.json"));
  return (s.productIds || []).map(Number).filter(n => !isNaN(n));
}

async function scalar(q) { return (await mssql.query(q)).recordset[0].c; }

async function main() {
  const ids = scopeIds();
  const inList = ids.join(",");
  console.log(`Scope: ${ids.length} products | cutoff: ${CUTOFF}\n`);

  // The 172 scoped subs and 203 scoped parents
  const scopedSubs = (await mssql.query(
    `SELECT DISTINCT SubProductId AS id FROM ProductGroup WITH (NOLOCK)
     WHERE SubProductId IN (${inList})`)).recordset.map(r => r.id);
  const scopedParents = (await mssql.query(
    `SELECT DISTINCT ParentProductId AS id FROM ProductGroup WITH (NOLOCK)
     WHERE ParentProductId IN (${inList})`)).recordset.map(r => r.id);
  console.log(`Scoped subs: ${scopedSubs.length} | Scoped parents: ${scopedParents.length}\n`);

  // A. Sanity: scoped subs with a finished order since cutoff (expect == all of them)
  const subsWithOrders = await scalar(
    `SELECT COUNT(DISTINCT ProjectId) AS c FROM Orders WITH (NOLOCK)
     WHERE ProjectId IN (${scopedSubs.join(",")})
       AND ChargeStatus='OrderFinished' AND DateCreated >= '${CUTOFF}'`);
  console.log("=== A. Live donations on the flattened hierarchy ===");
  console.log(`  Scoped subs with >=1 finished order since cutoff: ${subsWithOrders} / ${scopedSubs.length}`);
  console.log(`  (every in-scope product has one by construction — confirms subs carry live money)\n`);

  // B. Order volume on subs vs parents (since cutoff)
  const ordersOnSubs = await scalar(
    `SELECT COUNT(*) AS c FROM Orders WITH (NOLOCK)
     WHERE ProjectId IN (${scopedSubs.join(",")})
       AND ChargeStatus='OrderFinished' AND DateCreated >= '${CUTOFF}'`);
  const ordersOnParents = await scalar(
    `SELECT COUNT(*) AS c FROM Orders WITH (NOLOCK)
     WHERE ProjectId IN (${scopedParents.join(",")})
       AND ChargeStatus='OrderFinished' AND DateCreated >= '${CUTOFF}'`);
  console.log("=== B. Finished-order VOLUME since cutoff ===");
  console.log(`  Orders pointing at scoped SUBS:    ${ordersOnSubs}`);
  console.log(`  Orders pointing at scoped PARENTS: ${ordersOnParents}\n`);

  // C. Orphan risk: finished orders (ANY date) whose ProjectId is a ProductGroup member
  //    that is NOT in scope => never migrated => ItemId=1 fallback + dangling ProjectId.
  const pgMembersNotInScope = await scalar(
    `SELECT COUNT(DISTINCT m.id) AS c FROM (
        SELECT ParentProductId AS id FROM ProductGroup WITH (NOLOCK)
        UNION SELECT SubProductId FROM ProductGroup WITH (NOLOCK)
     ) m
     WHERE m.id NOT IN (${inList})
       AND EXISTS (SELECT 1 FROM Orders o WITH (NOLOCK)
                   WHERE o.ProjectId = m.id AND o.ChargeStatus='OrderFinished')`);
  const orphanOrders = await scalar(
    `SELECT COUNT(*) AS c FROM Orders o WITH (NOLOCK)
     WHERE o.ChargeStatus='OrderFinished'
       AND o.ProjectId NOT IN (${inList})
       AND EXISTS (SELECT 1 FROM ProductGroup g WITH (NOLOCK)
                   WHERE g.ParentProductId = o.ProjectId OR g.SubProductId = o.ProjectId)`);
  console.log("=== C. Orphan risk: ProductGroup members OUTSIDE scope with finished orders ===");
  console.log(`  (donation engine WHERE = all finished orders, not just since cutoff)`);
  console.log(`  PG members NOT in scope but with finished orders: ${pgMembersNotInScope}`);
  console.log(`  Total finished orders on those out-of-scope PG members: ${orphanOrders}`);
}

main()
  .then(() => mssql.close())
  .then(() => process.exit(0))
  .catch(err => { console.error("ERROR:", err.message); process.exit(1); });
