/**
 * READ-ONLY readiness check for the PrayName migration.
 * Only SELECTs are issued — no writes to either database.
 *
 * Verifies the assumptions baked into server/src/engine/prayname-engine.js:
 *  - LutEntityType Id=4 is really "Donation"            (FK BelongToEntityType)
 *  - LutGender Id=1 / Id=2 are Male / Female            (FK Gender)
 *  - System user Id=-1 exists                           (FK CreatedBy/UpdatedBy)
 *  - Donation is already migrated (id_mappings present) — PrayName depends on it
 *  - PrayName target table state (already populated?)
 *  - Source volume: total vs. in-scope vs. dropped-by-FK
 *  - Gender value distribution (sanity for the 0/1/other mapping)
 *  - NULL OrderId / NULL FirstName counts
 *
 * Usage: node scripts/checks/verify-prayname-readiness.js
 */
const targetDb = require("../../server/src/db/mysql-target");
const mssqlDb = require("../../server/src/db/mssql");
const trackerDb = require("../../server/src/db/mysql-tracker");

const CUTOFF = "2025-06-01"; // donation scope cutoff (scope-products.json)

function line() { console.log("-".repeat(60)); }

async function run() {
  console.log("=== PrayName migration readiness (READ-ONLY) ===\n");

  // ---------- TARGET: reference data ----------
  line(); console.log("TARGET reference data");
  const [et] = await targetDb.query("SELECT Id, Description FROM `LutEntityType` ORDER BY Id");
  console.log("LutEntityType:");
  et.forEach(r => console.log("   " + r.Id + " => " + r.Description + (r.Id === 4 ? "   <-- engine uses 4" : "")));

  const [g] = await targetDb.query("SELECT Id, Description FROM `LutGender` ORDER BY Id");
  console.log("LutGender:");
  g.forEach(r => console.log("   " + r.Id + " => " + r.Description));

  const [u] = await targetDb.query("SELECT Id FROM `User` WHERE Id = -1");
  console.log("System User Id=-1 exists: " + (u.length ? "YES" : "NO  <-- FK CreatedBy/UpdatedBy WILL FAIL"));

  // ---------- TARGET: dependency + current state ----------
  line(); console.log("TARGET dependency / current state");
  const [dm] = await trackerDb.query(
    "SELECT COUNT(*) AS cnt FROM id_mappings WHERE entity_type='Donation'");
  console.log("Donation id_mappings (FK source for PrayName): " + dm[0].cnt +
    (dm[0].cnt === 0 ? "   <-- Donation NOT migrated; every PrayName row would be skipped" : ""));

  const [pnm] = await trackerDb.query(
    "SELECT COUNT(*) AS cnt FROM id_mappings WHERE entity_type='PrayName'");
  const [pnt] = await targetDb.query("SELECT COUNT(*) AS cnt FROM `PrayName`");
  console.log("PrayName id_mappings already present: " + pnm[0].cnt);
  console.log("PrayName target rows already present: " + pnt[0].cnt +
    (pnt[0].cnt > 0 ? "   <-- table not empty; re-run may duplicate" : ""));

  // ---------- SOURCE: volume + scope ----------
  line(); console.log("SOURCE volume (MSSQL)");
  const [[allPn]] = [ (await mssqlDb.query("SELECT COUNT(*) AS cnt FROM PrayerNames WITH (NOLOCK)")).recordset ];
  console.log("PrayerNames total: " + allPn.cnt);

  const finishedSql =
    "SELECT COUNT(*) AS cnt FROM PrayerNames pn WITH (NOLOCK) " +
    "INNER JOIN Orders o WITH (NOLOCK) ON pn.OrderId = o.OrdersId " +
    "WHERE o.ChargeStatus = 'OrderFinished'";
  const finished = (await mssqlDb.query(finishedSql)).recordset[0].cnt;
  console.log("PrayerNames on finished orders (engine source query): " + finished);

  const inScopeSql = finishedSql + " AND o.DateCreated >= '" + CUTOFF + "'";
  const inScope = (await mssqlDb.query(inScopeSql)).recordset[0].cnt;
  console.log("...of which order DateCreated >= " + CUTOFF + " (likely to insert): " + inScope);
  console.log("...older than cutoff (dropped by missing Donation FK): " + (finished - inScope));

  // NULL OrderId on the full table (NULL OrderId never reaches the INNER JOIN, but informative)
  const nullOrder = (await mssqlDb.query(
    "SELECT COUNT(*) AS cnt FROM PrayerNames WITH (NOLOCK) WHERE OrderId IS NULL")).recordset[0].cnt;
  console.log("PrayerNames with NULL OrderId (excluded by INNER JOIN): " + nullOrder);

  // NULL / empty FirstName within engine source set
  const nullName = (await mssqlDb.query(
    finishedSql.replace("COUNT(*) AS cnt",
      "SUM(CASE WHEN pn.FirstName IS NULL OR LTRIM(RTRIM(pn.FirstName))='' THEN 1 ELSE 0 END) AS cnt"))).recordset[0].cnt;
  console.log("...with NULL/empty FirstName (stored as ''): " + nullName);

  // ---------- SOURCE: Gender distribution ----------
  line(); console.log("SOURCE Gender distribution (finished-order set)");
  const genderSql =
    "SELECT pn.Gender AS g, COUNT(*) AS cnt FROM PrayerNames pn WITH (NOLOCK) " +
    "INNER JOIN Orders o WITH (NOLOCK) ON pn.OrderId = o.OrdersId " +
    "WHERE o.ChargeStatus = 'OrderFinished' GROUP BY pn.Gender ORDER BY pn.Gender";
  const gd = (await mssqlDb.query(genderSql)).recordset;
  gd.forEach(r => {
    var mapped = r.g === 0 ? "->1 Male" : r.g === 1 ? "->2 Female" : "->NULL (dropped)";
    console.log("   Gender=" + (r.g === null ? "NULL" : r.g) + " : " + r.cnt + "   " + mapped);
  });

  console.log("\n=== done (read-only) ===");
  await closeAll();
}

async function closeAll() {
  try { await targetDb.close(); } catch (e) {}
  try { await trackerDb.close(); } catch (e) {}
  try { await mssqlDb.close(); } catch (e) {}
}

run().catch(e => { console.error("FATAL:", e.message); closeAll().then(() => process.exit(1)); });
