# Technical Patterns & Best Practices

## תבניות קוד חוזרות במיגרציה

### 1. Expression Evaluation Pattern

```javascript
// server.js - כך מעריכים expression
if (mapping.expression) {
  try {
    const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
    value = expressionFunc(value, sourceRow);

    // Apply defaultValue AFTER expression if result is null
    if ((value === null || value === undefined) && mapping.defaultValue) {
      if (mapping.defaultValue === 'GETDATE()') {
        value = new Date();
      } else {
        value = mapping.defaultValue;
      }
    }
  } catch (err) {
    logger.error(`Expression error: ${err.message}`);
    value = null;
  }
}
```

**חשוב**:
- ה-expression מקבל 2 פרמטרים: `value` (הערך הנוכחי), `row` (כל השורה)
- defaultValue מיושם **אחרי** expression (אם התוצאה null)
- תמיד לעטוף ב-try/catch למניעת קריסה

---

### 2. GETDATE() Replacement Pattern

```javascript
// server.js - המרת GETDATE() ל-JavaScript Date
if (mapping.value === 'GETDATE()' || mapping.defaultValue === 'GETDATE()') {
  value = new Date();
}
```

**הסבר**: SQL Server's `GETDATE()` לא קיים ב-JavaScript, צריך להמיר ל-`new Date()`.

---

### 3. FK Mapping Pattern

```javascript
// server.js - טיפול ב-FK mapping
if (mapping.useFkMapping) {
  const fkMappingFile = path.join(__dirname, 'fk-mappings', `${targetColumn}.json`);

  if (fs.existsSync(fkMappingFile)) {
    const fkMap = JSON.parse(fs.readFileSync(fkMappingFile, 'utf-8'));

    // Apply FK mapping
    if (fkMap[oldValue]) {
      value = fkMap[oldValue];
    } else if (mapping.defaultValue) {
      value = mapping.defaultValue;
    }
  }
}
```

**מבנה קובץ FK**:
```json
{
  "1": "1",
  "4": "2",
  "7": "3"
}
```

---

### 4. Multi-Language Localization Pattern

```javascript
// server.js - יצירת 3 שורות localization לכל project
const languages = [
  { id: 1, name: 'hebrew' },
  { id: 2, name: 'english' },
  { id: 3, name: 'french' }
];

for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
  const sourceRow = rows.find(r => r.productsid === parseInt(oldProductId));

  for (const lang of languages) {
    const locData = {
      ProjectId: newProjectId,
      LanguageId: lang.id
    };

    // Process each field per language
    for (const [fieldName, langMappings] of Object.entries(localizationMappings)) {
      const langMapping = langMappings[lang.name];

      if (langMapping) {
        let value = sourceRow[langMapping.oldColumn];

        // Apply expression if exists
        if (langMapping.expression) {
          const expressionFunc = new Function('value', 'row', `return ${langMapping.expression}`);
          value = expressionFunc(value, sourceRow);
        }

        // Apply defaultValue if needed
        if ((value === null || value === undefined) && langMapping.defaultValue) {
          value = langMapping.defaultValue;
        }

        locData[fieldName] = value;
      }
    }

    // INSERT locData
    await mysqlConnection.execute(insertQuery, values);
  }
}
```

**חשוב**:
- תמיד 3 iterations (hebrew, english, french)
- כל שדה יכול להיות שונה לפי שפה
- defaultValue יכול להיות שונה לפי שפה

---

### 5. Variable Items Pattern (ProjectItem)

```javascript
// server.js - מספר משתנה של items לפי ProjectType
const projectItemIdMappings = {}; // oldProductId → [itemId1, itemId2, ...]

for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
  const sourceRow = rows.find(r => r.productsid === parseInt(oldProductId));

  // Determine ProjectType
  const projectTypeMapping = mappings['ProjectType'];
  let projectType = parseInt(projectTypeMapping?.value || 2);

  projectItemIdMappings[oldProductId] = [];

  if (projectType === 1 && projectItemMappings.funds) {
    // Create 1 item for Funds
    const itemData = buildItemData(projectItemMappings.funds, sourceRow, newProjectId);
    const [result] = await mysqlConnection.execute(insertQuery, values);
    projectItemIdMappings[oldProductId].push(result.insertId);

  } else if (projectType === 2 && projectItemMappings.collections) {
    // Create 2 items for Collections

    // 1. Certificate
    const certData = buildItemData(projectItemMappings.collections.certificate, sourceRow, newProjectId);
    const [certResult] = await mysqlConnection.execute(insertQuery, certValues);
    projectItemIdMappings[oldProductId].push(certResult.insertId);

    // 2. Donation
    const donationData = buildItemData(projectItemMappings.collections.donation, sourceRow, newProjectId);
    const [donationResult] = await mysqlConnection.execute(insertQuery, donationValues);
    projectItemIdMappings[oldProductId].push(donationResult.insertId);
  }
}

// Save for future use
response.projectItemIdMappings = projectItemIdMappings;
```

**מבנה projectItemIdMappings**:
```javascript
{
  "1": [101],           // Fund → 1 item
  "2": [102, 103],      // Collection → 2 items (cert, donation)
  "3": [104],           // Fund → 1 item
  "4": [105, 106]       // Collection → 2 items
}
```

---

### 6. Dynamic SELECT Query Building

```javascript
// server.js - בניית SELECT אוטומטית
const sourceColumns = [];

// From columnMappings
for (const [targetColumn, mapping] of Object.entries(mappings)) {
  if (mapping.oldColumn && !sourceColumns.find(c => c.source === mapping.oldColumn)) {
    sourceColumns.push({
      target: targetColumn,
      source: mapping.oldColumn,
      table: mapping.oldTable
    });
  }
}

// From localizationMappings
for (const [fieldName, langMappings] of Object.entries(localizationMappings)) {
  for (const [lang, mapping] of Object.entries(langMappings)) {
    if (mapping.oldColumn && !sourceColumns.find(c => c.source === mapping.oldColumn)) {
      sourceColumns.push({
        target: fieldName,
        source: mapping.oldColumn,
        table: mapping.oldTable
      });
    }
  }
}

// From projectItemMappings
// ... similar logic

// Build query
const uniqueColumns = [...new Set(sourceColumns.map(c => c.source))];
const selectQuery = `SELECT productsid, ${uniqueColumns.join(', ')} FROM products`;
```

**חשוב**: הסקריפט אוסף את כל ה-oldColumn fields מכל המיפויים ובונה SELECT אוטומטית.

---

### 7. ID Mapping Pattern

```javascript
// server.js - שמירת מיפוי בין IDs ישנים לחדשים
const idMappings = {}; // oldProductId → newProjectId

for (const sourceRow of rows) {
  const oldProductId = sourceRow.productsid;
  const newData = {};

  // Build newData from mappings...

  const [result] = await mysqlConnection.execute(insertQuery, values);
  const newProjectId = result.insertId;

  // Save mapping
  idMappings[oldProductId] = newProjectId;
}

// Use later for child tables
for (const [oldProductId, newProjectId] of Object.entries(idMappings)) {
  // Create projectLocalization, projectItem, etc.
}
```

**חשוב**: שמור את המיפוי ב-memory כדי לקשר טבלאות child.

---

### 8. Error Handling Pattern

```javascript
// server.js - טיפול בשגיאות
const errors = [];

try {
  // Attempt insert
  await mysqlConnection.execute(insertQuery, values);
  insertedCount++;
} catch (err) {
  logger.error(`Insert failed for row ${oldProductId}: ${err.message}`);
  errors.push({
    oldProductId: oldProductId,
    newProjectId: newProjectId,
    error: err.message
  });
}

// Return first 10 errors only
if (errors.length > 0) {
  response.errors = errors.slice(0, 10);
  response.totalErrors = errors.length;
}
```

**חשוב**: תמיד לשמור errors אבל להחזיר רק את ה-10 הראשונים (למניעת response גדול מדי).

---

### 9. Logging Pattern

```javascript
// server.js - logging מובנה
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`)
  ),
  transports: [
    new winston.transports.File({ filename: 'migration-logs.log' }),
    new winston.transports.Console()
  ]
});

// Usage
logger.info('Starting migration for table: project');
logger.error(`Expression error: ${err.message}`);
logger.info(`Migration completed: ${insertedCount}/${totalRows} rows inserted successfully`);
```

---

### 10. INSERT Query Building Pattern

```javascript
// server.js - בניית INSERT query
const columns = Object.keys(newData);
const placeholders = columns.map(() => '?').join(', ');
const values = columns.map(col => {
  let val = newData[col];

  // Convert Date to MySQL format
  if (val instanceof Date) {
    val = val.toISOString().slice(0, 19).replace('T', ' ');
  }

  return val;
});

const insertQuery = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

await mysqlConnection.execute(insertQuery, values);
```

**חשוב**: להשתמש ב-prepared statements (?) למניעת SQL injection.

---

## Common Pitfalls (מלכודות נפוצות)

### 1. Expression vs Direct עם expression field
**בעיה**:
```json
{
  "convertType": "direct",
  "oldColumn": "Sort",
  "expression": "value <= 30 ? value : null"
}
```

**פתרון**: צריך להיות `convertType: "expression"`.

---

### 2. Fallback בתוך Expression לא עובד
**בעיה**:
```javascript
"expression": "(value ? value : row.Name)"
```

לפעמים `row.Name` לא זמין בזמן evaluation.

**פתרון**: ודא ש-`Name` נמצא ב-SELECT query.

---

### 3. GETDATE() לא מוחלף
**בעיה**: שכחנו להמיר `GETDATE()` ל-`new Date()`.

**פתרון**: תמיד בדוק אם `value === 'GETDATE()'`.

---

### 4. Foreign Key מוכנס לפני Parent
**בעיה**: ניסיון להכניס projectLocalization לפני project.

**פתרון**: שמור על סדר:
1. project
2. projectLocalization
3. projectItem
4. projectItemLocalization

---

### 5. defaultValue לא מיושם אחרי Expression NULL
**בעיה**: expression מחזיר null, defaultValue לא מוחל.

**פתרון**: החל defaultValue **אחרי** expression evaluation.

---

### 6. שכחנו לכלול Column ב-SELECT
**בעיה**: expression משתמש ב-`row.ShowMainPage` אבל `ShowMainPage` לא ב-SELECT.

**פתרון**: ודא ש-SELECT כולל את כל העמודות שמשמשות ב-expressions.

---

### 7. פורמט תאריך שגוי ל-MySQL
**בעיה**: JavaScript Date לא מתאים ל-MySQL DATETIME.

**פתרון**:
```javascript
if (val instanceof Date) {
  val = val.toISOString().slice(0, 19).replace('T', ' ');
  // "2025-11-11T10:24:28.000Z" → "2025-11-11 10:24:28"
}
```

---

### 8. FK Mapping File לא קיים
**בעיה**: `useFkMapping: true` אבל אין `fk-mappings/FieldName.json`.

**פתרון**: תמיד בדוק `fs.existsSync()` לפני קריאה.

---

### 9. convertType="const" עם oldColumn
**בעיה**:
```json
{
  "convertType": "const",
  "value": "2",
  "oldColumn": "Something"
}
```

**פתרון**: const לא צריך oldColumn. הסר אותו.

---

### 10. שכחנו לעדכן completedLines
**בעיה**: הוספנו mapping חדש אבל לא עדכנו את `mapping-reports/add-mapping-status.js`.

**פתרון**: תמיד עדכן את `completedLines` Set כשמוסיפים mapping.

---

## Code Review Checklist

לפני commit של mapping חדש:

- [ ] ✅ ProjectMapping.json מעודכן עם כל השדות
- [ ] ✅ server.js מטפל במיפוי (אם נדרש logic מיוחד)
- [ ] ✅ public/index.html מעודכן עם UI (אם נדרש accordion)
- [ ] ✅ mapping-reports/add-mapping-status.js עודכן עם line numbers
- [ ] ✅ MIGRATION_STATUS.md עודכן עם התקדמות
- [ ] ✅ docs/mappings/mapping-*.md עודכן עם פרטים
- [ ] ✅ בדקתי שכל oldColumn נמצא ב-SELECT query
- [ ] ✅ בדקתי convertType עקבי (expression עם expression field)
- [ ] ✅ בדקתי defaultValue logic
- [ ] ✅ הרצתי migration בסביבת test
- [ ] ✅ בדקתי logs לשגיאות
- [ ] ✅ בדקתי נתונים בבסיס הנתונים

---

## Performance Tips

### 1. Batch Inserts
במקום:
```javascript
for (const row of rows) {
  await connection.execute('INSERT ...');
}
```

עדיף:
```javascript
const values = rows.map(row => [...]); // Array of arrays
await connection.query('INSERT INTO table VALUES ?', [values]);
```

**הערה**: טרם מיושם בפרויקט הנוכחי.

---

### 2. Connection Pooling
```javascript
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'kupathair_new',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

**הערה**: טרם מיושם בפרויקט הנוכחי.

---

### 3. Disable Foreign Key Checks (זהירות!)
```sql
SET FOREIGN_KEY_CHECKS = 0;
-- Run migration
SET FOREIGN_KEY_CHECKS = 1;
```

**אזהרה**: השתמש רק בסביבת development!

---

## Database Optimization

### לפני מיגרציה גדולה:
```sql
-- Disable indexes temporarily
ALTER TABLE project DISABLE KEYS;

-- Run migration

-- Re-enable indexes
ALTER TABLE project ENABLE KEYS;
```

**הערה**: עובד רק על MyISAM, לא InnoDB.

---

## Useful SQL Queries

### בדיקת תוצאות:
```sql
-- Count projects
SELECT COUNT(*) FROM project;

-- Count localizations (should be 3x projects)
SELECT COUNT(*) FROM projectLocalization;

-- Check language distribution
SELECT LanguageId, COUNT(*)
FROM projectLocalization
GROUP BY LanguageId;

-- Find NULL titles
SELECT * FROM projectLocalization WHERE Title IS NULL;

-- Check ProjectType distribution
SELECT ProjectType, COUNT(*)
FROM project
GROUP BY ProjectType;

-- Verify FK relationships
SELECT p.Id, COUNT(pl.Id) as locCount
FROM project p
LEFT JOIN projectLocalization pl ON p.Id = pl.ProjectId
GROUP BY p.Id
HAVING locCount != 3;
```

---

## Git Workflow

```bash
# לפני שינוי
git status
git diff

# לאחר שינוי
git add .
git commit -m "Add ProjectItem migration with 13 fields

- Supports Funds (1 item) and Collections (2 items)
- Certificate + Donation types
- Stores projectItemIdMappings for future localization

🤖 Generated with Claude Code"

# אם צריך לדחוף
git push origin main
```
