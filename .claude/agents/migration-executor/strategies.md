# Migration Execution Strategies

## Strategy Patterns

### 1. Batch Processing Strategy
For large datasets, process in batches to avoid memory issues:

```javascript
const BATCH_SIZE = 1000;

async function migrateBatch(table, mapping, offset = 0) {
  const query = `SELECT * FROM ${table}
                 ORDER BY id
                 OFFSET ${offset} ROWS
                 FETCH NEXT ${BATCH_SIZE} ROWS ONLY`;

  const batch = await sourceDb.query(query);

  if (batch.length === 0) return;

  await processBatch(batch, mapping);

  // Recursive call for next batch
  await migrateBatch(table, mapping, offset + BATCH_SIZE);
}
```

### 2. Transaction Strategy
Ensure atomicity for related records:

```javascript
async function migrateWithTransaction(projectRow) {
  const transaction = await targetDb.beginTransaction();

  try {
    // Insert project
    const projectId = await insertProject(projectRow, transaction);

    // Insert localizations (3 languages)
    await insertLocalizations(projectId, projectRow, transaction);

    // Insert project items
    await insertProjectItems(projectId, projectRow, transaction);

    await transaction.commit();
    return { success: true, projectId };
  } catch (error) {
    await transaction.rollback();
    return { success: false, error: error.message };
  }
}
```

### 3. Parallel Processing Strategy
For independent tables, use parallel execution:

```javascript
async function migrateIndependentTables() {
  const independentTables = [
    'lutprojecttype',
    'terminal',
    'lutrecordstatus',
    'media'
  ];

  const migrations = independentTables.map(table =>
    migrateTable(table, mappings[table])
  );

  const results = await Promise.allSettled(migrations);

  return results.map((result, index) => ({
    table: independentTables[index],
    ...result
  }));
}
```

### 4. Retry Strategy with Exponential Backoff
For handling transient failures:

```javascript
async function retryWithBackoff(operation, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 5. Progressive Migration Strategy
Migrate in stages with validation:

```javascript
async function progressiveMigration() {
  const stages = [
    {
      name: 'Core Tables',
      tables: ['project'],
      validate: validateProjects
    },
    {
      name: 'Localizations',
      tables: ['projectlocalization'],
      validate: validateLocalizations
    },
    {
      name: 'Items',
      tables: ['projectitem', 'projectitemlocalization'],
      validate: validateItems
    }
  ];

  for (const stage of stages) {
    console.log(`Starting stage: ${stage.name}`);

    for (const table of stage.tables) {
      await migrateTable(table);
    }

    const valid = await stage.validate();
    if (!valid) {
      throw new Error(`Stage ${stage.name} validation failed`);
    }
  }
}
```

## Special Case Strategies

### ProjectItem Creation Strategy

```javascript
async function createProjectItems(projectId, oldRow, projectType) {
  const strategies = {
    1: createFundsItem,    // Single item
    2: createCollectionItems // Two items
  };

  const strategy = strategies[projectType];
  if (!strategy) {
    throw new Error(`Unknown ProjectType: ${projectType}`);
  }

  return await strategy(projectId, oldRow);
}

async function createFundsItem(projectId, oldRow) {
  return await insertProjectItem({
    ProjectId: projectId,
    ItemName: oldRow.Name,
    ItemType: 5,  // FundDonation
    PriceType: 2, // Free
    HasEngravingName: 0,
    AllowFreeAddPrayerNames: oldRow.ShowPrayerNames ? 1 : 0
  });
}

async function createCollectionItems(projectId, oldRow) {
  // Certificate
  const cert = await insertProjectItem({
    ProjectId: projectId,
    ItemName: oldRow.Name,
    ItemType: 2,  // Certificate
    PriceType: 1, // Fixed
    HasEngravingName: 1,
    AllowFreeAddPrayerNames: oldRow.ShowPrayerNames ? 1 : 0
  });

  // Donation
  const donation = await insertProjectItem({
    ProjectId: projectId,
    ItemName: oldRow.Name,
    ItemType: 4,  // GeneralDonation
    PriceType: 2, // Free
    HasEngravingName: 0,
    AllowFreeAddPrayerNames: oldRow.ShowPrayerNames ? 1 : 0
  });

  return [cert, donation];
}
```

### Localization Strategy

```javascript
async function migrateLocalizations(projectIds, oldRows) {
  const languages = [
    { id: 1, key: 'hebrew', suffix: '' },
    { id: 2, key: 'english', suffix: '_en' },
    { id: 3, key: 'french', suffix: '_fr' }
  ];

  const insertPromises = [];

  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    const oldRow = oldRows[i];

    for (const lang of languages) {
      insertPromises.push(
        insertLocalization(projectId, lang, oldRow)
      );
    }
  }

  // Insert all localizations in parallel
  const results = await Promise.allSettled(insertPromises);

  return {
    total: results.length,
    success: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  };
}
```

### FK Resolution Strategy

```javascript
async function resolveForeignKey(column, oldValue) {
  // Cache FK mappings in memory
  if (!this.fkCache) {
    this.fkCache = {};
  }

  if (!this.fkCache[column]) {
    const mappingPath = `data/fk-mappings/${column}.json`;
    this.fkCache[column] = require(mappingPath);
  }

  const mapping = this.fkCache[column];
  const newValue = mapping[oldValue];

  if (!newValue) {
    // Try to resolve dynamically
    const query = `SELECT NewId FROM ${column}_mapping WHERE OldId = ?`;
    const result = await targetDb.query(query, [oldValue]);

    if (result.length > 0) {
      // Cache for future use
      mapping[oldValue] = result[0].NewId;
      return result[0].NewId;
    }

    // Return default
    return 1;
  }

  return newValue;
}
```

## Performance Optimization Strategies

### 1. Bulk Insert Strategy

```javascript
async function bulkInsert(table, rows) {
  const columns = Object.keys(rows[0]);
  const values = rows.map(row =>
    columns.map(col => row[col])
  );

  const placeholders = rows.map(() =>
    `(${columns.map(() => '?').join(',')})`
  ).join(',');

  const query = `
    INSERT INTO ${table} (${columns.join(',')})
    VALUES ${placeholders}
  `;

  return await targetDb.query(query, values.flat());
}
```

### 2. Connection Pool Strategy

```javascript
const poolConfig = {
  mssql: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000
  },
  mysql: {
    connectionLimit: 10,
    queueLimit: 0,
    waitForConnections: true
  }
};

async function getConnection(type) {
  const pool = this.pools[type];
  if (!pool) {
    this.pools[type] = createPool(poolConfig[type]);
  }
  return await this.pools[type].getConnection();
}
```

### 3. Memory Management Strategy

```javascript
async function streamLargeTable(table, processRow) {
  const stream = sourceDb.stream(`SELECT * FROM ${table}`);

  let processed = 0;
  const buffer = [];
  const BUFFER_SIZE = 100;

  stream.on('data', async (row) => {
    buffer.push(row);

    if (buffer.length >= BUFFER_SIZE) {
      stream.pause();
      await processBatch(buffer);
      buffer.length = 0;
      stream.resume();
    }
  });

  stream.on('end', async () => {
    if (buffer.length > 0) {
      await processBatch(buffer);
    }
  });
}
```

## Error Recovery Strategies

### 1. Checkpoint Strategy

```javascript
class MigrationCheckpoint {
  constructor(tableName) {
    this.file = `checkpoints/${tableName}.json`;
    this.load();
  }

  load() {
    if (fs.existsSync(this.file)) {
      this.state = JSON.parse(fs.readFileSync(this.file));
    } else {
      this.state = { lastProcessedId: 0, errors: [] };
    }
  }

  save(lastId, error = null) {
    this.state.lastProcessedId = lastId;
    if (error) {
      this.state.errors.push(error);
    }
    fs.writeFileSync(this.file, JSON.stringify(this.state));
  }

  resume() {
    return this.state.lastProcessedId;
  }
}
```

### 2. Partial Rollback Strategy

```javascript
async function rollbackTable(table, fromTimestamp) {
  const query = `
    DELETE FROM ${table}
    WHERE CreatedAt >= ?
    OR UpdatedAt >= ?
  `;

  const result = await targetDb.query(query, [fromTimestamp, fromTimestamp]);

  console.log(`Rolled back ${result.affectedRows} rows from ${table}`);
  return result.affectedRows;
}
```

### 3. Data Validation Strategy

```javascript
async function validateMigration(table) {
  const validations = [
    checkRowCounts,
    checkPrimaryKeys,
    checkForeignKeys,
    checkRequiredFields,
    checkDataIntegrity
  ];

  const results = [];

  for (const validate of validations) {
    const result = await validate(table);
    results.push(result);

    if (!result.valid && result.critical) {
      throw new Error(`Critical validation failed: ${result.message}`);
    }
  }

  return {
    valid: results.every(r => r.valid),
    warnings: results.filter(r => !r.valid && !r.critical),
    passes: results.filter(r => r.valid)
  };
}
```

## Monitoring Strategy

```javascript
class MigrationMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      tablesProcessed: 0,
      rowsRead: 0,
      rowsWritten: 0,
      errors: 0,
      retries: 0
    };
  }

  recordRow(success) {
    this.metrics.rowsRead++;
    if (success) this.metrics.rowsWritten++;
    else this.metrics.errors++;

    // Log progress every 1000 rows
    if (this.metrics.rowsRead % 1000 === 0) {
      this.logProgress();
    }
  }

  logProgress() {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    const rate = this.metrics.rowsRead / elapsed;
    const errorRate = (this.metrics.errors / this.metrics.rowsRead * 100).toFixed(2);

    console.log(`
      Progress: ${this.metrics.rowsWritten}/${this.metrics.rowsRead} rows
      Rate: ${rate.toFixed(0)} rows/sec
      Errors: ${this.metrics.errors} (${errorRate}%)
      Elapsed: ${elapsed.toFixed(0)}s
    `);
  }

  generateReport() {
    return {
      ...this.metrics,
      duration: Date.now() - this.metrics.startTime,
      successRate: this.metrics.rowsWritten / this.metrics.rowsRead,
      averageRate: this.metrics.rowsRead / ((Date.now() - this.metrics.startTime) / 1000)
    };
  }
}
```