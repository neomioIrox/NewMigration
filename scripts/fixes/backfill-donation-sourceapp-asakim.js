/**
 * One-off backfill: set Donation.SourceApp = 3 (Asakim) for already-migrated
 * business donations that were imported under the old (buggy) mapping.
 *
 * Background: donation-engine._mapSourceApp originally had NO branch for
 * PaymentMethod='Asakim', so Asakim (business) orders fell through to the
 * default and were stored with SourceApp=1 (CustomerSite) instead of 3 (Asakim).
 * The engine is now fixed; this script corrects the rows that already migrated.
 *
 * It mirrors the FIXED engine mapping exactly:
 *     isManual -> 2 (ManagementSite)   [takes precedence]
 *     NedarimPlus -> 4 (Nedarim)
 *     Asakim -> 3 (Asakim)
 *     empty PaymentMethod + non-empty AsakimID -> 3 (Asakim)   [262 rows found post-migration:
 *         business orders sometimes have an empty PaymentMethod but always carry AsakimID;
 *         verified in-scope orders with AsakimID are ONLY Asakim/empty — no other methods]
 *     else -> 1 (CustomerSite)
 * so the corrective set is precisely:
 *     (PaymentMethod = 'Asakim' OR (empty PaymentMethod AND AsakimID non-empty))
 *     AND NOT IsManualDonation AND in migration scope.
 * (Asakim+manual rows correctly stay 2 and are excluded — old and new agree there.)
 *
 * Target rows are matched by Donation.Id == Orders.OrdersId (preserveSourceId),
 * and the IN() filter only ever touches rows that were actually migrated.
 * Idempotent: only rows with SourceApp <> 3 are written.
 *
 * Usage:
 *   node scripts/fixes/backfill-donation-sourceapp-asakim.js            # DRY-RUN (no writes)
 *   node scripts/fixes/backfill-donation-sourceapp-asakim.js --execute  # apply
 */
const mssqlDb = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");

const DRY_RUN = !process.argv.includes("--execute");
const CUTOFF = "2025-06-01"; // donation scope cutoff (scope-products.json) — same as donation-engine
const CHUNK = 1000;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function finish() {
  try { await targetDb.close(); } catch (e) {}
  try { await mssqlDb.close(); } catch (e) {}
}

async function run() {
  console.log("=== Backfill Donation.SourceApp = 3 (Asakim) ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN (no writes)" : "EXECUTE");
  console.log("Scope: ChargeStatus='OrderFinished' AND DateCreated >= " + CUTOFF);
  console.log("");

  // 1) Surface every PaymentMethod value containing 'asakim' (case-insensitive),
  //    so we can see whether '= Asakim' fully matches what the engine's exact === sees.
  const variants = (await mssqlDb.query(
    "SELECT PaymentMethod AS pm, COUNT(*) AS cnt FROM Orders WITH (NOLOCK) " +
    "WHERE PaymentMethod LIKE '%asakim%' GROUP BY PaymentMethod ORDER BY COUNT(*) DESC"
  )).recordset;
  console.log("Source PaymentMethod values matching '%asakim%':");
  if (!variants.length) console.log("   (none found)");
  variants.forEach(v => console.log("   '" + v.pm + "' : " + v.cnt +
    (v.pm === "Asakim"
      ? "   <-- exact value the engine maps to 3"
      : "   <-- VARIANT: engine's exact-match maps this to 1, NOT 3 (review)")));
  console.log("");

  // 2) Corrective source set = exactly what the fixed engine maps to SourceApp=3.
  const srcSql =
    "SELECT OrdersId FROM Orders WITH (NOLOCK) " +
    "WHERE (PaymentMethod = 'Asakim' " +
    "  OR ((PaymentMethod IS NULL OR PaymentMethod = '') AND AsakimID IS NOT NULL AND LTRIM(RTRIM(AsakimID)) <> '')) " +
    "AND ISNULL(IsManualDonation,0) <> 1 " +
    "AND ChargeStatus = 'OrderFinished' " +
    "AND DateCreated >= '" + CUTOFF + "'";
  const srcRows = (await mssqlDb.query(srcSql)).recordset;
  const ids = srcRows.map(r => r.OrdersId).filter(x => Number.isInteger(x));
  console.log("Source Asakim donations in scope (engine would map -> 3): " + ids.length);
  if (ids.length === 0) {
    console.log("Nothing to do.");
    return finish();
  }

  // 3) Inspect current target state (Donation.Id == OrdersId, preserveSourceId).
  const batches = chunk(ids, CHUNK);
  let present = 0;
  let toChange = 0;
  const dist = {}; // SourceApp -> count
  for (const b of batches) {
    const inList = b.join(",");
    const [rows] = await targetDb.query(
      "SELECT SourceApp, COUNT(*) AS cnt FROM `Donation` WHERE Id IN (" + inList + ") GROUP BY SourceApp"
    );
    for (const r of rows) {
      const n = Number(r.cnt);
      present += n;
      const key = r.SourceApp === null ? "NULL" : String(r.SourceApp);
      dist[key] = (dist[key] || 0) + n;
      if (r.SourceApp !== 3) toChange += n;
    }
  }
  console.log("Migrated & present in Donation: " + present + " of " + ids.length +
    "  (" + (ids.length - present) + " not migrated / out of scope)");
  console.log("Current SourceApp distribution among them:");
  Object.keys(dist).sort().forEach(k => console.log("   SourceApp=" + k + " : " + dist[k] +
    (k === "3" ? "   (already correct)" : "   <-- will become 3")));
  console.log("Rows to update (SourceApp <> 3): " + toChange);
  console.log("");

  // 4) Apply or stop.
  if (DRY_RUN) {
    console.log("DRY-RUN — no changes written. Re-run with --execute to apply.");
    return finish();
  }
  if (toChange === 0) {
    console.log("All already correct — nothing to write.");
    return finish();
  }

  console.log("--- EXECUTING ---");
  let updated = 0;
  for (const b of batches) {
    const inList = b.join(",");
    const [res] = await targetDb.query(
      "UPDATE `Donation` SET SourceApp = 3 WHERE Id IN (" + inList + ") AND SourceApp <> 3"
    );
    updated += res.affectedRows || 0;
  }
  console.log("UPDATE complete. Rows changed: " + updated);

  // 5) Verify nothing in the corrective set is left mislabeled.
  let remaining = 0;
  for (const b of batches) {
    const inList = b.join(",");
    const [rows] = await targetDb.query(
      "SELECT COUNT(*) AS cnt FROM `Donation` WHERE Id IN (" + inList + ") AND SourceApp <> 3"
    );
    remaining += Number(rows[0].cnt);
  }
  console.log("Verification — Asakim-in-scope rows still NOT SourceApp=3: " + remaining +
    (remaining === 0 ? "   OK" : "   <-- investigate"));

  return finish();
}

run().catch(e => { console.error("FATAL:", e.message); finish().then(() => process.exit(1)); });
