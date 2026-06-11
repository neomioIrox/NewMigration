#!/usr/bin/env node
/**
 * Backfills Donation.RecruiterId for donations whose Orders.RecruiterId column is NULL/0
 * but whose UserSource embeds the recruiter as "recparam<id>".
 *
 * Validation basis: among rows having BOTH, embedded id == RecruiterId column in 99.45%
 * (the column stays authoritative when present — those rows are NOT touched).
 * Only ids that resolve via RecruiterMapping id_mappings are applied (FK-safe).
 * recparam0 / unresolvable ids are skipped and reported.
 *
 * DRY-RUN by default. Usage: node scripts/fixes/backfill-donation-recruiter-from-recparam.js [--apply]
 */
const mssql = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");
const { preloadFKCache } = require("../../server/src/engine/fk-resolver");

const APPLY = process.argv.includes("--apply");

(async () => {
  console.log((APPLY ? "APPLY" : "DRY-RUN") + " | recruiter-from-recparam backfill\n");
  const recCache = await preloadFKCache("RecruiterMapping");

  const rows = (await mssql.query(
    "SELECT OrdersId, LTRIM(RTRIM(UserSource)) AS us FROM Orders WITH (NOLOCK)" +
    " WHERE ChargeStatus='OrderFinished' AND DateCreated>='2025-06-01'" +
    " AND UserSource LIKE 'recparam%' AND (RecruiterId IS NULL OR RecruiterId=0)")).recordset;

  const byTarget = new Map(); // target RecruiterId -> [donationIds]
  let skipped = 0;
  for (const r of rows) {
    const m = String(r.us).match(/^recparam(\d+)/i);
    const srcId = m ? m[1] : null;
    const tgt = srcId && Number(srcId) > 0 ? recCache.get(String(srcId)) : null;
    if (!tgt) { skipped++; continue; }
    if (!byTarget.has(tgt)) byTarget.set(tgt, []);
    byTarget.get(tgt).push(r.OrdersId);
  }
  const total = [...byTarget.values()].reduce((s, a) => s + a.length, 0);
  console.log("candidates: " + rows.length + " | recoverable: " + total + " (" + byTarget.size + " recruiters) | skipped (recparam0/unresolved): " + skipped);
  [...byTarget.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)
    .forEach(([rid, ids]) => console.log("   RecruiterId " + rid + " <- " + ids.length + " donations"));

  if (!APPLY) { console.log("\nDRY-RUN only. Re-run with --apply to write."); await targetDb.close(); process.exit(0); }

  let updated = 0;
  for (const [rid, ids] of byTarget) {
    const [r] = await targetDb.query(
      "UPDATE Donation SET RecruiterId=" + Number(rid) + " WHERE Id IN (" + ids.join(",") + ") AND RecruiterId IS NULL");
    updated += r.affectedRows;
  }
  console.log("updated: " + updated);
  const [v] = await targetDb.query("SELECT SUM(RecruiterId IS NOT NULL) withRec, SUM(RecruiterId IS NULL) noRec FROM Donation");
  console.log("AFTER: RecruiterId set: " + v[0].withRec + " | NULL: " + v[0].noRec);
  await targetDb.close(); process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
