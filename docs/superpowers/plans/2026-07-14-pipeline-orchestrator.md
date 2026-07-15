# Pipeline Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One button in a new UI page runs all 20 migrations sequentially in dependency order, with DB-persisted state and continue-from-last-point semantics.

**Architecture:** A new, fully additive layer: `pipeline.json` (step definitions) → `pipeline-orchestrator.js` (sequential loop that calls the EXISTING migration-manager start functions and awaits each engine's `completed`/`error`/`paused` events) → new tracker tables `pipeline_runs`/`pipeline_run_steps` → new `/api/pipeline/*` routes → new React page `/pipeline`. Zero changes to existing engines, migration-manager, or the `/migrate` screen.

**Tech Stack:** Node.js + Express + socket.io + mysql2 (server), React 18 + Vite + @tanstack/react-query + Tailwind classes (client). No test framework exists — tests are plain `node` scripts using `assert`, exiting non-zero on failure.

**Spec:** `docs/superpowers/specs/2026-07-14-pipeline-orchestrator-design.md` (approved).

## Global Constraints

- **Do NOT modify existing logic**: engines, `migration-manager.js`, `/migrate` screen, existing endpoints. Allowed additive changes ONLY: two `CREATE TABLE IF NOT EXISTS` in `init-tracker.js`, router mount + startup-recovery call in `server/src/index.js`, new route in `App.jsx`, nav item in `Layout.jsx`, new listeners + new state in `useWebSocket.js`, new methods appended to `client/src/api/client.js`.
- Codebase style: `var`, double quotes, compact spacing (`function(a,b){`), CommonJS on server, Hebrew RTL UI with Tailwind utility classes on client. Match it.
- Step names in `pipeline.json` MUST equal the `mapping` string each engine emits in its socket events (`DonationMapping`, `PrayNameMapping`, `AsakimDonationMapping`, and the mapping-file names for the rest) — the UI matches live progress events on this string.
- `fresh` mode does NOT wipe any target data (out of scope; separate future task).
- Failure policy: any engine `error` stops the whole pipeline immediately. Manual stop (`paused`) marks the run `stopped` and the interrupted step reverts to `pending`.
- Tracker DB (`migration_tracker` on local MySQL) is metadata only — test scripts may create and delete rows in the NEW pipeline tables, but must never touch MSSQL source or the target RDS.
- Server test scripts live in `server/scripts/tests/`, run with `node server/scripts/tests/<name>.js`, print `ALL PASS` and exit 0 on success.

---

### Task 1: Pipeline definition + config loader with dependency validation

**Files:**
- Create: `server/config/pipeline.json`
- Create: `server/src/services/pipeline-config.js`
- Test: `server/scripts/tests/test-pipeline-config.js`

**Interfaces:**
- Produces: `loadPipelineConfig() -> Step[]` (throws Error with clear message on invalid config) and `validatePipeline(steps) -> Step[]` where `Step = {name: string, label: string, kind: "standard"|"donation"|"prayname"|"asakim", dependsOn: string[], batchSize: number}`. Steps are returned in execution order (the file's order, verified to satisfy all dependencies).

- [ ] **Step 1: Write the failing test**

Create `server/scripts/tests/test-pipeline-config.js`:

```js
const assert=require("assert");
const {loadPipelineConfig,validatePipeline}=require("../../src/services/pipeline-config");

// 1. Real config: loads, has exactly 20 steps, every dependency appears earlier in the list
var steps=loadPipelineConfig();
assert.strictEqual(steps.length,20,"expected 20 steps, got "+steps.length);
var pos={};
steps.forEach(function(s,i){pos[s.name]=i;});
steps.forEach(function(s){
  assert.ok(s.label,"step "+s.name+" missing label");
  assert.ok(typeof s.batchSize==="number","step "+s.name+" missing numeric batchSize");
  s.dependsOn.forEach(function(d){
    assert.ok(pos[d]<pos[s.name],d+" must come before "+s.name);
  });
});
// 2. The dedicated-engine steps use the exact mapping names the engines emit
["DonationMapping","PrayNameMapping","AsakimDonationMapping"].forEach(function(n){
  assert.ok(pos[n]!==undefined,"missing step "+n);
});
assert.strictEqual(steps[pos["DonationMapping"]].kind,"donation");
assert.strictEqual(steps[pos["PrayNameMapping"]].kind,"prayname");
assert.strictEqual(steps[pos["AsakimDonationMapping"]].kind,"asakim");
// 3. Missing dependency rejected
assert.throws(function(){validatePipeline([{name:"A",label:"a",kind:"standard",dependsOn:["Nope"],batchSize:500}]);},/does not exist/);
// 4. Order violation / cycle rejected
assert.throws(function(){validatePipeline([
  {name:"A",label:"a",kind:"standard",dependsOn:["B"],batchSize:500},
  {name:"B",label:"b",kind:"standard",dependsOn:["A"],batchSize:500}
]);},/order violation or cycle/);
// 5. Invalid kind rejected
assert.throws(function(){validatePipeline([{name:"A",label:"a",kind:"nope",dependsOn:[],batchSize:500}]);},/invalid kind/);
// 6. Duplicate name rejected
assert.throws(function(){validatePipeline([
  {name:"A",label:"a",kind:"standard",dependsOn:[],batchSize:500},
  {name:"A",label:"a2",kind:"standard",dependsOn:[],batchSize:500}
]);},/duplicate/);

console.log("test-pipeline-config: ALL PASS");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/scripts/tests/test-pipeline-config.js`
Expected: FAIL with `Cannot find module '../../src/services/pipeline-config'`

- [ ] **Step 3: Create `server/config/pipeline.json`**

Note: the `server/config/` directory does not exist yet (existing config is `server/src/config/`) — create it. The 5 project steps are referenced repeatedly below; their names are `ProjectMapping_Funds_Fixed`, `ProjectMapping_Collections_Fixed`, `ProjectMapping_Collections_Type2`, `ProjectMapping_Type3_Parents`, `ProjectMapping_Type3_Subs`.

```json
{
  "steps": [
    {"name":"AffiliateMapping","label":"עמותות (Affiliate)","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"SourceMapping","label":"מקורות (Source)","kind":"standard","dependsOn":["AffiliateMapping"],"batchSize":500},
    {"name":"CustomerUserMapping","label":"משתמשים (CustomerUser)","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"LutFundCategoryMapping","label":"קטגוריות קרנות (Lut)","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"ProjectMapping_Funds_Fixed","label":"פרויקטים — קרנות","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"ProjectMapping_Collections_Fixed","label":"פרויקטים — מגביות","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"ProjectMapping_Collections_Type2","label":"פרויקטים — מגביות Type2","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"ProjectMapping_Type3_Parents","label":"פרויקטים — Type3 אבות","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"ProjectMapping_Type3_Subs","label":"פרויקטים — Type3 בנים","kind":"standard","dependsOn":["ProjectMapping_Type3_Parents"],"batchSize":500},
    {"name":"PrayerMapping","label":"תפילות (Prayer)","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"FundCategoryMapping","label":"שיוך קרנות לקטגוריות","kind":"standard","dependsOn":["ProjectMapping_Funds_Fixed","ProjectMapping_Collections_Fixed","ProjectMapping_Collections_Type2","ProjectMapping_Type3_Parents","ProjectMapping_Type3_Subs","LutFundCategoryMapping"],"batchSize":500},
    {"name":"ProjectItemLocalizationMapping","label":"לוקליזציית פריטי פרויקט","kind":"standard","dependsOn":["ProjectMapping_Funds_Fixed","ProjectMapping_Collections_Fixed","ProjectMapping_Collections_Type2","ProjectMapping_Type3_Parents","ProjectMapping_Type3_Subs"],"batchSize":500},
    {"name":"RecruitersGroupMapping","label":"קבוצות מגייסים","kind":"standard","dependsOn":["ProjectMapping_Funds_Fixed","ProjectMapping_Collections_Fixed","ProjectMapping_Collections_Type2","ProjectMapping_Type3_Parents","ProjectMapping_Type3_Subs"],"batchSize":500},
    {"name":"RecruiterMapping","label":"מגייסים","kind":"standard","dependsOn":["ProjectMapping_Funds_Fixed","ProjectMapping_Collections_Fixed","ProjectMapping_Collections_Type2","ProjectMapping_Type3_Parents","ProjectMapping_Type3_Subs","RecruitersGroupMapping"],"batchSize":500},
    {"name":"GalleryMapping_Images","label":"גלריות תמונות","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"GalleryMediaMapping_Images","label":"מדיה — תמונות גלריה","kind":"standard","dependsOn":["GalleryMapping_Images"],"batchSize":500},
    {"name":"VideoGalleryMediaMapping","label":"גלריית וידאו","kind":"standard","dependsOn":[],"batchSize":500},
    {"name":"DonationMapping","label":"תרומות (Donation)","kind":"donation","dependsOn":["ProjectMapping_Funds_Fixed","ProjectMapping_Collections_Fixed","ProjectMapping_Collections_Type2","ProjectMapping_Type3_Parents","ProjectMapping_Type3_Subs","PrayerMapping","CustomerUserMapping","SourceMapping","RecruiterMapping"],"batchSize":1000},
    {"name":"PrayNameMapping","label":"שמות לתפילה (PrayName)","kind":"prayname","dependsOn":["DonationMapping"],"batchSize":2000},
    {"name":"AsakimDonationMapping","label":"תרומות עסקים (Asakim)","kind":"asakim","dependsOn":["DonationMapping"],"batchSize":2000}
  ]
}
```

- [ ] **Step 4: Create `server/src/services/pipeline-config.js`**

```js
const fs=require("fs");
const path=require("path");

const CONFIG_PATH=path.join(__dirname,"../../config/pipeline.json");
const VALID_KINDS=["standard","donation","prayname","asakim"];

// Validates the declared list order satisfies every dependency (a dep must
// appear EARLIER in the array). This also rules out cycles, so no separate
// topological sort is needed — the file order IS the execution order.
function validatePipeline(steps){
  if(!Array.isArray(steps)||steps.length===0) throw new Error("pipeline.json: steps must be a non-empty array");
  var seen=new Set();
  steps.forEach(function(s,i){
    if(!s.name) throw new Error("pipeline.json: step at index "+i+" missing name");
    if(seen.has(s.name)) throw new Error("pipeline.json: duplicate step name "+s.name);
    if(VALID_KINDS.indexOf(s.kind)===-1) throw new Error("pipeline.json: step "+s.name+" has invalid kind '"+s.kind+"'");
    if(!Array.isArray(s.dependsOn)) throw new Error("pipeline.json: step "+s.name+" dependsOn must be an array");
    for(var d of s.dependsOn){
      if(!seen.has(d)){
        var existsLater=steps.some(function(x){return x.name===d;});
        throw new Error("pipeline.json: step "+s.name+" depends on "+d+" which "+
          (existsLater?"appears later in the list (order violation or cycle)":"does not exist"));
      }
    }
    seen.add(s.name);
  });
  return steps;
}

function loadPipelineConfig(){
  var raw=JSON.parse(fs.readFileSync(CONFIG_PATH,"utf8"));
  return validatePipeline(raw.steps);
}

module.exports={loadPipelineConfig,validatePipeline};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/scripts/tests/test-pipeline-config.js`
Expected: `test-pipeline-config: ALL PASS`

- [ ] **Step 6: Commit**

```bash
git add server/config/pipeline.json server/src/services/pipeline-config.js server/scripts/tests/test-pipeline-config.js
git commit -m "feat: add pipeline definition and validated config loader"
```

---

### Task 2: Tracker tables + pipeline-tracker service

**Files:**
- Modify: `server/src/db/init-tracker.js` (additive: two CREATE TABLE IF NOT EXISTS before the final log line, at line 89)
- Create: `server/src/services/pipeline-tracker.js`
- Test: `server/scripts/tests/test-pipeline-tracker.js`

**Interfaces:**
- Consumes: `server/src/db/mysql-tracker` (existing pool; `trackerDb.query(sql, params)` resolves to `[rows]`).
- Produces (all async, all exported from `pipeline-tracker.js`):
  - `createPipelineRun(mode, steps) -> runId` (steps = Step[] from Task 1; inserts one `pending` row per step with `order_index` = array index)
  - `getRunWithSteps(runId) -> {run, steps} | null` (steps LEFT JOINed to `migration_runs` for counters: `total_source_rows, processed_rows, inserted_rows, skipped_rows, error_rows`)
  - `getLatestRun() -> run | null`, `getActiveRun() -> run | null` (status='running'), `getAllRuns() -> run[]`
  - `updateRunStatus(runId, status, extra)` (`extra` optional `{current_step, error_message}`; sets `completed_at` for completed/failed/stopped)
  - `updateStepStatus(runId, stepName, status, extra)` (`extra` optional `{migration_run_id, error_message}`; `running` sets `started_at`, `completed`/`failed` set `completed_at`, `pending` NULLs both timestamps)
  - `failStaleRunningRuns() -> affectedCount` (marks orphaned `running` pipeline runs `failed` and reverts their `running` steps to `pending`)
  - `deletePipelineRun(runId)` (cascade-deletes steps; used by tests)

- [ ] **Step 1: Add the two tables to `init-tracker.js`**

Insert immediately before the `logger.info('Tracker DB init complete...')` line:

```js
    const pipelineRunsSql = [
      'CREATE TABLE IF NOT EXISTS pipeline_runs (',
      '  id INT AUTO_INCREMENT PRIMARY KEY,',
      "  mode ENUM('fresh','continue') NOT NULL DEFAULT 'continue',",
      "  status ENUM('running','completed','failed','stopped') NOT NULL DEFAULT 'running',",
      '  current_step VARCHAR(100),',
      '  error_message TEXT,',
      '  started_at DATETIME,',
      '  completed_at DATETIME,',
      '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
      '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join('\n');
    await conn.query(pipelineRunsSql);

    const pipelineStepsSql = [
      'CREATE TABLE IF NOT EXISTS pipeline_run_steps (',
      '  id INT AUTO_INCREMENT PRIMARY KEY,',
      '  pipeline_run_id INT NOT NULL,',
      '  step_name VARCHAR(100) NOT NULL,',
      '  order_index INT NOT NULL,',
      "  status ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',",
      '  migration_run_id INT,',
      '  error_message TEXT,',
      '  started_at DATETIME,',
      '  completed_at DATETIME,',
      '  UNIQUE KEY uk_run_step (pipeline_run_id, step_name),',
      '  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE,',
      '  FOREIGN KEY (migration_run_id) REFERENCES migration_runs(id) ON DELETE SET NULL',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join('\n');
    await conn.query(pipelineStepsSql);
```

Also change the log line `'Tracker DB init complete - all 4 tables ensured'` → `'Tracker DB init complete - all 6 tables ensured'`.

Note: the existing `clearAllHistory()` TRUNCATEs `migration_runs` with `FOREIGN_KEY_CHECKS=0` (unchanged). After such a clear, `pipeline_run_steps.migration_run_id` values may dangle; the LEFT JOIN in `getRunWithSteps` simply returns NULL counters for them — no crash, and we do not modify the existing function.

- [ ] **Step 2: Write the failing test**

Create `server/scripts/tests/test-pipeline-tracker.js`. It runs against the LOCAL `migration_tracker` DB (metadata only — never touches MSSQL or the target RDS) and cleans up after itself:

```js
const assert=require("assert");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");

const FAKE_STEPS=[
  {name:"TestStepA",label:"a",kind:"standard",dependsOn:[],batchSize:500},
  {name:"TestStepB",label:"b",kind:"standard",dependsOn:["TestStepA"],batchSize:500},
  {name:"TestStepC",label:"c",kind:"donation",dependsOn:["TestStepB"],batchSize:1000}
];

(async function(){
  await initTrackerDb(); // ensures the new tables exist
  var runId=await pt.createPipelineRun("continue",FAKE_STEPS);
  try{
    var data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.run.mode,"continue");
    assert.strictEqual(data.run.status,"running");
    assert.strictEqual(data.steps.length,3);
    assert.strictEqual(data.steps[0].step_name,"TestStepA");
    assert.strictEqual(data.steps[0].order_index,0);
    assert.strictEqual(data.steps[2].status,"pending");

    await pt.updateStepStatus(runId,"TestStepA","running");
    await pt.updateStepStatus(runId,"TestStepA","completed");
    await pt.updateStepStatus(runId,"TestStepB","failed",{error_message:"boom"});
    await pt.updateRunStatus(runId,"failed",{current_step:"TestStepB",error_message:"boom"});

    data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.steps[0].status,"completed");
    assert.ok(data.steps[0].completed_at,"completed_at should be set");
    assert.strictEqual(data.steps[1].status,"failed");
    assert.strictEqual(data.steps[1].error_message,"boom");
    assert.strictEqual(data.run.status,"failed");
    assert.strictEqual(data.run.current_step,"TestStepB");
    assert.ok(data.run.completed_at,"run completed_at should be set");

    // pending revert NULLs timestamps
    await pt.updateStepStatus(runId,"TestStepA","pending");
    data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.steps[0].status,"pending");
    assert.strictEqual(data.steps[0].started_at,null);

    // latest/active lookups
    var latest=await pt.getLatestRun();
    assert.strictEqual(latest.id,runId);
    var active=await pt.getActiveRun();
    assert.ok(!active||active.id!==runId,"failed run must not be active");

    // stale-run recovery
    await pt.updateRunStatus(runId,"running");
    await pt.updateStepStatus(runId,"TestStepB","running");
    var n=await pt.failStaleRunningRuns();
    assert.ok(n>=1,"should fail at least the stale run");
    data=await pt.getRunWithSteps(runId);
    assert.strictEqual(data.run.status,"failed");
    assert.strictEqual(data.steps[1].status,"pending","stale running step reverts to pending");

    console.log("test-pipeline-tracker: ALL PASS");
  }finally{
    // Cleanup only — process.exit here would swallow assertion failures
    // (exit(0) in a finally preempts the pending exception and the .catch).
    await pt.deletePipelineRun(runId);
  }
  process.exit(0); // success path only; failures propagate to .catch below
})().catch(function(e){console.error(e);process.exit(1);});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node server/scripts/tests/test-pipeline-tracker.js`
Expected: FAIL with `Cannot find module '../../src/services/pipeline-tracker'`

- [ ] **Step 4: Create `server/src/services/pipeline-tracker.js`**

```js
const trackerDb=require("../db/mysql-tracker");
const logger=require("../logger");

async function createPipelineRun(mode,steps){
  var [result]=await trackerDb.query(
    "INSERT INTO pipeline_runs (mode,status,started_at) VALUES (?,?,NOW())",[mode,"running"]);
  var runId=result.insertId;
  var placeholders=steps.map(function(){return "(?,?,?,?)";}).join(",");
  var vals=[];
  steps.forEach(function(s,i){vals.push(runId,s.name,i,"pending");});
  await trackerDb.query(
    "INSERT INTO pipeline_run_steps (pipeline_run_id,step_name,order_index,status) VALUES "+placeholders,vals);
  return runId;
}

async function getRunWithSteps(runId){
  var [runs]=await trackerDb.query("SELECT * FROM pipeline_runs WHERE id=?",[runId]);
  if(!runs[0]) return null;
  var [steps]=await trackerDb.query(
    "SELECT s.*, m.total_source_rows, m.processed_rows, m.inserted_rows, m.skipped_rows, m.error_rows "+
    "FROM pipeline_run_steps s LEFT JOIN migration_runs m ON m.id=s.migration_run_id "+
    "WHERE s.pipeline_run_id=? ORDER BY s.order_index",[runId]);
  return {run:runs[0],steps:steps};
}

async function getLatestRun(){
  var [rows]=await trackerDb.query("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1");
  return rows[0]||null;
}

async function getActiveRun(){
  var [rows]=await trackerDb.query("SELECT * FROM pipeline_runs WHERE status='running' ORDER BY id DESC LIMIT 1");
  return rows[0]||null;
}

async function getAllRuns(){
  var [rows]=await trackerDb.query("SELECT * FROM pipeline_runs ORDER BY id DESC");
  return rows;
}

async function updateRunStatus(runId,status,extra){
  var sets=["status=?"];
  var vals=[status];
  if(status==="completed"||status==="failed"||status==="stopped") sets.push("completed_at=NOW()");
  if(extra&&extra.current_step!==undefined){sets.push("current_step=?");vals.push(extra.current_step);}
  if(extra&&extra.error_message!==undefined){sets.push("error_message=?");vals.push(extra.error_message);}
  vals.push(runId);
  await trackerDb.query("UPDATE pipeline_runs SET "+sets.join(",")+" WHERE id=?",vals);
}

async function updateStepStatus(runId,stepName,status,extra){
  var sets=["status=?"];
  var vals=[status];
  if(status==="running") sets.push("started_at=NOW()");
  if(status==="completed"||status==="failed") sets.push("completed_at=NOW()");
  if(status==="pending"){sets.push("started_at=NULL");sets.push("completed_at=NULL");}
  if(extra&&extra.migration_run_id!==undefined){sets.push("migration_run_id=?");vals.push(extra.migration_run_id);}
  if(extra&&extra.error_message!==undefined){sets.push("error_message=?");vals.push(extra.error_message);}
  vals.push(runId,stepName);
  await trackerDb.query("UPDATE pipeline_run_steps SET "+sets.join(",")+" WHERE pipeline_run_id=? AND step_name=?",vals);
}

async function failStaleRunningRuns(){
  var [result]=await trackerDb.query(
    "UPDATE pipeline_runs SET status='failed',error_message='Server restarted while pipeline was running',completed_at=NOW() WHERE status='running'");
  if(result.affectedRows>0){
    await trackerDb.query(
      "UPDATE pipeline_run_steps SET status='pending',started_at=NULL,completed_at=NULL WHERE status='running'");
    logger.warn("Marked stale running pipeline runs as failed",{count:result.affectedRows});
  }
  return result.affectedRows;
}

async function deletePipelineRun(runId){
  await trackerDb.query("DELETE FROM pipeline_runs WHERE id=?",[runId]);
}

module.exports={createPipelineRun,getRunWithSteps,getLatestRun,getActiveRun,getAllRuns,updateRunStatus,updateStepStatus,failStaleRunningRuns,deletePipelineRun};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node server/scripts/tests/test-pipeline-tracker.js`
Expected: `test-pipeline-tracker: ALL PASS`

- [ ] **Step 6: Commit**

```bash
git add server/src/db/init-tracker.js server/src/services/pipeline-tracker.js server/scripts/tests/test-pipeline-tracker.js
git commit -m "feat: add pipeline_runs/pipeline_run_steps tables and pipeline-tracker service"
```

---

### Task 3: Orchestrator service

**Files:**
- Create: `server/src/services/pipeline-orchestrator.js`
- Test: `server/scripts/tests/test-pipeline-orchestrator.js`

**Interfaces:**
- Consumes: `migration-manager` exports `startMigration(name,options,io)`, `startDonationMigration(options,io)`, `startPrayNameMigration(options,io)`, `startAsakimDonationMigration(options,io)` — each returns an EventEmitter engine synchronously that later emits `started {runId,...}`, then exactly one of `completed {runId,counters}` / `error {runId,error}` / `paused {runId,...}`. Also consumes Task 1 `loadPipelineConfig()` and Task 2 `pipeline-tracker`.
- Produces (exported):
  - `startPipeline(mode, io) -> Promise<{run,steps}>` — validates, creates/continues a run, kicks off the loop (fire-and-forget), returns initial state. Throws `err.code=409` if already running.
  - `stopPipeline() -> boolean` — requests pause on the current engine; loop then marks run `stopped`.
  - `getCurrentRun() -> Promise<{run,steps}|null>` — latest run with steps.
  - `getAllRuns() -> Promise<run[]>`
  - `recoverStaleRuns() -> Promise<number>` — call once at server startup.
  - `_dispatchers` — the kind→function map, exported so the test can substitute fake engines.

- [ ] **Step 1: Write the failing test**

Create `server/scripts/tests/test-pipeline-orchestrator.js`. Uses the real local tracker DB + fake engines; asserts the three core scenarios (success, error-stops-pipeline, continue-resumes-from-failure):

```js
const assert=require("assert");
const EventEmitter=require("events");
const {initTrackerDb}=require("../../src/db/init-tracker");
const pt=require("../../src/services/pipeline-tracker");
const orch=require("../../src/services/pipeline-orchestrator");

function fakeEngine(behavior,delayMs){
  var e=new EventEmitter();
  setImmediate(function(){
    e.emit("started",{runId:null,mapping:"fake"});
    setTimeout(function(){
      if(behavior==="error") e.emit("error",{runId:null,error:"boom"});
      else if(behavior==="paused") e.emit("paused",{runId:null});
      else e.emit("completed",{runId:null,counters:{processed:1,inserted:1,skipped:0,errors:0}});
    },delayMs||0);
  });
  return e;
}

var emitted=[];
var fakeIo={emit:function(name,data){emitted.push({name:name,data:data});}};

function waitForIdle(){
  // The loop is fire-and-forget; poll the DB until the run leaves 'running'
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
    // Scenario 1: all engines succeed -> run completed, all 20 steps completed
    orch._dispatchers.standard=function(){return fakeEngine("ok");};
    orch._dispatchers.donation=function(){return fakeEngine("ok");};
    orch._dispatchers.prayname=function(){return fakeEngine("ok");};
    orch._dispatchers.asakim=function(){return fakeEngine("ok");};
    var initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    var data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,20);
    assert.ok(emitted.some(function(e){return e.name==="pipeline:completed";}));

    // Scenario 2: 3rd step errors -> run failed, later steps stay pending
    var count=0;
    orch._dispatchers.standard=function(){count++;return fakeEngine(count===3?"error":"ok");};
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    run=await waitForIdle();
    assert.strictEqual(run.status,"failed");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[2].status,"failed");
    assert.strictEqual(data.steps[2].error_message,"boom");
    assert.strictEqual(data.steps[3].status,"pending");
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,2);
    assert.ok(emitted.some(function(e){return e.name==="pipeline:error";}));

    // Scenario 3: continue mode resumes THE SAME failed run, skips completed steps
    orch._dispatchers.standard=function(){return fakeEngine("ok");};
    var before=data.steps[0].completed_at;
    initial=await orch.startPipeline("continue",fakeIo);
    assert.strictEqual(initial.run.id,run.id,"continue must reuse the failed run");
    run=await waitForIdle();
    assert.strictEqual(run.status,"completed");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps.filter(function(s){return s.status==="completed";}).length,20);
    assert.strictEqual(String(data.steps[0].completed_at),String(before),"already-completed step must not re-run");

    // Scenario 4: 409 while running, then manual-stop semantics.
    // The 300ms delay keeps the first step running long enough for the
    // concurrent-start check to be deterministic.
    orch._dispatchers.standard=function(){return fakeEngine("paused",300);};
    initial=await orch.startPipeline("fresh",fakeIo);
    createdRunIds.push(initial.run.id);
    var rejected=false;
    try{await orch.startPipeline("fresh",fakeIo);}catch(e){rejected=(e.code===409);}
    run=await waitForIdle();
    assert.ok(rejected,"second concurrent start must be rejected with 409");
    assert.strictEqual(run.status,"stopped","paused engine -> pipeline stopped");
    data=await pt.getRunWithSteps(run.id);
    assert.strictEqual(data.steps[0].status,"pending","interrupted step reverts to pending");
    assert.ok(emitted.some(function(e){return e.name==="pipeline:stopped";}));

    console.log("test-pipeline-orchestrator: ALL PASS");
  }finally{
    // Cleanup only — process.exit here would swallow assertion failures
    // (exit(0) in a finally preempts the pending exception and the .catch).
    for(var id of createdRunIds){await pt.deletePipelineRun(id);}
  }
  process.exit(0); // success path only; failures propagate to .catch below
})().catch(function(e){console.error(e);process.exit(1);});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/scripts/tests/test-pipeline-orchestrator.js`
Expected: FAIL with `Cannot find module '../../src/services/pipeline-orchestrator'`

- [ ] **Step 3: Create `server/src/services/pipeline-orchestrator.js`**

```js
const manager=require("./migration-manager");
const pipelineTracker=require("./pipeline-tracker");
const {loadPipelineConfig}=require("./pipeline-config");
const logger=require("../logger");

var running=false;
var currentEngine=null;
var stopRequested=false;

// kind -> function(step, io) returning an engine EventEmitter.
// Exported (as _dispatchers) so tests can substitute fake engines.
var dispatchers={
  standard:function(step,io){return manager.startMigration(step.name,{batchSize:step.batchSize||500},io);},
  donation:function(step,io){return manager.startDonationMigration({batchSize:step.batchSize||1000},io);},
  prayname:function(step,io){return manager.startPrayNameMigration({batchSize:step.batchSize||2000},io);},
  asakim:function(step,io){return manager.startAsakimDonationMigration({batchSize:step.batchSize||2000},io);}
};

function _awaitEngine(engine,onStarted){
  return new Promise(function(resolve){
    engine.once("started",function(d){if(onStarted) onStarted(d);});
    engine.once("completed",function(d){resolve({status:"completed",data:d});});
    engine.once("paused",function(d){resolve({status:"paused",data:d});});
    engine.once("error",function(d){resolve({status:"error",data:d});});
  });
}

async function startPipeline(mode,io){
  if(running){var e=new Error("Pipeline is already running");e.code=409;throw e;}
  var active=await pipelineTracker.getActiveRun();
  if(active){var e2=new Error("Pipeline run #"+active.id+" is already running");e2.code=409;throw e2;}

  var steps=loadPipelineConfig(); // throws a clear message on bad config — no run is created

  var runId=null;
  if(mode!=="fresh"){
    var latest=await pipelineTracker.getLatestRun();
    if(latest&&(latest.status==="failed"||latest.status==="stopped")) runId=latest.id;
  }
  if(runId===null){
    runId=await pipelineTracker.createPipelineRun(mode==="fresh"?"fresh":"continue",steps);
  }else{
    await pipelineTracker.updateRunStatus(runId,"running",{error_message:null});
  }

  running=true;stopRequested=false;
  _runLoop(runId,steps,io); // fire-and-forget; state is read via getCurrentRun/socket events
  return pipelineTracker.getRunWithSteps(runId);
}

async function _runLoop(runId,steps,io){
  try{
    var stepByName={};
    steps.forEach(function(s){stepByName[s.name]=s;});
    if(io) io.emit("pipeline:started",{pipelineRunId:runId});
    var data=await pipelineTracker.getRunWithSteps(runId);
    for(var row of data.steps){
      if(row.status==="completed") continue;
      if(stopRequested){await _markStopped(runId,io);return;}
      var def=stepByName[row.step_name];
      if(!def){await _markFailed(runId,row.step_name,"Step "+row.step_name+" is missing from pipeline.json — cannot continue this run",io);return;}
      await pipelineTracker.updateStepStatus(runId,row.step_name,"running");
      await pipelineTracker.updateRunStatus(runId,"running",{current_step:row.step_name});
      if(io) io.emit("pipeline:step-started",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
      logger.info("Pipeline step starting",{runId:runId,step:row.step_name});

      var engine=dispatchers[def.kind](def,io);
      currentEngine=engine;
      var stepName=row.step_name;
      var result=await _awaitEngine(engine,function(d){
        if(d&&d.runId){
          pipelineTracker.updateStepStatus(runId,stepName,"running",{migration_run_id:d.runId})
            .catch(function(e){logger.error("Pipeline: failed to record migration_run_id",{error:e.message});});
        }
      });
      currentEngine=null;

      if(result.status==="completed"){
        await pipelineTracker.updateStepStatus(runId,row.step_name,"completed");
        if(io) io.emit("pipeline:step-completed",{pipelineRunId:runId,step:row.step_name,orderIndex:row.order_index});
        logger.info("Pipeline step completed",{runId:runId,step:row.step_name});
        continue;
      }
      if(result.status==="paused"){
        // Manual stop (or engine pause): the step will re-run from its start next time
        await pipelineTracker.updateStepStatus(runId,row.step_name,"pending");
        await _markStopped(runId,io);
        return;
      }
      var msg=(result.data&&result.data.error)?String(result.data.error):"Unknown engine error";
      await _markFailed(runId,row.step_name,msg,io);
      return;
    }
    await pipelineTracker.updateRunStatus(runId,"completed",{current_step:null});
    if(io) io.emit("pipeline:completed",{pipelineRunId:runId});
    logger.info("Pipeline completed",{runId:runId});
  }catch(err){
    logger.error("Pipeline loop crashed",{error:err.message,stack:err.stack});
    try{await pipelineTracker.updateRunStatus(runId,"failed",{error_message:err.message});}catch(e){}
    if(io) io.emit("pipeline:error",{pipelineRunId:runId,error:err.message});
  }finally{
    running=false;currentEngine=null;stopRequested=false;
  }
}

async function _markFailed(runId,stepName,message,io){
  await pipelineTracker.updateStepStatus(runId,stepName,"failed",{error_message:message});
  await pipelineTracker.updateRunStatus(runId,"failed",{error_message:message});
  if(io) io.emit("pipeline:error",{pipelineRunId:runId,step:stepName,error:message});
  logger.error("Pipeline failed",{runId:runId,step:stepName,error:message});
}

async function _markStopped(runId,io){
  await pipelineTracker.updateRunStatus(runId,"stopped");
  if(io) io.emit("pipeline:stopped",{pipelineRunId:runId});
  logger.info("Pipeline stopped",{runId:runId});
}

function stopPipeline(){
  if(!running) return false;
  stopRequested=true;
  if(currentEngine&&typeof currentEngine.requestPause==="function") currentEngine.requestPause();
  return true;
}

async function getCurrentRun(){
  var latest=await pipelineTracker.getLatestRun();
  if(!latest) return null;
  return pipelineTracker.getRunWithSteps(latest.id);
}

function getAllRuns(){return pipelineTracker.getAllRuns();}

function recoverStaleRuns(){return pipelineTracker.failStaleRunningRuns();}

module.exports={startPipeline,stopPipeline,getCurrentRun,getAllRuns,recoverStaleRuns,_dispatchers:dispatchers};
```

Note: fake test engines have no `requestPause`, hence the `typeof` guard in `stopPipeline`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node server/scripts/tests/test-pipeline-orchestrator.js`
Expected: `test-pipeline-orchestrator: ALL PASS`

Also re-run the earlier suites to catch regressions:
`node server/scripts/tests/test-pipeline-config.js && node server/scripts/tests/test-pipeline-tracker.js`
Expected: both print ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/pipeline-orchestrator.js server/scripts/tests/test-pipeline-orchestrator.js
git commit -m "feat: add pipeline orchestrator with sequential dependency-ordered execution"
```

---

### Task 4: API routes + server wiring

**Files:**
- Create: `server/src/routes/pipeline.js`
- Modify: `server/src/index.js` (additive: one require at line ~15, one `app.use` after line 35, one recovery call inside `start()` after `initTrackerDb()`)

**Interfaces:**
- Consumes: Task 3 orchestrator exports.
- Produces HTTP API:
  - `POST /api/pipeline/start` body `{"mode":"fresh"|"continue"}` (anything other than `"fresh"` is treated as `"continue"`) → `{run,steps}`; 409 `{error}` if already running; 500 `{error}` on config errors.
  - `POST /api/pipeline/stop` → `{stopping:boolean}`
  - `GET /api/pipeline/current` → `{run,steps}` or `{run:null,steps:[]}`
  - `GET /api/pipeline/runs` → `{runs:[...]}`

- [ ] **Step 1: Create `server/src/routes/pipeline.js`**

```js
const express=require("express");
const router=express.Router();
const orchestrator=require("../services/pipeline-orchestrator");

router.post("/start",async function(req,res){
  try{
    var mode=req.body&&req.body.mode==="fresh"?"fresh":"continue";
    var data=await orchestrator.startPipeline(mode,req.app.get("io"));
    res.json(data);
  }catch(err){
    res.status(err.code===409?409:500).json({error:err.message});
  }
});

router.post("/stop",function(req,res){
  res.json({stopping:orchestrator.stopPipeline()});
});

router.get("/current",async function(req,res){
  try{
    var data=await orchestrator.getCurrentRun();
    res.json(data||{run:null,steps:[]});
  }catch(err){res.status(500).json({error:err.message});}
});

router.get("/runs",async function(req,res){
  try{res.json({runs:await orchestrator.getAllRuns()});}catch(err){res.status(500).json({error:err.message});}
});

module.exports=router;
```

- [ ] **Step 2: Wire into `server/src/index.js` (three additive lines)**

After `const validationRouter=require("./routes/validation");` add:

```js
const pipelineRouter=require("./routes/pipeline");
```

After `app.use("/api/validation",validationRouter);` add:

```js
app.use("/api/pipeline",pipelineRouter);
```

Inside `start()`, right after `logger.info("Tracker DB initialized");` add:

```js
    var staleCount=await require("./services/pipeline-orchestrator").recoverStaleRuns();
    if(staleCount>0) logger.warn("Recovered "+staleCount+" stale pipeline run(s) from previous server crash");
```

- [ ] **Step 3: Verify the API manually**

Start the server (`cd server && npm start` in a background terminal), then:

```bash
curl -s http://localhost:3001/api/pipeline/current
```
Expected: `{"run":null,"steps":[]}` (or the latest test run if Task 3's cleanup was skipped).

```bash
curl -s http://localhost:3001/api/pipeline/runs
```
Expected: `{"runs":[]}` (same caveat).

Do NOT call `POST /start` here — it would launch real migrations against the databases. Live-run verification is Task 7, gated on explicit authorization.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/pipeline.js server/src/index.js
git commit -m "feat: add /api/pipeline routes and server wiring"
```

---

### Task 5: Client plumbing — API methods + pipeline socket events

**Files:**
- Modify: `client/src/api/client.js` (append 4 methods to the `api` object)
- Modify: `client/src/hooks/useWebSocket.js` (add `lastPipelineEvent` state + 6 listeners; existing `lastEvent` behavior untouched)

**Interfaces:**
- Produces: `api.startPipeline(mode)`, `api.stopPipeline()`, `api.getPipelineCurrent()`, `api.getPipelineRuns()`; `useWebSocket()` now returns `{connected,lastEvent,lastPipelineEvent,socket}` where `lastPipelineEvent = {type:"pipeline:started"|"pipeline:step-started"|"pipeline:step-completed"|"pipeline:completed"|"pipeline:error"|"pipeline:stopped", pipelineRunId, step?, orderIndex?, error?}`.
- Note: pipeline events go into a SEPARATE state so they can never disturb the existing components that key off `lastEvent`.

- [ ] **Step 1: Append to `client/src/api/client.js`** (inside the `api` object, after `startGalleryMigration`):

```js
  startPipeline:(mode)=>fetchJson("/pipeline/start",{method:"POST",body:JSON.stringify({mode})}),
  stopPipeline:()=>fetchJson("/pipeline/stop",{method:"POST"}),
  getPipelineCurrent:()=>fetchJson("/pipeline/current"),
  getPipelineRuns:()=>fetchJson("/pipeline/runs"),
```

- [ ] **Step 2: Extend `client/src/hooks/useWebSocket.js`**

Add a second state below `lastEvent`:

```js
  const[lastPipelineEvent,setLastPipelineEvent]=useState(null);
```

Add listeners after the `migration:error` listener:

```js
    socket.on("pipeline:started",(d)=>setLastPipelineEvent({type:"pipeline:started",...d}));
    socket.on("pipeline:step-started",(d)=>setLastPipelineEvent({type:"pipeline:step-started",...d}));
    socket.on("pipeline:step-completed",(d)=>setLastPipelineEvent({type:"pipeline:step-completed",...d}));
    socket.on("pipeline:completed",(d)=>setLastPipelineEvent({type:"pipeline:completed",...d}));
    socket.on("pipeline:error",(d)=>setLastPipelineEvent({type:"pipeline:error",...d}));
    socket.on("pipeline:stopped",(d)=>setLastPipelineEvent({type:"pipeline:stopped",...d}));
```

Change the return to:

```js
  return{connected,lastEvent,lastPipelineEvent,socket:socketRef.current};
```

- [ ] **Step 3: Verify the client still builds**

Run: `cd client && npm run build`
Expected: Vite build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/api/client.js client/src/hooks/useWebSocket.js
git commit -m "feat: add pipeline API methods and socket events to client plumbing"
```

---

### Task 6: PipelineRunner page + routing

**Files:**
- Create: `client/src/components/PipelineRunner.jsx`
- Modify: `client/src/App.jsx` (one import + one route)
- Modify: `client/src/components/Layout.jsx` (one nav item)

**Interfaces:**
- Consumes: Task 5 API methods and `useWebSocket`. Server payload `{run,steps}` where `run.status ∈ running|completed|failed|stopped` (or `run:null`) and each step has `step_name,order_index,status,error_message,total_source_rows,processed_rows,inserted_rows,skipped_rows,error_rows`.
- Note on labels: the server API does not expose the Hebrew labels from `pipeline.json`, so the page keeps its own `STEP_LABELS` map keyed by `step_name` (single screen, acceptable duplication).

- [ ] **Step 1: Create `client/src/components/PipelineRunner.jsx`**

```jsx
import{useState,useEffect}from"react";
import{useQuery,useMutation,useQueryClient}from"@tanstack/react-query";
import{api}from"../api/client";
import{useWebSocket}from"../hooks/useWebSocket";

const STEP_LABELS={
  AffiliateMapping:"עמותות (Affiliate)",
  SourceMapping:"מקורות (Source)",
  CustomerUserMapping:"משתמשים (CustomerUser)",
  LutFundCategoryMapping:"קטגוריות קרנות (Lut)",
  ProjectMapping_Funds_Fixed:"פרויקטים — קרנות",
  ProjectMapping_Collections_Fixed:"פרויקטים — מגביות",
  ProjectMapping_Collections_Type2:"פרויקטים — מגביות Type2",
  ProjectMapping_Type3_Parents:"פרויקטים — Type3 אבות",
  ProjectMapping_Type3_Subs:"פרויקטים — Type3 בנים",
  PrayerMapping:"תפילות (Prayer)",
  FundCategoryMapping:"שיוך קרנות לקטגוריות",
  ProjectItemLocalizationMapping:"לוקליזציית פריטי פרויקט",
  RecruitersGroupMapping:"קבוצות מגייסים",
  RecruiterMapping:"מגייסים",
  GalleryMapping_Images:"גלריות תמונות",
  GalleryMediaMapping_Images:"מדיה — תמונות גלריה",
  VideoGalleryMediaMapping:"גלריית וידאו",
  DonationMapping:"תרומות (Donation)",
  PrayNameMapping:"שמות לתפילה (PrayName)",
  AsakimDonationMapping:"תרומות עסקים (Asakim)"
};

const STATUS_ICONS={completed:"✓",running:"⟳",pending:"○",failed:"✗"};
const STATUS_COLORS={completed:"text-green-600",running:"text-blue-600 animate-pulse",pending:"text-gray-400",failed:"text-red-600"};

function StepRow({step,liveProgress}){
  var isRunning=step.status==="running";
  var progress=isRunning&&liveProgress&&liveProgress.mapping===step.step_name?liveProgress:null;
  var pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):null;
  var counters=progress?progress.counters:(step.migration_run_id?{
    processed:step.processed_rows,inserted:step.inserted_rows,skipped:step.skipped_rows,errors:step.error_rows
  }:null);
  return(
    <div className={"flex flex-col border rounded p-3 "+(isRunning?"border-blue-300 bg-blue-50":step.status==="failed"?"border-red-300 bg-red-50":"border-gray-200")}>
      <div className="flex items-center gap-3">
        <span className={"text-lg font-bold w-6 text-center "+STATUS_COLORS[step.status]}>{STATUS_ICONS[step.status]}</span>
        <span className="text-sm text-gray-400 w-8">{step.order_index+1}.</span>
        <span className="font-medium flex-1">{STEP_LABELS[step.step_name]||step.step_name}</span>
        {counters&&(
          <span className="text-xs text-gray-600">
            עובדו: {counters.processed??0} | הוכנסו: {counters.inserted??0} | דולגו: {counters.skipped??0} | שגיאות: {counters.errors??0}
          </span>
        )}
      </div>
      {pct!==null&&(
        <div className="mt-2 mr-14">
          <div className="w-full bg-gray-200 rounded h-2">
            <div className="bg-blue-600 h-2 rounded" style={{width:pct+"%"}}/>
          </div>
          <span className="text-xs text-gray-600">{pct}% ({progress.counters.processed}/{progress.totalRows})</span>
        </div>
      )}
      {step.status==="failed"&&step.error_message&&(
        <p className="text-red-700 text-sm mt-2 mr-14 break-all">{step.error_message}</p>
      )}
    </div>
  );
}

export default function PipelineRunner(){
  const[fresh,setFresh]=useState(false);
  const queryClient=useQueryClient();
  const{lastEvent,lastPipelineEvent}=useWebSocket();

  const{data,isLoading}=useQuery({
    queryKey:["pipelineCurrent"],
    queryFn:api.getPipelineCurrent,
    refetchInterval:5000
  });

  // Any pipeline event = state changed on the server -> refetch immediately
  useEffect(()=>{
    if(lastPipelineEvent) queryClient.invalidateQueries({queryKey:["pipelineCurrent"]});
  },[lastPipelineEvent,queryClient]);

  const startMut=useMutation({
    mutationFn:()=>api.startPipeline(fresh?"fresh":"continue"),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["pipelineCurrent"]})
  });
  const stopMut=useMutation({
    mutationFn:api.stopPipeline,
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["pipelineCurrent"]})
  });

  const run=data?.run;
  const steps=data?.steps||[];
  const isRunning=run?.status==="running";
  const canContinue=!fresh&&run&&(run.status==="failed"||run.status==="stopped");
  const completedCount=steps.filter(s=>s.status==="completed").length;
  const overallPct=steps.length>0?Math.round((completedCount/steps.length)*100):0;

  // Live progress of the currently-running step, from the existing migration:progress stream
  const liveProgress=lastEvent&&lastEvent.type==="progress"?lastEvent:null;

  function onStart(){
    if(fresh&&!window.confirm("להתחיל מאפס? כל 20 השלבים ירוצו מההתחלה (ללא ניקוי טבלאות יעד).")) return;
    startMut.mutate();
  }

  return(
    <div>
      <h2 className="text-2xl font-bold mb-4">הרצה מלאה</h2>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fresh} onChange={e=>setFresh(e.target.checked)} disabled={isRunning}/>
            התחל מאפס (אחרת: המשך מהנקודה האחרונה)
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onStart} disabled={isRunning||startMut.isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium">
            {startMut.isPending?"מתחיל...":isRunning?"רץ...":canContinue?"המשך מהנקודה שנעצרה":"הרץ את כל התהליך"}
          </button>
          {isRunning&&(
            <button onClick={()=>stopMut.mutate()} disabled={stopMut.isPending}
              className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
              {stopMut.isPending?"עוצר...":"עצור"}
            </button>
          )}
        </div>
        {startMut.isError&&<p className="text-red-600 text-sm mt-3">{startMut.error.message}</p>}
        {run&&(
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>
                {run.status==="running"&&"רץ — שלב "+(completedCount+1)+" מתוך "+steps.length}
                {run.status==="completed"&&"הושלם — כל "+steps.length+" השלבים"}
                {run.status==="failed"&&"נכשל בשלב: "+(STEP_LABELS[run.current_step]||run.current_step)}
                {run.status==="stopped"&&"נעצר ידנית"}
              </span>
              <span>{overallPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded h-3">
              <div className={"h-3 rounded "+(run.status==="failed"?"bg-red-500":run.status==="completed"?"bg-green-500":"bg-blue-600")}
                style={{width:overallPct+"%"}}/>
            </div>
            {run.status==="failed"&&run.error_message&&(
              <p className="text-red-700 text-sm mt-2 break-all">{run.error_message}</p>
            )}
          </div>
        )}
      </div>

      {isLoading&&<p className="text-gray-500">טוען...</p>}
      {!isLoading&&steps.length===0&&<p className="text-gray-500">עדיין לא הופעלה הרצה מלאה. לחיצה על הכפתור תריץ את כל 20 השלבים לפי סדר התלויות.</p>}
      <div className="space-y-2">
        {steps.map(s=><StepRow key={s.step_name} step={s} liveProgress={liveProgress}/>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route in `client/src/App.jsx`**

Add import: `import PipelineRunner from"./components/PipelineRunner";`
Add route after the `migrate` route: `<Route path="pipeline" element={<PipelineRunner/>}/>`

- [ ] **Step 3: Add the nav item in `client/src/components/Layout.jsx`**

In `navItems`, after the `/migrate` entry, add:

```js
  {to:"/pipeline",label:"הרצה מלאה"},
```

- [ ] **Step 4: Verify build + render**

Run: `cd client && npm run build`
Expected: build succeeds.

Then with server + client dev running, open `http://localhost:5173/pipeline`:
Expected: page renders with the empty-state message (or the latest run if test rows remain), checkbox, and disabled-appropriate buttons. Do NOT click start.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PipelineRunner.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: add PipelineRunner page with one-button full migration run"
```

---

### Task 7: End-to-end verification (gated)

**Files:** none (verification only).

- [ ] **Step 1: Full test-suite pass**

```bash
node server/scripts/tests/test-pipeline-config.js
node server/scripts/tests/test-pipeline-tracker.js
node server/scripts/tests/test-pipeline-orchestrator.js
cd client && npm run build
```
Expected: three ALL PASS + clean build.

- [ ] **Step 2: UI smoke test (no live migration)**

Restart the server so `init-tracker` creates the new tables and stale-run recovery runs. Open `/pipeline`, verify: 20-step list appears after any run exists, WebSocket connects, checkbox toggles, fresh-mode confirm dialog appears (cancel it).

- [ ] **Step 3: Live run — ONLY with explicit user authorization**

Per project rule ("build vs execute"), an actual `POST /api/pipeline/start` against the real databases is a live migration and requires the user's explicit go-ahead, given the current DB state (dirty from prior partial runs). When authorized, verify: sequential execution, step statuses updating live, stop button mid-run → `stopped` → continue resumes, and a forced failure (e.g. temporarily breaking a mapping name) → `failed` → continue resumes.

- [ ] **Step 4: Report results to the user** — including anything skipped.

---

## Execution amendments (review findings fixed during implementation)

- Task 2/3 test scripts: `process.exit(0)` moved out of `finally` (was swallowing assertion failures); success-path exit only.
- Task 3 `startPipeline`: `running=true` is claimed synchronously before any `await` (TOCTOU fix — the plan's original code allowed two concurrent starts), rolled back in a pre-launch catch; the code blocks above reflect the original, commit `61dc02e` the fixed shape.
- Task 3 test: two scenarios added — manual stop via `stopPipeline()` (stoppable fake engine, DB-state + event assertions, `getCurrentRun`/`getAllRuns` coverage) and genuine concurrent entry (two un-awaited starts → exactly one 409).

## Self-review notes (already applied)

- Spec coverage: config+order (Task 1), tables (Task 2), orchestrator incl. 409/stop/stale-recovery (Task 3), API (Task 4), socket plumbing kept additive via separate `lastPipelineEvent` (Task 5), UI incl. fresh-confirm dialog and browser-refresh-safe state (Task 6), testing scenarios from spec §7 (Tasks 1/3/7).
- Naming consistency: step names = engine event `mapping` strings; UI matches `liveProgress.mapping===step.step_name`.
- The spec's "step reverts to pending on manual stop" is implemented in the orchestrator `paused` branch and asserted in test scenario 4.

## Post-review amendments (final whole-feature review, 2026-07-15)

- **Continue semantics hardened (commit de02449):** before dispatching a non-completed step, the orchestrator triages the step's previous engine run: `completed` → step marked completed and skipped; `paused` → resumed via existing `manager.resumeMigration` (row-level resume, no duplicates); any other status with `processed_rows>0` → pipeline aborts with an explicit Hebrew message (re-running would duplicate target rows); otherwise fresh dispatch. Covered by test scenarios 7 (resume) and 8 (abort).
- Stop-request windows closed (`stopRequested` claimed with `running`; `requestPause` recheck after `currentEngine` assignment); `onStarted` writes only `migration_run_id` (new `setStepMigrationRunId`); outer catch fails the in-flight step.
- The abort-on-partial policy is interim: the parallel spec `2026-07-15-migration-checkpoint-design.md` (per-mapping checkpoint in target RDS + engine `startMode`) will supersede it at the engine level; its implementation should relax the orchestrator's abort branch.
- Accepted follow-ups: start-side mutual exclusion between /pipeline and /migrate (document "don't use /migrate during a pipeline run"); fetchJson error-body passthrough.
