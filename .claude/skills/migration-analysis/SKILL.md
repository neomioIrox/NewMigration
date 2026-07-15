---
name: migration-analysis
description: Analyzes and validates a database migration before execution. Use when the user wants to prepare a table for migration, validate a mapping, check compatibility between source (MSSQL) and target (MySQL), or verify if a migration is ready to run.
---

# Migration Analysis Skill — Part 1: Pre-Migration Validation

## Purpose

This skill defines the **analysis and validation workflow** that must be followed before any migration is executed. It fills the gap between mapping generation (mapping-generator agent) and migration execution (migration-executor agent).

**Goal**: For a given table/entity, verify that the mapping definition is compatible with both the source DB (MSSQL) and target DB (MySQL) structures — and surface any issues or questions to the user **before** a single row is migrated.

---

## When to Use This Skill

Use this workflow when the user asks to:
- Prepare a new table for migration
- Validate a mapping file before running it
- Analyze compatibility between source and target for a specific entity
- Check if a migration is ready to run

---

## Overview of the 5 Steps

```
Step 1: Read Mapping Definition (from CSV)
         │
         ▼
Step 2: Inspect Source DB Structure (MSSQL — schema only, no data)
         │
         ▼
Step 3: Inspect Target DB Structure (MySQL — schema only, no data)
         │
         ▼
Step 4: Analyze Compatibility (mapping vs actual DB state)
         │
         ▼
Step 5: Present Findings & Questions to User
```

---

## Step 1: Read the Mapping Definition from the CSV

### Source File
- **Primary**: `legacy/reports/Mapping-WithStatus.csv`
- **Original**: `legacy/data/Mapping -Vs.xlsx` (Excel, for reference)

### CSV Column Layout

The CSV has the following columns (comma-separated):

| Position | Header | Description |
|----------|--------|-------------|
| A | Status emoji | `⏳` = pending, `✅` = done |
| B | Step | Migration step number (e.g., `1`, `1.1`, `3`, `5`) |
| C | Table Name (New) | Target MySQL table name |
| D | Column Name (New) | Target column name |
| E | Data Type | Target data type (`int`, `nvarchar`, `bit`, `datetime`) |
| F | Nullable | `YES` or `NO` |
| G | Max Length | e.g., `200`, `500`, `100` |
| H | (empty) | Separator column |
| I | Convert Type | `direct`, `const`, `expression`, `FK`, `auto`, `no-mapping` |
| J | Table Name (Old) | Source MSSQL table (e.g., `Kupat1.RecruitersGroups`, `Products`) |
| K | Column Name (Old) | Source column name |
| L | Comments | **Critical** — contains const values, expressions, conditions, logic |
| M | todo | Status tracking |

### How to Parse

1. **Find the rows for the target table**: Filter rows where Column C (New Table Name) matches the entity you're analyzing.
2. **Note the Step number**: Column B tells you the migration phase. Same table can appear under different steps (e.g., `Project` appears in Step `1` for Funds and Step `1.1` for Collections).
3. **Identify special rows**:
   - Rows with text like `"Translations for RecruitersGroup"` or `"Sourches"` in Column C are **section headers**, not actual column mappings.
   - Rows where Column C has a table name but Column D is empty are **table-level comments** — the Comments column (L) contains important instructions.
4. **Parse each column mapping**:
   - `auto` → Auto-increment ID, no source column needed
   - `direct` → Simple column-to-column copy. Check Column J+K for source.
   - `const` → Fixed value. The value is in Column L (Comments). Examples: `1`, `2(Accept)`, `GETDATE()`, `-1`
   - `expression` → JavaScript transformation. The logic hint is in Column L.
   - `FK` → Foreign key lookup. Column J+K show the target table/column to join on. Comments explain the lookup logic.
   - `no-mapping` → Column exists in target but has no source data (will be NULL or default).

### Step-to-Entity Mapping (Known)

| Step | Entity | Source Table |
|------|--------|-------------|
| 1 | Project (Funds) | Products |
| 1.1 | Project (Collections) | Products |
| 2 | ProjectLocalization | Products |
| 3 | Affiliate + Source | ParentSources, UserSources |
| 4 | RecruitersGroup | RecruitersGroups |
| 4 | Recruiter | ProductStock |
| 5 | ProjectTag | ProductTag, Tags |
| (no step) | LutMediaType, LutPlatformType, etc. | const data (no source) |

### Output of This Step

Produce a structured summary:
```
Entity: RecruitersGroup
Source Table: Kupat1.RecruitersGroups
Step: (no explicit step number — rows with no Step value)
Total mapping rows: 10
Convert types: 1x auto, 1x direct, 1x FK, 7x const
Has localization: Yes (Translations for RecruitersGroup)
Has WHERE clause: No explicit clause, but Comments say "where ProjectID is not null..."
```

---

## Step 2: Check Source DB Structure (MSSQL)

### Connection
Use the existing server connection to MSSQL (`kupatOld`) via the API or direct query.

### Queries to Run

#### 2.1 Get Source Table Columns
```sql
SELECT
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.CHARACTER_MAXIMUM_LENGTH,
    c.IS_NULLABLE,
    c.COLUMN_DEFAULT,
    c.ORDINAL_POSITION
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME = '<sourceTableName>'
ORDER BY c.ORDINAL_POSITION
```

**Important**: The source table name in the CSV may include a database prefix like `Kupat1.` or `Kupat2.`. Strip the prefix to get the actual table name. The MSSQL database is `kupatOld` which contains tables from both Kupat1 and Kupat2.

#### 2.2 Get Source Table Primary Key
```sql
SELECT
    kcu.COLUMN_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.TABLE_NAME = '<sourceTableName>'
    AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
```

#### 2.3 Get Source Table FK Relationships
```sql
SELECT
    fk.name AS FK_Name,
    tp.name AS ParentTable,
    cp.name AS ParentColumn,
    tr.name AS ReferencedTable,
    cr.name AS ReferencedColumn
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
WHERE tp.name = '<sourceTableName>' OR tr.name = '<sourceTableName>'
```

#### 2.4 Count Source Rows
```sql
SELECT COUNT(*) AS total FROM <sourceTableName>
```

If the mapping has a WHERE clause (from the Comments column or the JSON mapping's `whereClause` field), also count with the WHERE:
```sql
SELECT COUNT(*) AS filtered FROM <sourceTableName> WHERE <whereClause>
```

#### 2.5 Sample Source Data (Optional — only column names, no actual data)
```sql
SELECT TOP 0 * FROM <sourceTableName>
```
This returns zero rows but gives you all column names — useful to verify columns exist.

### Output of This Step

```
Source Table: RecruitersGroups (kupatOld)
Columns: 8
  - ID (int, PK, NOT NULL)
  - Name (nvarchar(200), NOT NULL)
  - ProjectId (int, NULL)
  - GroupDescription (nvarchar(max), NULL)
  - ...
Total Rows: 74
FK Relationships: ProjectId → Products.ProductsId
```

---

## Step 3: Check Target DB Structure (MySQL)

### Connection
Use the existing server connection to MySQL (`kupathairnew`) via the API or direct query.

### Queries to Run

#### 3.1 Get Target Table Columns
```sql
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_KEY,
    EXTRA,
    ORDINAL_POSITION
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'kupathairnew'
    AND TABLE_NAME = '<targetTableName>'
ORDER BY ORDINAL_POSITION
```

#### 3.2 Get Target Table Constraints (FK, PK, Unique)
```sql
SELECT
    tc.CONSTRAINT_NAME,
    tc.CONSTRAINT_TYPE,
    kcu.COLUMN_NAME,
    kcu.REFERENCED_TABLE_NAME,
    kcu.REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
WHERE tc.TABLE_SCHEMA = 'kupathairnew'
    AND tc.TABLE_NAME = '<targetTableName>'
```

#### 3.3 Get Target Table Indexes
```sql
SHOW INDEX FROM `<targetTableName>` FROM kupathairnew
```

#### 3.4 Check Localization Table (if applicable)
If the entity has localization (detected in Step 1), also query the localization table:
```sql
-- Example: if target is 'recruitersgroup', check 'recruitersgrouplanguage'
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'kupathairnew'
    AND TABLE_NAME = '<targetTable>language'
ORDER BY ORDINAL_POSITION
```

Common localization table name patterns:
- `recruitersgroup` → `recruitersgrouplanguage`
- `project` → `projectlocalization`
- `recruiter` → `recruiterlanguage`
- `projectitem` → `projectitemlocalization`

#### 3.5 Count Existing Target Rows
```sql
SELECT COUNT(*) AS existing FROM `<targetTableName>`
```

This tells us if the target table is clean or already has data.

### Output of This Step

```
Target Table: recruitersgroup (kupathairnew)
Columns: 11
  - Id (int, PK, AUTO_INCREMENT)
  - Name (varchar(200), NOT NULL)
  - ProjectId (int, NOT NULL, FK → project.Id)
  - DisplayInSite (tinyint, NOT NULL)
  - RecordStatus (int, NOT NULL)
  - StatusChangedAt (datetime, NOT NULL)
  - StatusChangedBy (int, NOT NULL)
  - CreatedAt (datetime, NOT NULL)
  - CreatedBy (int, NOT NULL)
  - UpdatedAt (datetime, NOT NULL)
  - UpdatedBy (int, NOT NULL)
Existing Rows: 0
FK Constraints: ProjectId → project(Id)

Localization Table: recruitersgrouplanguage
Columns: 5
  - Id (int, PK, AUTO_INCREMENT)
  - RecruiterGroupId (int, NOT NULL, FK → recruitersgroup.Id)
  - LanguageId (int, NOT NULL)
  - Name (varchar(200), NULL)
  - ...
```

---

## Step 4: Analyze Compatibility

Compare all three data sources: CSV mapping, source DB, target DB. Check for the following issues:

### 4.1 Missing Source Columns
For each mapping row with `convertType = direct` or `expression`:
- Does the `oldColumn` exist in the source table?
- Is the `oldTable` correct? (Strip `Kupat1.` / `Kupat2.` prefix)

```
CHECK: Mapping says source column "Name" from "RecruitersGroups"
→ Does RecruitersGroups.Name exist in kupatOld? YES/NO
```

### 4.2 Missing Target Columns
For each mapping row:
- Does the target column (Column D in CSV) exist in the MySQL target table?

```
CHECK: Mapping says target column "DisplayInSite" in "recruitersgroup"
→ Does kupathairnew.recruitersgroup.DisplayInSite exist? YES/NO
```

### 4.3 Unmapped NOT NULL Columns
For each column in the target MySQL table:
- If `IS_NULLABLE = 'NO'` and `EXTRA != 'auto_increment'` and `COLUMN_DEFAULT IS NULL`:
  - Does this column have a mapping? (direct, const, expression, FK)
  - If not → **CRITICAL**: This INSERT will fail!

```
CRITICAL: Target column "RecordStatus" is NOT NULL with no default,
          but no mapping found in CSV → needs const value
```

### 4.4 Data Type Compatibility

| Source Type (MSSQL) | Target Type (MySQL) | Compatible? | Notes |
|---------------------|---------------------|-------------|-------|
| `int` | `int` | Yes | Direct |
| `nvarchar(N)` | `varchar(M)` | If N ≤ M | Check length! nvarchar is Unicode |
| `nvarchar(max)` | `varchar(200)` | Warning | May truncate — need substring expression |
| `bit` | `tinyint(1)` | Yes | Both represent boolean |
| `datetime` | `datetime` | Yes | Direct |
| `money` | `decimal(10,2)` | Check | Precision differences |
| `text` / `ntext` | `text` / `longtext` | Yes | But check max length in target |
| `uniqueidentifier` | `varchar(36)` | Yes | GUID as string |

### 4.5 Length Overflow Risk
For string columns where `convertType = direct`:
- Compare source `CHARACTER_MAXIMUM_LENGTH` vs target `CHARACTER_MAXIMUM_LENGTH`
- If source > target → **WARNING**: Data may be truncated
- Suggest adding a `substring(0, targetLength)` expression

```
WARNING: Source "RecruitersGroups.Name" is nvarchar(MAX)
         Target "recruitersgroup.Name" is varchar(200)
         → Recommend expression: value ? value.substring(0, 200) : null
```

### 4.6 LUT (Lookup Table) Handling

When a mapping references a LUT table (any table prefixed with `lut`), determine the correct approach:

1. **Query the target LUT table row count**:
   ```sql
   SELECT COUNT(*) AS cnt FROM `<lutTableName>`
   ```

2. **If rows > 0** → The LUT is pre-populated. Do NOT create a migration mapping for it.
   - Use const values in the mapping (e.g., `"ProjectType": {"convertType": "const", "value": "1"}`)
   - Or use static FK mappings in `fkMappings` to map old values to existing target IDs
   - Examples of pre-populated LUTs: `lutcurrency` (5 rows), `lutrecordstatus` (6 rows), `lutprojecttype` (4 rows), `lutpricetype` (3 rows)

3. **If rows = 0** → The LUT is empty and needs to be populated through migration.
   - Check if there is a corresponding source table in MSSQL (e.g., `Cats` → `lutfundcategory`)
   - Create a dedicated mapping file for it (e.g., `LutFundCategoryMapping.json`)
   - This mapping must run BEFORE any entity that references it via FK
   - Example: `lutfundcategory` (0 rows) ← `Cats` (5 rows in MSSQL) → needs migration

**Always query — never assume a LUT is pre-populated or empty.**

```
CHECK: LUT table "lutfundcategory" — rows in target: 0
→ EMPTY — needs migration from MSSQL "Cats" table
→ Must run before FundCategoryMapping (FK dependency)

CHECK: LUT table "lutprojecttype" — rows in target: 4
→ PRE-POPULATED — use const/static mapping, do NOT migrate
```

### 4.7 FK Dependency Check
For each column with `convertType = FK` or `useFkMapping = true`:
- What entity does this FK reference?
- Has that entity already been migrated? Check `migration_tracker.id_mappings`:
  ```sql
  SELECT COUNT(*) FROM migration_tracker.id_mappings
  WHERE entity_type = '<dependencyEntityType>'
  ```
- If count = 0 → **CRITICAL**: FK resolution will fail. That entity must be migrated first.

```
CRITICAL: RecruitersGroup.ProjectId requires FK lookup for entity "Project"
          id_mappings has 0 entries for entity_type='Project'
          → Must migrate Project (Funds + Collections) first!
```

### 4.8 WHERE Clause Validation
If the mapping has a WHERE clause:
- Do all columns referenced in the WHERE exist in the source table?
- Is the SQL syntax valid for MSSQL?
- How many rows pass the filter vs total?

```
INFO: WHERE clause filters 74 rows out of 120 total
      Clause: "ProjectID IS NOT NULL"
      All referenced columns exist: YES
```

### 4.9 Existing JSON Mapping File Check
Check if a JSON mapping file already exists in `server/mappings/`:
- Does `server/mappings/<MappingName>.json` exist?
- If yes: does it match the CSV definition? Any drift?
- Are all CSV columns represented in the JSON?
- Does the JSON have proper `_meta` section?

### 4.10 Localization Completeness
If the entity has localization:
- Are all 3 languages mapped? (Hebrew=1, English=2, French=3)
- For English/French: is there a fallback to Hebrew if NULL?
- Does the localization table's FK column match the parent table's PK?

### 4.11 Child-to-Parent Back-Reference Pattern (Critical!)

When a migration creates child rows that need to be linked BACK to the parent, verify the UPDATE logic is correct.

#### The Pattern

```
1. INSERT parent row (e.g., project) → get newId
2. INSERT child rows (e.g., media, linksetting) → get childIds
3. UPDATE parent/localization with childIds (e.g., MainMedia = mediaId)
```

#### Why This Matters

The migration engine creates child entities (media, linksetting, entitycontent) AFTER the parent, but the parent table often has FK columns pointing TO the children:

| Parent Table | Child Table | Back-Reference Column |
|--------------|-------------|----------------------|
| projectlocalization | media | MainMedia, ImageForListsView |
| projectlocalization | linksetting | MainLinkButtonSettingId |
| projectlocalization | entitycontent | ContentId |
| projectitemlocalization | media | MediaForExecutePage |
| projectitemlocalization | linksetting | ProjectFooterLinkSettingId |

#### Common Failure Scenarios

**Scenario 1: UPDATE runs only for created languages**
```
Problem: Migration creates only Hebrew localization (EN/FR conditions fail)
         UPDATE runs only for Hebrew (createdLangs = ['hebrew'])
         Later, app creates EN/FR localizations with MainMedia = NULL

Solution: After migration, run fix script to copy Hebrew values to EN/FR:
          UPDATE projectlocalization en
          JOIN projectlocalization he ON en.ProjectId = he.ProjectId AND he.Language = 1
          SET en.MainMedia = he.MainMedia
          WHERE en.Language = 2 AND en.MainMedia IS NULL
```

**Scenario 2: Child INSERT fails silently**
```
Problem: Media INSERT fails (bad path, constraint violation)
         mediaIdMap is empty or partial
         UPDATE uses default value (1) instead of real mediaId

Solution: Check migration_errors table for INSERT failures
          Verify id_mappings has entries for Media_* entity types
```

**Scenario 3: UPDATE WHERE clause doesn't match**
```
Problem: UPDATE uses {ProjectId: newId, Language: langId}
         But localization row has different column names (e.g., Language vs LanguageId)
         UPDATE affects 0 rows silently

Solution: Verify exact column names in target table match UPDATE logic
```

#### Validation Checklist

For any mapping with `mediaMappings`, `linkSettingMappings`, or `entityContentMappings`:

1. **Check UPDATE logic in migration engine** (`_postInsertUpdates` function):
   - Does it handle all languages, or only `createdLangs`?
   - Does the WHERE clause use correct column names?

2. **After migration, verify linkage**:
   ```sql
   -- Check for NULL back-references
   SELECT COUNT(*) as missing
   FROM projectlocalization
   WHERE MainMedia IS NULL;

   -- Compare expected vs actual
   SELECT im_p.target_id as project_id, im_m.target_id as expected_media,
          pl.MainMedia as actual_media
   FROM migration_tracker.id_mappings im_p
   JOIN migration_tracker.id_mappings im_m ON im_p.source_id = im_m.source_id
   JOIN kupathairnew.projectlocalization pl ON im_p.target_id = pl.ProjectId
   WHERE im_p.entity_type = 'Project'
     AND im_m.entity_type = 'Media_hebrew_projectImage'
     AND pl.Language = 1
     AND pl.MainMedia != im_m.target_id;
   ```

3. **Common fix script pattern**:
   ```sql
   -- Fix: Copy from Hebrew to other languages
   UPDATE projectlocalization other
   JOIN projectlocalization he ON other.ProjectId = he.ProjectId AND he.Language = 1
   SET other.MainMedia = he.MainMedia,
       other.ImageForListsView = he.ImageForListsView
   WHERE other.Language IN (2, 3)
     AND other.MainMedia IS NULL
     AND he.MainMedia IS NOT NULL;
   ```

#### Examples of Back-Reference Mappings

**Media Example** (from ProjectMapping_Funds_Fixed.json):
```json
"mediaMappings": {
  "hebrew": {
    "projectImage": {
      "RelativePath": {"convertType": "direct", "oldColumn": "Pic"},
      "condition": "row.Pic != null && row.Pic != ''"
    }
  }
}
```
→ Creates Media row → UPDATE projectlocalization.MainMedia with new mediaId

**LinkSetting Example**:
```json
"linkSettingMappings": {
  "mainButton": {
    "hebrew": {"LinkType": 1, "LinkText": "לתרומה"}
  }
}
```
→ Creates LinkSetting row → UPDATE projectlocalization.MainLinkButtonSettingId

### Issue Severity Levels

| Level | Meaning | Action Required |
|-------|---------|-----------------|
| **CRITICAL** | Migration will fail | Must fix before running |
| **WARNING** | Data may be lost/truncated | Should fix, but can proceed with risk |
| **INFO** | Informational, no action needed | User awareness only |

---

## Step 5: Present Findings to User

### Output Format

Present the analysis results in a clear, structured format. Communicate in Hebrew since the user works in Hebrew.

### Template

```
## דוח ניתוח מיגרציה: <EntityName>

### סיכום
| פרט | ערך |
|------|------|
| טבלת מקור (MSSQL) | <sourceTable> (kupatOld) |
| טבלת יעד (MySQL) | <targetTable> (kupathairnew) |
| שורות במקור | <totalRows> (מסוננות: <filteredRows>) |
| שורות קיימות ביעד | <existingRows> |
| עמודות במיפוי | <mappedColumns> |
| עמודות ביעד | <targetColumns> |
| סוג המרה | <breakdown: X direct, Y const, Z expression, W FK> |
| לוקליזציה | כן/לא (טבלה: <localizationTable>) |
| תלויות FK | <list of dependencies> |

### מטריצת תאימות עמודות

| עמודה ביעד | סוג | NOT NULL | מיפוי | מקור | תאימות |
|------------|------|----------|--------|------|---------|
| Id | int | YES | auto | - | ✅ |
| Name | varchar(200) | YES | direct | RecruitersGroups.Name | ✅ |
| ProjectId | int | YES | FK | Products.ProductsId | ⚠️ צריך id_mappings |
| ... | | | | | |

### בעיות שנמצאו

#### 🔴 קריטי (חייב תיקון)
- [ ] <issue description>

#### 🟡 אזהרה (מומלץ לתקן)
- [ ] <issue description>

#### 🔵 מידע
- <informational note>

### שאלות למשתמש
1. <question that needs user decision>
2. <question about unclear mapping logic>

### המלצה
✅ מוכן להרצה / ⚠️ דורש תיקונים לפני הרצה / 🔴 לא מוכן
```

---

## Concrete Example: RecruitersGroup Analysis

### Step 1 Output
```
Entity: RecruitersGroup
CSV Step: (no step number)
Source Table: Kupat1.RecruitersGroups
Mapping rows: 10
  auto: 1 (Id)
  direct: 1 (Name)
  FK: 1 (ProjectId)
  const: 7 (DisplayInSite=1, RecordStatus=2, timestamps=GETDATE(), users=-1)
Localization: Yes ("Translations for RecruitersGroup" — Name field, 3 languages)
WHERE hint: "where ProjectID is not null or exists related ProductsStock..."
```

### Step 2 Output
```
Source: RecruitersGroups (kupatOld)
  ID             int          PK, NOT NULL
  Name           nvarchar(200)    NOT NULL
  ProjectId      int              NULL
  GroupDescription nvarchar(max)  NULL
  IsActive       bit              NULL
Total rows: 120
```

### Step 3 Output
```
Target: recruitersgroup (kupathairnew)
  Id              int          PK, AUTO_INCREMENT
  Name            varchar(200)     NOT NULL
  ProjectId       int              NOT NULL, FK → project(Id)
  DisplayInSite   tinyint(1)       NOT NULL
  RecordStatus    int              NOT NULL
  StatusChangedAt datetime         NOT NULL
  StatusChangedBy int              NOT NULL
  CreatedAt       datetime         NOT NULL
  CreatedBy       int              NOT NULL
  UpdatedAt       datetime         NOT NULL
  UpdatedBy       int              NOT NULL
Existing rows: 0

Localization: recruitersgrouplanguage
  Id                int          PK, AUTO_INCREMENT
  RecruiterGroupId  int          NOT NULL, FK → recruitersgroup(Id)
  LanguageId        int          NOT NULL
  Name              varchar(200)     NULL
```

### Step 4 Output
```
Issues Found:

🔴 CRITICAL:
- ProjectId is NOT NULL in target but NULL in source → need WHERE clause
  to exclude rows where ProjectId IS NULL, or need default value
- FK dependency: ProjectId requires entity_type='Project' in id_mappings
  → Current count: 0 → Must run Project migration first!

🟡 WARNING:
- Source Name is nvarchar(200), target is varchar(200) → OK for ASCII,
  but Hebrew chars take more bytes in varchar. Check if utf8mb4 is used in MySQL.

🔵 INFO:
- Source has 120 rows, but WHERE clause filters to ~74 rows
- Source columns GroupDescription, IsActive have no target mapping (they're dropped)
- 7 const columns are all standard audit fields (RecordStatus, timestamps, users)
```

### Step 5: Present to User
The full Hebrew report using the template above, ending with questions:

```
שאלות למשתמש:
1. ProjectId הוא NOT NULL ביעד אבל NULL במקור — האם לסנן שורות ללא ProjectId?
2. האם מיגרציית Project כבר הושלמה? (נדרש עבור FK lookup של ProjectId)
3. עמודות GroupDescription ו-IsActive לא ממופות — זה בכוונה?

המלצה: ⚠️ דורש תיקונים — יש להשלים מיגרציית Project קודם, ולהגדיר WHERE clause
```

---

## Complex Example: Project (Funds) Analysis

For complex entities like Project, additional checks are needed:

### Extra Complexity Points
1. **Multiple sub-tables**: Project creates records in `project`, `projectlocalization`, `projectitem`, `projectitemlocalization`
2. **WHERE clause complexity**: Must exclude Collections (Certificate != 1) and exclude specific patterns
3. **Localization has many fields**: Title, Description, ShortDescription, etc. — each with 3 languages
4. **ProjectItem cardinality**: Funds = 1 item, Collections = 2 items (certificate + donation)
5. **FK chain**: Project → ProjectLocalization → ProjectItem → ProjectItemLocalization

### Additional Checks for Complex Entities
- Verify ALL sub-tables exist in target (not just the main table)
- Check that localization FK column matches parent PK column name
- Verify ProjectItem types exist in `lutprojectitemtype` lookup table
- Count sub-table rows to estimate: if 1271 products, expect 1271 projects + 3813 localizations + 1271 items + 3813 item localizations

---

## Technical Notes

### Database Connections
- **MSSQL** (source): `kupatOld` on `DESKTOP-7QELS7G`, Windows Auth via ODBC Driver 17
- **MySQL** (target): `kupathairnew` on `localhost`, user `root`
- **MySQL** (tracker): `migration_tracker` on `localhost`, user `root`

### API Endpoints Available
The migration server (port 3001) provides these useful endpoints:
- `GET /api/connections/test` — Test all 3 DB connections
- `GET /api/mappings` — List available mapping files
- `GET /api/mappings/:name` — Load specific mapping JSON
- `GET /api/status/dashboard` — Migration status overview
- `GET /api/id-mappings` — Search ID mappings (for FK dependency check)

### Running Queries Directly
If the API doesn't provide a needed query, you can run it directly using the server's DB modules:

```javascript
// MSSQL query
const mssql = require('./server/src/db/mssql');
const result = await mssql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='RecruitersGroups'");

// MySQL query
const mysql = require('./server/src/db/mysql-target');
const [rows] = await mysql.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='kupathairnew' AND TABLE_NAME='recruitersgroup'");
```

Or create a temporary Node.js script and run it via bash.

### File Paths Reference
- CSV Mapping: `legacy/reports/Mapping-WithStatus.csv`
- Excel Mapping: `legacy/data/Mapping -Vs.xlsx`
- JSON Mappings: `server/mappings/*.json`
- Meta/Dependencies: `server/mappings/_meta.json`
- MySQL Schema Reference: `legacy/database/schemas/KupatHairNewMySQL.sql`
- FK Mapping History: `legacy/data/fk-mappings/*.json`
