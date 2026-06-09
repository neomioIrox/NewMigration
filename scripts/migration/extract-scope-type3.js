#!/usr/bin/env node
/**
 * Extract the frozen Case-3 (ProductGroup campaign) scope.
 *
 * Case 3 = Terminal=1 products that ARE ProductGroup members. We migrate an ACTIVE
 * campaign as: one Project per parent + one ProjectItem per member product (parent + each sub)
 * + one hidden donation item. A campaign is "active" if its parent OR any of its subs is in the
 * main migration scope (server/data/scope-products.json).
 *
 * READ-ONLY on the database (SELECT only). Writes two snapshot files that the Type3 mappings
 * filter against (via scopeFilter), so the set is identical and reproducible across runs:
 *   server/data/type3-parents.json — active-campaign parent productsids (→ ProjectMapping_Type3_Parents)
 *   server/data/type3-subs.json    — all subs of those parents          (→ ProjectMapping_Type3_Subs)
 *
 * Usage: node scripts/migration/extract-scope-type3.js
 */
const fs = require("fs");
const path = require("path");
const mssql = require("../../server/src/db/mssql");

const SCOPE = path.resolve(__dirname, "../../server/data/scope-products.json");
const OUT_PARENTS = path.resolve(__dirname, "../../server/data/type3-parents.json");
const OUT_SUBS = path.resolve(__dirname, "../../server/data/type3-subs.json");

function loadScopeIds() {
  const s = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
  return (s.productIds || []).map(Number).filter((n) => !isNaN(n) && n > 0);
}

function writeList(file, ids, description) {
  const payload = {
    description: description,
    definition: "Case 3 (ProductGroup campaigns). Parents: Terminal=1, active (parent or any sub in scope-products.json). Subs: all subs of those parents, PLUS Terminal=1 subs of an in-scope Terminal=4 fund-parent (collapsed into the fund's Project).",
    generatedAt: new Date().toISOString(),
    count: ids.length,
    productIds: ids,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

(async () => {
  try {
    const scope = loadScopeIds();
    const inScope = scope.join(",");

    // Active-campaign parents: a Terminal=1 ProductGroup parent whose parent OR any sub is in scope.
    const parentsRes = await mssql.query(
      "SELECT DISTINCT g.ParentProductId AS productsid " +
      "FROM ProductGroup g WITH (NOLOCK) " +
      "JOIN Products p WITH (NOLOCK) ON p.productsid = g.ParentProductId AND p.Terminal = 1 " +
      "WHERE g.ParentProductId IN (" + inScope + ") " +
      "   OR EXISTS (SELECT 1 FROM ProductGroup g2 WITH (NOLOCK) " +
      "              WHERE g2.ParentProductId = g.ParentProductId AND g2.SubProductId IN (" + inScope + ")) " +
      "ORDER BY g.ParentProductId"
    );
    const parents = parentsRes.recordset.map((r) => Number(r.productsid)).filter((n) => !isNaN(n) && n > 0);

    // Subs to collapse into a parent Project:
    //  (a) all subs of the active Terminal=1 parents above (whole campaign, per the locked decision); plus
    //  (b) Terminal=1 subs of an in-scope Terminal=4 fund-parent. Those fund-parents migrate via
    //      Funds_Fixed (so Project<parent> exists), but their Terminal=1 subs fall through every
    //      filter (Collections excludes ProductGroup members; Type3 parents are Terminal=1 only),
    //      so they orphan unless collapsed here. We take ONLY Terminal=1 subs — Terminal=4 subs are
    //      standalone funds migrated by Funds_Fixed and must NOT be collapsed (would duplicate).
    const inParents = parents.length ? parents.join(",") : "0";
    const subsRes = await mssql.query(
      "SELECT DISTINCT productsid FROM (" +
      "  SELECT g.SubProductId AS productsid FROM ProductGroup g WITH (NOLOCK) WHERE g.ParentProductId IN (" + inParents + ") " +
      "  UNION " +
      "  SELECT g.SubProductId FROM ProductGroup g WITH (NOLOCK) " +
      "    JOIN Products par WITH (NOLOCK) ON par.productsid = g.ParentProductId AND par.Terminal = 4 " +
      "    JOIN Products sub WITH (NOLOCK) ON sub.productsid = g.SubProductId AND sub.Terminal = 1 " +
      "    WHERE g.ParentProductId IN (" + inScope + ") " +
      ") u ORDER BY productsid"
    );
    const subs = subsRes.recordset.map((r) => Number(r.productsid)).filter((n) => !isNaN(n) && n > 0);

    writeList(OUT_PARENTS, parents, "Frozen Case-3 active-campaign parent productsids");
    writeList(OUT_SUBS, subs, "Frozen Case-3 sub-product productsids (all subs of active campaigns)");

    console.log("✅ Case 3 scope written:");
    console.log("   parents: " + parents.length + " -> " + OUT_PARENTS);
    console.log("   subs:    " + subs.length + " -> " + OUT_SUBS);
    console.log("   Projects to create: " + parents.length);
    console.log("   ProjectItems to create: " + (parents.length * 2 + subs.length) +
                " (donation + parent-item per parent, +1 per sub)");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
  process.exit(0);
})();
