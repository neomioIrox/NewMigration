/**
 * Smart sampling utilities for large tables
 */
const db = require('./db');

async function sampleSourceIds(sourceTable, sourceIdCol, whereClause, sourceQuery, n = 100) {
  let sql;
  if (sourceQuery) {
    sql = `WITH src AS (${sourceQuery}) SELECT TOP ${n} [${sourceIdCol}] FROM src ORDER BY NEWID()`;
  } else {
    const where = whereClause ? `WHERE ${whereClause}` : '';
    sql = `SELECT TOP ${n} [${sourceIdCol}] FROM [${sourceTable}] WITH (NOLOCK) ${where} ORDER BY NEWID()`;
  }

  const rows = await db.mssqlQuery(sql);
  return rows.map(r => r[sourceIdCol]);
}

async function sampleTargetRows(tableName, n = 100) {
  const rows = await db.targetQuery(
    `SELECT t.* FROM \`${tableName}\` t JOIN (SELECT Id FROM \`${tableName}\` ORDER BY RAND() LIMIT ?) sub ON t.Id = sub.Id`,
    [n]
  );
  return rows;
}

async function samplePairs(entityType, sourceTable, sourceIdCol, targetTable, whereClause, sourceQuery, n = 100) {
  // Get random id_mappings for this entity
  const mappings = await db.trackerQuery(
    `SELECT source_id, target_id FROM id_mappings WHERE entity_type = ? ORDER BY RAND() LIMIT ?`,
    [entityType, n]
  );

  if (mappings.length === 0) return [];

  // Fetch source rows
  const sourceIds = mappings.map(m => m.source_id);
  const sourceIdList = sourceIds.map(id => `'${id}'`).join(',');

  let srcSql;
  if (sourceQuery) {
    srcSql = `WITH src AS (${sourceQuery}) SELECT * FROM src WHERE [${sourceIdCol}] IN (${sourceIdList})`;
  } else {
    srcSql = `SELECT * FROM [${sourceTable}] WITH (NOLOCK) WHERE [${sourceIdCol}] IN (${sourceIdList})`;
  }

  const sourceRows = await db.mssqlQuery(srcSql);
  const sourceMap = new Map(sourceRows.map(r => [String(r[sourceIdCol]), r]));

  // Fetch target rows
  const targetIds = mappings.map(m => m.target_id);
  const targetIdPlaceholders = targetIds.map(() => '?').join(',');
  const targetRows = await db.targetQuery(
    `SELECT * FROM \`${targetTable}\` WHERE Id IN (${targetIdPlaceholders})`,
    targetIds
  );
  const targetMap = new Map(targetRows.map(r => [String(r.Id), r]));

  // Pair them up
  return mappings.map(m => ({
    sourceId: m.source_id,
    targetId: m.target_id,
    sourceRow: sourceMap.get(String(m.source_id)) || null,
    targetRow: targetMap.get(String(m.target_id)) || null
  })).filter(p => p.sourceRow && p.targetRow);
}

module.exports = { sampleSourceIds, sampleTargetRows, samplePairs };
