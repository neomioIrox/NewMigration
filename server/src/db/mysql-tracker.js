const mysql = require("mysql2/promise");
const config = require("../config/database");
const logger = require("../logger");
let pool = null;
function getPool() { if (!pool) { pool = mysql.createPool(config.mysqlTracker); logger.info("MySQL tracker pool created"); } return pool; }
async function query(sql, params) { return getPool().query(sql, params); }
async function getConnection() { return getPool().getConnection(); }
async function testConnection() {
  try { await getPool().execute("SELECT 1 AS test"); return { success: true, message: "MySQL tracker connected", database: config.mysqlTracker.database }; }
  catch (err) { return { success: false, message: err.message, database: config.mysqlTracker.database }; }
}
async function close() { if (pool) { await pool.end(); pool = null; } }
async function resetPool(){
  if(pool){var old=pool;pool=null;try{await old.end();}catch(err){logger.warn("MySQL tracker pool close failed: "+err.message);}}
}
module.exports = { getPool, query, getConnection, testConnection, close, resetPool };