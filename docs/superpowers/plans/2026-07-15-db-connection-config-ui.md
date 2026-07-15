# DB Connection Configuration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit the three DB connections (MSSQL source, MySQL target, MySQL tracker) from the Connections screen, persisting to `.env` and live-applying without a server restart, with a mandatory successful connection test before apply.

**Architecture:** A new `connection-config` service on the server owns redaction, validation, isolated candidate testing, `.env` persistence, in-place mutation of the shared `config` object, and pool reset. Three new endpoints extend `routes/connections.js`. The React Connections screen gains an inline edit form per connection card. Spec: `docs/superpowers/specs/2026-07-15-db-connection-config-ui-design.md`.

**Tech Stack:** Node.js (CommonJS), Express, mssql/msnodesqlv8, mysql2/promise, node:test, React 18 + @tanstack/react-query + Tailwind (existing stack — no new dependencies).

## Global Constraints

- **No new npm dependencies** — server and client both.
- **Code style:** match the repo — CommonJS on the server, compact `var`/`function` style, 2-space indent; client uses the existing compact JSX style with Tailwind classes.
- **Tests:** Node built-in runner. Run from repo root: `node --test server/test/`
- **Never return or log a password.** MySQL passwords never leave the server; `Pwd=`/`Password=` values inside the MSSQL connection string are masked with `******` on read.
- **UI text in English**, matching the existing Connections screen.
- **Commit after every task** (small, focused commits).
- The root `.env` is git-ignored and holds real credentials — tests must NEVER write to it. The env-writer unit tests operate on strings / temp files only.

---

### Task 1: `.env` writer utility

**Files:**
- Create: `server/src/services/env-file.js`
- Test: `server/test/env-file.test.js`

**Interfaces:**
- Consumes: nothing (pure + fs).
- Produces:
  - `updateEnvText(text: string, updates: {[key]: string}) : string` — pure; replaces values of the given keys only, preserves every other line verbatim (comments, blanks, unknown keys, CRLF/LF style), appends missing keys at the end.
  - `updateEnvFile(filePath: string, updates: {[key]: string}) : void` — reads the file (empty string if missing), applies `updateEnvText`, writes back.
  - Value quoting rule: raw when safe; wrapped in `"` if the value contains `#`, a quote, or leading/trailing whitespace; single quotes if it contains `"`; throws if it contains both quote kinds or a newline.

- [ ] **Step 1: Write the failing tests**

Create `server/test/env-file.test.js`:

```js
// Unit tests for the pure .env text editor. Run: node --test server/test/
const test=require("node:test");
const assert=require("node:assert");
const {updateEnvText}=require("../src/services/env-file");

test("replaces value of an existing key, preserves other lines verbatim",function(){
  var input="# MSSQL Source\nMSSQL_DATABASE=OldDb\nUNMANAGED=keep\n";
  var out=updateEnvText(input,{MSSQL_DATABASE:"NewDb"});
  assert.equal(out,"# MSSQL Source\nMSSQL_DATABASE=NewDb\nUNMANAGED=keep\n");
});

test("preserves CRLF line endings",function(){
  var input="A=1\r\nB=2\r\n";
  var out=updateEnvText(input,{B:"3"});
  assert.equal(out,"A=1\r\nB=3\r\n");
});

test("appends missing keys at the end, before trailing blank line",function(){
  var input="A=1\n";
  var out=updateEnvText(input,{NEW_KEY:"val"});
  assert.equal(out,"A=1\nNEW_KEY=val\n");
});

test("does not touch keys that merely share a prefix",function(){
  var input="MYSQL_TARGET_HOST=a\nMYSQL_TARGET_HOST_OLD=b\n";
  var out=updateEnvText(input,{MYSQL_TARGET_HOST:"c"});
  assert.equal(out,"MYSQL_TARGET_HOST=c\nMYSQL_TARGET_HOST_OLD=b\n");
});

test("values containing = and ; and spaces are written raw (connection strings)",function(){
  var cs="Driver={ODBC Driver 17 for SQL Server};Server=HOST;Database=Db;Trusted_Connection=yes;";
  var out=updateEnvText("MSSQL_CONNECTION_STRING=x\n",{MSSQL_CONNECTION_STRING:cs});
  assert.equal(out,"MSSQL_CONNECTION_STRING="+cs+"\n");
});

test("value containing # is double-quoted",function(){
  var out=updateEnvText("P=x\n",{P:"pa#ss"});
  assert.equal(out,'P="pa#ss"\n');
});

test("value containing double-quote is single-quoted",function(){
  var out=updateEnvText("P=x\n",{P:'pa"ss'});
  assert.equal(out,"P='pa\"ss'\n");
});

test("value with both quote kinds throws",function(){
  assert.throws(function(){updateEnvText("P=x\n",{P:"a'b\"c"});},/quote/);
});

test("value with newline throws",function(){
  assert.throws(function(){updateEnvText("P=x\n",{P:"a\nb"});},/newline/i);
});

test("updating an empty file produces just the keys",function(){
  var out=updateEnvText("",{A:"1"});
  assert.equal(out,"A=1\n");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/test/env-file.test.js`
Expected: FAIL — `Cannot find module '../src/services/env-file'`

- [ ] **Step 3: Write the implementation**

Create `server/src/services/env-file.js`:

```js
// Pure .env text editor. Replaces values of managed keys ONLY; every other
// line (comments, blanks, unknown keys) is preserved verbatim, including the
// file's CRLF/LF style. Missing keys are appended at the end. Used by the
// connection-config service — the root .env stays the single source of truth
// for the server AND the standalone scripts.
const fs=require("fs");

function formatValue(v){
  v=String(v);
  if(/[\r\n]/.test(v)) throw new Error("Value may not contain newlines");
  if(!/[#'"]/.test(v)&&!/^\s|\s$/.test(v)) return v;
  if(v.indexOf('"')<0) return '"'+v+'"';
  if(v.indexOf("'")<0) return "'"+v+"'";
  throw new Error("Value may not contain both single and double quotes");
}

function updateEnvText(text,updates){
  var eol=text.indexOf("\r\n")>=0?"\r\n":"\n";
  var pending=new Set(Object.keys(updates));
  var lines=text.split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var m=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(lines[i]);
    if(m&&pending.has(m[1])){lines[i]=m[1]+"="+formatValue(updates[m[1]]);pending.delete(m[1]);}
  }
  if(pending.size>0){
    var trailing=[];
    while(lines.length&&lines[lines.length-1]==="") trailing.push(lines.pop());
    pending.forEach(function(k){lines.push(k+"="+formatValue(updates[k]));});
    lines.push("");
  }
  return lines.join(eol);
}

function updateEnvFile(filePath,updates){
  var text=fs.existsSync(filePath)?fs.readFileSync(filePath,"utf8"):"";
  fs.writeFileSync(filePath,updateEnvText(text,updates),"utf8");
}

module.exports={updateEnvText,updateEnvFile,formatValue};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/test/env-file.test.js`
Expected: PASS (10 tests). If the "appends missing keys" or "empty file" test fails on trailing-newline handling, fix `updateEnvText` (not the test) — appended output must end with exactly one trailing newline.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `node --test server/test/`
Expected: all tests pass (existing `legacy-mapping.test.js`, `engine-smoke.test.js` included).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/env-file.js server/test/env-file.test.js
git commit -m "feat: add .env writer utility for connection config persistence"
```

---

### Task 2: Busy-state and pool-reset primitives

**Files:**
- Modify: `server/src/services/migration-manager.js` (add `hasActiveMigration`, export test seam)
- Modify: `server/src/services/pipeline-orchestrator.js` (add `isPipelineRunning`)
- Modify: `server/src/db/mysql-target.js` (add `resetPool`)
- Modify: `server/src/db/mysql-tracker.js` (add `resetPool`)
- Modify: `server/src/db/mssql.js` (add `resetPool`, export `getErrorMessage`)
- Test: `server/test/connection-guards.test.js`

**Interfaces:**
- Consumes: existing module-private state (`activeEngines`, `galleryChainRunning`, `running`, `pool`).
- Produces (used by Task 3):
  - `migration-manager`: `hasActiveMigration() : boolean` — true if any registered engine has `isRunning===true` or the gallery chain is running. Also exports `_activeEngines` (the live Map) as a test seam, following the existing `_dispatchers` precedent in pipeline-orchestrator.
  - `pipeline-orchestrator`: `isPipelineRunning() : boolean` — returns the module's `running` flag.
  - `mysql-target` / `mysql-tracker`: `resetPool() : Promise<void>` — best-effort `pool.end()` (errors logged and swallowed), then `pool=null`; next `getPool()` re-reads the (mutated) config.
  - `mssql`: `resetPool() : Promise<void>` — nulls the module pool and calls `sql.close()` (clears the driver's global connection so the next `sql.connect` picks up the new config); errors swallowed. Also exports the existing `getErrorMessage(err) : string`.

- [ ] **Step 1: Write the failing tests**

Create `server/test/connection-guards.test.js`:

```js
// Guards + pool-reset primitives for the connection-config feature.
// Run: node --test server/test/
const test=require("node:test");
const assert=require("node:assert");
const manager=require("../src/services/migration-manager");
const orchestrator=require("../src/services/pipeline-orchestrator");
const targetDb=require("../src/db/mysql-target");
const trackerDb=require("../src/db/mysql-tracker");
const mssqlDb=require("../src/db/mssql");

test("hasActiveMigration is false with no engines",function(){
  manager._activeEngines.clear();
  assert.equal(manager.hasActiveMigration(),false);
});

test("hasActiveMigration ignores engines that finished",function(){
  manager._activeEngines.clear();
  manager._activeEngines.set(1,{isRunning:false});
  assert.equal(manager.hasActiveMigration(),false);
  manager._activeEngines.clear();
});

test("hasActiveMigration is true when an engine is running",function(){
  manager._activeEngines.clear();
  manager._activeEngines.set(1,{isRunning:false});
  manager._activeEngines.set(2,{isRunning:true});
  assert.equal(manager.hasActiveMigration(),true);
  manager._activeEngines.clear();
});

test("isPipelineRunning is false at rest",function(){
  assert.equal(orchestrator.isPipelineRunning(),false);
});

test("resetPool is a safe no-op when no pool exists",async function(){
  await targetDb.resetPool();
  await trackerDb.resetPool();
  await mssqlDb.resetPool();
});

test("mssql exports getErrorMessage",function(){
  assert.equal(mssqlDb.getErrorMessage("boom"),"boom");
  assert.equal(mssqlDb.getErrorMessage(new Error("x")),"x");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/test/connection-guards.test.js`
Expected: FAIL — `manager._activeEngines` / `hasActiveMigration` / `isPipelineRunning` / `resetPool` are undefined.

- [ ] **Step 3: Implement `hasActiveMigration` in migration-manager.js**

In `server/src/services/migration-manager.js`, add after `function getActiveEngine(...)` (line ~218):

```js
function hasActiveMigration(){
  if(galleryChainRunning) return true;
  for(var engine of activeEngines.values()){if(engine.isRunning) return true;}
  return false;
}
```

Extend the `module.exports` line (last line of file) — add `hasActiveMigration` and the test seam:

```js
module.exports={loadMapping,listMappings,startMigration,startDonationMigration,startPrayNameMigration,startAsakimDonationMigration,startGalleryMigrationChain,pauseMigration,resumeMigration,restartMigration,getActiveEngine,hasActiveMigration,_activeEngines:activeEngines};
```

- [ ] **Step 4: Implement `isPipelineRunning` in pipeline-orchestrator.js**

In `server/src/services/pipeline-orchestrator.js`, add near the other top-level functions:

```js
function isPipelineRunning(){return running;}
```

Extend the exports line (line ~136):

```js
module.exports={startPipeline,stopPipeline,getCurrentRun,getAllRuns,recoverStaleRuns,isPipelineRunning,_dispatchers:dispatchers};
```

- [ ] **Step 5: Implement `resetPool` in the two mysql modules**

In `server/src/db/mysql-target.js`, add before `module.exports`:

```js
async function resetPool(){
  if(pool){var old=pool;pool=null;try{await old.end();}catch(err){logger.warn("MySQL target pool close failed: "+err.message);}}
}
```

Update exports: `module.exports = { getPool, query, getConnection, testConnection, close, resetPool };`

In `server/src/db/mysql-tracker.js`, add the same with the log text `"MySQL tracker pool close failed: "`:

```js
async function resetPool(){
  if(pool){var old=pool;pool=null;try{await old.end();}catch(err){logger.warn("MySQL tracker pool close failed: "+err.message);}}
}
```

Update exports: `module.exports = { getPool, query, getConnection, testConnection, close, resetPool };`

- [ ] **Step 6: Implement `resetPool` + export `getErrorMessage` in mssql.js**

In `server/src/db/mssql.js`, add before `module.exports`:

```js
async function resetPool(){
  // sql.close() clears the driver's global connection so the next
  // sql.connect() picks up new config values instead of reusing the old pool.
  pool=null;
  try{await sql.close();}catch(err){logger.warn("MSSQL pool close failed: "+getErrorMessage(err));}
}
```

Update exports: `module.exports = { getPool, query, testConnection, close, resetPool, getErrorMessage };`

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test server/test/connection-guards.test.js`
Expected: PASS (6 tests). Then run the full suite: `node --test server/test/` — all pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/migration-manager.js server/src/services/pipeline-orchestrator.js server/src/db/mysql-target.js server/src/db/mysql-tracker.js server/src/db/mssql.js server/test/connection-guards.test.js
git commit -m "feat: add busy-state guards and pool reset primitives for live connection config"
```

---

### Task 3: connection-config service

**Files:**
- Create: `server/src/services/connection-config.js`
- Test: `server/test/connection-config.test.js`

**Interfaces:**
- Consumes: `env-file.updateEnvFile` (Task 1); `hasActiveMigration`, `isPipelineRunning`, `resetPool`, `getErrorMessage` (Task 2); the shared `config` object from `server/src/config/database.js`.
- Produces (used by Task 4):
  - `getRedactedConfig() : {mssql:{connectionString,database,requestTimeout}, mysqlTarget:{host,user,database,hasPassword}, mysqlTracker:{host,user,database,hasPassword}}` — no password fields, masked connection string.
  - `testCandidate(connection, values) : Promise<{success,message,database}>` — `connection` ∈ `"mssql"|"mysqlTarget"|"mysqlTracker"`; opens an isolated connection (never the live pools); validation failures return `{success:false,message}` (no throw).
  - `applyConfig(connection, values) : Promise<status>` — throws `Error` with `.code=409` (busy) or `.code=400` (validation/test failed); on success returns the module's fresh `testConnection()` result.
  - `values` shapes — mssql: `{connectionString, database, requestTimeout}`; mysql*: `{host, user, password, database}` where empty/absent `password` means "keep stored".
  - Also exports pure helpers for tests: `maskConnectionString`, `validate`, `buildCandidate`, `MASK`.

- [ ] **Step 1: Write the failing tests**

Create `server/test/connection-config.test.js`:

```js
// Pure-helper tests for the connection-config service. I/O paths (candidate
// connections, .env writes, pool resets) are covered by the manual E2E task.
// Run: node --test server/test/
const test=require("node:test");
const assert=require("node:assert");
const config=require("../src/config/database");
const svc=require("../src/services/connection-config");

test("maskConnectionString masks Pwd and Password values, case-insensitive",function(){
  assert.equal(
    svc.maskConnectionString("Server=h;Pwd=secret;Database=d"),
    "Server=h;Pwd=******;Database=d");
  assert.equal(
    svc.maskConnectionString("Server=h;PASSWORD = topsecret"),
    "Server=h;PASSWORD = ******");
  assert.equal(
    svc.maskConnectionString("Server=h;Trusted_Connection=yes;"),
    "Server=h;Trusted_Connection=yes;");
});

test("getRedactedConfig never exposes a password field",function(){
  var r=svc.getRedactedConfig();
  assert.deepEqual(Object.keys(r).sort(),["mssql","mysqlTarget","mysqlTracker"]);
  assert.equal("password" in r.mysqlTarget,false);
  assert.equal("password" in r.mysqlTracker,false);
  assert.equal(typeof r.mysqlTarget.hasPassword,"boolean");
  assert.equal(typeof r.mssql.requestTimeout,"number");
});

test("validate: mssql requires fields, rejects mask, rejects bad timeout",function(){
  assert.equal(svc.validate("mssql",{connectionString:"x",database:"d",requestTimeout:1000}),null);
  assert.match(svc.validate("mssql",{database:"d",requestTimeout:1}),/connectionString/);
  assert.match(svc.validate("mssql",{connectionString:"Pwd="+svc.MASK,database:"d",requestTimeout:1}),/re-enter/);
  assert.match(svc.validate("mssql",{connectionString:"x",database:"",requestTimeout:1}),/database/);
  assert.match(svc.validate("mssql",{connectionString:"x",database:"d",requestTimeout:"abc"}),/requestTimeout/);
});

test("validate: mysql requires host/user/database, password optional",function(){
  assert.equal(svc.validate("mysqlTarget",{host:"h",user:"u",database:"d"}),null);
  assert.match(svc.validate("mysqlTarget",{user:"u",database:"d"}),/host/);
  assert.match(svc.validate("mysqlTracker",{host:"h",database:"d"}),/user/);
  assert.match(svc.validate("mysqlTracker",{host:"h",user:"u"}),/database/);
  assert.match(svc.validate("nope",{}),/Unknown connection/);
});

test("buildCandidate: empty password keeps the stored one",function(){
  var saved=config.mysqlTarget.password;
  config.mysqlTarget.password="stored-secret";
  try{
    assert.equal(svc.buildCandidate("mysqlTarget",{host:"h",user:"u",password:"",database:"d"}).password,"stored-secret");
    assert.equal(svc.buildCandidate("mysqlTarget",{host:"h",user:"u",database:"d"}).password,"stored-secret");
    assert.equal(svc.buildCandidate("mysqlTarget",{host:"h",user:"u",password:"new",database:"d"}).password,"new");
  }finally{config.mysqlTarget.password=saved;}
});

test("buildCandidate: mssql shape with numeric timeout",function(){
  var c=svc.buildCandidate("mssql",{connectionString:"cs",database:"d",requestTimeout:"5000"});
  assert.deepEqual(c,{connectionString:"cs",database:"d",requestTimeout:5000});
});

test("testCandidate returns validation failure without throwing",async function(){
  var r=await svc.testCandidate("mysqlTarget",{user:"u",database:"d"});
  assert.equal(r.success,false);
  assert.match(r.message,/host/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/test/connection-config.test.js`
Expected: FAIL — `Cannot find module '../src/services/connection-config'`

- [ ] **Step 3: Write the implementation**

Create `server/src/services/connection-config.js`:

```js
// Read / test / live-apply DB connection settings. Persistence is the root
// .env (single source of truth for the server AND standalone scripts); apply
// mutates the shared config object IN PLACE (every consumer holds the same
// reference) and resets the affected pool — no restart needed.
// Spec: docs/superpowers/specs/2026-07-15-db-connection-config-ui-design.md
const path=require("path");
const mysql=require("mysql2/promise");
const sql=require("mssql/msnodesqlv8");
const config=require("../config/database");
const envFile=require("./env-file");
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const manager=require("./migration-manager");
const orchestrator=require("./pipeline-orchestrator");
const logger=require("../logger");

const ENV_PATH=path.resolve(__dirname,"../../../.env");
const MASK="******";
const DB_MODULES={mssql:mssqlDb,mysqlTarget:targetDb,mysqlTracker:trackerDb};

var applying=false;

function maskConnectionString(cs){
  if(!cs) return cs;
  return cs.replace(/(pwd|password)(\s*=\s*)[^;]*/gi,function(_,k,eq){return k+eq+MASK;});
}

function getRedactedConfig(){
  return {
    mssql:{
      connectionString:maskConnectionString(config.mssql.connectionString),
      database:config.mssql.database,
      requestTimeout:config.mssql.requestTimeout
    },
    mysqlTarget:{host:config.mysqlTarget.host,user:config.mysqlTarget.user,database:config.mysqlTarget.database,hasPassword:!!config.mysqlTarget.password},
    mysqlTracker:{host:config.mysqlTracker.host,user:config.mysqlTracker.user,database:config.mysqlTracker.database,hasPassword:!!config.mysqlTracker.password}
  };
}

function validate(connection,values){
  values=values||{};
  if(connection==="mssql"){
    if(!values.connectionString||!String(values.connectionString).trim()) return "connectionString is required";
    if(String(values.connectionString).indexOf(MASK)>=0) return "Connection string contains the mask "+MASK+" — re-enter the full credential";
    if(!values.database||!String(values.database).trim()) return "database is required";
    var t=Number(values.requestTimeout);
    if(!Number.isFinite(t)||t<=0) return "requestTimeout must be a positive number";
    return null;
  }
  if(connection==="mysqlTarget"||connection==="mysqlTracker"){
    if(!values.host||!String(values.host).trim()) return "host is required";
    if(!values.user||!String(values.user).trim()) return "user is required";
    if(!values.database||!String(values.database).trim()) return "database is required";
    return null;
  }
  return "Unknown connection: "+connection;
}

// Empty/absent password means "keep the stored one" — the UI never sees it.
function buildCandidate(connection,values){
  if(connection==="mssql"){
    return {connectionString:values.connectionString,database:values.database,requestTimeout:parseInt(values.requestTimeout)||300000};
  }
  var base=connection==="mysqlTarget"?config.mysqlTarget:config.mysqlTracker;
  var pw=(values.password===undefined||values.password===null||values.password==="")?base.password:values.password;
  return {host:values.host,user:values.user,password:pw,database:values.database};
}

// Opens an ISOLATED connection with the candidate values — never touches the
// live pools, so a failed test cannot disturb a healthy running system.
async function testCandidate(connection,values){
  var invalid=validate(connection,values);
  if(invalid) return {success:false,message:invalid};
  var candidate=buildCandidate(connection,values);
  if(connection==="mssql"){
    var pool=null;
    try{
      pool=await new sql.ConnectionPool(candidate).connect();
      await pool.request().query("SELECT 1 AS test");
      return {success:true,message:"MSSQL connected",database:candidate.database};
    }catch(err){
      return {success:false,message:mssqlDb.getErrorMessage(err),database:candidate.database};
    }finally{
      if(pool){try{await pool.close();}catch(e){}}
    }
  }
  var conn=null;
  try{
    conn=await mysql.createConnection({host:candidate.host,user:candidate.user,password:candidate.password,database:candidate.database,connectTimeout:10000});
    await conn.ping();
    return {success:true,message:"MySQL connected",database:candidate.database};
  }catch(err){
    return {success:false,message:err.message,database:candidate.database};
  }finally{
    if(conn){try{await conn.end();}catch(e){}}
  }
}

var ENV_KEYS={
  mssql:function(c){return {MSSQL_CONNECTION_STRING:c.connectionString,MSSQL_DATABASE:c.database,MSSQL_REQUEST_TIMEOUT:String(c.requestTimeout)};},
  mysqlTarget:function(c){return {MYSQL_TARGET_HOST:c.host,MYSQL_TARGET_USER:c.user,MYSQL_TARGET_PASSWORD:c.password,MYSQL_TARGET_DATABASE:c.database};},
  mysqlTracker:function(c){return {MYSQL_TRACKER_HOST:c.host,MYSQL_TRACKER_USER:c.user,MYSQL_TRACKER_PASSWORD:c.password,MYSQL_TRACKER_DATABASE:c.database};}
};

// Ordered apply: guard -> test candidate -> persist .env -> mutate config
// in place -> reset pool -> verify. If the .env write throws, nothing has
// been applied. Throws with .code 409 (busy) / 400 (test failed).
async function applyConfig(connection,values){
  if(manager.hasActiveMigration()||orchestrator.isPipelineRunning()){
    var busy=new Error("A migration is currently running — connection settings are locked");
    busy.code=409;throw busy;
  }
  if(applying){
    var dup=new Error("Another connection update is already in progress");
    dup.code=409;throw dup;
  }
  applying=true;
  try{
    var test=await testCandidate(connection,values);
    if(!test.success){var bad=new Error(test.message);bad.code=400;throw bad;}
    var candidate=buildCandidate(connection,values);
    var envUpdates=ENV_KEYS[connection](candidate);
    envFile.updateEnvFile(ENV_PATH,envUpdates);
    Object.keys(envUpdates).forEach(function(k){process.env[k]=envUpdates[k];});
    Object.assign(config[connection],candidate);
    await DB_MODULES[connection].resetPool();
    var status=await DB_MODULES[connection].testConnection();
    logger.info("Connection config applied: "+connection+" (database="+candidate.database+")");
    return status;
  }finally{
    applying=false;
  }
}

module.exports={getRedactedConfig,testCandidate,applyConfig,maskConnectionString,validate,buildCandidate,MASK};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/test/connection-config.test.js`
Expected: PASS (7 tests). Then full suite: `node --test server/test/` — all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/connection-config.js server/test/connection-config.test.js
git commit -m "feat: add connection-config service (redact, isolated test, live apply)"
```

---

### Task 4: API endpoints

**Files:**
- Modify: `server/src/routes/connections.js`

**Interfaces:**
- Consumes: `connection-config` service (Task 3).
- Produces (used by Task 5):
  - `GET /api/connections/config` → redacted config object (shape from Task 3).
  - `POST /api/connections/test-config` body `{connection, values}` → `{success, message, database}` (always 200; failures are in `success:false`).
  - `PUT /api/connections/config` body `{connection, values}` → 200 `{applied:true, status}` | 400/409/500 `{error}`.
  - `GET /api/connections/test` — unchanged.

- [ ] **Step 1: Extend the router**

Replace the full contents of `server/src/routes/connections.js` with:

```js
const express=require("express");
const router=express.Router();
const mssqlDb=require("../db/mssql");
const targetDb=require("../db/mysql-target");
const trackerDb=require("../db/mysql-tracker");
const connectionConfig=require("../services/connection-config");

router.get("/test",async function(req,res){
  try{
    var results=await Promise.all([mssqlDb.testConnection(),targetDb.testConnection(),trackerDb.testConnection()]);
    res.json({mssql:results[0],mysqlTarget:results[1],mysqlTracker:results[2]});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

router.get("/config",function(req,res){
  try{
    res.json(connectionConfig.getRedactedConfig());
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

router.post("/test-config",async function(req,res){
  try{
    var b=req.body||{};
    res.json(await connectionConfig.testCandidate(b.connection,b.values));
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

router.put("/config",async function(req,res){
  try{
    var b=req.body||{};
    var status=await connectionConfig.applyConfig(b.connection,b.values);
    res.json({applied:true,status:status});
  }catch(err){
    var code=err.code===409?409:err.code===400?400:500;
    res.status(code).json({error:err.message});
  }
});

module.exports=router;
```

- [ ] **Step 2: Start the server and verify the endpoints with curl**

Start (in background): `cd server && npm run dev`
Then verify:

```bash
# 1. Redacted config — expect the three blocks, NO password fields anywhere:
curl -s http://localhost:3001/api/connections/config

# 2. Candidate test with a bad host — expect success:false with a driver message (ECONNREFUSED/ENOTFOUND), HTTP 200:
curl -s -X POST http://localhost:3001/api/connections/test-config \
  -H "Content-Type: application/json" \
  -d "{\"connection\":\"mysqlTracker\",\"values\":{\"host\":\"no-such-host.invalid\",\"user\":\"u\",\"database\":\"d\"}}"

# 3. Apply with a bad host — expect HTTP 400 with {error:...}:
curl -s -i -X PUT http://localhost:3001/api/connections/config \
  -H "Content-Type: application/json" \
  -d "{\"connection\":\"mysqlTracker\",\"values\":{\"host\":\"no-such-host.invalid\",\"user\":\"u\",\"database\":\"d\"}}"

# 4. Validation error — expect success:false mentioning "host":
curl -s -X POST http://localhost:3001/api/connections/test-config \
  -H "Content-Type: application/json" \
  -d "{\"connection\":\"mysqlTarget\",\"values\":{\"user\":\"u\",\"database\":\"d\"}}"

# 5. Existing status endpoint still works:
curl -s http://localhost:3001/api/connections/test
```

Confirm after step 3 that the root `.env` file was NOT modified (`git` won't show it — open the file and check the tracker host is unchanged): a failed test must never persist.

- [ ] **Step 3: Run the test suite (regression)**

Run: `node --test server/test/`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/connections.js
git commit -m "feat: add connection config read/test/apply endpoints"
```

---

### Task 5: Client — API methods and edit UI

**Files:**
- Modify: `client/src/api/client.js` (3 new methods + error message extraction in `fetchJson`)
- Create: `client/src/components/ConnectionEditForm.jsx`
- Modify: `client/src/components/ConnectionStatus.jsx`

**Interfaces:**
- Consumes: Task 4 endpoints.
- Produces: `api.getConnectionsConfig()`, `api.testConnectionConfig(connection,values)`, `api.saveConnectionConfig(connection,values)`; `<ConnectionEditForm connKey initial onApplied/>`.

- [ ] **Step 1: Extend the API client**

In `client/src/api/client.js`, replace `fetchJson` so server error messages (driver text, 409 lock message) reach the UI instead of a generic status code:

```js
async function fetchJson(url,options){
  var res=await fetch(BASE+url,{headers:{"Content-Type":"application/json"},...options});
  if(!res.ok){
    var msg="API error: "+res.status;
    try{var body=await res.json();if(body&&body.error) msg=body.error;}catch(e){}
    throw new Error(msg);
  }
  return res.json();
}
```

Add to the `api` object (after `testConnections`):

```js
  getConnectionsConfig:()=>fetchJson("/connections/config"),
  testConnectionConfig:(connection,values)=>fetchJson("/connections/test-config",{method:"POST",body:JSON.stringify({connection,values})}),
  saveConnectionConfig:(connection,values)=>fetchJson("/connections/config",{method:"PUT",body:JSON.stringify({connection,values})}),
```

- [ ] **Step 2: Create the edit form component**

Create `client/src/components/ConnectionEditForm.jsx`:

```jsx
import{useState}from"react";
import{api}from"../api/client";

const FIELD_DEFS={
  mssql:[
    {name:"connectionString",label:"Connection String",type:"textarea"},
    {name:"database",label:"Database",type:"text"},
    {name:"requestTimeout",label:"Request Timeout (ms)",type:"number"}
  ],
  mysqlTarget:[
    {name:"host",label:"Host",type:"text"},
    {name:"user",label:"User",type:"text"},
    {name:"password",label:"Password",type:"password",placeholder:"Leave empty to keep current"},
    {name:"database",label:"Database",type:"text"}
  ],
  mysqlTracker:[
    {name:"host",label:"Host",type:"text"},
    {name:"user",label:"User",type:"text"},
    {name:"password",label:"Password",type:"password",placeholder:"Leave empty to keep current"},
    {name:"database",label:"Database",type:"text"}
  ]
};

// Save & Apply is enabled only after a successful Test of the CURRENT form
// values — any edit clears the test result and disables it again (the server
// enforces the same rule; this is the matching UX).
export default function ConnectionEditForm({connKey,initial,onApplied}){
  const defs=FIELD_DEFS[connKey];
  const[values,setValues]=useState(function(){
    var v={};defs.forEach(function(f){v[f.name]=f.type==="password"?"":(initial[f.name]??"");});return v;
  });
  const[test,setTest]=useState(null);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState(null);

  function setField(name,val){setValues({...values,[name]:val});setTest(null);setError(null);}

  async function runTest(){
    setBusy(true);setError(null);
    try{setTest(await api.testConnectionConfig(connKey,values));}
    catch(e){setTest({success:false,message:e.message});}
    finally{setBusy(false);}
  }

  async function save(){
    setBusy(true);setError(null);
    try{await api.saveConnectionConfig(connKey,values);onApplied();}
    catch(e){setError(e.message);setTest(null);}
    finally{setBusy(false);}
  }

  return(
    <div className="mt-4 border-t pt-4 space-y-3" dir="ltr">
      {defs.map(f=>(
        <div key={f.name}>
          <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
          {f.type==="textarea"
            ?<textarea className="w-full border rounded p-2 text-sm font-mono" rows={3} value={values[f.name]} onChange={e=>setField(f.name,e.target.value)}/>
            :<input className="w-full border rounded p-2 text-sm" type={f.type} placeholder={f.placeholder||""} value={values[f.name]} onChange={e=>setField(f.name,e.target.value)}/>}
        </div>
      ))}
      {connKey!=="mssql"&&initial.hasPassword&&<div className="text-xs text-gray-400">A password is currently set.</div>}
      {test&&<div className={"text-sm "+(test.success?"text-green-600":"text-red-600")}>{test.message}</div>}
      {error&&<div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button onClick={runTest} disabled={busy} className="bg-gray-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">{busy?"Working...":"Test"}</button>
        <button onClick={save} disabled={busy||!test||!test.success} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">Save &amp; Apply</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rework the Connections screen**

Replace the full contents of `client/src/components/ConnectionStatus.jsx` with:

```jsx
import{useState}from"react";
import{useQuery,useQueryClient}from"@tanstack/react-query";
import{api}from"../api/client";
import ConnectionEditForm from"./ConnectionEditForm";

export default function ConnectionStatus(){
  const qc=useQueryClient();
  const{data,isLoading,refetch}=useQuery({queryKey:["connections"],queryFn:api.testConnections});
  const{data:cfg}=useQuery({queryKey:["connectionsConfig"],queryFn:api.getConnectionsConfig});
  const[editing,setEditing]=useState(null);
  if(isLoading) return <div className="p-8 text-center">Testing connections...</div>;
  const conns=[{key:"mssql",label:"MSSQL (Source)"},{key:"mysqlTarget",label:"MySQL (Target)"},{key:"mysqlTracker",label:"MySQL (Tracker)"}];
  function onApplied(){
    setEditing(null);
    qc.invalidateQueries({queryKey:["connections"]});
    qc.invalidateQueries({queryKey:["connectionsConfig"]});
  }
  return(
    <div>
      <h2 className="text-2xl font-bold mb-6">Database Connections</h2>
      <div className="grid grid-cols-3 gap-4 mb-6 items-start">
        {conns.map(c=>{
          const info=data?.[c.key]||{};
          return <div key={c.key} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className={"w-3 h-3 rounded-full "+(info.success?"bg-green-400":"bg-red-400")}/>
              <span className="font-semibold">{c.label}</span>
            </div>
            <div className="text-sm text-gray-600">{info.message||"Unknown"}</div>
            <div className="text-xs text-gray-400 mt-1">{info.database}</div>
            <button onClick={()=>setEditing(editing===c.key?null:c.key)} className="mt-3 text-sm text-blue-600 underline">
              {editing===c.key?"Close":"Edit"}
            </button>
            {editing===c.key&&cfg&&<ConnectionEditForm connKey={c.key} initial={cfg[c.key]} onApplied={onApplied}/>}
          </div>;
        })}
      </div>
      <button onClick={()=>refetch()} className="bg-blue-600 text-white px-4 py-2 rounded">Test Again</button>
    </div>
  );
}
```

- [ ] **Step 4: Verify in the browser**

With the server running (`cd server && npm run dev`) and the client dev server running (`cd client && npm run dev`), open `http://localhost:5173/connections` and check:

1. Three status cards render as before; each now has an **Edit** link.
2. Edit on **MySQL (Tracker)**: form pre-fills host/user/database; password field is empty with the "Leave empty to keep current" placeholder and "A password is currently set." hint.
3. **Save & Apply is disabled** before any test.
4. Change host to `no-such-host.invalid`, click **Test** → red driver error appears, Save stays disabled.
5. Restore the real host, click **Test** → green message, **Save & Apply becomes enabled**.
6. Change any character in the host → Save disables again (test result cleared).

- [ ] **Step 5: Commit**

```bash
git add client/src/api/client.js client/src/components/ConnectionEditForm.jsx client/src/components/ConnectionStatus.jsx
git commit -m "feat: add connection config edit forms to Connections screen"
```

---

### Task 6: End-to-end verification (manual, against real connections)

**Files:** none (verification only). Use the superpowers:verification-before-completion skill — evidence before claims.

Pre-req: server + client dev servers running; all three connections currently green.

- [ ] **Step 1: Full apply round-trip on the tracker connection**

The tracker is local and the safest to exercise. In the UI:
1. Note the current tracker host value (from the form).
2. Test with current values → green. Save & Apply → form closes, card refreshes green.
3. Open the root `.env` and confirm the `MYSQL_TRACKER_*` lines are intact (same values, comments in the file preserved, no duplicated keys).

- [ ] **Step 2: Live-apply actually swaps the pool (negative-positive round trip)**

1. Edit tracker host to `127.0.0.2` (or another value that fails), click Test → red. Confirm Save disabled — stop here; do NOT force an apply with bad values.
2. Restore the correct host, Test → green, Save & Apply.
3. Immediately visit the Dashboard (it queries the tracker) — it must load without a server restart. This proves the pool reset + in-place config mutation path.

- [ ] **Step 3: `.env` is the single source of truth for scripts**

Run a harmless read-only script that connects via `config/database.js`, e.g.:

```bash
node server/scripts/check-donation-amounts.js
```

Expected: it connects and prints its report — proving standalone scripts pick up the (re)written `.env`. (Any read-only `check-*` script is fine.)

- [ ] **Step 4: Busy guard**

1. Start any small migration dry-run from the Migration Runner screen (e.g. a dry-run with a small batch — dry-run performs no writes).
2. While it runs, attempt Save & Apply on the tracker connection (Test first with valid values to enable the button).
3. Expected: red error "A migration is currently running — connection settings are locked" (HTTP 409) and `.env` unchanged.
4. Let the dry-run finish; Save & Apply now succeeds.

- [ ] **Step 5: Regression sweep**

```bash
node --test server/test/
```
Expected: all tests pass. Also click through Dashboard, Migration Runner, and Errors screens — no console errors.

- [ ] **Step 6: Final commit (if any fixups were needed) and report**

Report results with evidence (command output / observed UI behavior) — do not claim success without having run each step.

---

## Execution notes

- Tasks 1→4 are strictly ordered (each consumes the previous task's exports). Task 5 depends on Task 4. Task 6 is last.
- If the `restart` skill is available in the session, it can be used to restart server+client between server-side tasks; otherwise `npm run dev` in `server/` and `client/`.
- The working tree already contains unrelated modified files (engines, dist, data JSONs) — commit ONLY the files listed in each task's commit step; never `git add -A`.
