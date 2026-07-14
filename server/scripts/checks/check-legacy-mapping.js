/**
 * Read-only QA: compare target LegacyMapping against the local tracker's
 * id_mappings (entity_type LIKE 'ProjectItem_%', grouped per run mapping_name).
 * Run AFTER a migration cycle: node server/scripts/checks/check-legacy-mapping.js
 * Makes NO changes to either DB. Exit 0 = match, 1 = mismatch, 2 = error.
 *
 * Caveat: the tracker side attributes rows to a mapping via id_mappings.run_id ->
 * migration_runs.mapping_name. Restarted runs can leave run_id pointing at an old
 * run of the SAME mapping, which is fine; treat per-mapping counts as advisory and
 * the missing/extra SourceId lists as the real signal.
 */
const mysql=require("mysql2/promise");
const config=require("../../src/config/database");

const EXPECTED={ // mapping filename -> SourceType it writes
  ProjectMapping_Collections_Fixed:1,
  ProjectMapping_Funds_Fixed:1,
  ProjectMapping_Type3_Parents:1,
  ProjectMapping_Type3_Subs:1,
  PrayerMapping:2
};

(async()=>{
  const target=await mysql.createConnection(config.mysqlTarget);
  const tracker=await mysql.createConnection(config.mysqlTracker);

  console.log("=== LegacyMapping rows by MappingName/SourceType ===");
  const [legacyRows]=await target.execute(
    "SELECT MappingName,SourceType,COUNT(*) cnt FROM LegacyMapping GROUP BY MappingName,SourceType ORDER BY MappingName");
  legacyRows.forEach(r=>console.log(" ",r.MappingName,"type",r.SourceType,":",r.cnt));

  console.log("\n=== Tracker ProjectItem_% mappings by run mapping_name ===");
  const [trackRows]=await tracker.execute(
    "SELECT r.mapping_name,COUNT(*) cnt FROM id_mappings im JOIN migration_runs r ON im.run_id=r.id "+
    "WHERE im.entity_type LIKE 'ProjectItem\\_%' GROUP BY r.mapping_name ORDER BY r.mapping_name");
  trackRows.forEach(r=>console.log(" ",r.mapping_name,":",r.cnt));

  console.log("\n=== Per-mapping diff (tracker vs LegacyMapping) ===");
  let failures=0;
  for(const name of Object.keys(EXPECTED)){
    const st=EXPECTED[name];
    const [tr]=await tracker.execute(
      "SELECT im.source_id FROM id_mappings im JOIN migration_runs r ON im.run_id=r.id "+
      "WHERE im.entity_type LIKE 'ProjectItem\\_%' AND r.mapping_name=?",[name]);
    const [lg]=await target.execute(
      "SELECT SourceId FROM LegacyMapping WHERE MappingName=? AND SourceType=?",[name,st]);
    const legacySet=new Set(lg.map(r=>String(r.SourceId)));
    const trackerSet=new Set(tr.map(r=>String(r.source_id)));
    const missing=[...trackerSet].filter(id=>!legacySet.has(id));
    const extra=[...legacySet].filter(id=>!trackerSet.has(id));
    console.log(" ",name,"tracker:",trackerSet.size,"legacy:",legacySet.size,
      "missing:",missing.length,"extra:",extra.length);
    if(missing.length) console.log("    missing sample:",missing.slice(0,20).join(","));
    if(extra.length) console.log("    extra sample:",extra.slice(0,20).join(","));
    if(missing.length||extra.length) failures++;
  }

  console.log(failures===0?"\nOK - LegacyMapping matches tracker":"\nMISMATCH in "+failures+" mapping(s)");
  await target.end();
  await tracker.end();
  process.exit(failures===0?0:1);
})().catch(e=>{console.error(e);process.exit(2);});
