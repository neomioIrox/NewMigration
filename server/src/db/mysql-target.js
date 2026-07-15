const mysql = require("mysql2/promise");
const config = require("../config/database");
const logger = require("../logger");
let pool = null;
function getPool() { if (!pool) { pool = mysql.createPool(config.mysqlTarget); logger.info("MySQL target pool created"); } return pool; }
async function query(sql, params) { return getPool().query(sql, params); }
async function getConnection() { return getPool().getConnection(); }
async function testConnection() {
  try { await getPool().execute("SELECT 1 AS test"); return { success: true, message: "MySQL target connected", database: config.mysqlTarget.database }; }
  catch (err) { return { success: false, message: err.message, database: config.mysqlTarget.database }; }
}
async function close() { if (pool) { await pool.end(); pool = null; } }
async function resetPool(){
  if(pool){var old=pool;pool=null;try{await old.end();}catch(err){logger.warn("MySQL target pool close failed: "+err.message);}}
}
module.exports = { getPool, query, getConnection, testConnection, close, resetPool };