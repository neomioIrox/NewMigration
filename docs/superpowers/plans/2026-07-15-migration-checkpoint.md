# Migration Checkpoint (המשך מהנקודה האחרונה) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-mapping `MigrationCheckpoint` table on the target RDS + `startMode` (continue/fresh/gapfill) in every engine, wired to the pipeline fresh/continue checkbox and the single-mapping runner.

**Architecture:** A new service (`migration-checkpoint.js`, LegacyMapping-style) owns the table; every engine seeds its keyset cursor from it on `continue`, upserts it per batch via a small "reporter" helper, and marks completion. `fresh` deletes the row inside the engine itself, so the restart path, the pipeline orchestrator and the UI all inherit the reset. `gapfill` (generic engine only) scans from 0 and skips source ids already present in the target.

**Tech Stack:** Node.js (CommonJS, `var`-style compact code matching the codebase), mysql2/promise (`targetDb.query` returns `[rows]`), Express, React + @tanstack/react-query, plain-`assert` test scripts under `server/scripts/tests/`.

**Spec:** `docs/superpowers/specs/2026-07-15-migration-checkpoint-design.md` (updated 2026-07-15: all 7 engines keyset-paginate — uniform treatment, no bulk-step special case).

## Global Constraints

- Target-RDS tables are PascalCase; the new table is `MigrationCheckpoint`.
- `MappingName` = the value used as `migration_runs.mapping_name`: `m.filename||m.targetTable` for the generic engine; the hard-coded names `DonationMapping`, `PrayNameMapping`, `AsakimDonationMapping`, `VideoGalleryMediaMapping`, `RecruiterMapping`, `RecruitersGroupMapping` for dedicated engines.
- All checkpoint timestamps are written SQL-side with `UTC_TIMESTAMP()` — never JS `Date` params (mysql2 double-shift issue).
- Checkpoint WRITE failures (upsert/markCompleted) must never fail a migration run — warn and continue. Checkpoint READ failure in `continue` mode and gapfill-set load failure MUST abort the run (silent fallback to 0 would duplicate rows on non-preserveSourceId mappings).
- `dryRun` engines: checkpoint writes (reset/upsert/markCompleted) disabled; the `continue` seed READ stays active.
- **[LIVE-GATED]:** any step that actually executes SQL against the target RDS or MSSQL (marked below) requires the user's explicit authorization at execution time — write the code/test, then STOP and ask before running it. Steps against the local `migration_tracker` DB are allowed (existing tests already do this).
- Default `startMode` is `"continue"` everywhere — this intentionally changes today's behavior (a new run used to always start from 0).
- Commit after every task with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `migration-checkpoint.js` service

**Files:**
- Create: `server/src/services/migration-checkpoint.js`
- Test: `server/scripts/tests/test-migration-checkpoint.js`

**Interfaces:**
- Consumes: `server/src/db/mysql-target` (`targetDb.query(sql, params)` → `[rows]`), `server/src/logger`.
- Produces (used by every later task):
  - `ensureTable(): Promise<void>`
  - `get(mappingName: string): Promise<Row|null>` — Row has `MappingName, LastSourceId (string|null), Status ('in_progress'|'completed'), LastRunAt, CompletedAt, RowsMigrated`
  - `upsert(mappingName: string, lastSourceId: string|number|null, insertedDelta: number): Promise<void>`
  - `markCompleted(mappingName: string): Promise<void>` — upserts (creates the row if a run completed with zero batches)
  - `resetForMapping(mappingName: string): Promise<number>` — returns deleted row count
  - `list(): Promise<Row[]>`
  - `createReporter(mappingName: string): {init(insertedSoFar), batch(lastSourceId, insertedTotal), complete()}` — all async; `batch` computes the `RowsMigrated` delta internally and tolerates write failures.

- [ ] **Step 1: Write the service**

```js
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

async function upsert(mappingName,lastSourceId,insertedDelta){
  await targetDb.query(
    "INSERT INTO MigrationCheckpoint (MappingName,LastSourceId,Status,LastRunAt,RowsMigrated) "+
    "VALUES (?,?,'in_progress',UTC_TIMESTAMP(),?) "+
    "ON DUPLICATE KEY UPDATE LastSourceId=VALUES(LastSourceId),Status='in_progress',"+
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

async function list(){
  var [rows]=await targetDb.query("SELECT * FROM MigrationCheckpoint ORDER BY MappingName");
  return rows;
}

// Per-run reporter: one instance per engine run. Tracks how much of counters.inserted was
// already added to RowsMigrated, so per-batch calls write only the delta. A failed upsert
// does NOT advance `reported` — the delta is retried on the next batch and RowsMigrated
// stays accurate. Write failures never fail the run (the cursor just lags — always safe:
// re-processing, never skipping).
function createReporter(mappingName){
  var reported=0;
  var disabled=false;
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
      }catch(err){
        logger.warn("MigrationCheckpoint upsert failed - run continues, checkpoint lags",{mappingName:mappingName,error:err.message});
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
```

- [ ] **Step 2: Write the test** (uses `TEST_CP_` mapping names, cleans up after itself)

```js
const assert=require("assert");
const cp=require("../../src/services/migration-checkpoint");
const targetDb=require("../../src/db/mysql-target");

const NAME="TEST_CP_Alpha";

(async function(){
  try{
    await cp.ensureTable();
    await cp.resetForMapping(NAME); // clean slate

    // upsert creates the row with the delta and cursor
    await cp.upsert(NAME,100,10);
    var row=await cp.get(NAME);
    assert.ok(row,"row created");
    assert.strictEqual(row.LastSourceId,"100");
    assert.strictEqual(row.Status,"in_progress");
    assert.strictEqual(row.RowsMigrated,10);
    assert.ok(row.LastRunAt,"LastRunAt set");
    assert.strictEqual(row.CompletedAt,null);

    // second upsert advances the cursor and ACCUMULATES the delta
    await cp.upsert(NAME,250,5);
    row=await cp.get(NAME);
    assert.strictEqual(row.LastSourceId,"250");
    assert.strictEqual(row.RowsMigrated,15);

    // markCompleted keeps cursor + counter, flips status, stamps CompletedAt
    await cp.markCompleted(NAME);
    row=await cp.get(NAME);
    assert.strictEqual(row.Status,"completed");
    assert.strictEqual(row.LastSourceId,"250");
    assert.strictEqual(row.RowsMigrated,15);
    assert.ok(row.CompletedAt,"CompletedAt set");

    // markCompleted on a mapping with no row creates one (zero-batch completed run)
    await cp.resetForMapping("TEST_CP_Empty");
    await cp.markCompleted("TEST_CP_Empty");
    var empty=await cp.get("TEST_CP_Empty");
    assert.ok(empty,"zero-batch completion creates the row");
    assert.strictEqual(empty.Status,"completed");
    assert.strictEqual(empty.LastSourceId,null);

    // list contains both; reset deletes exactly one
    var all=await cp.list();
    assert.ok(all.some(function(r){return r.MappingName===NAME;}));
    assert.ok(all.some(function(r){return r.MappingName==="TEST_CP_Empty";}));
    assert.strictEqual(await cp.resetForMapping(NAME),1);
    assert.strictEqual(await cp.get(NAME),null);

    // reporter: init baseline -> batch writes only deltas; complete marks
    await cp.resetForMapping(NAME);
    var rep=cp.createReporter(NAME);
    await rep.init(0);
    await rep.batch(50,7);   // delta 7
    await rep.batch(90,12);  // delta 5
    row=await cp.get(NAME);
    assert.strictEqual(row.LastSourceId,"90");
    assert.strictEqual(row.RowsMigrated,12);
    await rep.complete();
    row=await cp.get(NAME);
    assert.strictEqual(row.Status,"completed");

    // reporter with a resume baseline (donation-style restored counters): no double count
    var rep2=cp.createReporter(NAME);
    await rep2.init(12);
    await rep2.batch(120,15); // delta 3 only
    row=await cp.get(NAME);
    assert.strictEqual(row.RowsMigrated,15);

    console.log("test-migration-checkpoint: ALL PASS");
  }finally{
    await cp.resetForMapping(NAME);
    await cp.resetForMapping("TEST_CP_Empty");
    await targetDb.end&&targetDb.end();
  }
  process.exit(0);
})().catch(function(e){console.error(e);process.exit(1);});
```

Note: check `server/src/db/mysql-target.js` for the pool-close function name; if it exports `end()`/`close()`, call it in the `finally` so the script exits; otherwise rely on `process.exit(0)` (which the script already calls) and drop the `targetDb.end` line.

- [ ] **Step 3 [LIVE-GATED]: Run the test** — creates the `MigrationCheckpoint` table on the target RDS and writes/deletes `TEST_CP_*` rows only. STOP and ask the user for authorization before running.

Run: `node server/scripts/tests/test-migration-checkpoint.js`
Expected: `test-migration-checkpoint: ALL PASS`

- [ ] **Step 4: Commit**

```bash
git add server/src/services/migration-checkpoint.js server/scripts/tests/test-migration-checkpoint.js
git commit -m "feat: add MigrationCheckpoint service (per-mapping resume cursor on target RDS)"
```

---

### Task 2: Generic engine — `startMode` (continue/fresh/gapfill)

**Files:**
- Modify: `server/src/engine/migration-engine.js` (constructor ~line 13-24; create-or-resume block lines 157-166; row loop lines 204-211; pause block lines 174-180; batch counters line 398; completion lines 432-438)
- Modify: `server/src/services/migration-manager.js:172` (restart passes `startMode:"fresh"`)
- Modify: `server/src/routes/migrations.js:10-17` (`/start` accepts `startMode`)
- Test: `server/scripts/tests/test-gapfill-source.js`

**Interfaces:**
- Consumes: Task 1's `migration-checkpoint` module (`get`, `resetForMapping`, `createReporter`).
- Produces: `new MigrationEngine(mapping, {batchSize, totalLimit, startMode})` where `startMode` ∈ `"continue"|"fresh"|"gapfill"` (default `"continue"`); pure method `_gapfillSourceQuery(m)` returning `{db:"target"|"tracker", sql:string, params:any[]}` (used by the test).

- [ ] **Step 1: Write the failing test** (pure — no DB)

```js
const assert=require("assert");
const MigrationEngine=require("../../src/engine/migration-engine");

function q(m){return new MigrationEngine(m,{})._gapfillSourceQuery(m);}

// 1. legacyMapping wins (most precise: per-mapping scoped, covers collapse mappings)
var r=q({filename:"ProjectMapping_Funds_Fixed",targetTable:"Project",legacyMapping:{sourceType:1},preserveSourceId:true});
assert.strictEqual(r.db,"target");
assert.ok(/FROM LegacyMapping WHERE MappingName=\?/.test(r.sql),r.sql);
assert.deepStrictEqual(r.params,["ProjectMapping_Funds_Fixed"]);

// 2. preserveSourceId without legacyMapping -> target table ids
r=q({filename:"AffiliateMapping",targetTable:"Affiliate",preserveSourceId:true});
assert.strictEqual(r.db,"target");
assert.ok(/FROM `Affiliate`/.test(r.sql),r.sql);
assert.ok(/`Id`/.test(r.sql),"default id column");

// 2b. custom targetIdColumn respected
r=q({filename:"X",targetTable:"T",preserveSourceId:true,targetIdColumn:"Code"});
assert.ok(/`Code`/.test(r.sql),r.sql);

// 3. neither -> id_mappings by entityType (falls back to filename)
r=q({filename:"GalleryMapping_Images",targetTable:"Gallery",_meta:{entityType:"Gallery_Images"}});
assert.strictEqual(r.db,"tracker");
assert.ok(/FROM id_mappings WHERE entity_type=\?/.test(r.sql),r.sql);
assert.deepStrictEqual(r.params,["Gallery_Images"]);

// startMode default + validation
assert.strictEqual(new MigrationEngine({targetTable:"T"},{}).startMode,"continue");
assert.strictEqual(new MigrationEngine({targetTable:"T"},{startMode:"gapfill"}).startMode,"gapfill");

console.log("test-gapfill-source: ALL PASS");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/scripts/tests/test-gapfill-source.js`
Expected: FAIL with `TypeError: ..._gapfillSourceQuery is not a function`

- [ ] **Step 3: Implement in `migration-engine.js`**

3a. Add the require at the top (after `const legacyMapping=...`, line 9):

```js
const migrationCheckpoint=require("../services/migration-checkpoint");
```

3b. In the constructor, after `this.totalLimit=...` (line 17):

```js
this.startMode=(options&&options.startMode)||"continue"; // continue | fresh | gapfill
this.checkpointReporter=migrationCheckpoint.createReporter(mapping.filename||mapping.targetTable);
this.gapfillExistingIds=null; // Set<number> of source ids already in the target (gapfill mode)
```

3c. Add the two methods (next to `_loadScopeList`):

```js
  // gapfill: where to read "already migrated" source ids from. Precedence:
  // 1. LegacyMapping (per-MappingName, one row per source row — covers collapse mappings
  //    whose main table was never inserted). A row that failed AFTER its LegacyMapping
  //    insert would be silently skipped, but LegacyMapping is written with the item insert
  //    in the same row try/catch, so a partial row has no LegacyMapping entry.
  // 2. preserveSourceId: the target table's own ids (Id==sourceId).
  // 3. id_mappings by entityType (tracker approximation, survives for non-preserve mappings).
  _gapfillSourceQuery(m){
    if(m.legacyMapping){
      return {db:"target",sql:"SELECT SourceId AS id FROM LegacyMapping WHERE MappingName=?",params:[m.filename||m.targetTable]};
    }
    if(m.preserveSourceId){
      var idCol=m.targetIdColumn||"Id";
      return {db:"target",sql:"SELECT `"+idCol+"` AS id FROM `"+m.targetTable+"`",params:[]};
    }
    var entityType=m._meta&&m._meta.entityType||m.filename||m.targetTable;
    return {db:"tracker",sql:"SELECT source_id AS id FROM id_mappings WHERE entity_type=?",params:[entityType]};
  }

  async _loadGapfillSet(m){
    var src=this._gapfillSourceQuery(m);
    if(src.db==="target"&&m.legacyMapping) await legacyMapping.ensureTable();
    var db=src.db==="target"?targetDb:require("../db/mysql-tracker");
    var [rows]=await db.query(src.sql,src.params);
    var set=new Set(rows.map(function(r){return Number(r.id)}));
    logger.info("gapfill: existing source ids preloaded",{mapping:m.filename||m.targetTable,count:set.size,from:src.db==="target"?src.sql.split("FROM ")[1].split(" ")[0]:"id_mappings"});
    return set;
  }
```

3d. Replace the create-or-resume block (lines 157-166) with:

```js
      // Create or resume run
      var lastId=null;
      if(resumeRunId){
        this.runId=resumeRunId;
        var existingRun=await tracker.getRun(resumeRunId);
        if(existingRun) lastId=existingRun.last_processed_source_id;
        await tracker.updateRunStatus(resumeRunId,"running");
      }else{
        // startMode (checkpoint feature): fresh deletes this mapping's checkpoint row HERE —
        // the single owner of the reset, so restartMigration, the pipeline orchestrator and
        // the UI all inherit it. continue seeds the keyset cursor from the checkpoint.
        // gapfill scans from 0 and skips ids already in the target. A checkpoint READ
        // failure or gapfill-set load failure aborts the run (throw) — silently starting
        // from 0 would duplicate rows on non-preserveSourceId mappings.
        if(this.startMode==="fresh"){
          await migrationCheckpoint.ensureTable();
          await migrationCheckpoint.resetForMapping(m.filename||targetTable);
        }else if(this.startMode==="continue"){
          await migrationCheckpoint.ensureTable();
          var cp=await migrationCheckpoint.get(m.filename||targetTable);
          if(cp&&cp.LastSourceId!=null) lastId=cp.LastSourceId;
          if(lastId!=null) logger.info("continue mode: seeding from checkpoint",{mapping:m.filename||targetTable,lastSourceId:lastId});
        }else if(this.startMode==="gapfill"){
          this.gapfillExistingIds=await this._loadGapfillSet(m);
        }
        this.runId=await tracker.createRun(m.filename||targetTable,sourceTable,targetTable,totalRows,this.batchSize);
      }
      await this.checkpointReporter.init(this.counters.inserted);
```

3e. In the row loop, right after `this.counters.processed++;` (line 207, before the `isRowProcessed` check):

```js
          // gapfill: skip rows already in the target (cheaper than the per-row tracker check)
          if(this.gapfillExistingIds&&this.gapfillExistingIds.has(Number(sourceId))){this.counters.skipped++;continue;}
```

3f. In the pause block (after the existing `updateRunCounters` call, line 176):

```js
          await this.checkpointReporter.batch(lastId,this.counters.inserted);
```

3g. After the per-batch `updateRunCounters` (line 398):

```js
        await this.checkpointReporter.batch(lastId,this.counters.inserted);
```

3h. In the completion block, after the final `updateRunCounters` (line 434) and before `this.emit("completed",...)`:

```js
      await this.checkpointReporter.complete();
```

- [ ] **Step 4: `migration-manager.js` — restart runs fresh.** Replace line 172:

```js
  return startMigration(run.mapping_name,{batchSize:run.batch_size,startMode:"fresh"},io);
```

- [ ] **Step 5: `routes/migrations.js` — `/start` accepts `startMode`.** Replace lines 12-14:

```js
    var {mappingName,batchSize,totalLimit,startMode}=req.body;
    if(!mappingName) return res.status(400).json({error:"mappingName required"});
    var engine=manager.startMigration(mappingName,{batchSize:batchSize||500,totalLimit:totalLimit||0,startMode:startMode||"continue"},req.app.get("io"));
```

- [ ] **Step 6: Run tests**

Run: `node server/scripts/tests/test-gapfill-source.js`
Expected: `test-gapfill-source: ALL PASS`
Also run: `node server/scripts/tests/test-pipeline-config.js` (unchanged, sanity)
Expected: `test-pipeline-config: ALL PASS`

- [ ] **Step 7: Commit**

```bash
git add server/src/engine/migration-engine.js server/src/services/migration-manager.js server/src/routes/migrations.js server/scripts/tests/test-gapfill-source.js
git commit -m "feat: startMode continue/fresh/gapfill in generic engine, restart runs fresh"
```

---

### Task 3: Dedicated engines — Donation, PrayName, AsakimDonation

**Files:**
- Modify: `server/src/engine/donation-engine.js` (constructor line 27-34; create-or-resume lines 155-170; pause line 182; batch line 213; completion line 223)
- Modify: `server/src/engine/prayname-engine.js` (constructor line 31-41; create-or-resume lines 65-78; pause line 89; batch line 105; completion line 113)
- Modify: `server/src/engine/asakim-donation-engine.js` (constructor line 31-39; create-or-resume lines 57-70; pause line 81; batch line 97; completion line 105)
- Modify: `server/src/routes/migrations.js` (`/start-donations`, `/start-praynames`, `/start-asakim-donations` pass `startMode`)

**Interfaces:**
- Consumes: Task 1's `migration-checkpoint` (`get`, `resetForMapping`, `createReporter`).
- Produces: all three engines accept `options.startMode` (`"continue"|"fresh"`; anything else → warn + run as continue). Checkpoint names: `"DonationMapping"`, `"PrayNameMapping"`, `"AsakimDonationMapping"`.

The same four edits in each engine (shown for DonationEngine; repeat with the engine's own MAPPING name and line anchors — the seams are identical, found by the anchor lines quoted below):

- [ ] **Step 1: DonationEngine.** Add require at top:

```js
const migrationCheckpoint=require("../services/migration-checkpoint");
```

In the constructor after `this.dryRun=...` (line 30):

```js
    this.startMode=(options&&options.startMode)||"continue";
    if(this.startMode==="gapfill"){logger.warn("startMode gapfill not supported by DonationEngine - running as continue (built-in target skip covers gaps)");this.startMode="continue";}
    this.checkpointReporter=migrationCheckpoint.createReporter("DonationMapping");
```

In the create-or-resume block — the `else` branch currently reads (lines 168-170):

```js
      }else{
        this.runId=await tracker.createRun("DonationMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }
```

Replace with:

```js
      }else{
        if(!this.dryRun&&this.startMode==="fresh"){
          await migrationCheckpoint.ensureTable();
          await migrationCheckpoint.resetForMapping("DonationMapping");
        }else if(this.startMode==="continue"){
          await migrationCheckpoint.ensureTable();
          var cpRow=await migrationCheckpoint.get("DonationMapping");
          if(cpRow&&cpRow.LastSourceId!=null){lastId=cpRow.LastSourceId;logger.info("continue mode: seeding from checkpoint",{mapping:"DonationMapping",lastSourceId:lastId});}
        }
        this.runId=await tracker.createRun("DonationMapping",sourceTable,targetTable,totalRows,this.batchSize);
      }
      if(!this.dryRun) await this.checkpointReporter.init(this.counters.inserted);
```

(`init` after the whole if/else so a donation RESUME — which restores `counters.inserted` — sets the correct baseline.)

After the pause-block `updateRunCounters` (anchor: line 182) and after the per-batch `updateRunCounters` (anchor: line 213), add:

```js
        if(!this.dryRun) await this.checkpointReporter.batch(lastId,this.counters.inserted);
```

After the completion `updateRunCounters` (anchor: line 223), before `this.emit("completed",...)`:

```js
      if(!this.dryRun) await this.checkpointReporter.complete();
```

- [ ] **Step 2: PrayNameEngine — same four edits.** MAPPING name `"PrayNameMapping"`. Anchors: constructor line 34 (`this.dryRun=`), else-branch line 77-78 (`this.runId=await tracker.createRun("PrayNameMapping",...)`), pause line 89, batch line 105, completion line 113. PrayName does NOT restore counters on resume — `init(this.counters.inserted)` is 0 there, which is correct.

- [ ] **Step 3: AsakimDonationEngine — same four edits.** MAPPING name `"AsakimDonationMapping"`. Anchors: constructor line 34, else-branch line 69-70, pause line 81, batch line 97, completion line 105.

- [ ] **Step 4: Routes pass `startMode`.** In `server/src/routes/migrations.js`, for each of the three handlers, destructure and forward it. `/start-donations` (lines 52-61) becomes:

```js
router.post("/start-donations",async function(req,res){
  try{
    var {batchSize,dryRun,startMode}=req.body;
    var engine=manager.startDonationMigration(
      {batchSize:batchSize||1000,dryRun:dryRun||false,startMode:startMode||"continue"},
      req.app.get("io")
    );
    res.json({message:"Donation migration started",dryRun:dryRun||false,batchSize:batchSize||1000,startMode:startMode||"continue"});
  }catch(err){res.status(500).json({error:err.message});}
});
```

Apply the identical pattern to `/start-praynames` (default batchSize 2000) and `/start-asakim-donations` (default batchSize 2000). `manager.startDonationMigration/startPrayNameMigration/startAsakimDonationMigration` already pass `options` straight to the engine constructors — no manager change needed.

- [ ] **Step 5: Syntax check** (no live run)

Run: `node -e "require('./server/src/engine/donation-engine');require('./server/src/engine/prayname-engine');require('./server/src/engine/asakim-donation-engine');console.log('load OK')"`
Expected: `load OK`

- [ ] **Step 6: Commit**

```bash
git add server/src/engine/donation-engine.js server/src/engine/prayname-engine.js server/src/engine/asakim-donation-engine.js server/src/routes/migrations.js
git commit -m "feat: checkpoint startMode in Donation/PrayName/Asakim engines"
```

---

### Task 4: Dedicated engines — VideoGallery, Recruiter, RecruitersGroup

**Files:**
- Modify: `server/src/engine/videogallery-engine.js` (constructor line 30-39; create-or-resume lines 62-75; pause line 85; batch line 107; completion line 114)
- Modify: `server/src/engine/recruiter-engine.js` (constructor line 33-43; create-or-resume lines 82-95; pause line 106; batch line 123; completion line 134)
- Modify: `server/src/engine/recruitersgroup-engine.js` (constructor line 30-40; create-or-resume lines 75-88; pause line 99; batch line 116; completion line 127)

**Interfaces:**
- Consumes: Task 1's `migration-checkpoint`.
- Produces: the three engines accept `options.startMode`. Checkpoint names: `"VideoGalleryMediaMapping"`, `"RecruiterMapping"`, `"RecruitersGroupMapping"`. These engines are dispatched through `manager.startMigration` (mappingName special-cases at `migration-manager.js:34-39`), which already forwards `options` — no manager change needed.

- [ ] **Step 1: Apply the exact same four edits as Task 3 to each engine**, with the engine's own name. For each engine, using its warn message name (e.g. `"startMode gapfill not supported by RecruiterEngine - running as continue (built-in alreadyExists skip covers gaps)"`):

1. `const migrationCheckpoint=require("../services/migration-checkpoint");` at top.
2. Constructor after `this.dryRun=...`:

```js
    this.startMode=(options&&options.startMode)||"continue";
    if(this.startMode==="gapfill"){logger.warn("startMode gapfill not supported by <Engine> - running as continue");this.startMode="continue";}
    this.checkpointReporter=migrationCheckpoint.createReporter("<MappingName>");
```

3. In the create-or-resume `else` branch, before the `tracker.createRun("<MappingName>",...)` line:

```js
        if(!this.dryRun&&this.startMode==="fresh"){
          await migrationCheckpoint.ensureTable();
          await migrationCheckpoint.resetForMapping("<MappingName>");
        }else if(this.startMode==="continue"){
          await migrationCheckpoint.ensureTable();
          var cpRow=await migrationCheckpoint.get("<MappingName>");
          if(cpRow&&cpRow.LastSourceId!=null){lastId=cpRow.LastSourceId;logger.info("continue mode: seeding from checkpoint",{mapping:"<MappingName>",lastSourceId:lastId});}
        }
```

and directly after the whole if/else (outside it):

```js
      if(!this.dryRun) await this.checkpointReporter.init(this.counters.inserted);
```

4. `if(!this.dryRun) await this.checkpointReporter.batch(lastId,this.counters.inserted);` after the pause-block and per-batch `updateRunCounters` calls; `if(!this.dryRun) await this.checkpointReporter.complete();` after the completion `updateRunCounters`.

Verify each engine file already imports `logger` (all do).

- [ ] **Step 2: Syntax check**

Run: `node -e "require('./server/src/engine/videogallery-engine');require('./server/src/engine/recruiter-engine');require('./server/src/engine/recruitersgroup-engine');console.log('load OK')"`
Expected: `load OK`

- [ ] **Step 3: Commit**

```bash
git add server/src/engine/videogallery-engine.js server/src/engine/recruiter-engine.js server/src/engine/recruitersgroup-engine.js
git commit -m "feat: checkpoint startMode in VideoGallery/Recruiter/RecruitersGroup engines"
```

---

### Task 5: Pipeline orchestrator threads `startMode`

**Files:**
- Modify: `server/src/services/pipeline-orchestrator.js` (dispatchers lines 13-19; `_runLoop` line 99)
- Test: `server/scripts/tests/test-pipeline-startmode.js`

**Interfaces:**
- Consumes: nothing new server-side (engines own the fresh reset — the orchestrator only forwards the mode).
- Produces: dispatchers signature becomes `(step, io, startMode)`; `_runLoop` derives `startMode` from the pipeline run's stored `mode` column (`"fresh"` → `"fresh"`, else `"continue"`). Existing tests substitute dispatchers with functions that ignore extra args — they keep passing.

- [ ] **Step 1: Write the failing test** (runs against the local `migration_tracker` DB, same as `test-pipeline-orchestrator.js`)

```js
const assert=require("assert");
const EventEmitter=require("events");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");
const orch=require("../../src/services/pipeline-orchestrator");

function fakeEngine(){
  var e=new EventEmitter();
  setImmediate(function(){
    e.emit("started",{runId:null,mapping:"fake"});
    setImmediate(function(){e.emit("completed",{runId:null,counters:{processed:1,inserted:1,skipped:0,errors:0}});});
  });
  return e;
}

function waitForIdle(){
  return new Promise(function(resolve,reject){
    var tries=0;
    (function poll(){
      pt.getLatestRun().then(function(run){
        if(run&&run.status!=="running") return resolve(run);
        if(++tries>200) return reject(new Error("pipeline did not finish"));
        setTimeout(poll,50);
      }).catch(reject);
    })();
  });
}

(async function(){
  await initTrackerDb();
  var createdRunIds=[];
  try{
    // fresh run -> every dispatcher receives startMode "fresh"
    var modes=[];
    var capture=function(step,io,startMode){modes.push(startMode);return fakeEngine();};
    orch._dispatchers.standard=capture;
    orch._dispatchers.donation=capture;
    orch._dispatchers.prayname=capture;
    orch._dispatchers.asakim=capture;
    var initial=await orch.startPipeline("fresh",{emit:function(){}});
    createdRunIds.push(initial.run.id);
    var run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    assert.strictEqual(modes.length,20,"all 20 steps dispatched");
    assert.ok(modes.every(function(m){return m==="fresh";}),"fresh run must dispatch startMode=fresh, got: "+modes.join(","));

    // continue run (previous run completed -> a NEW run is created with mode continue)
    modes=[];
    initial=await orch.startPipeline("continue",{emit:function(){}});
    createdRunIds.push(initial.run.id);
    run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    assert.ok(modes.every(function(m){return m==="continue";}),"continue run must dispatch startMode=continue, got: "+modes.join(","));

    console.log("test-pipeline-startmode: ALL PASS");
  }finally{
    for(var id of createdRunIds){await pt.deletePipelineRun(id);}
  }
  process.exit(0);
})().catch(function(e){console.error(e);process.exit(1);});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/scripts/tests/test-pipeline-startmode.js`
Expected: FAIL on the `startMode=fresh` assertion (dispatchers currently receive only `(step, io)`, so `modes` contains `undefined`)

- [ ] **Step 3: Implement.** Replace the dispatchers (lines 13-19):

```js
// kind -> function(step, io, startMode) returning an engine EventEmitter.
// startMode ("fresh"|"continue") comes from the pipeline run's stored mode; the ENGINES
// own the checkpoint semantics (fresh deletes the row, continue seeds from it) — the
// orchestrator only forwards the mode. Exported (as _dispatchers) so tests can substitute.
var dispatchers={
  standard:function(step,io,startMode){return manager.startMigration(step.name,{batchSize:step.batchSize||500,startMode:startMode},io);},
  donation:function(step,io,startMode){return manager.startDonationMigration({batchSize:step.batchSize||1000,startMode:startMode},io);},
  prayname:function(step,io,startMode){return manager.startPrayNameMigration({batchSize:step.batchSize||2000,startMode:startMode},io);},
  asakim:function(step,io,startMode){return manager.startAsakimDonationMigration({batchSize:step.batchSize||2000,startMode:startMode},io);},
  resume:function(migrationRunId,io){return manager.resumeMigration(migrationRunId,io);}
};
```

In `_runLoop`, after `var data=await pipelineTracker.getRunWithSteps(runId);` (line 58):

```js
    var startMode=data.run&&data.run.mode==="fresh"?"fresh":"continue";
```

And replace line 99 (`engine=dispatchers[def.kind](def,io);`):

```js
        engine=dispatchers[def.kind](def,io,startMode);
```

- [ ] **Step 4: Run the tests**

Run: `node server/scripts/tests/test-pipeline-startmode.js`
Expected: `test-pipeline-startmode: ALL PASS`
Run: `node server/scripts/tests/test-pipeline-orchestrator.js`
Expected: `test-pipeline-orchestrator: ALL PASS` (existing suite unaffected)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/pipeline-orchestrator.js server/scripts/tests/test-pipeline-startmode.js
git commit -m "feat: pipeline orchestrator threads startMode from run mode to every step"
```

---

### Task 6: `/api/checkpoints` routes + client API

**Files:**
- Create: `server/src/routes/checkpoints.js`
- Modify: `server/src/index.js` (require + mount)
- Modify: `client/src/api/client.js` (4 additions)

**Interfaces:**
- Consumes: Task 1's `migration-checkpoint` (`ensureTable`, `list`, `resetForMapping`).
- Produces: `GET /api/checkpoints` → `{checkpoints: Row[]}`; `DELETE /api/checkpoints/:mappingName` → `{deleted: number}`. Client: `api.getCheckpoints()`, `api.resetCheckpoint(mappingName)`, and `startMode` params on the three dedicated start calls (consumed by Tasks 7-8).

- [ ] **Step 1: Write the route**

```js
const express=require("express");
const router=express.Router();
const checkpoint=require("../services/migration-checkpoint");

router.get("/",async function(req,res){
  try{
    await checkpoint.ensureTable();
    var rows=await checkpoint.list();
    res.json({checkpoints:rows});
  }catch(err){res.status(500).json({error:err.message});}
});

router.delete("/:mappingName",async function(req,res){
  try{
    await checkpoint.ensureTable();
    var deleted=await checkpoint.resetForMapping(req.params.mappingName);
    res.json({deleted:deleted});
  }catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
```

- [ ] **Step 2: Mount in `index.js`.** After `const pipelineRouter=...` (line 16):

```js
const checkpointsRouter=require("./routes/checkpoints");
```

After `app.use("/api/pipeline",pipelineRouter);` (line 37):

```js
app.use("/api/checkpoints",checkpointsRouter);
```

- [ ] **Step 3: Client API.** In `client/src/api/client.js`, replace the three dedicated start functions and add two new entries inside the `api` object:

```js
  startDonationMigration:(batchSize,dryRun,startMode)=>fetchJson("/migrations/start-donations",{method:"POST",body:JSON.stringify({batchSize,dryRun,startMode})}),
  startPrayNameMigration:(batchSize,dryRun,startMode)=>fetchJson("/migrations/start-praynames",{method:"POST",body:JSON.stringify({batchSize,dryRun,startMode})}),
  startAsakimDonationMigration:(batchSize,dryRun,startMode)=>fetchJson("/migrations/start-asakim-donations",{method:"POST",body:JSON.stringify({batchSize,dryRun,startMode})}),
  getCheckpoints:()=>fetchJson("/checkpoints"),
  resetCheckpoint:(mappingName)=>fetchJson("/checkpoints/"+encodeURIComponent(mappingName),{method:"DELETE"}),
```

(`startMigration` already spreads an `options` object into the body — Task 7 passes `{startMode}` through it; no change needed here.)

- [ ] **Step 4: Syntax check**

Run: `node -e "require('./server/src/routes/checkpoints');console.log('route OK')"`
Expected: `route OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/checkpoints.js server/src/index.js client/src/api/client.js
git commit -m "feat: /api/checkpoints routes + client API for checkpoint map"
```

---

### Task 7: MigrationRunner — mode selectors

**Files:**
- Modify: `client/src/components/MigrationRunner.jsx`

**Interfaces:**
- Consumes: Task 6's client API (`startMode` third param on dedicated starts; `startMigration` options spread).
- Produces: UI only.

- [ ] **Step 1: Shared mode selector component.** Add near the top of the file (after `formatETA`):

```jsx
const START_MODES=[
  {value:"continue",label:"המשך מהנקודה האחרונה"},
  {value:"fresh",label:"התחל מאפס (איפוס נקודת ההמשך)"},
  {value:"gapfill",label:"השלמת חורים (gap-fill)"}
];

function StartModeSelect({value,onChange,disabled,allowGapfill}){
  const modes=allowGapfill?START_MODES:START_MODES.filter(m=>m.value!=="gapfill");
  return(
    <div>
      <label className="block text-sm font-medium mb-1">מצב התחלה</label>
      <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className="border rounded p-2">
        {modes.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Generic runner.** In the `MigrationRunner` component body add state:

```jsx
  const[startMode,setStartMode]=useState("continue");
```

In the generic form's grid (`grid grid-cols-2 gap-4 mb-4`, around line 629), change `grid-cols-2` to `grid-cols-3` and add as a third cell after the Batch Size input:

```jsx
          <StartModeSelect value={startMode} onChange={setStartMode} disabled={migrationState==="running"} allowGapfill={true}/>
```

Change the start button (line 643) to pass the mode:

```jsx
          <button onClick={()=>startMut.mutate({extra:{startMode}})} disabled={!selected||startMut.isPending||migrationState==="running"}
```

(The existing `startMut` mutationFn already forwards `options?.extra` into `api.startMigration`, which spreads it into the request body — no other change.)

- [ ] **Step 3: Dedicated cards.** In each of `DonationRunner`, `PrayNameRunner`, `AsakimDonationRunner`:

Add state next to the existing `batchSize` state:

```jsx
  const[startMode,setStartMode]=useState("continue");
```

Pass it in the start mutation (Donation shown; same one-line change in the other two with their own api call):

```jsx
  const startMut=useMutation({mutationFn:(dryRun)=>api.startDonationMigration(batchSize,dryRun,startMode),
    onSuccess:(data)=>{setDonationResult(data);setStartTime(Date.now());}});
```

Add the selector next to the Batch Size input (inside the `flex items-end gap-4 mb-4` div, right after the Batch Size `div`), using each card's running flag (`isDonationRunning` / `isPrayRunning` / `isRunning`):

```jsx
        <StartModeSelect value={startMode} onChange={setStartMode} disabled={isDonationRunning} allowGapfill={false}/>
```

- [ ] **Step 4: Build the client**

Run: `cd client && npm run build`
Expected: build completes with no errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MigrationRunner.jsx client/dist
git commit -m "feat: start-mode selector (continue/fresh/gapfill) in migration runner UI"
```

---

### Task 8: PipelineRunner — checkpoint map table

**Files:**
- Modify: `client/src/components/PipelineRunner.jsx`

**Interfaces:**
- Consumes: Task 6's `api.getCheckpoints()`; existing `STEP_LABELS` map and `lastPipelineEvent`/`lastEvent` from `useWebSocket`.
- Produces: UI only.

- [ ] **Step 1: Add the CheckpointMap component** (after `StepRow`):

```jsx
function CheckpointMap({refreshKey}){
  const{data,isLoading,refetch}=useQuery({
    queryKey:["checkpoints"],
    queryFn:api.getCheckpoints,
    refetchInterval:15000
  });
  useEffect(()=>{refetch();},[refreshKey,refetch]);
  const rows=data?.checkpoints||[];
  function fmt(d){return d?new Date(d).toLocaleString("he-IL"):"—";}
  return(
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <h3 className="font-semibold mb-3">מפת נקודות המשך (MigrationCheckpoint)</h3>
      {isLoading&&<p className="text-gray-500 text-sm">טוען...</p>}
      {!isLoading&&rows.length===0&&<p className="text-gray-500 text-sm">אין עדיין נקודות המשך — ירשמו אוטומטית בריצה הבאה.</p>}
      {rows.length>0&&(
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right border-b text-gray-500">
                <th className="py-1 pl-3">Mapping</th>
                <th className="py-1 pl-3">ID אחרון</th>
                <th className="py-1 pl-3">סטטוס</th>
                <th className="py-1 pl-3">עדכון אחרון</th>
                <th className="py-1 pl-3">הושלם</th>
                <th className="py-1 pl-3">שורות (מצטבר)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.MappingName} className="border-b last:border-0">
                  <td className="py-1 pl-3 font-medium">{STEP_LABELS[r.MappingName]||r.MappingName}</td>
                  <td className="py-1 pl-3 font-mono" dir="ltr">{r.LastSourceId??"—"}</td>
                  <td className={"py-1 pl-3 "+(r.Status==="completed"?"text-green-700":"text-blue-700")}>
                    {r.Status==="completed"?"הושלם ✓":"בתהליך ⟳"}
                  </td>
                  <td className="py-1 pl-3" dir="ltr">{fmt(r.LastRunAt)}</td>
                  <td className="py-1 pl-3" dir="ltr">{fmt(r.CompletedAt)}</td>
                  <td className="py-1 pl-3">{(r.RowsMigrated??0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it.** At the bottom of the `PipelineRunner` return, after the steps `div` (`<div className="space-y-2">...</div>`), add:

```jsx
      <CheckpointMap refreshKey={lastPipelineEvent}/>
```

`lastEvent`/`lastPipelineEvent` changes flow into `refreshKey`, so the table refetches when steps progress; the 15s `refetchInterval` covers per-batch updates during a long step. (DATETIME values arrive as UTC ISO strings; `toLocaleString("he-IL")` renders them in local Israel time for the operator.)

- [ ] **Step 3: Build the client**

Run: `cd client && npm run build`
Expected: build completes with no errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/PipelineRunner.jsx client/dist
git commit -m "feat: checkpoint map table in pipeline runner page"
```

---

### Task 9 [LIVE-GATED]: End-to-end live verification

**Files:** none created (manual checklist run against the real DBs). EVERY item below touches the target RDS and/or MSSQL — STOP and get the user's explicit authorization before running any of it. Agree with the user on which mapping to use as the guinea pig (smallest is `AffiliateMapping`).

- [ ] **Step 1 [LIVE-GATED]:** With authorization: start the server, run the Task 1 service test if it was skipped earlier.
- [ ] **Step 2 [LIVE-GATED]: continue seeds from checkpoint.** Via the UI or `POST /api/migrations/start {mappingName:"AffiliateMapping", startMode:"continue"}`: run once to completion → `GET /api/checkpoints` shows the row with `Status='completed'` and the max source id as `LastSourceId`. Run continue again → completes immediately with `processed=0` (nothing above the cursor), log shows `continue mode: seeding from checkpoint`.
- [ ] **Step 3 [LIVE-GATED]: pause → continue.** Start a larger mapping, pause mid-run, verify the checkpoint row's `LastSourceId` advanced; start a NEW continue run (not resume) and verify its first batch starts above the checkpoint (log line + no duplicate-key errors).
- [ ] **Step 4 [LIVE-GATED]: gapfill.** Pick a completed mapping; delete ONE mid-range row from its target table (with the user choosing the row); run `startMode:"gapfill"`; verify exactly that row is re-inserted (inserted=1) and everything else is skipped.
- [ ] **Step 5 [LIVE-GATED]: fresh resets.** Run `startMode:"fresh"` on the guinea-pig mapping (target rows still present — expect duplicate-key errors OR clean the table first with the user); verify the checkpoint row was deleted at run start and recreated during the run.
- [ ] **Step 6 [LIVE-GATED]: pipeline.** From `/pipeline`, run continue mode; verify every step dispatches with the seeded cursor (fast completion on already-done steps) and the checkpoint map table updates live.
- [ ] **Step 7:** Report results to the user; fix anything that surfaced before closing the feature.
