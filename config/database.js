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
  database: 'kupat1_28262025',
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  authentication: {
    type: 'default',
    options: {
      userName: 'on',
      password: '1234567890'
    }
  }
};

// MySQL Configuration
const mysqlConfig = {
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'kupathairnew'
};

module.exports = {
  mssqlConfig,
  mysqlConfig
};
