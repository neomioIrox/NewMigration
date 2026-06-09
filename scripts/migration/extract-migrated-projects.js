#!/usr/bin/env node
/**
 * Extract the set of project ids that were ACTUALLY migrated into the target
 * `Project` table. Used as a scopeFilter for downstream tables (Recruiter,
 * RecruitersGroup) so we migrate ONLY rows whose project was migrated — never
 * leaving orphan rows with ProjectId=NULL.
 *
 * Why not reuse scope-products.json? That file lists every product with a
 * completed donation (the donation scope). A product can be in that scope yet
 * never become a Project (wrong Terminal, collection inside a ProductGroup, ...).
 * The ground truth for "project was migrated" is the target Project table itself.
 *
 * Since Project uses preserveSourceId, Project.Id == products.productsid, so the
 * ids are directly comparable to ProductStock.ProductId and the RecruitersGroups
 * resolved project id.
 *
 * READ-ONLY on the database (SELECT only). Writes a frozen snapshot so the set is
 * identical and reproducible across runs:
 *   server/data/migrated-projects.json
 *
 * Usage: node scripts/migration/extract-migrated-projects.js
 */
const fs = require("fs");
const path = require("path");
const targetDb = require("../../server/src/db/mysql-target");

const OUT = path.resolve(__dirname, "../../server/data/migrated-projects.json");

(async () => {
  try {
    const [rows] = await targetDb.query("SELECT Id FROM Project ORDER BY Id");
    const ids = rows.map((r) => Number(r.Id)).filter((n) => !isNaN(n) && n > 0);

    const payload = {
      description: "Project ids actually present in the target Project table — downstream scopeFilter for Recruiter/RecruitersGroup",
      source: "target.Project.Id (== products.productsid via preserveSourceId)",
      generatedAt: new Date().toISOString(),
      count: ids.length,
      productIds: ids,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
    console.log("✅ Wrote " + ids.length + " migrated project ids to:");
    console.log("   " + OUT);
    console.log("   Id range: " + (ids.length ? ids[0] + "-" + ids[ids.length - 1] : "(empty)"));
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
  process.exit(0);
})();
