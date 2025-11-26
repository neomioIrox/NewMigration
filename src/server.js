const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const sql = require('mssql');
const mysql = require('mysql2/promise');
const winston = require('winston');
const { mssqlConfig: defaultMssqlConfig, mysqlConfig: defaultMysqlConfig } = require('../config/database');

const app = express();
const PORT = 3030;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    // Write to file
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/migration-logs.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Also output to console
    new winston.transports.Console()
  ]
});

app.use(express.static(path.join(__dirname, '../public')));
app.use('/mappings', express.static(path.join(__dirname, '../mappings')));
app.use(express.json());

// Connection configs from centralized config file (can be overridden via API)
let mssqlConfig = { ...defaultMssqlConfig };
let mysqlConfig = { ...defaultMysqlConfig };

// Parse SQL file to extract table definitions
function parseSQLFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const tables = {};

  let currentTable = null;
  let inTableDef = false;
  let columns = [];
  let foreignKeys = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of CREATE TABLE - support both MySQL (`table`) and SQL Server ([schema].[table] or [table])
    const mysqlMatch = line.match(/^CREATE TABLE `(\w+)`/);
    const sqlServerMatch = line.match(/^CREATE TABLE (?:\[[\w]+\]\.)?\[(\w+)\]/);

    if (mysqlMatch || sqlServerMatch) {
      currentTable = (mysqlMatch ? mysqlMatch[1] : sqlServerMatch[1]);
      inTableDef = true;
      columns = [];
      foreignKeys = [];
      continue;
    }

    // Inside table definition
    if (inTableDef) {
      // End of table definition - MySQL: ") ENGINE", SQL Server: ") ON [PRIMARY]" or just "GO"
      if (line.startsWith(') ENGINE') || line.startsWith(')ENGINE') ||
          line.startsWith(') ON') || line === 'GO') {
        tables[currentTable.toLowerCase()] = {
          name: currentTable,
          columns: columns,
          foreignKeys: foreignKeys
        };
        inTableDef = false;
        currentTable = null;
        continue;
      }

      // Column definition - MySQL: `col` type, SQL Server: [col] [type]
      const mysqlColMatch = line.match(/^`(\w+)`\s+(\w+(?:\([^)]+\))?)/);
      const sqlServerColMatch = line.match(/^\[(\w+)\]\s+\[?(\w+(?:\([^)]+\))?)\]?/);

      if (mysqlColMatch) {
        columns.push({
          name: mysqlColMatch[1],
          type: mysqlColMatch[2]
        });
      } else if (sqlServerColMatch && !line.startsWith('CONSTRAINT')) {
        columns.push({
          name: sqlServerColMatch[1],
          type: sqlServerColMatch[2]
        });
      }

      // Foreign key
      const fkMatch = line.match(/CONSTRAINT\s+`(\w+)`\s+FOREIGN KEY\s+\(`(\w+)`\)\s+REFERENCES\s+`(\w+)`\s+\(`(\w+)`\)/);
      if (fkMatch) {
        foreignKeys.push({
          constraintName: fkMatch[1],
          column: fkMatch[2],
          referencedTable: fkMatch[3],
          referencedColumn: fkMatch[4]
        });
      }
    }
  }

  return tables;
}

// Parse CSV mapping file
function parseMappingFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true
  });

  const mappings = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    // Include rows that have at least a newTable - don't require oldTable for const types
    if (row[1] && row[2]) {  // newTable and newColumn must exist
      mappings.push({
        step: row[0],
        newTable: row[1],
        newColumn: row[2],
        convertType: row[7],
        oldTable: row[8] || '',
        oldColumn: row[9] || '',
        comments: row[10] || ''
      });
    }
  }

  return mappings;
}

// Find related tables (tables that reference or are referenced by the target table)
function findRelatedTables(targetTable, tables) {
  const related = {
    referencedBy: [],  // Tables that reference this table
    references: []     // Tables this table references
  };

  // Find tables that reference the target table
  for (const [tableName, tableData] of Object.entries(tables)) {
    for (const fk of tableData.foreignKeys) {
      if (fk.referencedTable.toLowerCase() === targetTable.toLowerCase()) {
        related.referencedBy.push({
          table: tableName,
          column: fk.column,
          constraintName: fk.constraintName
        });
      }
    }
  }

  // Find tables that this table references
  const targetTableData = tables[targetTable.toLowerCase()];
  if (targetTableData) {
    for (const fk of targetTableData.foreignKeys) {
      related.references.push({
        table: fk.referencedTable.toLowerCase(),
        column: fk.column,
        constraintName: fk.constraintName,
        referencedColumn: fk.referencedColumn
      });
    }
  }

  return related;
}

// API endpoint to get all old table names
app.get('/api/old-tables', (req, res) => {
  try {
    const oldTables = parseSQLFile(path.join(__dirname, '../database/schemas/create-kupat-db-generic.sql'));
    const tableNames = Object.keys(oldTables).sort();
    res.json({ tables: tableNames });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get specific old table details
app.get('/api/old-table/:tableName', (req, res) => {
  try {
    const tableName = req.params.tableName.toLowerCase();
    const oldTables = parseSQLFile(path.join(__dirname, '../database/schemas/create-kupat-db-generic.sql'));

    if (!oldTables[tableName]) {
      return res.status(404).json({ error: 'Table not found' });
    }

    res.json(oldTables[tableName]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get table relationships
app.get('/api/analyze/:tableName', (req, res) => {
  try {
    const tableName = req.params.tableName;

    // Parse both SQL files
    const newTables = parseSQLFile(path.join(__dirname, '../database/schemas/KupatHairNewMySQL.sql'));
    const oldTables = parseSQLFile(path.join(__dirname, '../database/schemas/create-kupat-db-generic.sql'));

    // Parse mapping file
    const mappings = parseMappingFile(path.join(__dirname, '../data/Mapping.csv'));

    // Find related tables in new DB
    const newRelated = findRelatedTables(tableName, newTables);

    // Find mappings for the target table
    const tableMappings = mappings.filter(m =>
      m.newTable && m.newTable.toLowerCase() === tableName.toLowerCase()
    );

    // Get unique old table names from mappings
    const oldTableNames = [...new Set(tableMappings
      .filter(m => m.oldTable)
      .map(m => m.oldTable.toLowerCase()))];

    res.json({
      targetTable: tableName,
      newDB: {
        table: newTables[tableName.toLowerCase()],
        relatedTables: {
          referencedBy: newRelated.referencedBy.map(r => ({
            ...r,
            tableData: newTables[r.table]
          })),
          references: newRelated.references.map(r => ({
            ...r,
            tableData: newTables[r.table]
          }))
        }
      },
      oldDB: {
        tables: oldTableNames.map(name => ({
          name: name,
          data: oldTables[name]
        }))
      },
      mappings: tableMappings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test MSSQL connection
app.post('/api/test-mssql', async (req, res) => {
  try {
    const { server, database, user, password, options, authentication } = req.body;

    // Build config - support both SQL Auth and Windows Auth
    mssqlConfig = {
      server,
      database,
      options: options || { encrypt: true, trustServerCertificate: true }
    };

    // Add authentication if provided
    if (authentication) {
      mssqlConfig.authentication = authentication;
    } else if (user || password) {
      // SQL Authentication
      mssqlConfig.user = user;
      mssqlConfig.password = password;
    }
    // If neither authentication nor user/password provided, will use Windows Auth

    const pool = await sql.connect(mssqlConfig);
    await pool.close();

    res.json({ success: true, message: 'Connected to MSSQL successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test MySQL connection
app.post('/api/test-mysql', async (req, res) => {
  try {
    const { host, database, user, password } = req.body;
    mysqlConfig = { host, database, user, password, charset: 'utf8mb4' };

    const connection = await mysql.createConnection(mysqlConfig);
    await connection.end();

    res.json({ success: true, message: 'Connected to MySQL successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clear log file
app.post('/api/clear-logs', (req, res) => {
  try {
    // Write empty string to log file to clear it
    fs.writeFileSync(path.join(__dirname, '../logs/migration-logs.log'), '');
    logger.info('Log file cleared by user');
    res.json({ success: true, message: 'Log file cleared successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get table data from MSSQL (for FK mapping)
app.post('/api/table-data', async (req, res) => {
  try {
    const { tableName } = req.body;

    if (!mssqlConfig) {
      return res.status(400).json({ success: false, message: 'MSSQL connection not configured' });
    }

    const pool = await sql.connect(mssqlConfig);
    const result = await pool.request().query(`SELECT * FROM ${tableName}`);
    await pool.close();

    res.json({ success: true, data: result.recordset, columns: result.recordset.columns || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save FK mapping
app.post('/api/fk-mapping/:columnName', (req, res) => {
  try {
    const { columnName } = req.params;
    const { sourceTable, keyColumn, mappings } = req.body;

    const fkMappingPath = path.join(__dirname, '../data/fk-mappings', `${columnName}.json`);
    const mappingData = {
      columnName,
      sourceTable,
      keyColumn,
      mappings,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(fkMappingPath, JSON.stringify(mappingData, null, 2));
    logger.info(`FK mapping saved for column: ${columnName} (key: ${keyColumn})`);

    res.json({ success: true, message: 'FK mapping saved successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get FK mapping
app.get('/api/fk-mapping/:columnName', (req, res) => {
  try {
    const { columnName } = req.params;
    const fkMappingPath = path.join(__dirname, '../data/fk-mappings', `${columnName}.json`);

    if (!fs.existsSync(fkMappingPath)) {
      return res.json({ success: true, exists: false, mapping: null });
    }

    const mappingData = JSON.parse(fs.readFileSync(fkMappingPath, 'utf-8'));
    res.json({ success: true, exists: true, mapping: mappingData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Generate RecruiterGroupId mapping by matching old and new data
app.post('/api/generate-recruitersgroup-mapping', async (req, res) => {
  try {
    if (!mssqlConfig || !mysqlConfig) {
      return res.status(400).json({ success: false, message: 'Database connections not configured' });
    }

    logger.info('Generating RecruiterGroupId mapping...');

    // Load product-to-project mapping
    const projectMappingPath = path.join(__dirname, '../data/fk-mappings/ProjectId.json');
    if (!fs.existsSync(projectMappingPath)) {
      return res.status(400).json({ success: false, message: 'ProjectId mapping not found' });
    }
    const projectMapping = JSON.parse(fs.readFileSync(projectMappingPath, 'utf-8'));

    // Connect to databases
    const mssqlPool = await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'utf8mb4'
    });

    // Get old RecruitersGroups
    const oldGroups = await mssqlPool.request().query(`
      SELECT ID, Name, ProjectId
      FROM RecruitersGroups
      WHERE ProjectId IS NOT NULL
    `);
    logger.info(`Found ${oldGroups.recordset.length} groups in old DB`);

    // Get new recruitersgroup
    const [newGroups] = await mysqlConn.query(`
      SELECT Id, Name, ProjectId
      FROM recruitersgroup
    `);
    logger.info(`Found ${newGroups.length} groups in new DB`);

    // Create lookup by Name+ProjectId for new groups
    const newGroupLookup = {};
    for (const g of newGroups) {
      const key = `${g.Name}|${g.ProjectId}`;
      newGroupLookup[key] = g.Id;
    }

    // Create mapping
    const mapping = {};
    let matched = 0;
    let notMatched = 0;

    for (const oldGroup of oldGroups.recordset) {
      // Convert old ProjectId to new ProjectId
      const newProjectId = projectMapping.mappings[oldGroup.ProjectId.toString()];

      if (!newProjectId) {
        notMatched++;
        continue;
      }

      // Find new group by Name + new ProjectId
      const key = `${oldGroup.Name}|${newProjectId}`;
      const newGroupId = newGroupLookup[key];

      if (newGroupId) {
        mapping[oldGroup.ID] = newGroupId;
        matched++;
      } else {
        notMatched++;
      }
    }

    logger.info(`RecruiterGroupId mapping: ${matched} matched, ${notMatched} not matched`);

    // Save mapping
    const mappingData = {
      columnName: 'RecruiterGroupId',
      sourceTable: 'RecruitersGroups',
      keyColumn: 'ID',
      description: 'Mapping from old RecruitersGroups.ID to new recruitersgroup.Id',
      totalMappings: Object.keys(mapping).length,
      mappings: mapping,
      createdAt: new Date().toISOString()
    };

    const fkMappingPath = path.join(__dirname, '../data/fk-mappings/RecruiterGroupId.json');
    fs.writeFileSync(fkMappingPath, JSON.stringify(mappingData, null, 2));

    await mssqlPool.close();
    await mysqlConn.end();

    res.json({
      success: true,
      message: `RecruiterGroupId mapping created: ${matched} matched, ${notMatched} not matched`,
      matched,
      notMatched,
      totalMappings: Object.keys(mapping).length
    });

  } catch (error) {
    logger.error(`Error generating RecruiterGroupId mapping: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Run full recruiters migration (groups + individual recruiters)
app.post('/api/run-all-recruiters', async (req, res) => {
  const results = {
    step1_groups: null,
    step1_5_groupLanguage: null,
    step2_mapping: null,
    step3_recruiters: null,
    success: false
  };

  try {
    logger.info('='.repeat(60));
    logger.info('STARTING FULL RECRUITERS MIGRATION');
    logger.info('='.repeat(60));

    // Load mapping files
    const groupMappingPath = path.join(__dirname, '../mappings/RecruitersGroupMapping.json');
    const recruiterMappingPath = path.join(__dirname, '../mappings/RecruiterMapping.json');

    if (!fs.existsSync(groupMappingPath)) {
      throw new Error('RecruitersGroupMapping.json not found');
    }
    if (!fs.existsSync(recruiterMappingPath)) {
      throw new Error('RecruiterMapping.json not found');
    }

    const groupMapping = JSON.parse(fs.readFileSync(groupMappingPath, 'utf-8'));
    const recruiterMapping = JSON.parse(fs.readFileSync(recruiterMappingPath, 'utf-8'));

    // Helper function to run migration
    async function runMigration(mapping, tableName) {
      const formattedLocalization = {};
      if (mapping.localizationMappings) {
        const loc = mapping.localizationMappings;
        const fields = Object.keys(loc).filter(k => !['targetTable', 'parentFkColumn'].includes(k));
        for (const field of fields) {
          formattedLocalization[field] = loc[field];
        }
      }

      const requestBody = {
        tableName: mapping.targetTable,
        mappings: mapping.columnMappings,
        localizationMappings: formattedLocalization,
        fkMappings: mapping.fkMappings || {},
        whereClause: mapping.whereClause || '',
        sourceIdColumn: mapping.sourceIdColumn || 'productsid'
      };

      // Simulate internal API call by reusing migration logic
      return new Promise(async (resolve, reject) => {
        try {
          // Connect to databases
          const mssqlPool = await sql.connect(mssqlConfig);
          const mysqlConn = await mysql.createConnection({
            ...mysqlConfig,
            charset: 'utf8mb4'
          });

          // Run migration logic (simplified version)
          const sourceTable = Object.values(requestBody.mappings).find(m => m.oldTable)?.oldTable;
          const sourceIdColumn = requestBody.sourceIdColumn;

          // Build select columns
          const selectColumns = [];
          for (const [targetCol, mapping] of Object.entries(requestBody.mappings)) {
            if (mapping.oldColumn && mapping.oldTable === sourceTable) {
              selectColumns.push(mapping.oldColumn);
            }
          }

          // Add localization columns
          if (requestBody.localizationMappings) {
            for (const [fieldName, fieldMappings] of Object.entries(requestBody.localizationMappings)) {
              // Skip if it's an object (actual field mappings)
              if (typeof fieldMappings === 'object' && fieldMappings !== null && !Array.isArray(fieldMappings)) {
                for (const langMapping of Object.values(fieldMappings)) {
                  if (langMapping.oldColumn && langMapping.oldTable === sourceTable) {
                    selectColumns.push(langMapping.oldColumn);
                  }
                }
              }
            }
          }

          const uniqueColumns = [...new Set(selectColumns)];
          let query = `SELECT ${sourceIdColumn} as sourceId, ${uniqueColumns.join(', ')} FROM ${sourceTable}`;
          if (requestBody.whereClause) {
            query += ` WHERE ${requestBody.whereClause}`;
          }

          logger.info(`Query: ${query}`);
          const sourceData = await mssqlPool.request().query(query);
          logger.info(`Fetched ${sourceData.recordset.length} rows`);

          // Load FK mappings
          const fkMappings = {};
          for (const [colName, mapping] of Object.entries(requestBody.mappings)) {
            if (mapping.useFkMapping) {
              const fkPath = path.join(__dirname, `../data/fk-mappings/${colName}.json`);
              if (fs.existsSync(fkPath)) {
                fkMappings[colName] = JSON.parse(fs.readFileSync(fkPath, 'utf-8'));
              }
            }
          }

          let inserted = 0;
          let errors = 0;

          for (const row of sourceData.recordset) {
            try {
              const values = {};

              // Process mappings
              for (const [targetCol, mapping] of Object.entries(requestBody.mappings)) {
                if (mapping.convertType === 'const') {
                  values[targetCol] = mapping.value === 'GETDATE()' ? new Date() : mapping.value;
                } else if (mapping.convertType === 'direct' || mapping.convertType === 'expression') {
                  let value = row[mapping.oldColumn];

                  // Apply expression if exists
                  if (mapping.expression) {
                    try {
                      value = eval(mapping.expression);
                    } catch (e) {
                      // Keep original value
                    }
                  }

                  // Apply FK mapping if needed
                  if (mapping.useFkMapping && fkMappings[targetCol]) {
                    const fk = fkMappings[targetCol];
                    const mappedValue = fk.mappings[String(value)];
                    if (mappedValue !== undefined) {
                      value = mappedValue;
                    } else if (mapping.nullable) {
                      value = null;
                    }
                  }

                  values[targetCol] = value;
                }
              }

              // Insert into MySQL
              const columns = Object.keys(values);
              const placeholders = columns.map(() => '?').join(', ');
              const insertQuery = `INSERT INTO ${requestBody.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

              await mysqlConn.execute(insertQuery, Object.values(values));
              inserted++;
            } catch (err) {
              errors++;
              if (errors <= 5) {
                logger.error(`Error: ${err.message}`);
              }
            }
          }

          await mssqlPool.close();
          await mysqlConn.end();

          resolve({ inserted, total: sourceData.recordset.length, errors });
        } catch (err) {
          reject(err);
        }
      });
    }

    // STEP 1: Run RecruitersGroup migration
    logger.info('STEP 1: Migrating RecruitersGroups...');
    results.step1_groups = await runMigration(groupMapping, 'recruitersgroup');
    logger.info(`Step 1 completed: ${results.step1_groups.inserted}/${results.step1_groups.total} rows`);

    // STEP 1.5: Run RecruitersGroupLanguage migration (simple approach - same Name for all languages)
    logger.info('STEP 1.5: Migrating RecruitersGroupLanguage...');
    const mysqlConnGroupLang = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });
    const [allGroups] = await mysqlConnGroupLang.query('SELECT Id, Name FROM recruitersgroup');

    let groupLangInserted = 0;
    let groupLangErrors = 0;

    for (const group of allGroups) {
      // Hebrew (LanguageId = 1)
      try {
        await mysqlConnGroupLang.execute(
          'INSERT INTO recruitersgrouplanguage (RecruiterGroupId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [group.Id, 1, group.Name, null, 1]
        );
        groupLangInserted++;
      } catch (err) {
        groupLangErrors++;
        if (groupLangErrors <= 3) logger.error(`Hebrew error for ${group.Name}: ${err.message}`);
      }

      // English (LanguageId = 2) - same Name
      try {
        await mysqlConnGroupLang.execute(
          'INSERT INTO recruitersgrouplanguage (RecruiterGroupId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [group.Id, 2, group.Name, null, 1]
        );
        groupLangInserted++;
      } catch (err) {
        groupLangErrors++;
        if (groupLangErrors <= 3) logger.error(`English error for ${group.Name}: ${err.message}`);
      }

      // French (LanguageId = 3) - same Name
      try {
        await mysqlConnGroupLang.execute(
          'INSERT INTO recruitersgrouplanguage (RecruiterGroupId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [group.Id, 3, group.Name, null, 1]
        );
        groupLangInserted++;
      } catch (err) {
        groupLangErrors++;
        if (groupLangErrors <= 3) logger.error(`French error for ${group.Name}: ${err.message}`);
      }
    }

    await mysqlConnGroupLang.end();
    results.step1_5_groupLanguage = { inserted: groupLangInserted, total: allGroups.length * 3, errors: groupLangErrors };
    logger.info(`Step 1.5 completed: ${groupLangInserted}/${allGroups.length * 3} rows (${allGroups.length} groups × 3 languages)`);

    // STEP 2: Generate RecruiterGroupId mapping
    logger.info('STEP 2: Generating RecruiterGroupId mapping...');
    const projectMappingPath = path.join(__dirname, '../data/fk-mappings/ProjectId.json');
    const projectMapping = JSON.parse(fs.readFileSync(projectMappingPath, 'utf-8'));

    const mssqlPool = await sql.connect(mssqlConfig);
    const mysqlConn = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });

    const oldGroupsResult = await mssqlPool.request().query('SELECT ID, Name, ProjectId FROM RecruitersGroups WHERE ProjectId IS NOT NULL');
    const [newGroups] = await mysqlConn.query('SELECT Id, Name, ProjectId FROM recruitersgroup');

    const newGroupLookup = {};
    for (const g of newGroups) {
      newGroupLookup[`${g.Name}|${g.ProjectId}`] = g.Id;
    }

    const groupIdMapping = {};
    let matched = 0;
    for (const old of oldGroupsResult.recordset) {
      const newProjectId = projectMapping.mappings[String(old.ProjectId)];
      if (newProjectId) {
        const newId = newGroupLookup[`${old.Name}|${newProjectId}`];
        if (newId) {
          groupIdMapping[old.ID] = newId;
          matched++;
        }
      }
    }

    const fkMappingPath = path.join(__dirname, '../data/fk-mappings/RecruiterGroupId.json');
    fs.writeFileSync(fkMappingPath, JSON.stringify({
      columnName: 'RecruiterGroupId',
      mappings: groupIdMapping,
      createdAt: new Date().toISOString()
    }, null, 2));

    results.step2_mapping = { matched, total: oldGroupsResult.recordset.length };
    logger.info(`Step 2 completed: ${matched} mappings created`);

    await mssqlPool.close();
    await mysqlConn.end();

    // STEP 3: Run Recruiter migration
    logger.info('STEP 3: Migrating Recruiters...');
    results.step3_recruiters = await runMigration(recruiterMapping, 'recruiter');
    logger.info(`Step 3 completed: ${results.step3_recruiters.inserted}/${results.step3_recruiters.total} rows`);

    // STEP 4: Generate RecruiterId mapping
    logger.info('STEP 4: Generating RecruiterId mapping...');
    const mssqlPool2 = await sql.connect(mssqlConfig);
    const mysqlConn2 = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });

    const recruiterGroupIdMappingPath = path.join(__dirname, '../data/fk-mappings/RecruiterGroupId.json');
    const recruiterGroupIdMapping = JSON.parse(fs.readFileSync(recruiterGroupIdMappingPath, 'utf-8'));

    const oldRecruitersResult = await mssqlPool2.request().query('SELECT ProductStockId, Name, GroupId FROM ProductStock WHERE GroupId IS NOT NULL');
    const [newRecruiters] = await mysqlConn2.query('SELECT Id, Name, RecruiterGroupId FROM recruiter');

    const newRecruiterLookup = {};
    for (const r of newRecruiters) {
      newRecruiterLookup[`${r.Name}|${r.RecruiterGroupId}`] = r.Id;
    }

    const recruiterIdMapping = {};
    let matched2 = 0;
    for (const old of oldRecruitersResult.recordset) {
      const newRecruiterGroupId = recruiterGroupIdMapping.mappings[String(old.GroupId)];
      if (newRecruiterGroupId) {
        const newId = newRecruiterLookup[`${old.Name}|${newRecruiterGroupId}`];
        if (newId) {
          recruiterIdMapping[old.ProductStockId] = newId;
          matched2++;
        }
      }
    }

    const recruiterIdMappingPath = path.join(__dirname, '../data/fk-mappings/RecruiterId.json');
    fs.writeFileSync(recruiterIdMappingPath, JSON.stringify({
      columnName: 'RecruiterId',
      sourceTable: 'ProductStock',
      targetTable: 'recruiter',
      mappings: recruiterIdMapping,
      createdAt: new Date().toISOString()
    }, null, 2));

    results.step4_mapping = { matched: matched2, total: oldRecruitersResult.recordset.length };
    logger.info(`Step 4 completed: ${matched2} mappings created`);

    // STEP 5: Run RecruiterLocalization migration with special logic
    logger.info('STEP 5: Migrating RecruiterLocalization (only languages with data)...');

    // Get all recruiters from new DB
    const [allNewRecruiters] = await mysqlConn2.query('SELECT Id, Name FROM recruiter');
    logger.info(`Found ${allNewRecruiters.length} recruiters in new DB`);

    // Get all ProductStock data
    const sourceDataResult = await mssqlPool2.request().query(`
      SELECT Name, Hide, Name_en, Hide_en, Name_fr, Hide_fr
      FROM ProductStock
      WHERE GroupId IS NOT NULL
    `);
    logger.info(`Found ${sourceDataResult.recordset.length} ProductStock in old DB`);

    // Create lookup: Name -> ProductStock data
    const productStockLookup = {};
    for (const ps of sourceDataResult.recordset) {
      productStockLookup[ps.Name] = ps;
    }

    // Helper: check if value is empty (including "null" string)
    const isEmpty = (val) => {
      if (val === null || val === undefined) return true;
      const str = String(val).trim();
      return str === '' || str === 'null';
    };

    let locInserted = 0;
    let locErrors = 0;
    let locSkipped = 0;
    const langCounts = { he: 0, en: 0, fr: 0 };

    for (const recruiter of allNewRecruiters) {
      const oldData = productStockLookup[recruiter.Name];
      if (!oldData) {
        locSkipped++;
        continue;
      }

      // Hebrew - always exists (Name is from recruiter table)
      try {
        const displayInSite = (oldData.Hide === 0 || oldData.Hide === null) ? 1 : 0;
        await mysqlConn2.execute(
          'INSERT INTO recruiterlocalization (RecruiterId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
          [recruiter.Id, 1, recruiter.Name, null, displayInSite]
        );
        locInserted++;
        langCounts.he++;
      } catch (err) {
        locErrors++;
        if (locErrors <= 5) logger.error(`Hebrew localization error for ${recruiter.Name}: ${err.message}`);
      }

      // English - check if Name_en has real value
      if (!isEmpty(oldData.Name_en)) {
        try {
          const displayInSite = (oldData.Hide_en === 0 || oldData.Hide_en === null) ? 1 : 0;
          await mysqlConn2.execute(
            'INSERT INTO recruiterlocalization (RecruiterId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
            [recruiter.Id, 2, oldData.Name_en, null, displayInSite]
          );
          locInserted++;
          langCounts.en++;
        } catch (err) {
          locErrors++;
          if (locErrors <= 5) logger.error(`English localization error for ${recruiter.Name}: ${err.message}`);
        }
      }

      // French - check if Name_fr has real value
      if (!isEmpty(oldData.Name_fr)) {
        try {
          const displayInSite = (oldData.Hide_fr === 0 || oldData.Hide_fr === null) ? 1 : 0;
          await mysqlConn2.execute(
            'INSERT INTO recruiterlocalization (RecruiterId, LanguageId, Name, Description, DisplayInSite, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) VALUES (?, ?, ?, ?, ?, NOW(), -1, NOW(), -1)',
            [recruiter.Id, 3, oldData.Name_fr, null, displayInSite]
          );
          locInserted++;
          langCounts.fr++;
        } catch (err) {
          locErrors++;
          if (locErrors <= 5) logger.error(`French localization error for ${recruiter.Name}: ${err.message}`);
        }
      }
    }

    results.step5_localization = {
      inserted: locInserted,
      errors: locErrors,
      skipped: locSkipped,
      total: allNewRecruiters.length,
      languages: langCounts
    };
    logger.info(`Step 5 completed: ${locInserted} localization rows (Hebrew: ${langCounts.he}, English: ${langCounts.en}, French: ${langCounts.fr}, Skipped: ${locSkipped})`);

    await mssqlPool2.close();
    await mysqlConn2.end();

    results.success = true;
    logger.info('='.repeat(60));
    logger.info('FULL RECRUITERS MIGRATION COMPLETED (6 STEPS)');
    logger.info('='.repeat(60));

    res.json({
      success: true,
      message: 'Full recruiters migration completed',
      results
    });

  } catch (error) {
    logger.error(`Full migration failed: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
      results
    });
  }
});

// Save complete mapping (column mappings + FK mappings + localization mappings + projectItem mappings + projectItemLocalization mappings + media mappings)
app.post('/api/save-mapping', (req, res) => {
  try {
    const { filename, columnMappings, fkMappings, localizationMappings, projectItemMappings, projectItemLocalizationMappings, mediaMappings, whereClause } = req.body;

    if (!filename) {
      return res.status(400).json({ success: false, message: 'Filename is required' });
    }

    // Create mappings directory if it doesn't exist
    const mappingsDir = path.join(__dirname, '../mappings');
    if (!fs.existsSync(mappingsDir)) {
      fs.mkdirSync(mappingsDir);
    }

    // Sanitize filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9\-_\u0590-\u05FF]/g, '_');
    const filePath = path.join(mappingsDir, `${safeFilename}.json`);

    const mappingData = {
      filename: safeFilename,
      columnMappings,
      fkMappings,
      localizationMappings: localizationMappings || {},
      projectItemMappings: projectItemMappings || {},
      projectItemLocalizationMappings: projectItemLocalizationMappings || {},
      mediaMappings: mediaMappings || {},
      whereClause: whereClause || null,
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(mappingData, null, 2));
    logger.info(`Complete mapping saved: ${safeFilename}.json`);

    res.json({ success: true, message: 'Mapping saved successfully!', filename: safeFilename });
  } catch (error) {
    logger.error(`Error saving mapping: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get list of available mappings
app.get('/api/mappings', (req, res) => {
  try {
    const mappingsDir = path.join(__dirname, '../mappings');

    if (!fs.existsSync(mappingsDir)) {
      return res.json({ success: true, mappings: [] });
    }

    const files = fs.readdirSync(mappingsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(mappingsDir, file);
        const stats = fs.statSync(filePath);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        return {
          filename: file.replace('.json', ''),
          savedAt: data.savedAt || stats.mtime.toISOString(),
          size: stats.size
        };
      })
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    res.json({ success: true, mappings: files });
  } catch (error) {
    logger.error(`Error listing mappings: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Load mapping from file
app.get('/api/load-mapping/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = filename.replace(/[^a-zA-Z0-9\-_\u0590-\u05FF]/g, '_');
    const filePath = path.join(__dirname, '../mappings', `${safeFilename}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Mapping file not found' });
    }

    const mappingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    logger.info(`Mapping loaded: ${safeFilename}.json`);

    res.json({
      success: true,
      mapping: {
        sourceTable: mappingData.sourceTable || null,
        targetTable: mappingData.targetTable || null,
        sourceIdColumn: mappingData.sourceIdColumn || 'productsid',
        columnMappings: mappingData.columnMappings || {},
        fkMappings: mappingData.fkMappings || {},
        localizationMappings: mappingData.localizationMappings || {},
        projectItemMappings: mappingData.projectItemMappings || {},
        projectItemLocalizationMappings: mappingData.projectItemLocalizationMappings || {},
        mediaMappings: mappingData.mediaMappings || {},
        whereClause: mappingData.whereClause || null,
        savedAt: mappingData.savedAt
      }
    });
  } catch (error) {
    logger.error(`Error loading mapping: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Execute migration
app.post('/api/migrate', async (req, res) => {
  try {
    const { tableName, mappings } = req.body;

    logger.info('='.repeat(60));
    logger.info('Starting migration for table: ' + tableName);
    logger.info('='.repeat(60));

    if (!mssqlConfig || !mysqlConfig) {
      logger.error('Migration failed: Database connections not configured');
      return res.status(400).json({ success: false, message: 'Database connections not configured. Please test connections first.' });
    }

    // Connect to MSSQL
    logger.info('Connecting to MSSQL...');
    const mssqlPool = await sql.connect(mssqlConfig);
    logger.info('MSSQL connected successfully');

    // Connect to MySQL with explicit UTF8MB4 encoding
    logger.info('Connecting to MySQL...');
    const mysqlConnection = await mysql.createConnection({
      ...mysqlConfig,
      charset: 'UTF8MB4_GENERAL_CI'
    });
    // Ensure UTF8MB4 encoding for Hebrew support
    await mysqlConnection.execute("SET NAMES utf8mb4 COLLATE utf8mb4_general_ci");
    await mysqlConnection.execute("SET character_set_client = utf8mb4");
    await mysqlConnection.execute("SET character_set_results = utf8mb4");
    await mysqlConnection.execute("SET character_set_connection = utf8mb4");
    logger.info('MySQL connected successfully with UTF8MB4 encoding');

    // Build SELECT query for MSSQL based on mappings
    const sourceColumns = [];
    const targetColumns = [];
    const constValues = {};
    const fkMappingColumns = {};

    logger.info('Received mappings: ' + JSON.stringify(mappings, null, 2));

    // Load FK mappings if needed
    for (const [targetCol, mapping] of Object.entries(mappings)) {
      targetColumns.push(targetCol);

      if (mapping.convertType === 'const') {
        constValues[targetCol] = mapping.value;
      } else if ((mapping.convertType === 'direct' || mapping.convertType === 'expression') && mapping.oldTable && mapping.oldColumn) {
        sourceColumns.push({ target: targetCol, source: mapping.oldColumn, table: mapping.oldTable, expression: mapping.expression });

        // Check if FK mapping is enabled for this column
        if (mapping.useFkMapping) {
          const fkMappingPath = path.join(__dirname, '../data/fk-mappings', `${targetCol}.json`);
          if (fs.existsSync(fkMappingPath)) {
            const fkData = JSON.parse(fs.readFileSync(fkMappingPath, 'utf-8'));
            fkMappingColumns[targetCol] = fkData;
            logger.info(`Loaded FK mapping for column: ${targetCol}`);
          }
        }
      }
    }

    logger.info('Source columns: ' + JSON.stringify(sourceColumns, null, 2));
    logger.info('Const values: ' + JSON.stringify(constValues, null, 2));

    if (sourceColumns.length === 0 && Object.keys(constValues).length === 0) {
      await mssqlPool.close();
      await mysqlConnection.end();
      return res.status(400).json({ success: false, message: 'No valid mappings found' });
    }

    // Pre-load FK mapping tables for efficiency
    const fkTableCache = {};
    for (const [colName, fkData] of Object.entries(fkMappingColumns)) {
      if (!fkTableCache[fkData.sourceTable]) {
        logger.info(`Loading FK table: ${fkData.sourceTable}`);
        const fkTableResult = await mssqlPool.request().query(`SELECT * FROM ${fkData.sourceTable}`);
        fkTableCache[fkData.sourceTable] = fkTableResult.recordset;
      }
    }

    let rows = [];
    let sourceTable = null;

    if (sourceColumns.length > 0) {
      // For now, we'll assume all source columns are from the same table (first mapping's table)
      sourceTable = sourceColumns[0].table;
      const selectColumnsSet = new Set(sourceColumns.map(c => c.source));

      // Also include columns from localizationMappings
      const localizationMappings = req.body.localizationMappings;
      if (localizationMappings) {
        for (const fieldMappings of Object.values(localizationMappings)) {
          for (const langMapping of Object.values(fieldMappings)) {
            if (langMapping.oldColumn && langMapping.oldTable === sourceTable) {
              selectColumnsSet.add(langMapping.oldColumn);
            }

            // Extract columns from expressions (e.g., row.ShowMainPage)
            if (langMapping.expression) {
              const rowFieldMatches = langMapping.expression.match(/row\.(\w+)/g);
              if (rowFieldMatches) {
                rowFieldMatches.forEach(match => {
                  const fieldName = match.replace('row.', '');
                  selectColumnsSet.add(fieldName);
                });
              }
            }
          }
        }
      }

      // Also include columns from projectItemMappings
      const projectItemMappings = req.body.projectItemMappings;
      if (projectItemMappings) {
        // Handle both funds structure and collections structure
        const itemMappings = projectItemMappings.funds || projectItemMappings.collections;
        if (itemMappings) {
          // If collections, it has nested certificate/donation
          const mappingsToProcess = itemMappings.certificate ?
            [...Object.values(itemMappings.certificate || {}), ...Object.values(itemMappings.donation || {})] :
            Object.values(itemMappings);

          for (const mapping of mappingsToProcess) {
            if (mapping && mapping.oldColumn && mapping.oldTable === sourceTable) {
              selectColumnsSet.add(mapping.oldColumn);
            }

            // Extract columns from expressions
            if (mapping && mapping.expression) {
              const rowFieldMatches = mapping.expression.match(/row\.(\w+)/g);
              if (rowFieldMatches) {
                rowFieldMatches.forEach(match => {
                  const fieldName = match.replace('row.', '');
                  selectColumnsSet.add(fieldName);
                });
              }
            }
          }
        }
      }

      // Also include columns from mediaMappings
      const mediaMappings = req.body.mediaMappings;
      if (mediaMappings) {
        // Process all languages (hebrew, french, english)
        for (const language of Object.values(mediaMappings)) {
          // Process all media types (projectImage, projectVideo, donationBanner)
          for (const mediaType of Object.values(language)) {
            for (const [fieldName, mapping] of Object.entries(mediaType)) {
              if (fieldName === 'condition') continue; // Skip condition field

              if (mapping && mapping.oldColumn && mapping.oldTable === sourceTable) {
                selectColumnsSet.add(mapping.oldColumn);
              }

              // Extract columns from expressions and conditions
              if (mapping && mapping.expression) {
                const rowFieldMatches = mapping.expression.match(/row\.(\w+)/g);
                if (rowFieldMatches) {
                  rowFieldMatches.forEach(match => {
                    const fieldName = match.replace('row.', '');
                    selectColumnsSet.add(fieldName);
                  });
                }
              }
            }

            // Extract columns from condition expression
            if (mediaType.condition) {
              const conditionMatches = mediaType.condition.match(/row\.(\w+)/g);
              if (conditionMatches) {
                conditionMatches.forEach(match => {
                  const fieldName = match.replace('row.', '');
                  selectColumnsSet.add(fieldName);
                });
              }
            }
          }
        }
      }

      const selectColumns = Array.from(selectColumnsSet).join(', ');

      // Get source ID column from request, default to 'productsid' for backward compatibility
      const sourceIdColumn = req.body.sourceIdColumn || 'productsid';

      // Always include the source table's ID column for tracking
      let selectQuery = `SELECT ${sourceIdColumn} as sourceId, ${selectColumns} FROM ${sourceTable}`;

      // Add WHERE clause if provided in mapping
      if (req.body.whereClause) {
        selectQuery += ` WHERE ${req.body.whereClause}`;
        logger.info('Applied WHERE clause: ' + req.body.whereClause);
      }

      logger.info('Executing query: ' + selectQuery);

      // Fetch data from MSSQL
      const result = await mssqlPool.request().query(selectQuery);
      rows = result.recordset;
      logger.info(`Fetched ${rows.length} rows from MSSQL`);
    } else {
      // If only const values, create a single dummy row to insert
      rows = [{}];
    }

    let insertedCount = 0;
    let errors = [];
    let idMappings = {};  // Store oldId -> newId mappings

    logger.info(`Starting to insert ${rows.length} rows into ${tableName}...`);

    // Insert each row into MySQL
    for (const row of rows) {
      try {
        const insertData = {};

        // Map direct columns
        for (const col of sourceColumns) {
          let sourceValue = row[col.source];
          const mapping = mappings[col.target];

          // Check if FK mapping exists and should be used
          if (fkMappingColumns[col.target]) {
            const fkMapping = fkMappingColumns[col.target];

            // Use the key column value to look up the mapping
            if (fkMapping.mappings[sourceValue]) {
              const newValue = fkMapping.mappings[sourceValue];
              logger.debug(`Applied FK mapping for ${col.target}: ${sourceValue} -> ${newValue}`);
              sourceValue = newValue;
            }
          }

          // Check if source value is NULL and defaultValue is provided
          if ((sourceValue === null || sourceValue === undefined) && mapping && mapping.defaultValue) {
            logger.debug(`Using default value for ${col.target}: ${mapping.defaultValue} (source was NULL)`);
            // Handle special SQL functions in default value
            if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
              insertData[col.target] = new Date();
            } else {
              insertData[col.target] = mapping.defaultValue;
            }
          } else {
            insertData[col.target] = sourceValue;
          }

          // Apply JavaScript expression if provided
          if (mapping && mapping.expression) {
            try {
              const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
              insertData[col.target] = expressionFunc(insertData[col.target], row);
              logger.debug(`Applied expression for ${col.target}: ${mapping.expression} => ${insertData[col.target]}`);
            } catch (exprErr) {
              logger.error(`Expression evaluation failed for ${col.target}: ${exprErr.message}`);
              // Continue with current value if expression fails
            }
          }
        }

        // Add const values
        for (const [key, value] of Object.entries(constValues)) {
          // Handle special SQL functions
          if (value === 'GETDATE()' || value === 'NOW()') {
            insertData[key] = new Date();
          } else {
            insertData[key] = value;
          }
        }

        const columns = Object.keys(insertData).join(', ');
        const placeholders = Object.keys(insertData).map(() => '?').join(', ');
        const values = Object.values(insertData);

        const insertQuery = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
        const [result] = await mysqlConnection.execute(insertQuery, values);

        // Capture the generated ID
        const newProjectId = result.insertId;
        const oldProductId = row.sourceId;

        if (oldProductId && newProjectId) {
          idMappings[oldProductId] = newProjectId;
          logger.debug(`Mapped old ID ${oldProductId} -> new ID ${newProjectId}`);
        }

        insertedCount++;
      } catch (err) {
        // Try to find row ID for logging
        const rowId = row.ID || row.Id || row.id || row[Object.keys(row)[0]] || 'unknown';
        logger.error(`Error inserting row [ID: ${rowId}]: ${err.message}`);
        logger.error(`Row data: ${JSON.stringify(row)}`);
        errors.push({ row, rowId, error: err.message });
      }
    }

    // ===== projectLocalization Migration =====
    let localizationInsertedCount = 0;
    let localizationErrors = [];

    // Check if localizationMappings were provided
    const localizationMappings = req.body.localizationMappings;

    if (localizationMappings && Object.keys(localizationMappings).length > 0) {
      logger.info('='.repeat(60));
      logger.info('Starting projectLocalization migration...');
      logger.info(`Will create ${Object.keys(idMappings).length * 3} localization rows (3 languages per project)`);

      // Language mapping: hebrew=1, english=2, french=3
      const languageIds = { hebrew: 1, english: 2, french: 3 };

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const sourceRow = rows.find(r => r.sourceId === parseInt(oldProductId));

        if (!sourceRow) {
          logger.warn(`Source row not found for oldProductId: ${oldProductId}`);
          continue;
        }

        // Insert for each language
        for (const [langKey, languageId] of Object.entries(languageIds)) {
          try {
            const locData = {
              ProjectId: newProjectId,
              Language: languageId
            };

            // Map fields from localizationMappings
            for (const [fieldName, langMappings] of Object.entries(localizationMappings)) {
              const langMapping = langMappings[langKey];

              if (!langMapping || !langMapping.oldColumn) {
                continue;  // Skip if no mapping for this language
              }

              let sourceValue = sourceRow[langMapping.oldColumn];

              // Apply default value if source is NULL
              if ((sourceValue === null || sourceValue === undefined) && langMapping.defaultValue) {
                if (langMapping.defaultValue === 'GETDATE()' || langMapping.defaultValue === 'NOW()') {
                  sourceValue = new Date();
                } else {
                  sourceValue = langMapping.defaultValue;
                }
                logger.debug(`Applied defaultValue for ${fieldName} (${langKey}): ${langMapping.defaultValue}`);
              }

              // Apply JavaScript expression if provided
              if (langMapping.expression) {
                try {
                  // Create a function with 'value' and 'row' parameters
                  const expressionFunc = new Function('value', 'row', `return ${langMapping.expression}`);
                  const beforeValue = sourceValue;
                  sourceValue = expressionFunc(sourceValue, sourceRow);
                  logger.debug(`Applied expression for ${fieldName} (${langKey}): ${langMapping.expression} | before: ${beforeValue} => after: ${sourceValue}`);
                } catch (exprErr) {
                  logger.error(`Expression evaluation failed for ${fieldName} (${langKey}): ${exprErr.message}`);
                  // Continue with original value if expression fails
                }
              }

              // Apply defaultValue AGAIN if expression returned null and defaultValue exists
              if ((sourceValue === null || sourceValue === undefined) && langMapping.defaultValue) {
                if (langMapping.defaultValue === 'GETDATE()' || langMapping.defaultValue === 'NOW()') {
                  sourceValue = new Date();
                } else {
                  sourceValue = langMapping.defaultValue;
                }
                logger.info(`Re-applied defaultValue after expression for ${fieldName} (${langKey}): ${langMapping.defaultValue}`);
              }

              // Convert undefined to null (MySQL doesn't accept undefined)
              if (sourceValue === undefined) {
                sourceValue = null;
              }

              locData[fieldName] = sourceValue;
            }

            // Add audit fields (required in schema)
            locData.CreatedAt = new Date();
            locData.CreatedBy = -1;  // System user
            locData.UpdatedAt = new Date();
            locData.UpdatedBy = -1;

            const locColumns = Object.keys(locData).join(', ');
            const locPlaceholders = Object.keys(locData).map(() => '?').join(', ');
            const locValues = Object.values(locData);

            const locInsertQuery = `INSERT INTO projectlocalization (${locColumns}) VALUES (${locPlaceholders})`;
            await mysqlConnection.execute(locInsertQuery, locValues);
            localizationInsertedCount++;

            logger.debug(`Inserted localization for Project ${newProjectId}, Language ${languageId} (${langKey})`);
          } catch (err) {
            logger.error(`Error inserting localization [Project: ${newProjectId}, Lang: ${langKey}]: ${err.message}`);
            localizationErrors.push({
              projectId: newProjectId,
              language: langKey,
              error: err.message
            });
          }
        }
      }

      logger.info(`Localization migration completed: ${localizationInsertedCount}/${Object.keys(idMappings).length * 3} rows inserted`);
      if (localizationErrors.length > 0) {
        logger.warn(`Localization errors: ${localizationErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    // ===== ProjectItem Migration =====
    let projectItemInsertedCount = 0;
    let projectItemErrors = [];
    const projectItemIdMappings = {}; // Store oldProductId -> [newItemIds]

    // Check if projectItemMappings were provided
    const projectItemMappings = req.body.projectItemMappings;

    if (projectItemMappings && (projectItemMappings.funds || projectItemMappings.collections)) {
      logger.info('='.repeat(60));
      logger.info('Starting ProjectItem migration...');

      // Count expected items
      let expectedItemCount = 0;
      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const sourceRow = rows.find(r => r.sourceId === parseInt(oldProductId));
        if (!sourceRow) continue;

        // Determine ProjectType from const mappings or row data
        const projectTypeMapping = mappings['ProjectType'];
        let projectType = 2; // Default to Collection
        if (projectTypeMapping && projectTypeMapping.value) {
          projectType = parseInt(projectTypeMapping.value);
        }

        if (projectType === 1) {
          expectedItemCount += 1; // Fund: 1 item
        } else if (projectType === 2) {
          expectedItemCount += 2; // Collection: 2 items
        }
      }

      logger.info(`Will create approximately ${expectedItemCount} ProjectItem rows`);

      // Iterate through each project
      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const sourceRow = rows.find(r => r.sourceId === parseInt(oldProductId));

        if (!sourceRow) {
          logger.warn(`Source row not found for oldProductId: ${oldProductId}`);
          continue;
        }

        // Determine ProjectType
        const projectTypeMapping = mappings['ProjectType'];
        let projectType = 2; // Default to Collection
        if (projectTypeMapping && projectTypeMapping.value) {
          projectType = parseInt(projectTypeMapping.value);
        }

        projectItemIdMappings[oldProductId] = [];

        try {
          if (projectType === 1 && projectItemMappings.funds) {
            // Create 1 FundDonation item
            const itemMapping = projectItemMappings.funds;
            const itemData = { ProjectId: newProjectId };

            // Apply mappings
            for (const [fieldName, mapping] of Object.entries(itemMapping)) {
              let value = null;

              if (mapping.convertType === 'const') {
                value = mapping.value;
                if (value === 'GETDATE()' || value === 'NOW()') {
                  value = new Date();
                } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                  // Convert numeric strings to numbers
                  value = parseInt(value, 10);
                }
              } else if (mapping.convertType === 'direct' && mapping.oldColumn) {
                value = sourceRow[mapping.oldColumn];
              } else if (mapping.convertType === 'expression' && mapping.oldColumn) {
                value = sourceRow[mapping.oldColumn];

                // Apply defaultValue if source is NULL
                if ((value === null || value === undefined) && mapping.defaultValue) {
                  if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                    value = new Date();
                  } else {
                    value = mapping.defaultValue;
                    // Convert numeric strings to numbers
                    if (typeof value === 'string' && /^\d+$/.test(value)) {
                      value = parseInt(value, 10);
                    }
                  }
                }

                // Apply expression
                if (mapping.expression) {
                  try {
                    const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
                    value = expressionFunc(value, sourceRow);
                  } catch (exprErr) {
                    logger.error(`Expression evaluation failed for ${fieldName} (funds): ${exprErr.message}`);
                  }
                }

                // Re-apply defaultValue if expression returned null
                if ((value === null || value === undefined) && mapping.defaultValue) {
                  if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                    value = new Date();
                  } else {
                    value = mapping.defaultValue;
                    // Convert numeric strings to numbers
                    if (typeof value === 'string' && /^\d+$/.test(value)) {
                      value = parseInt(value, 10);
                    }
                  }
                }
              }

              // Convert undefined to null, and numeric strings to numbers for MySQL
              if (value === undefined) {
                value = null;
              } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                value = parseInt(value, 10);
              }

              // Final fallback to defaultValue if still null
              if ((value === null || value === undefined) && mapping.defaultValue) {
                if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                  value = new Date();
                } else {
                  value = mapping.defaultValue;
                  if (typeof value === 'string' && /^\d+$/.test(value)) {
                    value = parseInt(value, 10);
                  }
                }
              }

              // Truncate ItemName if too long (max 150 chars)
              if (fieldName === 'ItemName' && typeof value === 'string' && value.length > 150) {
                value = value.substring(0, 150);
              }

              itemData[fieldName] = value;

              // Debug logging for AllowFreeAddPrayerNames
              if (fieldName === 'AllowFreeAddPrayerNames') {
                logger.info(`AllowFreeAddPrayerNames for product ${oldProductId}: sourceValue=${sourceRow['ShowPrayerNames']}, finalValue=${value}, type=${typeof value}, expressionResult=${mapping.expression ? 'applied' : 'none'}`);
              }
            }

            // Insert fund item
            const columns = Object.keys(itemData).join(', ');
            const placeholders = Object.keys(itemData).map(() => '?').join(', ');
            const values = Object.values(itemData).map(v => v === undefined ? null : v);
            const insertQuery = `INSERT INTO projectitem (${columns}) VALUES (${placeholders})`;

            // Debug logging before INSERT
            if (itemData.AllowFreeAddPrayerNames === null || itemData.AllowFreeAddPrayerNames === undefined) {
              logger.warn(`About to INSERT with NULL AllowFreeAddPrayerNames for product ${oldProductId}`);
            }

            const [result] = await mysqlConnection.execute(insertQuery, values);
            projectItemIdMappings[oldProductId].push(result.insertId);
            projectItemInsertedCount++;
            logger.debug(`Created FundDonation item for Project ${newProjectId} (oldProductId: ${oldProductId})`);

          } else if (projectType === 2 && projectItemMappings.collections) {
            // Create 2 items: Certificate + Donation
            const collectionMappings = projectItemMappings.collections;

            // Create Certificate item
            if (collectionMappings.certificate) {
              const itemMapping = collectionMappings.certificate;
              const itemData = { ProjectId: newProjectId };

              // Apply mappings (same logic as above)
              for (const [fieldName, mapping] of Object.entries(itemMapping)) {
                let value = null;

                if (mapping.convertType === 'const') {
                  value = mapping.value;
                  if (value === 'GETDATE()' || value === 'NOW()') {
                    value = new Date();
                  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                    // Convert numeric strings to numbers
                    value = parseInt(value, 10);
                  }
                } else if (mapping.convertType === 'direct' && mapping.oldColumn) {
                  value = sourceRow[mapping.oldColumn];
                } else if (mapping.convertType === 'expression' && mapping.oldColumn) {
                  value = sourceRow[mapping.oldColumn];

                  if ((value === null || value === undefined) && mapping.defaultValue) {
                    if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                      value = new Date();
                    } else {
                      value = mapping.defaultValue;
                      // Convert numeric strings to numbers
                      if (typeof value === 'string' && /^\d+$/.test(value)) {
                        value = parseInt(value, 10);
                      }
                    }
                  }

                  if (mapping.expression) {
                    try {
                      const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
                      value = expressionFunc(value, sourceRow);
                    } catch (exprErr) {
                      logger.error(`Expression evaluation failed for ${fieldName} (certificate): ${exprErr.message}`);
                    }
                  }

                  if ((value === null || value === undefined) && mapping.defaultValue) {
                    if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                      value = new Date();
                    } else {
                      value = mapping.defaultValue;
                      // Convert numeric strings to numbers
                      if (typeof value === 'string' && /^\d+$/.test(value)) {
                        value = parseInt(value, 10);
                      }
                    }
                  }
                }

                // Convert undefined to null, and numeric strings to numbers for MySQL
                if (value === undefined) {
                  value = null;
                } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                  value = parseInt(value, 10);
                }

                // Final fallback to defaultValue if still null
                if ((value === null || value === undefined) && mapping.defaultValue) {
                  if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                    value = new Date();
                  } else {
                    value = mapping.defaultValue;
                    if (typeof value === 'string' && /^\d+$/.test(value)) {
                      value = parseInt(value, 10);
                    }
                  }
                }

                // Truncate ItemName if too long (max 150 chars)
                if (fieldName === 'ItemName' && typeof value === 'string' && value.length > 150) {
                  value = value.substring(0, 150);
                }

                itemData[fieldName] = value;
              }

              const columns = Object.keys(itemData).join(', ');
              const placeholders = Object.keys(itemData).map(() => '?').join(', ');
              const values = Object.values(itemData).map(v => {
                if (v === undefined) return null;
                if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
                return v;
              });
              const insertQuery = `INSERT INTO projectitem (${columns}) VALUES (${placeholders})`;

              const [result] = await mysqlConnection.execute(insertQuery, values);
              projectItemIdMappings[oldProductId].push(result.insertId);
              projectItemInsertedCount++;
              logger.debug(`Created Certificate item for Project ${newProjectId} (oldProductId: ${oldProductId})`);
            }

            // Create Donation item
            if (collectionMappings.donation) {
              const itemMapping = collectionMappings.donation;
              const itemData = { ProjectId: newProjectId };

              // Apply mappings (same logic as above)
              for (const [fieldName, mapping] of Object.entries(itemMapping)) {
                let value = null;

                if (mapping.convertType === 'const') {
                  value = mapping.value;
                  if (value === 'GETDATE()' || value === 'NOW()') {
                    value = new Date();
                  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                    // Convert numeric strings to numbers
                    value = parseInt(value, 10);
                  }
                } else if (mapping.convertType === 'direct' && mapping.oldColumn) {
                  value = sourceRow[mapping.oldColumn];
                } else if (mapping.convertType === 'expression' && mapping.oldColumn) {
                  value = sourceRow[mapping.oldColumn];

                  if ((value === null || value === undefined) && mapping.defaultValue) {
                    if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                      value = new Date();
                    } else {
                      value = mapping.defaultValue;
                      // Convert numeric strings to numbers
                      if (typeof value === 'string' && /^\d+$/.test(value)) {
                        value = parseInt(value, 10);
                      }
                    }
                  }

                  if (mapping.expression) {
                    try {
                      const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
                      value = expressionFunc(value, sourceRow);
                    } catch (exprErr) {
                      logger.error(`Expression evaluation failed for ${fieldName} (donation): ${exprErr.message}`);
                    }
                  }

                  if ((value === null || value === undefined) && mapping.defaultValue) {
                    if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                      value = new Date();
                    } else {
                      value = mapping.defaultValue;
                      // Convert numeric strings to numbers
                      if (typeof value === 'string' && /^\d+$/.test(value)) {
                        value = parseInt(value, 10);
                      }
                    }
                  }
                }

                // Convert undefined to null, and numeric strings to numbers for MySQL
                if (value === undefined) {
                  value = null;
                } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                  value = parseInt(value, 10);
                }

                // Final fallback to defaultValue if still null
                if ((value === null || value === undefined) && mapping.defaultValue) {
                  if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                    value = new Date();
                  } else {
                    value = mapping.defaultValue;
                    if (typeof value === 'string' && /^\d+$/.test(value)) {
                      value = parseInt(value, 10);
                    }
                  }
                }

                // Truncate ItemName if too long (max 150 chars)
                if (fieldName === 'ItemName' && typeof value === 'string' && value.length > 150) {
                  value = value.substring(0, 150);
                }

                itemData[fieldName] = value;
              }

              const columns = Object.keys(itemData).join(', ');
              const placeholders = Object.keys(itemData).map(() => '?').join(', ');
              const values = Object.values(itemData).map(v => {
                if (v === undefined) return null;
                if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
                return v;
              });
              const insertQuery = `INSERT INTO projectitem (${columns}) VALUES (${placeholders})`;

              const [result] = await mysqlConnection.execute(insertQuery, values);
              projectItemIdMappings[oldProductId].push(result.insertId);
              projectItemInsertedCount++;
              logger.debug(`Created Donation item for Project ${newProjectId} (oldProductId: ${oldProductId})`);
            }
          }
        } catch (err) {
          logger.error(`Error creating ProjectItem for oldProductId ${oldProductId}: ${err.message}`);
          projectItemErrors.push({ oldProductId, newProjectId, error: err.message });
        }
      }

      logger.info(`ProjectItem migration completed: ${projectItemInsertedCount} items created`);
      if (projectItemErrors.length > 0) {
        logger.warn(`ProjectItem errors: ${projectItemErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    // ===== ProjectItemLocalization Migration =====
    let projectItemLocInsertedCount = 0;
    let projectItemLocErrors = [];

    // Check if projectItemLocalizationMappings were provided
    const projectItemLocMappings = req.body.projectItemLocalizationMappings;

    if (projectItemLocMappings && Object.keys(projectItemIdMappings).length > 0) {
      logger.info('='.repeat(60));
      logger.info('Starting ProjectItemLocalization migration...');

      const languages = {
        hebrew: 1,
        english: 2,
        french: 3
      };

      // Iterate through each project's items
      for (const [oldProductId, itemIds] of Object.entries(projectItemIdMappings)) {
        const row = rows.find(r => r.sourceId === parseInt(oldProductId));

        if (!row) {
          logger.warn(`Source row not found for oldProductId: ${oldProductId}`);
          continue;
        }

        // For each projectItem created
        for (const itemId of itemIds) {
          // Create localization for each language
          for (const [langName, langId] of Object.entries(languages)) {
            const langMapping = projectItemLocMappings[langName];
            if (!langMapping) {
              logger.debug(`No mapping for language ${langName}, skipping`);
              continue;
            }

            try {
              const locData = {
                ItemId: itemId,
                Language: langId
              };

              // Apply mappings for this language
              for (const [fieldName, mapping] of Object.entries(langMapping)) {
                let value = null;

                if (mapping.convertType === 'const') {
                  value = mapping.value;
                  if (value === 'GETDATE()' || value === 'NOW()') {
                    value = new Date();
                  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                    value = parseInt(value, 10);
                  }
                } else if (mapping.convertType === 'direct' && mapping.oldColumn) {
                  value = row[mapping.oldColumn];
                } else if (mapping.convertType === 'expression') {
                  // Get the source value if oldColumn specified
                  if (mapping.oldColumn) {
                    value = row[mapping.oldColumn];
                  }

                  // Apply expression
                  if (mapping.expression) {
                    try {
                      const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
                      value = expressionFunc(value, row);
                    } catch (exprErr) {
                      logger.error(`Expression evaluation failed for ${fieldName} (${langName}): ${exprErr.message}`);
                    }
                  }
                }

                // Apply defaultValue if value is null
                if ((value === null || value === undefined) && mapping.defaultValue !== undefined) {
                  if (mapping.defaultValue === 'GETDATE()' || mapping.defaultValue === 'NOW()') {
                    value = new Date();
                  } else {
                    value = mapping.defaultValue;
                  }
                }

                // Convert undefined to null, and numeric strings to numbers
                if (value === undefined) {
                  value = null;
                } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                  value = parseInt(value, 10);
                }

                // Truncate string fields if needed
                if (fieldName === 'Title' && typeof value === 'string' && value.length > 150) {
                  value = value.substring(0, 150);
                }
                if (fieldName === 'NameForReceipt' && typeof value === 'string' && value.length > 150) {
                  value = value.substring(0, 150);
                }

                locData[fieldName] = value;
              }

              // Insert projectItemLocalization record
              const columns = Object.keys(locData).join(', ');
              const placeholders = Object.keys(locData).map(() => '?').join(', ');
              const values = Object.values(locData).map(v => v === undefined ? null : v);
              const insertQuery = `INSERT INTO projectitemlocalization (${columns}) VALUES (${placeholders})`;

              await mysqlConnection.query(insertQuery, values);
              projectItemLocInsertedCount++;
              logger.debug(`Created ProjectItemLocalization for ItemId ${itemId}, language ${langName}`);

            } catch (err) {
              logger.error(`Error creating ProjectItemLocalization for ItemId ${itemId}, language ${langName}: ${err.message}`);
              projectItemLocErrors.push({ itemId, language: langName, error: err.message });
            }
          }
        }
      }

      logger.info(`ProjectItemLocalization migration completed: ${projectItemLocInsertedCount} rows created`);
      if (projectItemLocErrors.length > 0) {
        logger.warn(`ProjectItemLocalization errors: ${projectItemLocErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    // ===== Media Migration =====
    let mediaInsertedCount = 0;
    let mediaErrors = [];
    const mediaIdMappings = {}; // Store oldProductId -> { language -> { mediaType -> mediaId } }

    // Check if mediaMappings were provided
    const mediaMappings = req.body.mediaMappings;

    if (mediaMappings) {
      logger.info('='.repeat(60));
      logger.info('Starting Media migration...');

      // Iterate through each project
      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const row = rows.find(r => r.sourceId === parseInt(oldProductId));

        if (!row) {
          logger.warn(`Source row not found for oldProductId: ${oldProductId}`);
          continue;
        }

        mediaIdMappings[oldProductId] = {};

        // Process each language (hebrew, french, english)
        for (const [languageName, languageMappings] of Object.entries(mediaMappings)) {
          mediaIdMappings[oldProductId][languageName] = {};

          // Process each media type (projectImage, projectVideo, donationBanner)
          for (const [mediaTypeName, mediaMapping] of Object.entries(languageMappings)) {
            try {
              // Check condition if specified
              if (mediaMapping.condition) {
                const conditionResult = eval(mediaMapping.condition);
                if (!conditionResult) {
                  logger.debug(`Skipping ${languageName}.${mediaTypeName} for product ${oldProductId} - condition not met`);
                  continue;
                }
              }

              const mediaData = {};

              // Apply mappings
              for (const [fieldName, mapping] of Object.entries(mediaMapping)) {
                if (fieldName === 'condition') continue; // Skip condition field

                let value = null;

                if (mapping.convertType === 'const') {
                  value = mapping.value;
                  if (value === 'GETDATE()' || value === 'NOW()') {
                    value = new Date();
                  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                    value = parseInt(value, 10);
                  }
                } else if (mapping.convertType === 'direct' && mapping.oldColumn) {
                  value = row[mapping.oldColumn];
                } else if (mapping.convertType === 'expression' && mapping.oldColumn) {
                  value = row[mapping.oldColumn];

                  // Apply expression if provided
                  if (mapping.expression) {
                    try {
                      value = eval(mapping.expression);
                    } catch (err) {
                      logger.warn(`Expression evaluation failed for ${fieldName}: ${err.message}`);
                    }
                  }
                }

                // Convert undefined to null
                if (value === undefined) {
                  value = null;
                } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                  value = parseInt(value, 10);
                }

                mediaData[fieldName] = value;
              }

              // Insert media record
              const columns = Object.keys(mediaData).join(', ');
              const placeholders = Object.keys(mediaData).map(() => '?').join(', ');
              const values = Object.values(mediaData).map(v => v === undefined ? null : v);
              const insertQuery = `INSERT INTO media (${columns}) VALUES (${placeholders})`;

              const [result] = await mysqlConnection.execute(insertQuery, values);
              mediaIdMappings[oldProductId][languageName][mediaTypeName] = result.insertId;
              mediaInsertedCount++;
              logger.debug(`Created ${languageName}.${mediaTypeName} for Project ${newProjectId} (Media ID: ${result.insertId})`);

            } catch (err) {
              logger.error(`Error creating Media (${languageName}.${mediaTypeName}) for oldProductId ${oldProductId}: ${err.message}`);
              mediaErrors.push({
                oldProductId,
                newProjectId,
                language: languageName,
                mediaType: mediaTypeName,
                error: err.message
              });
            }
          }
        }
      }

      logger.info(`Media migration completed: ${mediaInsertedCount} media records created`);
      if (mediaErrors.length > 0) {
        logger.warn(`Media errors: ${mediaErrors.length}`);
      }
      logger.info('='.repeat(60));

      // ===== Update MainMedia FK in Project table =====
      logger.info('='.repeat(60));
      logger.info('Updating MainMedia FK in Project table...');

      let mainMediaUpdatedCount = 0;
      let mainMediaUpdateErrors = [];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        try {
          // Get hebrew media IDs with fallback priority: projectImage → projectVideo → donationBanner
          const hebrewProjectImageId = mediaIdMappings[oldProductId]?.hebrew?.projectImage;
          const hebrewProjectVideoId = mediaIdMappings[oldProductId]?.hebrew?.projectVideo;
          const hebrewDonationBannerId = mediaIdMappings[oldProductId]?.hebrew?.donationBanner;

          const mainMediaId = hebrewProjectImageId || hebrewProjectVideoId || hebrewDonationBannerId;

          if (mainMediaId) {
            const updateQuery = `UPDATE project SET MainMedia = ? WHERE Id = ?`;
            await mysqlConnection.execute(updateQuery, [mainMediaId, newProjectId]);
            mainMediaUpdatedCount++;

            const mediaType = hebrewProjectImageId ? 'projectImage' :
                             hebrewProjectVideoId ? 'projectVideo' : 'donationBanner';
            logger.debug(`Updated Project ${newProjectId} MainMedia to ${mainMediaId} (hebrew.${mediaType})`);
          } else {
            logger.debug(`No hebrew media found for Project ${newProjectId}, skipping MainMedia update`);
          }
        } catch (err) {
          logger.error(`Error updating MainMedia for Project ${newProjectId}: ${err.message}`);
          mainMediaUpdateErrors.push({
            projectId: newProjectId,
            error: err.message
          });
        }
      }

      logger.info(`MainMedia FK update completed: ${mainMediaUpdatedCount} projects updated`);
      if (mainMediaUpdateErrors.length > 0) {
        logger.warn(`MainMedia update errors: ${mainMediaUpdateErrors.length}`);
      }
      logger.info('='.repeat(60));

      // ===== Update MainMedia FK in ProjectLocalization table by language =====
      logger.info('='.repeat(60));
      logger.info('Updating MainMedia FK in ProjectLocalization table by language...');

      let localizationMainMediaUpdatedCount = 0;
      let localizationMainMediaUpdateErrors = [];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        // Update Hebrew projectLocalization (Language=1)
        try {
          // Get hebrew media IDs with fallback priority: projectImage → projectVideo → donationBanner
          const hebrewProjectImageId = mediaIdMappings[oldProductId]?.hebrew?.projectImage;
          const hebrewProjectVideoId = mediaIdMappings[oldProductId]?.hebrew?.projectVideo;
          const hebrewDonationBannerId = mediaIdMappings[oldProductId]?.hebrew?.donationBanner;

          const hebrewMainMediaId = hebrewProjectImageId || hebrewProjectVideoId || hebrewDonationBannerId;

          if (hebrewMainMediaId) {
            const updateQuery = `UPDATE projectlocalization SET MainMedia = ? WHERE ProjectId = ? AND Language = 1`;
            await mysqlConnection.execute(updateQuery, [hebrewMainMediaId, newProjectId]);
            localizationMainMediaUpdatedCount++;

            const mediaType = hebrewProjectImageId ? 'projectImage' :
                             hebrewProjectVideoId ? 'projectVideo' : 'donationBanner';
            logger.debug(`Updated ProjectLocalization (Hebrew) for Project ${newProjectId} MainMedia to ${hebrewMainMediaId} (hebrew.${mediaType})`);
          } else {
            logger.debug(`No hebrew media found for Project ${newProjectId}, skipping Hebrew MainMedia update`);
          }
        } catch (err) {
          logger.error(`Error updating Hebrew MainMedia for ProjectLocalization ${newProjectId}: ${err.message}`);
          localizationMainMediaUpdateErrors.push({
            projectId: newProjectId,
            language: 'Hebrew',
            error: err.message
          });
        }

        // Update English projectLocalization (Language=2)
        try {
          // Get english media IDs with fallback priority: projectImage → projectVideo → donationBanner
          const englishProjectImageId = mediaIdMappings[oldProductId]?.english?.projectImage;
          const englishProjectVideoId = mediaIdMappings[oldProductId]?.english?.projectVideo;
          const englishDonationBannerId = mediaIdMappings[oldProductId]?.english?.donationBanner;

          const englishMainMediaId = englishProjectImageId || englishProjectVideoId || englishDonationBannerId;

          if (englishMainMediaId) {
            const updateQuery = `UPDATE projectlocalization SET MainMedia = ? WHERE ProjectId = ? AND Language = 2`;
            await mysqlConnection.execute(updateQuery, [englishMainMediaId, newProjectId]);
            localizationMainMediaUpdatedCount++;

            const mediaType = englishProjectImageId ? 'projectImage' :
                             englishProjectVideoId ? 'projectVideo' : 'donationBanner';
            logger.debug(`Updated ProjectLocalization (English) for Project ${newProjectId} MainMedia to ${englishMainMediaId} (english.${mediaType})`);
          } else {
            logger.debug(`No english media found for Project ${newProjectId}, skipping English MainMedia update`);
          }
        } catch (err) {
          logger.error(`Error updating English MainMedia for ProjectLocalization ${newProjectId}: ${err.message}`);
          localizationMainMediaUpdateErrors.push({
            projectId: newProjectId,
            language: 'English',
            error: err.message
          });
        }

        // Update French projectLocalization (Language=3)
        try {
          // Get french media IDs with fallback priority: projectImage → projectVideo → donationBanner
          const frenchProjectImageId = mediaIdMappings[oldProductId]?.french?.projectImage;
          const frenchProjectVideoId = mediaIdMappings[oldProductId]?.french?.projectVideo;
          const frenchDonationBannerId = mediaIdMappings[oldProductId]?.french?.donationBanner;

          const frenchMainMediaId = frenchProjectImageId || frenchProjectVideoId || frenchDonationBannerId;

          if (frenchMainMediaId) {
            const updateQuery = `UPDATE projectlocalization SET MainMedia = ? WHERE ProjectId = ? AND Language = 3`;
            await mysqlConnection.execute(updateQuery, [frenchMainMediaId, newProjectId]);
            localizationMainMediaUpdatedCount++;

            const mediaType = frenchProjectImageId ? 'projectImage' :
                             frenchProjectVideoId ? 'projectVideo' : 'donationBanner';
            logger.debug(`Updated ProjectLocalization (French) for Project ${newProjectId} MainMedia to ${frenchMainMediaId} (french.${mediaType})`);
          } else {
            logger.debug(`No french media found for Project ${newProjectId}, skipping French MainMedia update`);
          }
        } catch (err) {
          logger.error(`Error updating French MainMedia for ProjectLocalization ${newProjectId}: ${err.message}`);
          localizationMainMediaUpdateErrors.push({
            projectId: newProjectId,
            language: 'French',
            error: err.message
          });
        }
      }

      logger.info(`ProjectLocalization MainMedia FK update completed: ${localizationMainMediaUpdatedCount} rows updated`);
      if (localizationMainMediaUpdateErrors.length > 0) {
        logger.warn(`ProjectLocalization MainMedia update errors: ${localizationMainMediaUpdateErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    // ===== LinkSetting Migration =====
    let linkSettingInsertedCount = 0;
    let linkSettingErrors = [];
    const linkSettingIdMappings = {}; // Store oldProductId -> { language -> linkSettingId }

    // Check if we have ProjectItem records to create LinkSettings for
    if (Object.keys(projectItemIdMappings).length > 0) {
      logger.info('='.repeat(60));
      logger.info('Starting LinkSetting migration...');
      logger.info('Creating Main Button LinkSettings for each language...');

      // Language configurations based on mapping lines 1870-1893, 2041-2054, 2210-2224
      const languageConfigs = [
        { language: 1, name: 'Hebrew', linkText: 'לתרומה' },
        { language: 3, name: 'French', linkText: 'Pour faire un don' },
        { language: 2, name: 'English', linkText: 'Donate' }
      ];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const itemIds = projectItemIdMappings[oldProductId];

        if (!itemIds || itemIds.length === 0) {
          logger.debug(`No ProjectItem found for oldProductId ${oldProductId}, skipping LinkSetting creation`);
          continue;
        }

        // Get the first (and typically only) item ID for this project
        const itemId = itemIds[0];
        linkSettingIdMappings[oldProductId] = {};

        // Create LinkSetting for each language
        for (const langConfig of languageConfigs) {
          try {
            const linkSettingData = {
              LinkType: 1, // button
              LinkTargetType: 3, // Link to Execution Page
              ProjectId: newProjectId,
              ItemId: itemId,
              LinkText: langConfig.linkText,
              CreatedAt: new Date(),
              CreatedBy: 1, // System user
              UpdatedAt: new Date(),
              UpdatedBy: 1 // System user
            };

            const columns = Object.keys(linkSettingData).join(', ');
            const placeholders = Object.keys(linkSettingData).map(() => '?').join(', ');
            const values = Object.values(linkSettingData);

            const insertQuery = `INSERT INTO linksetting (${columns}) VALUES (${placeholders})`;
            const [result] = await mysqlConnection.execute(insertQuery, values);

            linkSettingIdMappings[oldProductId][langConfig.language] = result.insertId;
            linkSettingInsertedCount++;
            logger.debug(`Created ${langConfig.name} LinkSetting ${result.insertId} for Project ${newProjectId}, Item ${itemId}`);

          } catch (err) {
            logger.error(`Error creating ${langConfig.name} LinkSetting for Project ${newProjectId}, Item ${itemId}: ${err.message}`);
            linkSettingErrors.push({ oldProductId, newProjectId, itemId, language: langConfig.name, error: err.message });
          }
        }
      }

      logger.info(`LinkSetting migration completed: ${linkSettingInsertedCount} records created (${linkSettingInsertedCount / 3} projects × 3 languages)`);
      if (linkSettingErrors.length > 0) {
        logger.warn(`LinkSetting errors: ${linkSettingErrors.length}`);
      }
      logger.info('='.repeat(60));

      // ===== Update ProjectLocalization.MainLinkButtonSettingId =====
      logger.info('='.repeat(60));
      logger.info('Updating ProjectLocalization.MainLinkButtonSettingId...');

      let localizationLinkUpdatedCount = 0;
      let localizationLinkUpdateErrors = [];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const linkSettingIds = linkSettingIdMappings[oldProductId];

        if (!linkSettingIds || Object.keys(linkSettingIds).length === 0) {
          logger.debug(`No LinkSettings found for oldProductId ${oldProductId}, skipping MainLinkButtonSettingId update`);
          continue;
        }

        // Update each language's ProjectLocalization record
        for (const [language, linkSettingId] of Object.entries(linkSettingIds)) {
          try {
            const updateQuery = `UPDATE projectlocalization SET MainLinkButtonSettingId = ? WHERE ProjectId = ? AND Language = ?`;
            await mysqlConnection.execute(updateQuery, [linkSettingId, newProjectId, parseInt(language)]);

            localizationLinkUpdatedCount++;
            const langName = language === '1' ? 'Hebrew' : language === '2' ? 'English' : 'French';
            logger.debug(`Updated ${langName} ProjectLocalization for Project ${newProjectId} with LinkSetting ${linkSettingId}`);

          } catch (err) {
            logger.error(`Error updating ProjectLocalization for Project ${newProjectId}, Language ${language}: ${err.message}`);
            localizationLinkUpdateErrors.push({ oldProductId, newProjectId, language, error: err.message });
          }
        }
      }

      logger.info(`ProjectLocalization.MainLinkButtonSettingId update completed: ${localizationLinkUpdatedCount} rows updated`);
      if (localizationLinkUpdateErrors.length > 0) {
        logger.warn(`ProjectLocalization MainLinkButtonSettingId update errors: ${localizationLinkUpdateErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    // ===== LinkSettingInListView Migration =====
    let linkSettingListViewInsertedCount = 0;
    let linkSettingListViewErrors = [];
    const linkSettingListViewIdMappings = {}; // Store oldProductId -> { language -> linkSettingId }

    // Create LinkSettingInListView for each ProjectLocalization
    if (localizationInsertedCount > 0) {
      logger.info('='.repeat(60));
      logger.info('Starting LinkSettingInListView migration...');
      logger.info('Creating List View LinkSettings for each language...');

      // Language configurations
      const languageConfigs = [
        { language: 1, name: 'Hebrew' },
        { language: 3, name: 'French' },
        { language: 2, name: 'English' }
      ];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        linkSettingListViewIdMappings[oldProductId] = {};

        // Create LinkSettingInListView for each language
        for (const langConfig of languageConfigs) {
          try {
            const linkSettingData = {
              LinkType: 3,
              LinkTargetType: 1,
              ProjectId: newProjectId,
              ItemId: null,
              LinkText: null,
              CreatedAt: new Date(),
              CreatedBy: 1, // System user
              UpdatedAt: new Date(),
              UpdatedBy: 1 // System user
            };

            const columns = Object.keys(linkSettingData).join(', ');
            const placeholders = Object.keys(linkSettingData).map(() => '?').join(', ');
            const values = Object.values(linkSettingData);

            const insertQuery = `INSERT INTO linksetting (${columns}) VALUES (${placeholders})`;
            const [result] = await mysqlConnection.execute(insertQuery, values);

            linkSettingListViewIdMappings[oldProductId][langConfig.language] = result.insertId;
            linkSettingListViewInsertedCount++;
            logger.debug(`Created ${langConfig.name} LinkSettingInListView ${result.insertId} for Project ${newProjectId}`);

          } catch (err) {
            logger.error(`Error creating ${langConfig.name} LinkSettingInListView for Project ${newProjectId}: ${err.message}`);
            linkSettingListViewErrors.push({ oldProductId, newProjectId, language: langConfig.name, error: err.message });
          }
        }
      }

      logger.info(`LinkSettingInListView migration completed: ${linkSettingListViewInsertedCount} records created (${linkSettingListViewInsertedCount / 3} projects × 3 languages)`);
      if (linkSettingListViewErrors.length > 0) {
        logger.warn(`LinkSettingInListView errors: ${linkSettingListViewErrors.length}`);
      }
      logger.info('='.repeat(60));

      // ===== Update ProjectLocalization.LinkSettingIdInListView =====
      logger.info('='.repeat(60));
      logger.info('Updating ProjectLocalization.LinkSettingIdInListView...');

      let localizationListViewLinkUpdatedCount = 0;
      let localizationListViewLinkUpdateErrors = [];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const linkSettingIds = linkSettingListViewIdMappings[oldProductId];

        if (!linkSettingIds || Object.keys(linkSettingIds).length === 0) {
          logger.debug(`No LinkSettingsInListView found for oldProductId ${oldProductId}, skipping LinkSettingIdInListView update`);
          continue;
        }

        // Update each language's ProjectLocalization record
        for (const [language, linkSettingId] of Object.entries(linkSettingIds)) {
          try {
            const updateQuery = `UPDATE projectlocalization SET LinkSettingIdInListView = ? WHERE ProjectId = ? AND Language = ?`;
            await mysqlConnection.execute(updateQuery, [linkSettingId, newProjectId, parseInt(language)]);

            localizationListViewLinkUpdatedCount++;
            const langName = language === '1' ? 'Hebrew' : language === '2' ? 'English' : 'French';
            logger.debug(`Updated ${langName} ProjectLocalization for Project ${newProjectId} with LinkSettingIdInListView ${linkSettingId}`);

          } catch (err) {
            logger.error(`Error updating ProjectLocalization.LinkSettingIdInListView for Project ${newProjectId}, Language ${language}: ${err.message}`);
            localizationListViewLinkUpdateErrors.push({ oldProductId, newProjectId, language, error: err.message });
          }
        }
      }

      logger.info(`ProjectLocalization.LinkSettingIdInListView update completed: ${localizationListViewLinkUpdatedCount} rows updated`);
      if (localizationListViewLinkUpdateErrors.length > 0) {
        logger.warn(`ProjectLocalization LinkSettingIdInListView update errors: ${localizationListViewLinkUpdateErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    // ===== EntityContent & EntityContentItem Migration =====
    let contentInsertedCount = 0;
    let contentItemInsertedCount = 0;
    let contentErrors = [];
    const contentIdMappings = {}; // Store oldProductId -> { language -> contentId }

    // Only create EntityContent if we have ProjectLocalization records
    if (localizationInsertedCount > 0) {
      logger.info('='.repeat(60));
      logger.info('Starting EntityContent migration...');

      // Language configurations
      const languageConfigs = [
        { language: 1, name: 'Hebrew', descriptionField: 'Description' },
        { language: 3, name: 'French', descriptionField: 'Description_fr' },
        { language: 2, name: 'English', descriptionField: 'Description_en' }
      ];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        contentIdMappings[oldProductId] = {};

        // Get the description fields from the original product
        const productResult = await mssqlPool.request()
          .input('productId', sql.Int, oldProductId)
          .query(`SELECT Description, Description_en, Description_fr FROM Products WHERE productsid = @productId`);

        if (productResult.recordset.length === 0) {
          logger.warn(`Product ${oldProductId} not found in source DB`);
          continue;
        }

        const product = productResult.recordset[0];

        // Create EntityContent for each language
        for (const langConfig of languageConfigs) {
          const descriptionContent = product[langConfig.descriptionField];

          // Skip if description is null or empty
          if (!descriptionContent || descriptionContent.trim() === '') {
            logger.debug(`No ${langConfig.name} content for Product ${oldProductId}, skipping EntityContent creation`);
            contentIdMappings[oldProductId][langConfig.language] = null;
            continue;
          }

          try {
            // Create EntityContent
            const contentData = {
              Name: null, // As specified
              IsTemplate: 0,
              CreatedAt: new Date(),
              CreatedBy: 1 // System user
            };

            const contentColumns = Object.keys(contentData).join(', ');
            const contentPlaceholders = Object.keys(contentData).map(() => '?').join(', ');
            const contentValues = Object.values(contentData);

            const contentQuery = `INSERT INTO entitycontent (${contentColumns}) VALUES (${contentPlaceholders})`;
            const [contentResult] = await mysqlConnection.execute(contentQuery, contentValues);

            const contentId = contentResult.insertId;
            contentIdMappings[oldProductId][langConfig.language] = contentId;
            contentInsertedCount++;
            logger.debug(`Created ${langConfig.name} EntityContent ${contentId} for Project ${newProjectId}`);

            // Create EntityContentItem with ItemType = 11
            const contentItemData = {
              ContentId: contentId,
              ItemType: 11, // As specified
              ItemDefinition: JSON.stringify({ Text: descriptionContent }), // Keep HTML as-is for now
              Name: null,
              CreatedAt: new Date(),
              CreatedBy: 1, // System user
              UpdatedAt: new Date(),
              UpdatedBy: 1 // System user
            };

            const itemColumns = Object.keys(contentItemData).join(', ');
            const itemPlaceholders = Object.keys(contentItemData).map(() => '?').join(', ');
            const itemValues = Object.values(contentItemData);

            const itemQuery = `INSERT INTO entitycontentitem (${itemColumns}) VALUES (${itemPlaceholders})`;
            const [itemResult] = await mysqlConnection.execute(itemQuery, itemValues);

            contentItemInsertedCount++;
            logger.debug(`Created EntityContentItem ${itemResult.insertId} for EntityContent ${contentId}`);

          } catch (err) {
            logger.error(`Error creating ${langConfig.name} EntityContent for Project ${newProjectId}: ${err.message}`);
            contentErrors.push({
              oldProductId,
              newProjectId,
              language: langConfig.name,
              error: err.message
            });
          }
        }
      }

      logger.info(`EntityContent migration completed: ${contentInsertedCount} records created`);
      logger.info(`EntityContentItem migration completed: ${contentItemInsertedCount} records created`);
      if (contentErrors.length > 0) {
        logger.warn(`EntityContent errors: ${contentErrors.length}`);
      }
      logger.info('='.repeat(60));

      // ===== Update ProjectLocalization.ContentId =====
      logger.info('='.repeat(60));
      logger.info('Updating ProjectLocalization.ContentId...');

      let localizationContentUpdatedCount = 0;
      let localizationContentUpdateErrors = [];

      for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
        const contentIds = contentIdMappings[oldProductId];

        if (!contentIds || Object.keys(contentIds).length === 0) {
          logger.debug(`No EntityContent found for oldProductId ${oldProductId}, skipping ContentId update`);
          continue;
        }

        // Update each language's ProjectLocalization record
        for (const [language, contentId] of Object.entries(contentIds)) {
          if (contentId === null) {
            // Skip null content IDs (where description was empty)
            continue;
          }

          try {
            const updateQuery = `UPDATE projectlocalization SET ContentId = ? WHERE ProjectId = ? AND Language = ?`;
            await mysqlConnection.execute(updateQuery, [contentId, newProjectId, parseInt(language)]);

            localizationContentUpdatedCount++;
            const langName = language === '1' ? 'Hebrew' : language === '2' ? 'English' : 'French';
            logger.debug(`Updated ${langName} ProjectLocalization for Project ${newProjectId} with ContentId ${contentId}`);

          } catch (err) {
            logger.error(`Error updating ProjectLocalization ContentId for Project ${newProjectId}, Language ${language}: ${err.message}`);
            localizationContentUpdateErrors.push({
              oldProductId,
              newProjectId,
              language,
              error: err.message
            });
          }
        }
      }

      logger.info(`ProjectLocalization.ContentId update completed: ${localizationContentUpdatedCount} rows updated`);
      if (localizationContentUpdateErrors.length > 0) {
        logger.warn(`ProjectLocalization ContentId update errors: ${localizationContentUpdateErrors.length}`);
      }
      logger.info('='.repeat(60));
    }

    await mssqlPool.close();
    await mysqlConnection.end();

    logger.info('='.repeat(60));
    logger.info(`Migration completed: ${insertedCount}/${rows.length} rows inserted successfully`);
    if (errors.length > 0) {
      logger.warn(`Total errors: ${errors.length}`);
      errors.slice(0, 10).forEach((err, idx) => {
        logger.error(`Error ${idx + 1} [Row ID: ${err.rowId}]: ${err.error}`);
      });
      if (errors.length > 10) {
        logger.warn(`... and ${errors.length - 10} more errors (see full log above)`);
      }
    }
    logger.info('='.repeat(60));

    const response = {
      success: true,
      message: `Migration completed! Inserted ${insertedCount} out of ${rows.length} rows.`,
      project: {
        insertedCount,
        totalRows: rows.length,
        errors: errors.slice(0, 10) // Return first 10 errors
      }
    };

    // Add localization stats if applicable
    if (localizationInsertedCount > 0 || localizationErrors.length > 0) {
      response.projectLocalization = {
        insertedCount: localizationInsertedCount,
        totalRows: Object.keys(idMappings).length * 3,
        errors: localizationErrors.slice(0, 10)
      };
      response.message += ` + ${localizationInsertedCount} localization rows.`;
    }

    // Add projectItem stats if applicable
    if (projectItemInsertedCount > 0 || projectItemErrors.length > 0) {
      response.projectItem = {
        insertedCount: projectItemInsertedCount,
        errors: projectItemErrors.slice(0, 10)
      };
      response.message += ` + ${projectItemInsertedCount} projectItem rows.`;
    }

    // Add projectItemLocalization stats if applicable
    if (projectItemLocInsertedCount > 0 || projectItemLocErrors.length > 0) {
      response.projectItemLocalization = {
        insertedCount: projectItemLocInsertedCount,
        errors: projectItemLocErrors.slice(0, 10)
      };
      response.message += ` + ${projectItemLocInsertedCount} projectItemLocalization rows.`;
    }

    // Add media stats if applicable
    if (mediaInsertedCount > 0 || mediaErrors.length > 0) {
      response.media = {
        insertedCount: mediaInsertedCount,
        errors: mediaErrors.slice(0, 10)
      };
      response.message += ` + ${mediaInsertedCount} media records.`;
    }

    // Add linkSetting stats if applicable
    if (linkSettingInsertedCount > 0 || linkSettingErrors.length > 0) {
      response.linkSetting = {
        insertedCount: linkSettingInsertedCount,
        errors: linkSettingErrors.slice(0, 10)
      };
      response.message += ` + ${linkSettingInsertedCount} linkSetting records.`;
    }

    // Add linkSettingListView stats if applicable
    if (linkSettingListViewInsertedCount > 0 || linkSettingListViewErrors.length > 0) {
      response.linkSettingListView = {
        insertedCount: linkSettingListViewInsertedCount,
        errors: linkSettingListViewErrors.slice(0, 10)
      };
      response.message += ` + ${linkSettingListViewInsertedCount} linkSettingListView records.`;
    }

    // Add entityContent stats if applicable
    if (contentInsertedCount > 0 || contentErrors.length > 0) {
      response.entityContent = {
        insertedCount: contentInsertedCount,
        contentItemInsertedCount: contentItemInsertedCount,
        errors: contentErrors.slice(0, 10)
      };
      response.message += ` + ${contentInsertedCount} entityContent records + ${contentItemInsertedCount} entityContentItem records.`;
    }

    res.json(response);

  } catch (error) {
    logger.error('Migration failed with error: ' + error.message);
    logger.error('Stack trace: ' + error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check projectItem table status
app.get('/api/check-projectitem', async (req, res) => {
  try {
    if (!mysqlConfig) {
      return res.status(400).json({ success: false, message: 'MySQL connection not configured' });
    }

    const connection = await mysql.createConnection({ ...mysqlConfig, charset: 'utf8mb4' });

    try {
      // Get total counts
      const [countRows] = await connection.execute(`
        SELECT
          COUNT(*) as total_rows,
          SUM(CASE WHEN AllowFreeAddPrayerNames IS NULL THEN 1 ELSE 0 END) as null_count,
          SUM(CASE WHEN AllowFreeAddPrayerNames IS NOT NULL THEN 1 ELSE 0 END) as non_null_count
        FROM projectItem
      `);

      // Get value distribution
      const [distribution] = await connection.execute(`
        SELECT
          AllowFreeAddPrayerNames,
          COUNT(*) as count
        FROM projectItem
        GROUP BY AllowFreeAddPrayerNames
        ORDER BY AllowFreeAddPrayerNames
      `);

      // Get sample of NULL rows if any exist
      let nullSamples = [];
      if (countRows[0].null_count > 0) {
        const [samples] = await connection.execute(`
          SELECT ProjectId, ItemName, AllowFreeAddPrayerNames
          FROM projectItem
          WHERE AllowFreeAddPrayerNames IS NULL
          LIMIT 10
        `);
        nullSamples = samples;
      }

      res.json({
        success: true,
        summary: countRows[0],
        distribution: distribution,
        nullSamples: nullSamples
      });

    } finally {
      await connection.end();
    }

  } catch (error) {
    logger.error('Check projectItem failed: ' + error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Migration Helper running at http://localhost:${PORT}`);
  logger.info('Logs are being written to migration-logs.log');
});
