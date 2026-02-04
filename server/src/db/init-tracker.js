const mysql = require('mysql2/promise');
const config = require('../config/database');
const logger = require('../logger');

async function initTrackerDb() {
  const conn = await mysql.createConnection({
    host: config.mysqlTracker.host,
    user: config.mysqlTracker.user,
    password: config.mysqlTracker.password,
    connectTimeout: config.mysqlTracker.connectTimeout
  });
  try {
    await conn.query('CREATE DATABASE IF NOT EXISTS migration_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    logger.info('migration_tracker database ensured');
    await conn.query('USE migration_tracker');

    const runsSql = [
      'CREATE TABLE IF NOT EXISTS migration_runs (',
      '  id INT AUTO_INCREMENT PRIMARY KEY,',
      '  mapping_name VARCHAR(100) NOT NULL,',
      '  source_table VARCHAR(100) NOT NULL,',
      '  target_table VARCHAR(100) NOT NULL,',
      "  status ENUM('pending','running','paused','completed','failed') DEFAULT 'pending',",
      '  total_source_rows INT DEFAULT 0,',
      '  processed_rows INT DEFAULT 0,',
      '  inserted_rows INT DEFAULT 0,',
      '  skipped_rows INT DEFAULT 0,',
      '  error_rows INT DEFAULT 0,',
      '  last_processed_source_id VARCHAR(50),',
      '  batch_size INT DEFAULT 500,',
      '  started_at DATETIME,',
      '  paused_at DATETIME,',
      '  completed_at DATETIME,',
      '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
      '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join('\n');
    await conn.query(runsSql);

    const idSql = [
      'CREATE TABLE IF NOT EXISTS id_mappings (',
      '  id INT AUTO_INCREMENT PRIMARY KEY,',
      '  entity_type VARCHAR(50) NOT NULL,',
      '  source_id VARCHAR(50) NOT NULL,',
      '  target_id VARCHAR(50) NOT NULL,',
      '  run_id INT,',
      '  extra_data JSON,',
      '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
      '  UNIQUE KEY uk_entity_source (entity_type, source_id),',
      '  INDEX idx_entity_target (entity_type, target_id),',
      '  FOREIGN KEY (run_id) REFERENCES migration_runs(id) ON DELETE SET NULL',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join('\n');
    await conn.query(idSql);

    const rowSql = [
      'CREATE TABLE IF NOT EXISTS row_status (',
      '  id INT AUTO_INCREMENT PRIMARY KEY,',
      '  run_id INT NOT NULL,',
      '  source_id VARCHAR(50) NOT NULL,',
      "  status ENUM('pending','inserted','skipped','error') NOT NULL,",
      '  target_id VARCHAR(50),',
      '  error_message TEXT,',
      '  source_data JSON,',
      '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
      '  UNIQUE KEY uk_run_source (run_id, source_id),',
      '  INDEX idx_status (status),',
      '  FOREIGN KEY (run_id) REFERENCES migration_runs(id) ON DELETE CASCADE',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join('\n');
    await conn.query(rowSql);

    const errSql = [
      'CREATE TABLE IF NOT EXISTS migration_errors (',
      '  id INT AUTO_INCREMENT PRIMARY KEY,',
      '  run_id INT NOT NULL,',
      '  source_id VARCHAR(50),',
      "  error_type ENUM('transform','insert','fk_missing','validation','connection') NOT NULL,",
      '  error_message TEXT NOT NULL,',
      '  source_data JSON,',
      '  stack_trace TEXT,',
      '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
      '  INDEX idx_run (run_id),',
      '  FOREIGN KEY (run_id) REFERENCES migration_runs(id) ON DELETE CASCADE',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join('\n');
    await conn.query(errSql);

    logger.info('Tracker DB init complete - all 4 tables ensured');
  } finally {
    await conn.end();
  }
}

module.exports = { initTrackerDb };
