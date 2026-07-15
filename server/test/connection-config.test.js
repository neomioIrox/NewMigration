// Pure-helper tests for the connection-config service. I/O paths (candidate
// connections, .env writes, pool resets) are covered by the manual E2E task.
// Run: node --test server/test/
const test=require("node:test");
const assert=require("node:assert");
const config=require("../src/config/database");
const svc=require("../src/services/connection-config");
const trackerDb=require("../src/db/mysql-tracker");

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
  assert.equal(
    svc.maskConnectionString("Server=h;Pwd={pa;ss};Database=d"),
    "Server=h;Pwd=******;Database=d");
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
  assert.match(svc.validate("mysqlTarget",{host:"h",user:"u",database:"d",password:svc.MASK}),/re-enter/);
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

test("hasBlockingTrackerRun true when a run is running or paused, false otherwise, false on tracker error",async function(){
  var saved=trackerDb.query;
  try{
    trackerDb.query=async function(){return [[{cnt:2}]];};
    assert.equal(await svc.hasBlockingTrackerRun(),true);
    trackerDb.query=async function(){return [[{cnt:0}]];};
    assert.equal(await svc.hasBlockingTrackerRun(),false);
    trackerDb.query=async function(){throw new Error("tracker down");};
    assert.equal(await svc.hasBlockingTrackerRun(),false);
  }finally{trackerDb.query=saved;}
});

test("applyConfig rejects 409 when tracker has a paused run (before any connection attempt)",async function(){
  var saved=trackerDb.query;
  try{
    trackerDb.query=async function(){return [[{cnt:1}]];};
    await assert.rejects(svc.applyConfig("mysqlTracker",{host:"h",user:"u",database:"d"}),function(err){
      return err.code===409&&/locked/.test(err.message);
    });
  }finally{trackerDb.query=saved;}
});
