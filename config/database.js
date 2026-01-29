/**
 * Centralized Database Configuration
 *
 * This file contains all database connection settings.
 * All scripts and the main server import from here.
 *
 * To update connection settings, modify this file only.
 */

// MSSQL (SQL Server) Configuration
const mssqlConfig = {
  server: 'DESKTOP-7QELS7G',
  database: 'kupatOld',
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  authentication: {
    type: 'default',
    options: {
      userName: 'no',
      password: '0987654321'
    }
  },
  connectionTimeout: 30000,  // 30 seconds timeout for connection
  requestTimeout: 300000     // 5 minutes timeout for queries (complex migrations need time)
};

// MySQL Configuration
const mysqlConfig = {
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'kupathairnew',
  connectTimeout: 10000      // 10 seconds timeout
};

module.exports = {
  mssqlConfig,
  mysqlConfig
};
