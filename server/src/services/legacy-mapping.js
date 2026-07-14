const targetDb=require("../db/mysql-target");
const logger=require("../logger");

// LegacyMapping — app-facing lookup table ON THE TARGET DB: legacy id -> new Project/Item.
// The new application resolves old product/prayer URLs through it at runtime.
// SourceType: 1=Product (products.productsid), 2=Prayer (Prayers.PrayersId).
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
