#!/usr/bin/env node
/**
 * READ-ONLY. For each UNIQUE(ProjectId,Name) collision in Recruiter, the engine keeps
 * the LOWEST ProductStockId (inserted first) and drops the rest. This script finds the
 * DROPPED ProductStockIds and checks whether any donations (Orders.RecruiterId) point at
 * them — i.e. whether dropping them breaks donation referential integrity.
 *
 * Reports per dropped recruiter: the kept survivor id, total orders, and completed orders
 * since the scope cutoff (the subset that will actually migrate).
 *
 * No writes. Usage: node scripts/checks/check-dropped-recruiter-donations.js
 */
const mssql = require("../../server/src/db/mssql");
const scope = require("../../server/data/migrated-projects.json");
const donScope = require("../../server/data/scope-products.json");

const ids = (scope.productIds || scope.ids || []).map(Number).filter((n) => !isNaN(n) && n > 0);
const IN = ids.join(",");
const CUTOFF = donScope.cutoff || "2025-06-01";
const NAME = "LEFT(ISNULL(NULLIF(Name,''),N'ללא שם'),200)";

const sql =
  "WITH scoped AS (" +
  "  SELECT ProductStockId, ProductId, " + NAME + " AS Nm" +
  "  FROM ProductStock WITH (NOLOCK)" +
  "  WHERE ProductId IS NOT NULL AND ProductId IN (" + IN + ")" +
  "), ranked AS (" +
  "  SELECT *, COUNT(*) OVER (PARTITION BY ProductId, Nm) AS grpcnt," +
  "         ROW_NUMBER() OVER (PARTITION BY ProductId, Nm ORDER BY ProductStockId ASC) AS rn," +
  "         MIN(ProductStockId) OVER (PARTITION BY ProductId, Nm) AS keptId" +
  "  FROM scoped" +
  "), dropped AS (" +
  "  SELECT ProductStockId, ProductId, Nm, keptId FROM ranked WHERE grpcnt > 1 AND rn > 1" +
  ")" +
  "SELECT d.ProductStockId, d.ProductId, d.Nm, d.keptId," +
  "  (SELECT COUNT(*) FROM Orders o WITH (NOLOCK) WHERE o.RecruiterId = d.ProductStockId) AS totalOrders," +
  "  (SELECT COUNT(*) FROM Orders o WITH (NOLOCK) WHERE o.RecruiterId = d.ProductStockId" +
  "     AND o.ChargeStatus='OrderFinished' AND o.DateCreated >= '" + CUTOFF + "') AS doneOrdersInScope" +
  " FROM dropped d ORDER BY doneOrdersInScope DESC, totalOrders DESC";

(async () => {
  if (!ids.length) { console.error("scope empty"); process.exit(1); }
  console.log("scope: " + ids.length + " projects | donation cutoff: " + CUTOFF + "\n");
  const res = await mssql.query(sql);
  const rows = res.recordset;

  const withAnyOrders = rows.filter((r) => Number(r.totalOrders) > 0);
  const withScopedDonations = rows.filter((r) => Number(r.doneOrdersInScope) > 0);
  const sumScoped = rows.reduce((s, r) => s + Number(r.doneOrdersInScope), 0);
  const sumTotal = rows.reduce((s, r) => s + Number(r.totalOrders), 0);

  console.log("dropped recruiters: " + rows.length);
  console.log("  ...with ANY orders ever:           " + withAnyOrders.length + " (sum " + sumTotal + " orders)");
  console.log("  ...with COMPLETED orders in scope: " + withScopedDonations.length + " (sum " + sumScoped + " donations)\n");

  if (withAnyOrders.length) {
    console.log("DROPPED id -> kept id | totalOrders | doneOrdersInScope | name");
    withAnyOrders.forEach((r) =>
      console.log("  " + r.ProductStockId + " -> " + r.keptId + " | " + r.totalOrders + " | " + r.doneOrdersInScope + " | " + JSON.stringify(r.Nm))
    );
  } else {
    console.log("None of the dropped recruiters are referenced by any order. Dropping them is harmless. ✅");
  }
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
