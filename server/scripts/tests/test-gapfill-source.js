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
