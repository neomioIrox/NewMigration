#!/usr/bin/env node
/**
 * Extract the frozen Case-3 (ProductGroup campaign) scope.
 *
 * Case 3 = Terminal=1 products that ARE ProductGroup members. We migrate an ACTIVE
 * campaign as: one Project per parent + one ProjectItem per member product. A campaign is
 * "active" if its parent OR any of its subs is in the main migration scope
 * (server/data/scope-products.json).
 *
 * Decisions locked 2026-07-14:
 *   - NO hidden catch-all 'donation' item on campaigns (removed from the mappings).
 *   - A sub that belongs to SEVERAL active campaigns gets ONE item, under ONE deterministic
 *     parent (lowest active-parent productsid) — recorded in type3-sub-parent.json.
 *   - A product that is BOTH an active-campaign parent AND a sub of another campaign is
 *     EXCLUDED from the subs scope: it keeps only its own Project, so its
 *     ProjectItem_certificate id_mapping is never overwritten and its donations route to
 *     its own item.
 *   - A Terminal=4 sub that is itself in the main scope is EXCLUDED from the subs scope:
 *     it migrates standalone via Funds_Fixed (collapsing it too would duplicate it).
 *
 * READ-ONLY on the database (SELECT only). Writes three snapshot files that the Type3
 * mappings use, so the set is identical and reproducible across runs:
 *   server/data/type3-parents.json    — active-campaign parent productsids (→ ProjectMapping_Type3_Parents)
 *   server/data/type3-subs.json       — sub productsids to collapse           (→ ProjectMapping_Type3_Subs scopeFilter)
 *   server/data/type3-sub-parent.json — sub→parent Project map                (→ ProjectMapping_Type3_Subs parentProjectIdMapFile)
 *
 * Usage: node scripts/migration/extract-scope-type3.js
 */
const fs = require("fs");
const path = require("path");
const mssql = require("../../server/src/db/mssql");

const SCOPE = path.resolve(__dirname, "../../server/data/scope-products.json");
const OUT_PARENTS = path.resolve(__dirname, "../../server/data/type3-parents.json");
const OUT_SUBS = path.resolve(__dirname, "../../server/data/type3-subs.json");
const OUT_SUB_PARENT = path.resolve(__dirname, "../../server/data/type3-sub-parent.json");

const DEFINITION =
  "Case 3 (ProductGroup campaigns). Parents: Terminal=1, active (parent or any sub in scope-products.json). " +
  "Subs: all subs of those parents PLUS Terminal=1 subs of an in-scope Terminal=4 fund-parent, " +
  "EXCLUDING subs that are themselves active parents and EXCLUDING in-scope Terminal=4 subs (standalone funds). " +
  "Each sub maps to ONE deterministic parent (lowest active-parent id) in type3-sub-parent.json.";

function loadScopeIds() {
  const s = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
  return (s.productIds || []).map(Number).filter((n) => !isNaN(n) && n > 0);
}

function writeList(file, ids, description) {
  const payload = {
    description: description,
    definition: DEFINITION,
    generatedAt: new Date().toISOString(),
    count: ids.length,
    productIds: ids,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

(async () => {
  try {
    const scope = loadScopeIds();
    const scopeSet = new Set(scope);
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
    const parentSet = new Set(parents);
    const inParents = parents.length ? parents.join(",") : "0";

    // Candidate sub→parent PAIRS:
    //  (a) every (sub, parent) edge under the active Terminal=1 parents above; plus
    //  (b) (sub, fund-parent) edges for Terminal=1 subs of an in-scope Terminal=4 fund-parent.
    //      Those fund-parents migrate via Funds_Fixed (so Project<parent> exists), but their
    //      Terminal=1 subs fall through every other filter, so they collapse into the fund's Project.
    // sub Terminal is fetched for the T4-sub exclusion below.
    const pairsRes = await mssql.query(
      "SELECT u.SubProductId, u.ParentProductId, s.Terminal AS SubTerminal FROM (" +
      "  SELECT g.SubProductId, g.ParentProductId FROM ProductGroup g WITH (NOLOCK) WHERE g.ParentProductId IN (" + inParents + ") " +
      "  UNION " +
      "  SELECT g.SubProductId, g.ParentProductId FROM ProductGroup g WITH (NOLOCK) " +
      "    JOIN Products par WITH (NOLOCK) ON par.productsid = g.ParentProductId AND par.Terminal = 4 " +
      "    JOIN Products sub WITH (NOLOCK) ON sub.productsid = g.SubProductId AND sub.Terminal = 1 " +
      "    WHERE g.ParentProductId IN (" + inScope + ") " +
      ") u JOIN Products s WITH (NOLOCK) ON s.productsid = u.SubProductId " +
      "ORDER BY u.SubProductId, u.ParentProductId"
    );

    // Group pairs by sub, applying the exclusions.
    const bySub = new Map(); // sub -> {t1Parents:[], fundParents:[]}
    const excludedBothParentSub = new Set();
    const excludedFundSubs = new Set();
    for (const r of pairsRes.recordset) {
      const sub = Number(r.SubProductId);
      const par = Number(r.ParentProductId);
      if (!sub || !par) continue;
      if (parentSet.has(sub)) { excludedBothParentSub.add(sub); continue; }        // both parent & sub → own Project only
      if (r.SubTerminal === 4 && scopeSet.has(sub)) { excludedFundSubs.add(sub); continue; } // standalone fund → Funds_Fixed
      if (!bySub.has(sub)) bySub.set(sub, { t1Parents: [], fundParents: [] });
      const entry = bySub.get(sub);
      if (parentSet.has(par)) entry.t1Parents.push(par);
      else entry.fundParents.push(par); // rule (b): in-scope T4 fund-parent (Project exists via Funds_Fixed)
    }

    // ONE deterministic parent per sub: prefer the lowest active T1 campaign parent,
    // else the lowest in-scope fund parent. Subs whose edges were all filtered out
    // (e.g. only edge points at an inactive parent) simply don't make the scope.
    const subs = [];
    const subParentMap = {};
    for (const [sub, entry] of [...bySub.entries()].sort((a, b) => a[0] - b[0])) {
      const chosen = entry.t1Parents.length
        ? Math.min(...entry.t1Parents)
        : (entry.fundParents.length ? Math.min(...entry.fundParents) : null);
      if (chosen === null) continue;
      subs.push(sub);
      subParentMap[String(sub)] = chosen;
    }

    writeList(OUT_PARENTS, parents, "Frozen Case-3 active-campaign parent productsids");
    writeList(OUT_SUBS, subs, "Frozen Case-3 sub-product productsids (one item each, under the mapped parent)");
    fs.writeFileSync(OUT_SUB_PARENT, JSON.stringify({
      description: "Frozen Case-3 sub→parent Project map (parent Project.Id == parent productsid, preserveSourceId)",
      definition: DEFINITION,
      generatedAt: new Date().toISOString(),
      count: subs.length,
      map: subParentMap,
    }, null, 2), "utf8");

    console.log("✅ Case 3 scope written:");
    console.log("   parents:      " + parents.length + " -> " + OUT_PARENTS);
    console.log("   subs:         " + subs.length + " -> " + OUT_SUBS);
    console.log("   sub->parent:  " + Object.keys(subParentMap).length + " -> " + OUT_SUB_PARENT);
    console.log("   excluded (both parent&sub): " + excludedBothParentSub.size +
                (excludedBothParentSub.size ? " [" + [...excludedBothParentSub].sort((a, b) => a - b).join(",") + "]" : ""));
    console.log("   excluded (in-scope T4 subs -> Funds_Fixed): " + excludedFundSubs.size +
                (excludedFundSubs.size ? " [" + [...excludedFundSubs].join(",") + "]" : ""));
    console.log("   Projects to create: " + parents.length);
    console.log("   ProjectItems to create: " + (parents.length + subs.length) +
                " (parent's own item per parent, +1 per sub; no hidden donation items)");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
  process.exit(0);
})();
