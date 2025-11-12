const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const sql = require('mssql');
const mysql = require('mysql2/promise');
const winston = require('winston');

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
app.use(express.json());

// Store connection configs (in production, use environment variables or secure storage)
let mssqlConfig = null;
let mysqlConfig = null;

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
    mysqlConfig = { host, database, user, password };

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

// Save complete mapping (column mappings + FK mappings + localization mappings + projectItem mappings)
app.post('/api/save-mapping', (req, res) => {
  try {
    const { filename, columnMappings, fkMappings, localizationMappings, projectItemMappings, whereClause } = req.body;

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
        columnMappings: mappingData.columnMappings || {},
        fkMappings: mappingData.fkMappings || {},
        localizationMappings: mappingData.localizationMappings || {},
        projectItemMappings: mappingData.projectItemMappings || {},
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

    // Connect to MySQL
    logger.info('Connecting to MySQL...');
    const mysqlConnection = await mysql.createConnection(mysqlConfig);
    logger.info('MySQL connected successfully');

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
          const fkMappingPath = path.join(__dirname, 'fk-mappings', `${targetCol}.json`);
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

      const selectColumns = Array.from(selectColumnsSet).join(', ');

      // Always include the source table's ID column for tracking
      let selectQuery = `SELECT productsid, ${selectColumns} FROM ${sourceTable}`;

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
        const oldProductId = row.productsid;

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
        const sourceRow = rows.find(r => r.productsid === parseInt(oldProductId));

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
        const sourceRow = rows.find(r => r.productsid === parseInt(oldProductId));
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
        const sourceRow = rows.find(r => r.productsid === parseInt(oldProductId));

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

    const connection = await mysql.createConnection(mysqlConfig);

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
