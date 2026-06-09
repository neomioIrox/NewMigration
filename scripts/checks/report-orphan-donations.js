#!/usr/bin/env node
/**
 * READ-ONLY. Produces reports/orphan-donations.xlsx — donations that HAVE a project/prayer
 * reference in the source but it does NOT resolve to a migrated ProjectItem, so they migrate
 * into the general bucket (ItemId=1). Pure general donations (no ProjectId AND no PrayerId)
 * are NOT included here — those are general by design, not "project not found".
 *
 * Usage: node scripts/checks/report-orphan-donations.js
 */
const path = require("path");
const XLSX = require(path.join(__dirname, "../../node_modules/xlsx"));
const mssql = require("../../server/src/db/mssql");
const scope = require("../../server/data/scope-products.json");
const { preloadFKCache } = require("../../server/src/engine/fk-resolver");

const CUTOFF = scope.cutoff || "2025-06-01";
const SCOPE = " WHERE ChargeStatus='OrderFinished' AND DateCreated >= '" + CUTOFF + "'";

// mirror engine._determineItemId for the "has a reference" cases
function classify(projectId, prayerId, c) {
  if (prayerId > 0) {
    if (c.prayer.get(String(prayerId))) return null; // resolved via prayer
    if (!(projectId > 0)) return "prayer-not-migrated";
  }
  if (projectId > 0) {
    if (c.funds.get(String(projectId)) || c.cert.get(String(projectId)) || c.don.get(String(projectId))) return null;
    return "project-unresolved"; // refined below (dangling vs not-migrated)
  }
  return null;
}

(async () => {
  const c = {
    funds: await preloadFKCache("ProjectItem_funds"),
    cert: await preloadFKCache("ProjectItem_certificate"),
    don: await preloadFKCache("ProjectItem_donation"),
    prayer: await preloadFKCache("ProjectItem_prayerName"),
  };

  // distinct referenced combos
  const combos = (await mssql.query(
    "SELECT ISNULL(ProjectId,0) AS ProjectId, ISNULL(PrayerId,0) AS PrayerId, COUNT(*) AS cnt" +
    " FROM Orders WITH (NOLOCK)" + SCOPE + " AND (ISNULL(ProjectId,0)>0 OR ISNULL(PrayerId,0)>0)" +
    " GROUP BY ISNULL(ProjectId,0), ISNULL(PrayerId,0)")).recordset;

  const orphanCombos = combos.filter((r) => classify(Number(r.ProjectId), Number(r.PrayerId), c));
  const orphanProjIds = [...new Set(orphanCombos.map((r) => Number(r.ProjectId)).filter((x) => x > 0))];

  // which orphan ProjectIds actually exist in Products (else they are dangling references)
  const inProducts = new Set();
  const nameById = new Map();
  if (orphanProjIds.length) {
    const pr = (await mssql.query(
      "SELECT productsid, Name FROM Products WITH (NOLOCK) WHERE productsid IN (" + orphanProjIds.join(",") + ")")).recordset;
    pr.forEach((p) => { inProducts.add(Number(p.productsid)); nameById.set(Number(p.productsid), (p.Name || "").trim()); });
  }

  // fetch per-donation detail for the orphan combos
  const conds = orphanCombos.map((r) => "(ISNULL(ProjectId,0)=" + Number(r.ProjectId) + " AND ISNULL(PrayerId,0)=" + Number(r.PrayerId) + ")").join(" OR ");
  const rows = conds ? (await mssql.query(
    "SELECT OrdersId, ISNULL(ProjectId,0) AS ProjectId, ISNULL(PrayerId,0) AS PrayerId, Total, ChargeCurrency," +
    " CONVERT(varchar(19),DateCreated,120) AS DateCreated, PaymentMethod" +
    " FROM Orders WITH (NOLOCK)" + SCOPE + " AND (" + conds + ") ORDER BY ProjectId, OrdersId")).recordset : [];

  const report = rows.map((r) => {
    const pid = Number(r.ProjectId);
    let reason;
    if (pid > 0) reason = inProducts.has(pid) ? "project-not-migrated" : "project-id-not-in-products (dangling)";
    else reason = "prayer-not-migrated";
    return {
      OrdersId: r.OrdersId, ProjectId: r.ProjectId || "", PrayerId: r.PrayerId || "",
      SourceProjectName: pid > 0 ? (nameById.get(pid) || "") : "",
      Total: r.Total, ChargeCurrency: r.ChargeCurrency, DateCreated: r.DateCreated,
      PaymentMethod: r.PaymentMethod, OrphanReason: reason, MigratedToItemId: 1,
    };
  });

  const ws = XLSX.utils.json_to_sheet(report);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "OrphanDonations");
  const out = path.join(__dirname, "../../reports/orphan-donations.xlsx");
  XLSX.writeFile(wb, out);

  // summary
  const byReason = report.reduce((a, r) => { a[r.OrphanReason] = (a[r.OrphanReason] || 0) + 1; return a; }, {});
  console.log("orphan donations (referenced but unresolved): " + report.length);
  console.log("by reason: " + JSON.stringify(byReason, null, 0));
  console.log("distinct ProjectIds: " + orphanProjIds.length + " | written: reports/orphan-donations.xlsx");
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
