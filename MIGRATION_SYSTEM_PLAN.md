# Migration System - Full Rebuild Plan

## Goal
Build a systematic, production-grade migration system from MS SQL (kupatOld) to MySQL (kupathairnew) with:
- **Exactly-once** row processing guarantee
- **Pause/Resume/Restart** support
- **Separate tracking DB** (migration_tracker) for status, ID mappings, and errors
- **React dashboard UI** with real-time progress
- **Reuse existing JSON mapping files** with enhancements

---

## 1. Project Structure

```
NewMigration/
├── legacy/                          # Existing code (read-only reference)
├── server/                          # Express backend
│   ├── package.json
│   ├── src/
│   │   ├── index.js                 # Express app entry point
│   │   ├── config/
│   │   │   └── database.js          # 3 DB connections (mssql, mysql-target, mysql-tracker)
│   │   ├── db/
│   │   │   ├── mssql.js             # MSSQL connection pool
│   │   │   ├── mysql-target.js      # MySQL target connection pool
│   │   │   ├── mysql-tracker.js     # MySQL tracker connection pool
│   │   │   └── init-tracker.js      # Creates migration_tracker schema on first run
│   │   ├── engine/
│   │   │   ├── migration-engine.js  # Core: orchestrates a single migration task
│   │   │   ├── row-processor.js     # Transforms one source row → target row using mapping
│   │   │   ├── expression-eval.js   # Safe expression evaluator (replaces eval())
│   │   │   ├── fk-resolver.js       # Resolves FK mappings from tracker DB
│   │   │   └── batch-runner.js      # Batched INSERT with configurable batch size
│   │   ├── routes/
│   │   │   ├── migrations.js        # CRUD + run/pause/resume/restart
│   │   │   ├── status.js            # Dashboard stats, progress queries
│   │   │   ├── mappings.js          # List/view/validate mapping files
│   │   │   ├── id-lookups.js        # Search old_id ↔ new_id
│   │   │   ├── errors.js            # Error log queries
│   │   │   └── connections.js       # Test DB connections
│   │   ├── services/
│   │   │   ├── tracker.js           # All tracker DB operations (insert/update/query)
│   │   │   └── migration-manager.js # Manages running migrations, pause signals
│   │   └── websocket.js             # WebSocket server for real-time progress
│   └── mappings/                    # Enhanced JSON mapping files (copied from legacy)
│       ├── ProjectMapping.json
│       ├── RecruiterMapping.json
│       ├── PrayerMapping.json
│       ├── ... (all existing mappings)
│       └── _meta.json               # Migration order & dependency graph
├── client/                          # React frontend (Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/
│       │   ├── Layout.jsx           # RTL-aware shell with sidebar
│       │   ├── Dashboard.jsx        # Overall migration status overview
│       │   ├── MigrationRunner.jsx  # Select table → configure → run/pause/resume
│       │   ├── MigrationProgress.jsx # Real-time progress bar + row counts
│       │   ├── IdLookup.jsx         # Search old→new ID mappings
│       │   ├── ErrorViewer.jsx      # Filterable error log table
│       │   ├── MappingViewer.jsx    # View mapping definitions
│       │   └── ConnectionStatus.jsx # DB connection health indicators
│       ├── hooks/
│       │   └── useWebSocket.js      # WebSocket hook for real-time updates
│       └── api/
│           └── client.js            # Axios/fetch wrapper for all API calls
└── README.md
```

---

## 2. Tracking Database Schema (`migration_tracker`)

A **completely separate MySQL database** on the same MySQL server. Configured as a 3rd connection alongside source (MSSQL) and target (MySQL).

```
Connection 1: MSSQL → kupatOld        (source, read-only)
Connection 2: MySQL → kupathairnew     (target, write)
Connection 3: MySQL → migration_tracker (tracking DB, read/write)
```

The tracking DB is **auto-created** on first server startup by `init-tracker.js`.

### Table: `migration_runs`
Tracks each migration execution (a "run" = one click of "Run" button for a specific table).

```sql
CREATE TABLE migration_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mapping_name VARCHAR(100) NOT NULL,      -- e.g. 'ProjectMapping_Funds'
  source_table VARCHAR(100) NOT NULL,       -- e.g. 'products'
  target_table VARCHAR(100) NOT NULL,       -- e.g. 'project'
  status ENUM('pending','running','paused','completed','failed') DEFAULT 'pending',
  total_source_rows INT DEFAULT 0,          -- COUNT from source query
  processed_rows INT DEFAULT 0,
  inserted_rows INT DEFAULT 0,
  skipped_rows INT DEFAULT 0,              -- already existed / duplicate
  error_rows INT DEFAULT 0,
  last_processed_source_id VARCHAR(50),     -- for resume: last source PK processed
  batch_size INT DEFAULT 500,
  started_at DATETIME,
  paused_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Table: `id_mappings`
The core old→new ID mapping table. **Replaces all FK JSON files**.

```sql
CREATE TABLE id_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,        -- e.g. 'Project', 'Recruiter', 'RecruitersGroup'
  source_id VARCHAR(50) NOT NULL,          -- old ID from MSSQL
  target_id VARCHAR(50) NOT NULL,          -- new auto-increment ID in MySQL
  run_id INT,                              -- which migration_run created this
  extra_data JSON,                         -- optional: store ProjectType, Name, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_entity_source (entity_type, source_id),
  INDEX idx_entity_target (entity_type, target_id),
  FOREIGN KEY (run_id) REFERENCES migration_runs(id)
);
```

### Table: `row_status`
Per-row tracking for exactly-once guarantee and error details.

```sql
CREATE TABLE row_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  source_id VARCHAR(50) NOT NULL,          -- PK from source table
  status ENUM('pending','inserted','skipped','error') NOT NULL,
  target_id VARCHAR(50),                   -- new ID if inserted
  error_message TEXT,                      -- error details if failed
  source_data JSON,                        -- snapshot of source row (for debugging)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_run_source (run_id, source_id),
  INDEX idx_status (status),
  FOREIGN KEY (run_id) REFERENCES migration_runs(id)
);
```

### Table: `migration_errors`
Aggregated error log for the error viewer UI.

```sql
CREATE TABLE migration_errors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  source_id VARCHAR(50),
  error_type ENUM('transform','insert','fk_missing','validation','connection') NOT NULL,
  error_message TEXT NOT NULL,
  source_data JSON,
  stack_trace TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_run (run_id),
  FOREIGN KEY (run_id) REFERENCES migration_runs(id)
);
```

---

## 3. Backend Architecture

### 3.1 API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/connections/test` | Test all 3 DB connections |
| GET | `/api/mappings` | List all available mapping files |
| GET | `/api/mappings/:name` | Get specific mapping with validation results |
| GET | `/api/migrations` | List all migration runs |
| POST | `/api/migrations/start` | Start a new migration run |
| POST | `/api/migrations/:id/pause` | Pause a running migration |
| POST | `/api/migrations/:id/resume` | Resume a paused migration |
| POST | `/api/migrations/:id/restart` | Reset and restart from scratch |
| GET | `/api/migrations/:id/progress` | Get detailed progress for a run |
| GET | `/api/status/dashboard` | Aggregated stats for all entities |
| GET | `/api/id-mappings` | Search/filter ID mappings |
| GET | `/api/id-mappings/:entity/:sourceId` | Lookup specific old→new ID |
| GET | `/api/errors` | Paginated error log with filters |
| GET | `/api/errors/:runId` | Errors for specific run |

### 3.2 Migration Engine Flow

```
User clicks "Run Migration" for ProjectMapping_Funds
          │
          ▼
┌─────────────────────────┐
│  1. VALIDATE             │  - Load mapping JSON
│                          │  - Verify source table exists in MSSQL
│                          │  - Verify target table exists in MySQL
│                          │  - Check FK dependencies are satisfied
│                          │  - Count source rows (with WHERE clause)
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│  2. CREATE RUN           │  - Insert into migration_runs (status='running')
│                          │  - Store total_source_rows count
│                          │  - WebSocket: emit 'migration:started'
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│  3. FETCH BATCH          │  - SELECT TOP {batchSize} FROM source
│     (loop)               │    WHERE source_pk > last_processed_source_id
│                          │    ORDER BY source_pk ASC
│                          │  - If resume: start from last_processed_source_id
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│  4. PROCESS EACH ROW     │  For each row in batch:
│                          │  a. Check row_status: skip if already 'inserted'
│                          │  b. Transform using mapping (row-processor)
│                          │  c. Resolve FK lookups from id_mappings table
│                          │  d. Validate transformed data
│                          │  e. INSERT into MySQL target
│                          │  f. Capture new auto-increment ID
│                          │  g. Write to id_mappings (entity_type, old_id, new_id)
│                          │  h. Write to row_status (status='inserted')
│                          │  i. On error: write to row_status (status='error')
│                          │     + migration_errors table
│                          │  j. Update migration_runs counters
│                          │  k. WebSocket: emit 'migration:progress'
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│  5. CHECK SIGNALS        │  - If pause requested → update status='paused', stop
│                          │  - If more batches → go to step 3
│                          │  - If done → status='completed'
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│  6. FINALIZE             │  - Update migration_runs (completed_at, final counts)
│                          │  - WebSocket: emit 'migration:completed'
│                          │  - Log summary
└─────────────────────────┘
```

### 3.3 Exactly-Once Guarantee
1. Before processing a row, check `row_status` for `(run_id, source_id)` — skip if exists with status='inserted'
2. Each INSERT + row_status write happens in a **MySQL transaction** on the target DB
3. On resume, the engine queries `last_processed_source_id` from `migration_runs` and fetches source rows starting after that ID
4. `id_mappings` has UNIQUE constraint on `(entity_type, source_id)` — prevents double-mapping

### 3.4 Pause/Resume/Restart
- **Pause**: Set an in-memory flag (`pauseRequested = true`). Engine checks this after each batch. Updates `migration_runs.status = 'paused'` and `paused_at`.
- **Resume**: Update status back to 'running'. Engine starts from `last_processed_source_id`.
- **Restart**: Delete all `row_status` and `id_mappings` entries for this entity_type. Delete related rows from target MySQL tables. Reset `migration_runs`. Start fresh.

### 3.5 Expression Evaluator (Safe)
Replace `eval()` with a sandboxed function:
```javascript
// expression-eval.js
function evaluateExpression(expression, value, row) {
  const fn = new Function('value', 'row', `"use strict"; return (${expression});`);
  return fn(value, row);
}
```
This is still dynamic but scoped — `value` and `row` are the only available variables, matching the existing mapping format exactly.

### 3.6 FK Resolution
Instead of loading JSON files, FK lookups query the `id_mappings` table:
```javascript
// fk-resolver.js
async function resolveFK(entityType, sourceId) {
  const [rows] = await trackerDb.query(
    'SELECT target_id FROM id_mappings WHERE entity_type = ? AND source_id = ?',
    [entityType, sourceId]
  );
  return rows.length > 0 ? rows[0].target_id : null;
}
```
Static FK mappings (like TerminalId: `{1→1, 4→2}`) remain inline in mapping JSON.

---

## 4. React Frontend

### 4.1 Pages

**Dashboard** (`/`)
- Cards showing: total entities, completed %, errors count
- Per-entity status bars (Project: 1271/1271, Recruiter: 0/544 pending, etc.)
- Recent errors preview
- DB connection health indicators (green/red dots)

**Migration Runner** (`/migrate`)
- Dropdown: select mapping file (e.g., "ProjectMapping_Funds")
- Shows: source table, target table, estimated row count
- Shows: dependency check (Project completed → can run Recruiter)
- Config: batch size slider (100-2000, default 500)
- Buttons: **Run** / **Pause** / **Resume** / **Restart**
- Real-time progress: animated progress bar, row counter, rows/sec
- Live log stream (last 20 events)

**ID Mappings** (`/id-mappings`)
- Search box: enter old ID or new ID
- Filter by entity type
- Table: entity_type | source_id | target_id | created_at
- Export to CSV button

**Error Viewer** (`/errors`)
- Filter by: migration run, error type, date range
- Table: timestamp | entity | source_id | error_type | message
- Click row → expand to see full source_data JSON and stack trace
- Export errors to CSV

**Settings** (`/settings`)
- DB connection strings (editable, with test button)
- View/reload mapping files

### 4.2 Tech Choices
- **Vite** for fast dev builds
- **React Router** for navigation
- **TanStack Query** (React Query) for API data fetching + caching
- **Socket.io client** for WebSocket real-time updates
- **Tailwind CSS** for styling (supports RTL via `dir="rtl"`)
- No heavy component library — keep it lean

---

## 5. Mapping File Enhancements

Keep existing format 100% backward-compatible. Add optional metadata:

```json
{
  "filename": "ProjectMapping_Funds",
  "_meta": {
    "entityType": "Project",
    "sourceTable": "products",
    "targetTable": "project",
    "sourcePrimaryKey": "productsid",
    "description": "Migrates Fund products (ProjectType=1)",
    "dependsOn": [],
    "order": 1
  },
  "whereClause": "IsNull([Certificate],0) != 1 AND NOT EXISTS ...",
  "columnMappings": { ... },
  "localizationMappings": { ... },
  "projectItemMappings": { ... },
  "fkMappings": { ... }
}
```

### Dependency Graph (`mappings/_meta.json`)
```json
{
  "migrationOrder": [
    { "mapping": "ProjectMapping_Funds", "entityType": "Project", "order": 1 },
    { "mapping": "ProjectMapping_Collections", "entityType": "Project", "order": 2 },
    { "mapping": "PrayerMapping", "entityType": "Project", "order": 3 },
    { "mapping": "RecruitersGroupMapping", "entityType": "RecruitersGroup", "order": 4, "dependsOn": ["Project"] },
    { "mapping": "RecruiterMapping", "entityType": "Recruiter", "order": 5, "dependsOn": ["Project", "RecruitersGroup"] },
    { "mapping": "RecruiterLocalizationMapping", "entityType": "RecruiterLocalization", "order": 6, "dependsOn": ["Recruiter"] },
    { "mapping": "DonationMapping", "entityType": "Donation", "order": 7, "dependsOn": ["Project", "Recruiter"] },
    { "mapping": "GalleryMapping_Images", "entityType": "Gallery", "order": 8 },
    { "mapping": "GalleryMapping_Videos", "entityType": "Gallery", "order": 9 },
    { "mapping": "AffiliateMapping", "entityType": "Affiliate", "order": 10 },
    { "mapping": "CustomerUserMapping", "entityType": "CustomerUser", "order": 11 }
  ]
}
```

---

## 6. Implementation Steps

### Phase 1: Foundation
1. Initialize `server/` project with Express, install deps (mssql, mysql2, express, socket.io, winston)
2. Initialize `client/` project with Vite + React + Tailwind
3. Create `config/database.js` with 3 connection configs
4. Create DB connection modules (`db/mssql.js`, `db/mysql-target.js`, `db/mysql-tracker.js`)
5. Create `db/init-tracker.js` — auto-creates `migration_tracker` DB and all 4 tables on startup
6. Create connection test route (`/api/connections/test`)

### Phase 2: Tracking DB & Core Engine
7. Implement `services/tracker.js` — all CRUD for migration_runs, row_status, id_mappings, migration_errors
8. Implement `engine/expression-eval.js` — safe expression evaluator
9. Implement `engine/fk-resolver.js` — FK lookups from id_mappings + inline static maps
10. Implement `engine/row-processor.js` — takes mapping + source row → target row
11. Implement `engine/batch-runner.js` — batched INSERT with transaction per row
12. Implement `engine/migration-engine.js` — orchestrates full migration flow (fetch → process → insert → track)

### Phase 3: API Routes
13. Implement all routes: migrations (start/pause/resume/restart), status, mappings, id-lookups, errors
14. Implement WebSocket server (`websocket.js`) — emit progress events
15. Implement `services/migration-manager.js` — manages active migration instances, pause signals

### Phase 4: Copy & Enhance Mappings
16. Copy all mapping JSON files from `legacy/mappings/` to `server/mappings/`
17. Add `_meta` fields to each mapping file
18. Create `mappings/_meta.json` dependency graph
19. Validate all mappings load and parse correctly

### Phase 5: React Dashboard
20. Build Layout with RTL support and sidebar navigation
21. Build Dashboard page — overall status cards + per-entity progress
22. Build MigrationRunner page — select mapping, configure, run with real-time progress
23. Build IdLookup page — search old<->new IDs
24. Build ErrorViewer page — filterable error table
25. Build Settings page — connection config + mapping viewer
26. Wire up WebSocket for real-time progress updates

### Phase 6: Testing & Validation
27. Test with a single small mapping (e.g., RecruitersGroup — ~70 rows)
28. Verify exactly-once: run, pause, resume — check no duplicates
29. Verify restart: clean and re-run — check counts match
30. Test full Project migration (Funds + Collections)
31. Run all remaining mappings in dependency order
32. Cross-validate row counts: source vs target vs tracker

---

## 7. Key Files to Modify/Create

### New files to create:
- `server/package.json`
- `server/src/index.js`
- `server/src/config/database.js`
- `server/src/db/mssql.js`, `mysql-target.js`, `mysql-tracker.js`, `init-tracker.js`
- `server/src/engine/migration-engine.js`, `row-processor.js`, `expression-eval.js`, `fk-resolver.js`, `batch-runner.js`
- `server/src/routes/migrations.js`, `status.js`, `mappings.js`, `id-lookups.js`, `errors.js`, `connections.js`
- `server/src/services/tracker.js`, `migration-manager.js`
- `server/src/websocket.js`
- `server/mappings/*.json` (copied + enhanced from legacy)
- `client/` — full React app (Vite scaffolding + all components listed in section 4)

### Reference files (read-only):
- `legacy/src/server.js` — migration logic patterns
- `legacy/mappings/*.json` — mapping definitions
- `legacy/config/database.js` — connection configs
- `legacy/scripts/migration/migrate-donations.js` — complex migration patterns
- `legacy/database/schemas/KupatHairNewMySQL.sql` — target schema

---

## 8. Verification Plan

1. **Connection test**: Start server → hit `/api/connections/test` → all 3 DBs green
2. **Tracker init**: On first start, `migration_tracker` DB + 4 tables created automatically
3. **Small migration test**: Run RecruitersGroup mapping (~70 rows) → verify:
   - `migration_runs` has entry with correct counts
   - `id_mappings` has 70 entries (entity_type='RecruitersGroup')
   - `row_status` has 70 entries (all status='inserted')
   - Target `recruitersgroup` table has 70 new rows
4. **Pause/Resume test**: Start Project migration → pause at 50% → verify `last_processed_source_id` → resume → verify completion with no gaps/duplicates
5. **Restart test**: Restart completed migration → verify old target rows deleted → re-run → same final counts
6. **Error handling test**: Introduce a bad FK reference → verify row logged as error, migration continues, error visible in UI
7. **ID lookup test**: Search for old ProductId=1 → get new ProjectId in UI
8. **Full migration**: Run all mappings in dependency order → cross-validate counts against legacy system results


---

## Progress Log

### Phase 1: Foundation
- [x] Step 1: Initialize server/ project with Express, install deps
- [x] Step 2: Initialize client/ project with Vite + React + Tailwind
- [x] Step 3: Create config/database.js with 3 connection configs
- [x] Step 4: Create DB connection modules (mssql.js, mysql-target.js, mysql-tracker.js)
- [x] Step 5: Create db/init-tracker.js - auto-creates migration_tracker DB and all 4 tables
- [x] Step 6: Create connection test route (/api/connections/test)

### Phase 2: Tracking DB and Core Engine
- [x] Step 7: Implement services/tracker.js - all CRUD for tracking tables
- [x] Step 8: Implement engine/expression-eval.js - safe expression evaluator
- [x] Step 9: Implement engine/fk-resolver.js - FK lookups from id_mappings + inline static maps
- [x] Step 10: Implement engine/row-processor.js - mapping + source row to target row
- [x] Step 11: Implement engine/batch-runner.js - batched INSERT with transaction
- [x] Step 12: Implement engine/migration-engine.js - orchestrates full migration flow

### Phase 3: API Routes
- [x] Step 13: Implement all routes (migrations, status, mappings, id-lookups, errors)
- [x] Step 14: Implement WebSocket server (websocket.js)
- [x] Step 15: Implement services/migration-manager.js

### Phase 4: Copy and Enhance Mappings
- [x] Step 16: Copy all mapping JSON files from legacy/mappings/ to server/mappings/
- [x] Step 17-18: Create mappings/_meta.json dependency graph
- [x] Step 19: All mappings load and parse correctly

### Phase 5: React Dashboard
- [x] Step 20: Build Layout with RTL support and sidebar navigation
- [x] Step 21: Build Dashboard page - overall status cards + per-entity progress
- [x] Step 22: Build MigrationRunner page - select mapping, configure, run with real-time progress
- [x] Step 23: Build IdLookup page - search old/new IDs
- [x] Step 24: Build ErrorViewer page - filterable error table
- [x] Step 25: Build ConnectionStatus page
- [x] Step 26: Wire up WebSocket for real-time progress updates

### Phase 6: Testing and Validation
- [ ] Step 27: Test with small mapping (RecruitersGroup)
- [ ] Step 28: Verify exactly-once: run, pause, resume
- [ ] Step 29: Verify restart functionality
- [ ] Step 30: Test full Project migration
- [ ] Step 31: Run all remaining mappings in dependency order
- [ ] Step 32: Cross-validate row counts
