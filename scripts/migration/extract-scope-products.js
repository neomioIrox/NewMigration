#!/usr/bin/env node
/**
 * Extract the FROZEN migration scope: the list of products (productsid) that had a
 * COMPLETED donation (Orders.ChargeStatus='OrderFinished') since the cutoff date.
 *
 * READ-ONLY on the database (SELECT only). Writes a snapshot file that every
 * migration step filters against, so the scope is identical across all steps.
 *
 * Output: server/data/scope-products.json
 * Usage:  node scripts/migration/extract-scope-products.js [YYYY-MM-DD]
 */
const fs = require("fs");
const path = require("path");
const mssql = require("../../server/src/db/mssql");

const CUTOFF = process.argv[2] || "2025-06-01";
const OUT = path.resolve(__dirname, "../../server/data/scope-products.json");

(async () => {
  try {
    const res = await mssql.query(
      "SELECT DISTINCT ProjectId AS productsid FROM Orders WITH (NOLOCK) " +
      "WHERE ProjectId IS NOT NULL AND ChargeStatus='OrderFinished' AND DateCreated >= '" + CUTOFF + "' " +
      "ORDER BY ProjectId"
    );
    const ids = res.recordset.map((r) => Number(r.productsid)).filter((n) => !isNaN(n) && n > 0);

    const payload = {
      description: "Frozen migration scope — products with a completed donation since the cutoff",
      cutoff: CUTOFF,
      definition: "Orders.ChargeStatus='OrderFinished' AND Orders.DateCreated >= cutoff",
      sourceColumn: "Orders.ProjectId (= products.productsid)",
      generatedAt: new Date().toISOString(),
      count: ids.length,
      productIds: ids,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
    console.log("✅ Wrote " + ids.length + " in-scope productsid to:");
    console.log("   " + OUT);
    console.log("   cutoff=" + CUTOFF + " | definition=OrderFinished");
    console.log("   Id range: " + (ids.length ? ids[0] + "-" + ids[ids.length - 1] : "(empty)"));
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
  process.exit(0);
})();
