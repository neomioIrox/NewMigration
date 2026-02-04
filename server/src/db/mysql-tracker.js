const mysql = require("mysql2/promise");
const config = require("../config/database");
const logger = require("../logger");
let pool = null;
function getPool() { if (!pool) { pool = mysql.createPool(config.mysqlTracker); logger.info("MySQL tracker pool created"); } return pool; }
async function query(sql, params) { return getPool().execute(sql, params); }
async function getConnection() { return getPool().getConnection(); }
async function testConnection() {
  try { await getPool().execute("SELECT 1 AS test"); return { success: true, message: "MySQL tracker connected", database: config.mysqlTracker.database }; }
  catch (err) { return { success: false, message: err.message, database: config.mysqlTracker.database }; }
}
async function close() { if (pool) { await pool.end(); pool = null; } }
module.exports = { getPool, query, getConnection, testConnection, close };