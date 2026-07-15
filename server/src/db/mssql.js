const sql = require("mssql/msnodesqlv8");
const config = require("../config/database");
const logger = require("../logger");
let pool = null;

function getErrorMessage(err) {
  if (typeof err === 'string') return err;
  if (err && err.message) return err.message;
  if (Array.isArray(err)) return err.map(e => e.message || JSON.stringify(e)).join('; ');
  try { return JSON.stringify(err, Object.getOwnPropertyNames(err)); } catch(e) {}
  return String(err);
}

async function getPool() {
  if (pool) return pool;
  try {
    pool = await sql.connect(config.mssql);
    logger.info("MSSQL pool established");
    return pool;
  } catch (err) {
    const msg = getErrorMessage(err);
    logger.error("MSSQL failed: " + msg);
    throw new Error(msg);
  }
}

async function query(sqlText) {
  const p = await getPool();
  return p.request().query(sqlText);
}

async function testConnection() {
  try {
    pool = null; // reset pool to force reconnect on each test
    await getPool();
    return { success: true, message: "MSSQL connected", database: config.mssql.database };
  } catch (err) {
    pool = null;
    return { success: false, message: getErrorMessage(err), database: config.mssql.database };
  }
}

async function close() {
  if (pool) { await pool.close(); pool = null; }
}

async function resetPool(){
  // sql.close() clears the driver's global connection so the next
  // sql.connect() picks up new config values instead of reusing the old pool.
  pool=null;
  try{await sql.close();}catch(err){logger.warn("MSSQL pool close failed: "+getErrorMessage(err));}
}

module.exports = { getPool, query, testConnection, close, resetPool, getErrorMessage };
