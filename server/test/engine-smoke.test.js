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
