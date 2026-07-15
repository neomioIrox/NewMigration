#!/usr/bin/env node
/**
 * Backfills source attribution on EXISTING migrated donations.
 *
 * The donation engine stored every donation with SourceType=3 (None), SourceId=NULL and the
 * raw Orders.UserSource in UnknownSourceCode. Correct semantics per LutDonationSourceType:
 *   1=DefinedSource  -> UserSource matches a Source.SourceCode  => SourceId set, UnknownSourceCode NULL
 *   2=UnknownSource  -> UserSource non-empty but unmatched       => UnknownSourceCode kept
 *   3=None           -> UserSource empty or recParam* (recruiter param, handled via RecruiterId)
 *
 * Matching: trim + lowercase on both sides (also strips tab-suffixed SourceCodes).
 * Duplicate SourceCodes (25 rows / 15 codes): lowest Source.Id wins (deterministic).
 * Donation.Id == Orders.OrdersId (preserved IDs), so the join is direct.
 *
 * DRY-RUN by default — prints the full plan. Run with --apply to write.
 * Usage: node scripts/fixes/backfill-donation-source-attribution.js [--apply]
 */
const mssql = require("../../server/src/db/mssql");
const targetDb = require("../../server/src/db/mysql-target");

const APPLY = process.argv.includes("--apply");
const CHUNK = 5000;

(async () => {
  console.log((APPLY ? "APPLY" : "DRY-RUN") + " | donation source-attribution backfill\n");

  // 1. Source code map (lowest Id wins on duplicates)
  const [srcs] = await targetDb.query("SELECT Id, SourceCode FROM Source ORDER BY Id ASC");
  const codeMap = new Map();
  let dups = 0;
  for (const s of srcs) {
    const k = String(s.SourceCode || "").trim().toLowerCase();
    if (!k) continue;
    if (codeMap.has(k)) { dups++; continue; }
    codeMap.set(k, s.Id);
  }
  console.log("Source codes loaded: " + codeMap.size + " (duplicate rows skipped, lowest Id kept: " + dups + ")");

  // 2. Scoped orders with non-empty UserSource (Donation.Id == OrdersId)
  const orders = (await mssql.query(
    "SELECT OrdersId, LTRIM(RTRIM(UserSource)) AS us FROM Orders WITH (NOLOCK)" +
    " WHERE ChargeStatus='OrderFinished' AND DateCreated>='2025-06-01' AND ISNULL(UserSource,'')<>''")).recordset;
  console.log("scoped orders with UserSource: " + orders.length);

  // 3. Classify
  const bySourceId = new Map(); // sourceId -> [donationIds]
  const unknownIds = [];        // -> SourceType=2 (UnknownSourceCode already stored by engine)
  let recParam = 0;
  for (const o of orders) {
    const us = String(o.us).trim();
    if (!us) continue;
    if (us.toLowerCase().startsWith("recparam")) { recParam++; continue; } // stays SourceType=3
    const sid = codeMap.get(us.toLowerCase());
    if (sid) { if (!bySourceId.has(sid)) bySourceId.set(sid, []); bySourceId.get(sid).push(o.OrdersId); }
    else unknownIds.push(o.OrdersId);
  }
  const matchedCount = [...bySourceId.values()].reduce((s, a) => s + a.length, 0);
  console.log("plan: DefinedSource(1): " + matchedCount + " donations -> " + bySourceId.size + " sources" +
    " | UnknownSource(2): " + unknownIds.length + " | recParam (stay 3): " + recParam);

  const top = [...bySourceId.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  top.forEach(([sid, ids]) => console.log("   SourceId " + sid + " <- " + ids.length + " donations"));

  if (!APPLY) {
    console.log("\nDRY-RUN only. Re-run with --apply to write. Expected UPDATEs: ~" +
      (Math.ceil(matchedCount / CHUNK) + bySourceId.size + Math.ceil(unknownIds.length / CHUNK)) + " statements");
    await targetDb.close(); process.exit(0);
  }

  // 4. Apply — SourceType=1 + SourceId (+ clear UnknownSourceCode), grouped per source
  let updated1 = 0, updated2 = 0;
  for (const [sid, ids] of bySourceId) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const [r] = await targetDb.query(
        "UPDATE Donation SET SourceType=1, SourceId=" + Number(sid) + ", UnknownSourceCode=NULL" +
        " WHERE Id IN (" + chunk.join(",") + ")");
      updated1 += r.affectedRows;
    }
  }
  // 5. Apply — SourceType=2 for unmatched (UnknownSourceCode already holds the code)
  for (let i = 0; i < unknownIds.length; i += CHUNK) {
    const chunk = unknownIds.slice(i, i + CHUNK);
    const [r] = await targetDb.query("UPDATE Donation SET SourceType=2 WHERE Id IN (" + chunk.join(",") + ")");
    updated2 += r.affectedRows;
  }
  console.log("updated: DefinedSource=" + updated1 + " | UnknownSource=" + updated2);

  // 6. Verify
  const [v] = await targetDb.query(
    "SELECT SourceType, COUNT(*) c, SUM(SourceId IS NOT NULL) withSource, SUM(UnknownSourceCode IS NOT NULL) withCode" +
    " FROM Donation GROUP BY SourceType ORDER BY SourceType");
  console.log("\nAFTER — Donation by SourceType:");
  v.forEach((r) => console.log("  type " + r.SourceType + ": " + r.c + " rows | SourceId set: " + r.withSource + " | UnknownSourceCode set: " + r.withCode));

  await targetDb.close(); process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
