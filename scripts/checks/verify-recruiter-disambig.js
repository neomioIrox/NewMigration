#!/usr/bin/env node
/**
 * READ-ONLY proof that the RecruiterMapping disambiguation eliminates all
 * UNIQUE(ProjectId, Name) collisions. Uses the ACTUAL sourceQuery from the
 * mapping, wraps it exactly like the engine (WITH src AS (...)), applies the
 * same whereClause + scopeFilter, and groups by (ProductId, _DisplayName).
 *
 * Expected after disambiguation: 0 colliding groups.
 * No writes. Usage: node scripts/checks/verify-recruiter-disambig.js
 */
const mssql = require("../../server/src/db/mssql");
const m = require("../../server/mappings/RecruiterMapping.json");
const scope = require("../../server/data/migrated-projects.json");

const ids = (scope.productIds || scope.ids || []).map(Number).filter((n) => !isNaN(n) && n > 0);
const IN = ids.join(",");

(async () => {
  // Mirror the engine: WITH src AS (<sourceQuery>) ... WHERE (whereClause) AND (scopeFilter)
  const where = "(" + m.whereClause + ") AND (" + m.scopeFilter.column + " IN (" + IN + "))";

  // 1. Total in-scope rows that will be inserted
  const cnt = await mssql.query("WITH src AS (" + m.sourceQuery + ") SELECT COUNT(*) c FROM src WHERE " + where);
  console.log("in-scope recruiters to insert: " + cnt.recordset[0].c);

  // 2. Any remaining (ProductId, final Name) collisions?
  const dup = await mssql.query(
    "WITH src AS (" + m.sourceQuery + ") " +
    "SELECT ProductId, _DisplayName, COUNT(*) c FROM src WHERE " + where +
    " GROUP BY ProductId, _DisplayName HAVING COUNT(*) > 1 ORDER BY c DESC"
  );
  console.log("remaining colliding (ProjectId, Name) groups: " + dup.recordset.length);
  dup.recordset.slice(0, 10).forEach((r) =>
    console.log("   ProductId=" + r.ProductId + " | c=" + r.c + " | " + JSON.stringify(r._DisplayName))
  );

  // 3. Show a few disambiguated examples (groups that got a suffix)
  const ex = await mssql.query(
    "WITH src AS (" + m.sourceQuery + ") " +
    "SELECT TOP 8 ProductId, ProductStockId, Name AS original, _DisplayName FROM src WHERE " + where +
    " AND _DisplayName LIKE '% (%)' ORDER BY ProductId, _DisplayName"
  );
  console.log("\nsample disambiguated names (original -> _DisplayName):");
  ex.recordset.forEach((r) =>
    console.log("   pid=" + r.ProductId + " psid=" + r.ProductStockId + " | " + JSON.stringify(r.original) + " -> " + JSON.stringify(r._DisplayName))
  );

  console.log("\n" + (dup.recordset.length === 0 ? "PASS: no collisions remain. All recruiters survive." : "FAIL: collisions still present."));
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
