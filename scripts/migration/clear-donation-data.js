#!/usr/bin/env node
/**
 * LIVE DESTRUCTIVE (authorized). Completely clears donation data from the target so the
 * donation migration can run clean:
 *   DonationCurrencyValue, DonationActionLog (children) -> Donation -> orphaned Address rows
 *   -> donation tracker data (id_mappings/row_status/errors/runs for DonationMapping).
 * Address rows referenced by non-donation tables (Branch/CustomerAddress/Lead/...) are preserved.
 *
 * Usage: node scripts/migration/clear-donation-data.js
 */
const targetDb = require("../../server/src/db/mysql-target");
const trackerDb = require("../../server/src/db/mysql-tracker");

async function count(t) { const [r] = await targetDb.query("SELECT COUNT(*) c FROM " + t); return r[0].c; }

(async () => {
  console.log("BEFORE: Donation=" + (await count("Donation")) +
    " DonationCurrencyValue=" + (await count("DonationCurrencyValue")) +
    " DonationActionLog=" + (await count("DonationActionLog")) +
    " Address=" + (await count("Address")));

  // children first (FK to Donation), then Donation
  const [cv] = await targetDb.query("DELETE FROM DonationCurrencyValue");
  const [al] = await targetDb.query("DELETE FROM DonationActionLog");
  const [dn] = await targetDb.query("DELETE FROM Donation");
  console.log("deleted: DonationCurrencyValue=" + cv.affectedRows + " DonationActionLog=" + al.affectedRows + " Donation=" + dn.affectedRows);

  // orphaned addresses only (not referenced by any non-donation table; Donation already empty)
  const [ad] = await targetDb.query(
    "DELETE FROM Address WHERE Id NOT IN (" +
    "  SELECT AddressId FROM Branch WHERE AddressId IS NOT NULL" +
    "  UNION SELECT AddressId FROM ClothesCollectionPoint WHERE AddressId IS NOT NULL" +
    "  UNION SELECT AddressId FROM ClothesCollectionRequest WHERE AddressId IS NOT NULL" +
    "  UNION SELECT AddressId FROM CustomerAddress WHERE AddressId IS NOT NULL" +
    "  UNION SELECT `Address` FROM `Lead` WHERE `Address` IS NOT NULL)");
  console.log("deleted: orphaned Address=" + ad.affectedRows);

  // tracker cleanup for DonationMapping
  await trackerDb.query("DELETE FROM id_mappings WHERE entity_type='Donation'");
  await trackerDb.query("DELETE FROM row_status WHERE run_id IN (SELECT id FROM migration_runs WHERE mapping_name='DonationMapping')");
  await trackerDb.query("DELETE FROM migration_errors WHERE run_id IN (SELECT id FROM migration_runs WHERE mapping_name='DonationMapping')");
  await trackerDb.query("DELETE FROM migration_runs WHERE mapping_name='DonationMapping'");
  console.log("tracker: cleared Donation id_mappings/row_status/errors/runs");

  console.log("AFTER:  Donation=" + (await count("Donation")) +
    " DonationCurrencyValue=" + (await count("DonationCurrencyValue")) +
    " DonationActionLog=" + (await count("DonationActionLog")) +
    " Address=" + (await count("Address")));
  await targetDb.close();
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message, "\n", e.stack); process.exit(1); });
