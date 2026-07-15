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
