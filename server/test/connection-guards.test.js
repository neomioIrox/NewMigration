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
  await assert.doesNotReject(targetDb.resetPool());
  await assert.doesNotReject(trackerDb.resetPool());
  await assert.doesNotReject(mssqlDb.resetPool());
});

test("mssql exports getErrorMessage",function(){
  assert.equal(mssqlDb.getErrorMessage("boom"),"boom");
  assert.equal(mssqlDb.getErrorMessage(new Error("x")),"x");
});
