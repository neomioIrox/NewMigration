/**
 * DB wrapper for validation - reuses existing connection pools
 */
const path = require('path');

// Resolve modules from server's node_modules
const serverRoot = path.resolve(__dirname, '../../../server');
const projectRoot = path.resolve(__dirname, '../../..');

// Load .env from project root (dotenv installed in server/)
require(path.join(serverRoot, 'node_modules/dotenv')).config({ path: path.join(projectRoot, '.env') });

const mssqlDb = require('../../../server/src/db/mssql');
const targetDb = require('../../../server/src/db/mysql-target');
const trackerDb = require('../../../server/src/db/mysql-tracker');

async function connect() {
  const results = await Promise.allSettled([
    mssqlDb.testConnection(),
    targetDb.testConnection(),
    trackerDb.testConnection()
  ]);

  const names = ['MSSQL (Source)', 'MySQL (Target)', 'MySQL (Tracker)'];
  const failures = [];

  results.forEach((r, i) => {
    if (r.status === 'rejected' || (r.value && !r.value.success)) {
      const msg = r.status === 'rejected' ? r.reason.message : r.value.message;
      failures.push(`${names[i]}: ${msg}`);
    }
  });

  if (failures.length > 0) {
    throw new Error('DB connection failed:\n  ' + failures.join('\n  '));
  }

  return {
    mssql: results[0].value,
    target: results[1].value,
    tracker: results[2].value
  };
}

async function mssqlQuery(sql) {
  const result = await mssqlDb.query(sql);
  return result.recordset;
}

async function targetQuery(sql, params) {
  const [rows] = await targetDb.query(sql, params);
  return rows;
}

async function trackerQuery(sql, params) {
  const [rows] = await trackerDb.query(sql, params);
  return rows;
}

async function closeAll() {
  await Promise.allSettled([
    mssqlDb.close(),
    targetDb.close(),
    trackerDb.close()
  ]);
}

module.exports = { connect, mssqlQuery, targetQuery, trackerQuery, closeAll };
