# LegacyMapping Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the legacy-id → new Project/ProjectItem mapping inside the target RDS (`LegacyMapping` table), populated by the migration engine as each project-producing mapping runs.

**Architecture:** A new shared service (`server/src/services/legacy-mapping.js`) owns the table DDL, per-mapping delete, and UPSERT record. The generic `MigrationEngine` calls it at run start (ensure table) and right after each ProjectItem insert (record). `restartMigration` in migration-manager deletes that mapping's rows together with the tracker cleanup. Five mapping JSONs opt in via a `legacyMapping` key. A read-only QA script compares the table against the local tracker.

**Tech Stack:** Node.js 24 (CommonJS, codebase's terse `var` style), mysql2/promise, built-in `node:test` runner (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-14-legacy-mapping-table-design.md` (approved 2026-07-14).

## Global Constraints

- **Build-only.** Never connect to or mutate the live source/target/tracker DBs in this work. Unit tests stub the DB module; the QA script is written but NOT executed (needs live-run authorization).
- Target table name is exactly `LegacyMapping` (PascalCase — AWS RDS is case-sensitive).
- `SourceType` values: `1` = Product (`products.productsid`), `2` = Prayer (`PrayerNames` id).
- **`MappingName` is the mapping JSON's `filename` value** (e.g. `ProjectMapping_Funds_Fixed`), which equals `migration_runs.mapping_name`. It is NOT the engine's `entityType` variable — `_meta.entityType` is `"Project"` for all four product mappings and would collide.
- LegacyMapping deletion happens ONLY alongside `tracker.cleanupForRestart` (restart path). Never at ordinary run start: ordinary re-runs are gap-fills (skip-existing) that would never re-insert deleted rows.
- Match surrounding code style: CommonJS `require`, terse `var`/minimal-whitespace style in `server/src/engine` + `server/src/services`, `const`/template-free SQL strings, `logger` for logging.
- The repo working tree contains unrelated modified files — `git add` ONLY the files listed in each task's commit step, never `git add -A`.
- All commands below run from the repo root `c:\Users\NeomiOs\Documents\NewMigration`.

---

### Task 1: `legacy-mapping` service module (TDD)

**Files:**
- Create: `server/test/legacy-mapping.test.js`
- Create: `server/src/services/legacy-mapping.js`
- Modify: `docs/superpowers/specs/2026-07-14-legacy-mapping-table-design.md` (1-line wording fix)

**Interfaces:**
- Consumes: `server/src/db/mysql-target.js` — `query(sql, params)` returning mysql2 `[result, fields]`.
- Produces (used by Tasks 2, 3):
  - `ensureTable(): Promise<void>` — `CREATE TABLE IF NOT EXISTS LegacyMapping ...` on the target DB. Idempotent.
  - `deleteForMapping(mappingName: string): Promise<number>` — deletes that mapping's rows, returns affectedRows.
  - `record(sourceType: number, sourceId: number|string, projectId: number, itemId: number, mappingName: string): Promise<void>` — UPSERT one row.
  - `SOURCE_TYPE = { PRODUCT: 1, PRAYER: 2 }`.

- [ ] **Step 1: Write the failing test**

Create `server/test/legacy-mapping.test.js`:

```js
// Unit tests for the LegacyMapping service. The target-DB module is stubbed by
// replacing its exported query() BEFORE requiring the service (the service calls
// targetDb.query as a property at call time, so the swap takes effect).
// Run: node --test server/test/
const test=require("node:test");
const assert=require("node:assert");
const targetDb=require("../src/db/mysql-target");

var calls=[];
targetDb.query=async function(sql,params){calls.push({sql:sql,params:params});return [{affectedRows:2}];};

const lm=require("../src/services/legacy-mapping");

test("SOURCE_TYPE constants",function(){
  assert.equal(lm.SOURCE_TYPE.PRODUCT,1);
  assert.equal(lm.SOURCE_TYPE.PRAYER,2);
});

test("ensureTable issues CREATE TABLE IF NOT EXISTS with the spec schema",async function(){
  calls=[];
  await lm.ensureTable();
  assert.equal(calls.length,1);
  var sql=calls[0].sql;
  assert.match(sql,/CREATE TABLE IF NOT EXISTS LegacyMapping/);
  assert.match(sql,/SourceType TINYINT NOT NULL/);
  assert.match(sql,/SourceId INT NOT NULL/);
  assert.match(sql,/ProjectId INT NOT NULL/);
  assert.match(sql,/ItemId INT NOT NULL/);
  assert.match(sql,/MappingName VARCHAR\(100\) NOT NULL/);
  assert.match(sql,/UNIQUE KEY UK_Source \(SourceType, SourceId\)/);
  assert.match(sql,/CHARSET=utf8mb4/);
});

test("deleteForMapping deletes only that mapping's rows and returns affectedRows",async function(){
  calls=[];
  var n=await lm.deleteForMapping("ProjectMapping_Funds_Fixed");
  assert.equal(n,2);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/DELETE FROM LegacyMapping WHERE MappingName=\?/);
  assert.deepEqual(calls[0].params,["ProjectMapping_Funds_Fixed"]);
});

test("record upserts with numeric ids and ON DUPLICATE KEY UPDATE",async function(){
  calls=[];
  await lm.record(1,"123",456,789,"ProjectMapping_Funds_Fixed");
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/INSERT INTO LegacyMapping \(SourceType,SourceId,ProjectId,ItemId,MappingName\)/);
  assert.match(calls[0].sql,/ON DUPLICATE KEY UPDATE ProjectId=VALUES\(ProjectId\),ItemId=VALUES\(ItemId\),MappingName=VALUES\(MappingName\)/);
  assert.deepEqual(calls[0].params,[1,123,456,789,"ProjectMapping_Funds_Fixed"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/`
Expected: FAIL — `Cannot find module '../src/services/legacy-mapping'`

- [ ] **Step 3: Write minimal implementation**

Create `server/src/services/legacy-mapping.js`:

```js
const targetDb=require("../db/mysql-target");
const logger=require("../logger");

// LegacyMapping — app-facing lookup table ON THE TARGET DB: legacy id -> new Project/Item.
// The new application resolves old product/prayer URLs through it at runtime.
// SourceType: 1=Product (products.productsid), 2=Prayer (PrayerNames id).
// MappingName is the mapping JSON "filename" (== migration_runs.mapping_name) — NOT the
// engine's entityType, which is "Project" for every product mapping and would collide.
// UNIQUE(SourceType,SourceId) assumes one ProjectItem per source row (true since the
// 2026-07-14 removal of the catch-all donation item); a second projectItemMappings key
// would silently overwrite via the UPSERT — add a key qualifier if that ever changes.
// Spec: docs/superpowers/specs/2026-07-14-legacy-mapping-table-design.md
const SOURCE_TYPE={PRODUCT:1,PRAYER:2};

const CREATE_SQL=[
  "CREATE TABLE IF NOT EXISTS LegacyMapping (",
  "  Id INT AUTO_INCREMENT PRIMARY KEY,",
  "  SourceType TINYINT NOT NULL,",
  "  SourceId INT NOT NULL,",
  "  ProjectId INT NOT NULL,",
  "  ItemId INT NOT NULL,",
  "  MappingName VARCHAR(100) NOT NULL,",
  "  CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,",
  "  UNIQUE KEY UK_Source (SourceType, SourceId),",
  "  INDEX IX_Project (ProjectId),",
  "  INDEX IX_Item (ItemId)",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
].join("\n");

async function ensureTable(){
  await targetDb.query(CREATE_SQL);
}

async function deleteForMapping(mappingName){
  var [res]=await targetDb.query("DELETE FROM LegacyMapping WHERE MappingName=?",[mappingName]);
  logger.info("LegacyMapping cleared for mapping",{mappingName:mappingName,deleted:res.affectedRows});
  return res.affectedRows;
}

async function record(sourceType,sourceId,projectId,itemId,mappingName){
  await targetDb.query(
    "INSERT INTO LegacyMapping (SourceType,SourceId,ProjectId,ItemId,MappingName) VALUES (?,?,?,?,?) "+
    "ON DUPLICATE KEY UPDATE ProjectId=VALUES(ProjectId),ItemId=VALUES(ItemId),MappingName=VALUES(MappingName)",
    [sourceType,Number(sourceId),Number(projectId),Number(itemId),mappingName]);
}

module.exports={ensureTable,deleteForMapping,record,SOURCE_TYPE};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/`
Expected: PASS — 4 passing tests, 0 failing.

- [ ] **Step 5: Fix the spec's MappingName wording**

In `docs/superpowers/specs/2026-07-14-legacy-mapping-table-design.md`, replace:

```
  MappingName VARCHAR(100) NOT NULL,     -- mapping entityType that produced the row
```

with:

```
  MappingName VARCHAR(100) NOT NULL,     -- mapping filename (== migration_runs.mapping_name)
```

and replace:

```
   `record(m.legacyMapping.sourceType, sourceId, newId, itemId, entityType)`.
```

with:

```
   `record(m.legacyMapping.sourceType, sourceId, newId, itemId, m.filename||targetTable)`
   — the mapping filename, NOT the engine's `entityType` (`_meta.entityType` is
   `"Project"` for all four product mappings and would collide across mappings).
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/legacy-mapping.js server/test/legacy-mapping.test.js docs/superpowers/specs/2026-07-14-legacy-mapping-table-design.md
git commit -m "feat: add LegacyMapping service (target-DB legacy id -> Project/Item map)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Engine hooks — ensure table at run start, record on ProjectItem insert

**Files:**
- Modify: `server/src/engine/migration-engine.js` (3 edits: require at ~line 9, ensure-table after the preMigrationRunners block at ~line 105, record after the `recordMapping("ProjectItem_"+itemKey,...)` call at ~line 288)
- Test: `server/test/engine-smoke.test.js` (new)

**Interfaces:**
- Consumes (from Task 1): `legacyMapping.ensureTable()`, `legacyMapping.record(sourceType, sourceId, projectId, itemId, mappingName)`.
- Produces: engine behavior — any mapping JSON with `"legacyMapping": {"sourceType": N}` gets its table ensured at run start and one LegacyMapping row per created ProjectItem. Mappings without the key are untouched.

- [ ] **Step 1: Write the smoke test (loads the engine after the edit — catches broken requires beyond `node --check`)**

Create `server/test/engine-smoke.test.js`:

```js
// Smoke test: the engine and manager modules must load cleanly with the new
// legacy-mapping require wiring. No DB calls happen at require time (pools are lazy).
const test=require("node:test");
const assert=require("node:assert");

test("migration-engine loads and exposes a constructor",function(){
  const MigrationEngine=require("../src/engine/migration-engine");
  assert.equal(typeof MigrationEngine,"function");
});

test("migration-manager loads and exposes startMigration",function(){
  const mgr=require("../src/services/migration-manager");
  assert.equal(typeof mgr.startMigration,"function");
});
```

Note: `migration-manager` doesn't reference `legacyMapping` until Task 3, but including it now keeps one smoke file for both tasks. `startMigration` is confirmed exported (`module.exports` at migration-manager.js line 281).

- [ ] **Step 2: Run the smoke test to establish it passes BEFORE the engine edit**

Run: `node --test server/test/`
Expected: PASS (6 tests total) — a loadability baseline before the edits.

- [ ] **Step 3: Add the require to migration-engine.js**

In `server/src/engine/migration-engine.js`, after line 8 (`const tracker=require("../services/tracker");`), add:

```js
const legacyMapping=require("../services/legacy-mapping");
```

- [ ] **Step 4: Add the ensure-table hook at run start**

In `migration-engine.js` `run()`, directly AFTER the closing brace of the `preMigrationRunners` block (currently lines 98-105):

```js
      if(m.preMigrationRunners&&Array.isArray(m.preMigrationRunners)){
        for(var preRunnerName of m.preMigrationRunners){
          logger.info("Running pre-migration runner",{runner:preRunnerName,mapping:m.filename});
          var preRunner=require("./pre-runners/"+preRunnerName);
          var preResult=await preRunner.run();
          logger.info("Pre-migration runner completed",{runner:preRunnerName,result:preResult});
        }
      }
```

add:

```js
      // LegacyMapping (app-facing legacy-id map on the TARGET DB): make sure the table
      // exists before any ProjectItem insert. Population is opt-in per mapping via
      // m.legacyMapping.sourceType (1=Product, 2=Prayer). Cleanup is delete-per-mapping
      // and lives ONLY in restartMigration (next to cleanupForRestart) — never here:
      // ordinary re-runs are gap-fills that would not re-insert deleted rows.
      if(m.legacyMapping){
        await legacyMapping.ensureTable();
      }
```

- [ ] **Step 5: Add the record hook after the ProjectItem tracker mapping**

In the `projectItemMappings` loop, find (currently lines 287-288):

```js
                itemId=await insertRow("ProjectItem",itemRow);
                await recordMapping("ProjectItem_"+itemKey,sourceId,itemId,this.runId);
```

and add directly after:

```js
                // Also persist to LegacyMapping on the TARGET DB (app runtime lookup:
                // legacy productsid/prayerId -> ProjectId+ItemId). MappingName is the
                // mapping filename (== migration_runs.mapping_name) — NOT entityType,
                // which is "Project" for every product mapping. A failure here fails the
                // row like any other child insert — this table is app-critical.
                if(m.legacyMapping){
                  await legacyMapping.record(m.legacyMapping.sourceType,sourceId,newId,itemId,m.filename||targetTable);
                }
```

(`newId` is the ProjectId in both modes: the inserted Project's id in normal mode, the resolved parent ProjectId in collapse mode. The call sits inside the row's `try` block, so a throw is caught by the existing per-row `catch` → `recordError` → row counted as error. That is the intended error handling.)

- [ ] **Step 6: Verify syntax + tests**

Run: `node --check server/src/engine/migration-engine.js`
Expected: no output (exit 0).

Run: `node --test server/test/`
Expected: PASS — all tests (Task 1's 4 + this task's 2).

- [ ] **Step 7: Commit**

```bash
git add server/src/engine/migration-engine.js server/test/engine-smoke.test.js
git commit -m "feat: record LegacyMapping rows from the generic engine (opt-in per mapping)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Restart cleanup hook in migration-manager

**Files:**
- Modify: `server/src/services/migration-manager.js` (require at top; edit `restartMigration`, currently lines 151-160)

**Interfaces:**
- Consumes (from Task 1): `legacyMapping.ensureTable()`, `legacyMapping.deleteForMapping(mappingName)`.
- Produces: restarting a run whose mapping opted in deletes that mapping's LegacyMapping rows before the fresh run starts. Engine-coded mappings without a JSON (e.g. `DonationMapping` — no `DonationMapping.json` exists) and mappings without `legacyMapping` are unaffected.

- [ ] **Step 1: Add the require**

In `server/src/services/migration-manager.js`, after line 10 (`const tracker=require("./tracker");`), add:

```js
const legacyMapping=require("./legacy-mapping");
```

- [ ] **Step 2: Edit `restartMigration`**

Replace the current function (lines 151-160):

```js
async function restartMigration(runId,io){
  var run=await tracker.getRun(runId);
  if(!run) return null;
  var engine=activeEngines.get(runId);
  if(engine&&engine.isRunning){engine.requestPause();await new Promise(function(r){setTimeout(r,2000);});}
  activeEngines.delete(runId);
  var entityType=run.mapping_name;
  await tracker.cleanupForRestart(runId,entityType);
  return startMigration(run.mapping_name,{batchSize:run.batch_size},io);
}
```

with:

```js
async function restartMigration(runId,io){
  var run=await tracker.getRun(runId);
  if(!run) return null;
  var engine=activeEngines.get(runId);
  if(engine&&engine.isRunning){engine.requestPause();await new Promise(function(r){setTimeout(r,2000);});}
  activeEngines.delete(runId);
  var entityType=run.mapping_name;
  await tracker.cleanupForRestart(runId,entityType);
  // LegacyMapping cleanup — tied to restart ONLY: cleanupForRestart just wiped row_status,
  // so the fresh run below re-records every row. Never delete on an ordinary run start
  // (gap-fill runs skip existing rows and would not re-insert). Engine-coded mappings
  // (DonationMapping etc.) have no JSON to load — treated as no legacyMapping. A delete
  // failure aborts the restart: stale LegacyMapping rows must not survive silently.
  var restartMapping=null;
  try{restartMapping=loadMapping(run.mapping_name);}catch(e){/* no mapping JSON — engine-coded */}
  if(restartMapping&&restartMapping.legacyMapping){
    await legacyMapping.ensureTable();
    await legacyMapping.deleteForMapping(run.mapping_name);
  }
  return startMigration(run.mapping_name,{batchSize:run.batch_size},io);
}
```

- [ ] **Step 3: Verify syntax + tests**

Run: `node --check server/src/services/migration-manager.js`
Expected: no output (exit 0).

Run: `node --test server/test/`
Expected: PASS — all tests.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/migration-manager.js
git commit -m "feat: clear a mapping's LegacyMapping rows on migration restart

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Opt in the five mapping JSONs

**Files:**
- Modify: `server/mappings/ProjectMapping_Collections_Fixed.json` (line 2 area)
- Modify: `server/mappings/ProjectMapping_Funds_Fixed.json` (line 2 area)
- Modify: `server/mappings/ProjectMapping_Type3_Parents.json` (line 2 area)
- Modify: `server/mappings/ProjectMapping_Type3_Subs.json` (line 2 area)
- Modify: `server/mappings/PrayerMapping.json` (line 2 area)

**Interfaces:**
- Consumes: the engine reads `m.legacyMapping.sourceType` (Task 2), restart reads `mapping.legacyMapping` (Task 3).
- Produces: the five project-producing mappings write LegacyMapping rows on their next run.

- [ ] **Step 1: Add the key to the four product mappings**

In each of `ProjectMapping_Collections_Fixed.json`, `ProjectMapping_Funds_Fixed.json`, `ProjectMapping_Type3_Parents.json`, `ProjectMapping_Type3_Subs.json` — every file has `"filename": "<name>",` on line 2. Add directly after that line:

```json
  "legacyMapping": { "sourceType": 1 },
```

- [ ] **Step 2: Add the key to PrayerMapping (sourceType 2)**

In `PrayerMapping.json`, after line 2 (`"filename": "PrayerMapping",`), add:

```json
  "legacyMapping": { "sourceType": 2 },
```

- [ ] **Step 3: Verify all five parse and carry the right sourceType**

Run:

```bash
node -e "var names=['ProjectMapping_Collections_Fixed','ProjectMapping_Funds_Fixed','ProjectMapping_Type3_Parents','ProjectMapping_Type3_Subs','PrayerMapping'];names.forEach(function(n){var m=require('./server/mappings/'+n+'.json');var st=m.legacyMapping&&m.legacyMapping.sourceType;var want=n==='PrayerMapping'?2:1;console.log(n,st);if(st!==want)process.exit(1);});console.log('OK');"
```

Expected: five lines with the right sourceType (1,1,1,1,2) then `OK`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add server/mappings/ProjectMapping_Collections_Fixed.json server/mappings/ProjectMapping_Funds_Fixed.json server/mappings/ProjectMapping_Type3_Parents.json server/mappings/ProjectMapping_Type3_Subs.json server/mappings/PrayerMapping.json
git commit -m "feat: opt project + prayer mappings into LegacyMapping recording

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Read-only QA check script

**Files:**
- Create: `server/scripts/checks/check-legacy-mapping.js`

**Interfaces:**
- Consumes: `server/src/config/database.js` (`config.mysqlTarget`, `config.mysqlTracker`); target `LegacyMapping` table (Task 1 schema); tracker `id_mappings`/`migration_runs`.
- Produces: console report + exit code (0 = match, 1 = mismatch, 2 = error). NOT run in this work — it needs the live DBs; it runs after the next authorized migration cycle.

- [ ] **Step 1: Write the script**

Create `server/scripts/checks/check-legacy-mapping.js`:

```js
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
```

- [ ] **Step 2: Verify syntax only (do NOT execute — live DBs)**

Run: `node --check server/scripts/checks/check-legacy-mapping.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add server/scripts/checks/check-legacy-mapping.js
git commit -m "feat: add read-only LegacyMapping vs tracker QA check script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verification (whole feature, build-only)

1. `node --test server/test/` → all 6 tests pass.
2. `node --check` on the three modified/created JS runtime files → clean.
3. Mapping JSON parse check (Task 4 Step 3 one-liner) → `OK`.
4. `git log --oneline -5` → the five feature commits present.

Live verification (deferred until authorized): next clean migration cycle runs the five mappings, then `node server/scripts/checks/check-legacy-mapping.js` must exit 0.
