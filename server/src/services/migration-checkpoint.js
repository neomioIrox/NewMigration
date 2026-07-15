const targetDb=require("../db/mysql-target");
const logger=require("../logger");

// MigrationCheckpoint — per-mapping resume cursor ON THE TARGET DB.
// One row per mapping (MappingName == migration_runs.mapping_name, i.e. the mapping JSON
// "filename" or the dedicated engine's hard-coded name — NOT entityType, which collides
// at "Project"). LastSourceId is the keyset-loop CURSOR: the last PROCESSED source id,
// including failed/skipped rows — holes below it are filled only by gapfill mode.
// All timestamps are written with UTC_TIMESTAMP() (target convention is UTC; passing JS
// Dates through mysql2 double-shifts them).
// Spec: docs/superpowers/specs/2026-07-15-migration-checkpoint-design.md
const CREATE_SQL=[
  "CREATE TABLE IF NOT EXISTS MigrationCheckpoint (",
  "  Id INT AUTO_INCREMENT PRIMARY KEY,",
  "  MappingName VARCHAR(100) NOT NULL,",
  "  LastSourceId VARCHAR(64) NULL,",
  "  Status VARCHAR(20) NOT NULL DEFAULT 'in_progress',",
  "  LastRunAt DATETIME NOT NULL,",
  "  CompletedAt DATETIME NULL,",
  "  RowsMigrated INT NOT NULL DEFAULT 0,",
  "  UNIQUE KEY UK_Mapping (MappingName)",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
].join("\n");

async function ensureTable(){
  await targetDb.query(CREATE_SQL);
}

async function get(mappingName){
  var [rows]=await targetDb.query("SELECT * FROM MigrationCheckpoint WHERE MappingName=?",[mappingName]);
  return rows[0]||null;
}

// lastSourceId==null means "don't move the cursor" (used by gapfill on an interrupted
// run, where the scanned range is incomplete and advancing LastSourceId would let a
// future gapfill re-scan a shorter range and miss holes). COALESCE keeps the existing
// LastSourceId in that case; the INSERT branch is unchanged — a brand-new row still gets
// NULL when there is nothing to seed yet.
async function upsert(mappingName,lastSourceId,insertedDelta){
  await targetDb.query(
    "INSERT INTO MigrationCheckpoint (MappingName,LastSourceId,Status,LastRunAt,RowsMigrated) "+
    "VALUES (?,?,'in_progress',UTC_TIMESTAMP(),?) "+
    "ON DUPLICATE KEY UPDATE LastSourceId=COALESCE(VALUES(LastSourceId),LastSourceId),Status='in_progress',"+
    "LastRunAt=UTC_TIMESTAMP(),RowsMigrated=RowsMigrated+VALUES(RowsMigrated)",
    [mappingName,lastSourceId==null?null:String(lastSourceId),insertedDelta||0]);
}

async function markCompleted(mappingName){
  // Upsert so a zero-batch run (nothing above the cursor) still gets a completed row
  await targetDb.query(
    "INSERT INTO MigrationCheckpoint (MappingName,LastSourceId,Status,LastRunAt,CompletedAt,RowsMigrated) "+
    "VALUES (?,NULL,'completed',UTC_TIMESTAMP(),UTC_TIMESTAMP(),0) "+
    "ON DUPLICATE KEY UPDATE Status='completed',CompletedAt=UTC_TIMESTAMP(),LastRunAt=UTC_TIMESTAMP()",
    [mappingName]);
}

async function resetForMapping(mappingName){
  var [res]=await targetDb.query("DELETE FROM MigrationCheckpoint WHERE MappingName=?",[mappingName]);
  logger.info("MigrationCheckpoint reset",{mappingName:mappingName,deleted:res.affectedRows});
  return res.affectedRows;
}

// UI-facing reader: the shared target pool has no `timezone` config (left alone here —
// other modules' write paths are tuned around it), so mysql2 would parse the DATETIME
// columns (stored as UTC wall-clock via UTC_TIMESTAMP()) using the server's LOCAL zone,
// shifting them on read. Format them SQL-side as explicit ISO-UTC strings instead, so the
// UI gets unambiguous values regardless of server timezone.
async function list(){
  var [rows]=await targetDb.query(
    "SELECT Id,MappingName,LastSourceId,Status,"+
    "DATE_FORMAT(LastRunAt,'%Y-%m-%dT%H:%i:%SZ') AS LastRunAt,"+
    "DATE_FORMAT(CompletedAt,'%Y-%m-%dT%H:%i:%SZ') AS CompletedAt,"+
    "RowsMigrated FROM MigrationCheckpoint ORDER BY MappingName");
  return rows;
}

// Per-run reporter: one instance per engine run. Tracks how much of counters.inserted was
// already added to RowsMigrated, so per-batch calls write only the delta. A failed upsert
// does NOT advance `reported` — the delta is retried on the next batch and RowsMigrated
// stays accurate. Write failures never fail the run, but a lagging cursor is NOT free:
// the next continue run re-processes the lagged span. That is harmless for engines with
// built-in skip-existing / preserveSourceId (the re-processed rows hit duplicate-key or
// the skip set), but can duplicate rows on non-idempotent mappings (PrayName and generic
// non-preserveSourceId mappings have no skip-existing) — which is why persistent write
// failures escalate to logger.error below.
function createReporter(mappingName){
  var reported=0;
  var disabled=false;
  var consecutiveFailures=0;
  return {
    init:async function(insertedSoFar){
      reported=insertedSoFar||0;
      try{await ensureTable();}
      catch(err){
        disabled=true;
        logger.warn("MigrationCheckpoint disabled for this run (ensureTable failed)",{mappingName:mappingName,error:err.message});
      }
    },
    batch:async function(lastSourceId,insertedTotal){
      if(disabled) return;
      var delta=insertedTotal-reported;
      if(delta<0) delta=0;
      try{
        await upsert(mappingName,lastSourceId,delta);
        reported=insertedTotal;
        consecutiveFailures=0;
      }catch(err){
        consecutiveFailures++;
        // 3+ consecutive failures = the checkpoint is persistently unwritable (not a blip):
        // escalate to error so a widening re-process window is visible before it bites.
        var logFn=consecutiveFailures>=3?logger.error:logger.warn;
        logFn("MigrationCheckpoint upsert failed - run continues, checkpoint lags",{mappingName:mappingName,error:err.message,consecutiveFailures:consecutiveFailures});
      }
    },
    complete:async function(){
      if(disabled) return;
      try{await markCompleted(mappingName);}
      catch(err){logger.warn("MigrationCheckpoint markCompleted failed",{mappingName:mappingName,error:err.message});}
    }
  };
}

module.exports={ensureTable,get,upsert,markCompleted,resetForMapping,list,createReporter};
