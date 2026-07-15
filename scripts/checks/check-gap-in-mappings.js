#!/usr/bin/env node
/** READ-ONLY. For each unresolved in-scope product, show EXACTLY where it appears
 * (or doesn't) across id_mappings entity types + the Type3 frozen lists. */
const tr = require("../../server/src/db/mysql-tracker");
const scope = require("../../server/data/scope-products.json");
const t3p = require("../../server/data/type3-parents.json");
const t3s = require("../../server/data/type3-subs.json");
const { preloadFKCache } = require("../../server/src/engine/fk-resolver");

(async () => {
  const funds = await preloadFKCache("ProjectItem_funds");
  const cert = await preloadFKCache("ProjectItem_certificate");
  const don = await preloadFKCache("ProjectItem_donation");
  const prayer = await preloadFKCache("ProjectItem_prayerName");
  const resolves = (id) => funds.get(String(id)) || cert.get(String(id)) || don.get(String(id)) || prayer.get(String(id));
  const unresolved = (scope.productIds || []).map(Number).filter((id) => !resolves(id));

  const t3pSet = new Set((t3p.productIds || []).map(Number));
  const t3sSet = new Set((t3s.productIds || []).map(Number));

  // pull every id_mappings row for these source ids
  const IN = unresolved.join(",");
  const [rows] = await tr.query(
    "SELECT source_id, entity_type FROM id_mappings WHERE source_id IN (" + IN + ")");
  const byId = {};
  rows.forEach((r) => { const k = Number(r.source_id); (byId[k] = byId[k] || []).push(r.entity_type); });

  console.log("unresolved in-scope products: " + unresolved.length + "\n");
  console.log("ProductId | inType3Parent | inType3Sub | id_mappings entity_types found");
  let notAnywhere = 0, asProjectOnly = 0, inType3 = 0;
  unresolved.sort((a, b) => a - b).forEach((id) => {
    const ets = byId[id] || [];
    const isT3 = t3pSet.has(id) || t3sSet.has(id);
    if (isT3) inType3++;
    if (ets.length === 0) notAnywhere++;
    else if (ets.every((e) => e === "Project")) asProjectOnly++;
    console.log("  " + String(id).padStart(7) + " |      " + (t3pSet.has(id) ? "Y" : ".") +
      "        |     " + (t3sSet.has(id) ? "Y" : ".") + "      | " + (ets.length ? ets.join(", ") : "<NONE>"));
  });

  console.log("\nsummary:");
  console.log("  in a Type3 frozen list: " + inType3);
  console.log("  not in id_mappings at all (never migrated): " + notAnywhere);
  console.log("  migrated as Project but NO ProjectItem: " + asProjectOnly);
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
