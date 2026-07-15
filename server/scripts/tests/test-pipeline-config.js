const assert=require("assert");
const {loadPipelineConfig,validatePipeline}=require("../../src/services/pipeline-config");

// 1. Real config: loads, has exactly 19 steps, every dependency appears earlier in the list
// (ProjectItemLocalizationMapping was removed 2026-07-15: it has no sourceTable — the
// generic engine cannot run it standalone; PIL rows are created inline by the Project mappings)
var steps=loadPipelineConfig();
assert.strictEqual(steps.length,19,"expected 19 steps, got "+steps.length);
assert.ok(!steps.some(function(s){return s.name==="ProjectItemLocalizationMapping";}),"PIL must not be a pipeline step (no sourceTable)");
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
