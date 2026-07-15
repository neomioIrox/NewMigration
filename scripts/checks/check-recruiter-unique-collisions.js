#!/usr/bin/env node
/**
 * READ-ONLY pre-run check for the UNIQUE KEY (ProjectId, Name) on the target
 * `Recruiter` and `RecruitersGroup` tables. The engine preserves source ids but
 * the unique key is on (ProjectId, Name) — two source rows under the same project
 * with the same (transformed) name collide, and the 2nd insert is silently dropped.
 *
 * Mirrors the engine exactly:
 *   - scope = migrated-projects.json (only projects that actually migrated)
 *   - Name transform: value ? LEFT(value,200) : 'ללא שם'   (empty/NULL -> fallback)
 *   - Recruiter project = ProductStock.ProductId
 *   - RecruitersGroup project = COALESCE(rg.ProjectId, first ProductStock.ProductId of group)
 *
 * No writes. Usage: node scripts/checks/check-recruiter-unique-collisions.js
 */
const path = require("path");
const mssql = require("../../server/src/db/mssql");
const scope = require("../../server/data/migrated-projects.json");

const ids = (scope.productIds || scope.ids || []).map(Number).filter((n) => !isNaN(n) && n > 0);
const IN = ids.join(",");
const NAME = "LEFT(ISNULL(NULLIF(%C,''),N'ללא שם'),200)"; // matches JS: value ? value.substring(0,200) : 'ללא שם'

async function report(title, sql) {
  const res = await mssql.query(sql);
  const rows = res.recordset;
  const groups = rows.length;
  const lost = rows.reduce((s, r) => s + (Number(r.cnt) - 1), 0); // extra rows that would be dropped
  console.log("\n=== " + title + " ===");
  console.log("colliding (ProjectId, Name) groups: " + groups + " | rows that would be SILENTLY DROPPED: " + lost);
  rows.slice(0, 12).forEach((r) =>
    console.log("   ProjectId=" + r.ProjectId + " | cnt=" + r.cnt + " | Name=" + JSON.stringify(r.Nm))
  );
  if (groups > 12) console.log("   ... (" + (groups - 12) + " more groups)");
  return { groups, lost };
}

(async () => {
  if (!ids.length) { console.error("scope list empty"); process.exit(1); }
  console.log("scope: " + ids.length + " migrated projects");

  // Recruiter: source ProductStock, project = ProductId
  const recSql =
    "SELECT ProductId AS ProjectId, " + NAME.replace("%C", "Name") + " AS Nm, COUNT(*) AS cnt " +
    "FROM ProductStock WITH (NOLOCK) " +
    "WHERE ProductId IS NOT NULL AND ProductId IN (" + IN + ") " +
    "GROUP BY ProductId, " + NAME.replace("%C", "Name") + " HAVING COUNT(*) > 1 ORDER BY cnt DESC";

  // RecruitersGroup: project = COALESCE(rg.ProjectId, first ProductStock.ProductId)
  const grpSql =
    "WITH src AS (" +
    "  SELECT rg.ID, rg.Name, COALESCE(rg.ProjectId, pstop.ProductId) AS ResolvedProjectId " +
    "  FROM RecruitersGroups rg WITH (NOLOCK) " +
    "  OUTER APPLY (SELECT TOP 1 ps.ProductId FROM ProductStock ps WITH (NOLOCK) WHERE ps.GroupId = rg.ID AND ps.ProductId IS NOT NULL) pstop" +
    ") SELECT ResolvedProjectId AS ProjectId, " + NAME.replace("%C", "Name") + " AS Nm, COUNT(*) AS cnt " +
    "FROM src WHERE ResolvedProjectId IS NOT NULL AND ResolvedProjectId IN (" + IN + ") " +
    "GROUP BY ResolvedProjectId, " + NAME.replace("%C", "Name") + " HAVING COUNT(*) > 1 ORDER BY cnt DESC";

  const g = await report("RecruitersGroup  (ResolvedProjectId, Name)", grpSql);
  const r = await report("Recruiter  (ProductId, Name)", recSql);

  console.log("\n=== SUMMARY ===");
  console.log("RecruitersGroup: " + g.lost + " rows would be dropped on UNIQUE (ProjectId,Name)");
  console.log("Recruiter:       " + r.lost + " rows would be dropped on UNIQUE (ProjectId,Name)");
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
