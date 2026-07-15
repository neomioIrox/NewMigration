#!/usr/bin/env node
/**
 * READ-ONLY. Answers: "if we migrate only in-date completed donations, will any of them
 * reference a product/prayer we did NOT migrate (and thus fall back to ItemId=1)?"
 *
 * Replicates the engine's _determineItemId logic against the LIVE id_mappings caches
 * (ProjectItem_funds / _certificate / _donation / _prayerName) for every distinct
 * (ProjectId, PrayerId) combo among scoped donations, and classifies each orphan by reason.
 *
 * No writes. Usage: node scripts/checks/check-donation-itemid-orphans.js
 */
const mssql = require("../../server/src/db/mssql");
const tracker = require("../../server/src/db/mysql-tracker");
const { preloadFKCache } = require("../../server/src/engine/fk-resolver");
const donScope = require("../../server/data/scope-products.json");

const CUTOFF = donScope.cutoff || "2025-06-01";
const scopeIds = new Set((donScope.productIds || []).map(Number));
const SCOPE = " WHERE ChargeStatus='OrderFinished' AND DateCreated >= '" + CUTOFF + "'";

// Faithful copy of engine._determineItemId, returns {itemId, reason}
function determineItemId(projectId, prayerId, caches) {
  if (prayerId && prayerId > 0) {
    if (caches.prayer.get(String(prayerId))) return { itemId: 99, reason: "fromPrayer" };
    if (!(projectId && projectId > 0)) return { itemId: 1, reason: "orphan:prayer-missing-no-project" };
    // else fall through to ProjectId
  }
  if (projectId && projectId > 0) {
    var pid = String(projectId);
    if (caches.funds.get(pid)) return { itemId: 99, reason: "fromProduct" };
    if (caches.cert.get(pid)) return { itemId: 99, reason: "fromProduct" };
    if (caches.donation.get(pid)) return { itemId: 99, reason: "fromProduct" };
    return { itemId: 1, reason: "orphan:project-not-migrated" };
  }
  return { itemId: 1, reason: "orphan:no-project-no-prayer" };
}

(async () => {
  console.log("ItemId orphan check | cutoff: " + CUTOFF + " | scope products: " + scopeIds.size);

  const caches = {
    funds: await preloadFKCache("ProjectItem_funds"),
    cert: await preloadFKCache("ProjectItem_certificate"),
    donation: await preloadFKCache("ProjectItem_donation"),
    prayer: await preloadFKCache("ProjectItem_prayerName"),
  };
  console.log("caches: funds=" + caches.funds.size + " cert=" + caches.cert.size +
    " donation=" + caches.donation.size + " prayer=" + caches.prayer.size);

  const rows = (await mssql.query(
    "SELECT ISNULL(ProjectId,0) AS ProjectId, ISNULL(PrayerId,0) AS PrayerId, COUNT(*) AS cnt" +
    " FROM Orders WITH (NOLOCK)" + SCOPE +
    " GROUP BY ISNULL(ProjectId,0), ISNULL(PrayerId,0)")).recordset;

  let total = 0, orphan = 0;
  const reasons = {};
  const orphanProjInScope = new Set(), orphanProjNotInScope = new Set();
  const sampleNotInScope = [];

  for (const r of rows) {
    total += r.cnt;
    const res = determineItemId(Number(r.ProjectId), Number(r.PrayerId), caches);
    if (res.itemId === 1) {
      orphan += r.cnt;
      reasons[res.reason] = (reasons[res.reason] || 0) + r.cnt;
      if (res.reason === "orphan:project-not-migrated") {
        if (scopeIds.has(Number(r.ProjectId))) orphanProjInScope.add(Number(r.ProjectId));
        else { orphanProjNotInScope.add(Number(r.ProjectId)); if (sampleNotInScope.length < 15) sampleNotInScope.push(r.ProjectId + "(" + r.cnt + ")"); }
      }
    }
  }

  console.log("\n=== RESULT ===");
  console.log("total in-date completed donations: " + total);
  console.log("would resolve to ItemId=1 (orphan): " + orphan + "  (" + (total ? (orphan / total * 100).toFixed(3) : 0) + "%)");
  console.log("\nbreakdown by reason:");
  Object.keys(reasons).forEach((k) => console.log("  " + k + ": " + reasons[k]));

  console.log("\nfor 'project-not-migrated' orphans:");
  console.log("  distinct ProjectIds that ARE in scope-products but NOT in id_mappings (migration gap!): " + orphanProjInScope.size);
  if (orphanProjInScope.size) console.log("    -> " + [...orphanProjInScope].slice(0, 20).join(", "));
  console.log("  distinct ProjectIds NOT in scope-products (would be excluded by a scope filter): " + orphanProjNotInScope.size);
  if (sampleNotInScope.length) console.log("    sample ProjectId(donations): " + sampleNotInScope.join(", "));

  console.log("\n=== INTERPRETATION ===");
  console.log("If orphanProjInScope.size == 0 -> the scope IS internally consistent (your intuition holds).");
  console.log("A ProjectId-in-scope filter would only remove the 'NOT in scope-products' donations above.");

  await tracker.close && (tracker.close ? null : null);
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
