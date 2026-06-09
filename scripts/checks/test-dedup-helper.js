// Unit test for MigrationEngine._insertMainRow dedup-suffix logic.
// Mocks batch-runner.insertRowWithTracking BEFORE the engine requires it, so the
// engine's destructured reference picks up the mock. No DB connection is made.
const br = require("../../server/src/engine/batch-runner");

let calls = [];
let dupTimes = 0; // how many leading calls should throw ER_DUP_ENTRY
let dupKey = "CustomerUser.UserName"; // which index the simulated dup is on
br.insertRowWithTracking = async function (table, data, runId, sourceId, entityType, explicitId) {
  calls.push({ UserName: data.UserName, explicitId: explicitId, Id: data.Id });
  if (calls.length <= dupTimes) {
    const e = new Error("Duplicate entry '" + data.UserName + "' for key '" + dupKey + "'");
    e.code = "ER_DUP_ENTRY";
    throw e;
  }
  return explicitId != null ? explicitId : 999; // mimic preserveSourceId returning explicit id
};

const MigrationEngine = require("../../server/src/engine/migration-engine");
const mapping = { dedupColumns: ["UserName"], dedupMaxLen: 40 };
const engine = new MigrationEngine(mapping, {});

function assert(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("ok -", msg); }

(async () => {
  // Case 1: one collision then success — suffix from sourceId, fits in 40
  calls = []; dupTimes = 1;
  let row = { UserName: "avraham1820@gmail.com", FirstName: "A" };
  let id = await engine._insertMainRow(mapping, "CustomerUser", row, 200, "CustomerUser", undefined);
  assert(id === 999, "returns inserted id after one collision");
  assert(calls.length === 2, "retried exactly once (2 insert attempts)");
  assert(row.UserName === "avraham1820@gmail.com_200", "suffix = _<sourceId>: " + row.UserName);
  assert(row.UserName.length <= 40, "result within 40 chars (" + row.UserName.length + ")");

  // Case 2: long base + large sourceId — base must be truncated to fit 40
  calls = []; dupTimes = 1;
  let row2 = { UserName: "abcdefghijklmnopqrstuvwxyzABCDEFGHI" }; // 35 chars
  await engine._insertMainRow(mapping, "CustomerUser", row2, 1234567, "CustomerUser", undefined);
  assert(row2.UserName.length === 40, "truncated to exactly 40 (" + row2.UserName.length + ")");
  assert(row2.UserName.endsWith("_1234567"), "ends with _<sourceId>: " + row2.UserName);

  // Case 3: no collision — value untouched, no suffix
  calls = []; dupTimes = 0;
  let row3 = { UserName: "unique_name" };
  await engine._insertMainRow(mapping, "CustomerUser", row3, 5, "CustomerUser", undefined);
  assert(row3.UserName === "unique_name", "no suffix when no collision");
  assert(calls.length === 1, "single insert attempt when no collision");

  // Case 4: a non-dedup mapping should NOT swallow ER_DUP_ENTRY (rethrows)
  calls = []; dupTimes = 1; dupKey = "CustomerUser.UserName";
  const plainMapping = {};
  let threw = false;
  try { await engine._insertMainRow(plainMapping, "X", { UserName: "x" }, 1, "X", undefined); }
  catch (e) { threw = e.code === "ER_DUP_ENTRY"; }
  assert(threw, "without dedupColumns, ER_DUP_ENTRY propagates (other mappings unaffected)");

  // Case 5: preserveSourceId — explicit PK is preserved across a dedup retry,
  // only UserName changes, and the returned id equals the source id.
  calls = []; dupTimes = 1; dupKey = "CustomerUser.UserName";
  let row5 = { Id: 200, UserName: "p0504188726@gmail.com" };
  let id5 = await engine._insertMainRow(mapping, "CustomerUser", row5, 200, "CustomerUser", 200);
  assert(id5 === 200, "preserveSourceId: returns explicit source id (" + id5 + ")");
  assert(row5.Id === 200, "preserveSourceId: PK unchanged by dedup retry");
  assert(row5.UserName === "p0504188726@gmail.com_200", "preserveSourceId: only UserName suffixed");
  assert(calls.every(c => c.Id === 200 && c.explicitId === 200), "every attempt kept the explicit PK");

  // Case 6: a PRIMARY-key collision must NOT be masked by suffixing UserName — it rethrows.
  calls = []; dupTimes = 1; dupKey = "CustomerUser.PRIMARY";
  let row6 = { Id: 200, UserName: "real_name" };
  let threwPk = false;
  try { await engine._insertMainRow(mapping, "CustomerUser", row6, 200, "CustomerUser", 200); }
  catch (e) { threwPk = e.code === "ER_DUP_ENTRY"; }
  assert(threwPk, "PRIMARY-key ER_DUP_ENTRY propagates (not masked as a UserName dedup)");
  assert(row6.UserName === "real_name", "UserName untouched on a PK collision");
  assert(calls.length === 1, "no pointless retries on a PK collision");

  console.log("\nALL DEDUP TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
