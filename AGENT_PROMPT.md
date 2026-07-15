# Prompt for New Agent - Migration System Build

## Your Task

Build a production-grade database migration system. The full plan is in `MIGRATION_SYSTEM_PLAN.md` — read it first before doing anything.

## Project Context

We're migrating a charity organization (Kupat Hair) database from **MS SQL Server** to **MySQL**. The system handles donations, fundraising projects, recruiters, prayers, and media — all with **3-language support** (Hebrew, English, French).

## Current State

- **Nothing has been built yet** — only the plan file exists
- The `legacy/` folder contains a working but messy old migration system (read-only reference)
- The new system goes into `server/` (Express backend) and `client/` (React frontend)
- **The target MySQL DB (`kupathairnew`) will be clean** — no existing migrated data. No need to sync or import legacy state.

## Database Connections

```
Source (MSSQL - read only):
  server: DESKTOP-7QELS7G
  database: kupatOld
  user: no
  password: 0987654321
  encrypt: false
  trustServerCertificate: true
  requestTimeout: 300000

Target (MySQL - write):
  host: localhost
  user: root
  password: 1234
  database: kupathairnew

Tracking (MySQL - new DB, auto-created on startup):
  host: localhost
  user: root
  password: 1234
  database: migration_tracker
```

## Critical Reference Files (in `legacy/`)

Read these to understand the patterns you need to preserve:

1. **`legacy/src/server.js`** (~4,236 lines) — The monolithic server with ALL migration logic. Contains: expression evaluation, FK resolution, localization handling, batch processing, SSE events. This is the main reference for how transformations work.

2. **`legacy/mappings/*.json`** (11 files) — Column mapping definitions. These define how each source column maps to a target column. Format uses `convertType: direct|expression|const|FK`. You will copy and enhance these files.
   - `ProjectMapping.json` — Most complex: funds, collections, localization, projectItems, projectItemLocalization
   - `RecruiterMapping.json`, `RecruitersGroupMapping.json`
   - `PrayerMapping.json`
   - `ProjectItemLocalizationMapping.json`
   - `RecruiterLocalizationMapping.json`
   - `GalleryMapping_Images.json`, `GalleryMapping_Videos.json`
   - `ProjectMapping_Collections_Fixed.json`, `ProjectMapping_Funds_Fixed.json`
   - `ProjectMapping_Collections_Type2.json`

3. **`legacy/database/schemas/KupatHairNewMySQL.sql`** — Complete target MySQL schema (103 tables). Use this to validate column names, types, VARCHAR lengths, NOT NULL constraints, FK relationships.

4. **`legacy/data/Mapping -Vs.xlsx`** — The master Excel mapping document. Source of truth for all table-to-table mappings.

5. **`legacy/scripts/migration/migrate-donations.js`** (~1,063 lines) — Most complex migration script. Shows batch processing, state persistence, FK resolution across multiple mappings, inline Address creation.

6. **`legacy/config/database.js`** — Original DB config (2 connections). You'll create a new one with 3 connections.

7. **`legacy/data/fk-mappings/*.json`** (9 files) — Old ID→New ID mappings stored as JSON files. In the new system, these are replaced by the `id_mappings` table in the tracking DB.

## Implementation Approach — TWO PHASES

### Phase A: Build Infrastructure ONLY (no actual migrations)
Build the complete system first:
1. Server: Express + 3 DB connections + tracking DB auto-creation
2. Engine: batch processing, row transformation, FK resolution, pause/resume/restart
3. API routes: all endpoints for migrations, status, mappings, id-lookups, errors
4. WebSocket: real-time progress events (socket.io)
5. React dashboard: Dashboard, MigrationRunner, IdLookup, ErrorViewer, Settings pages
6. Copy mapping files from legacy/ to server/mappings/ with `_meta` enhancements

At the end of Phase A: a fully working system that can run any mapping file, but no migration has been executed yet.

### Phase B: Create & Test Each Mapping (one at a time, later)
This will be done in a separate session after Phase A is verified working:
1. Start with a small table (RecruitersGroup, ~70 rows)
2. Then Project (Funds), then Project (Collections)
3. Then Recruiter, Donations, etc. — following dependency order
4. Each mapping: run → verify counts → verify ID mappings → verify errors → next

## Tech Stack
- **Backend**: Node.js + Express + socket.io + winston + mssql + mysql2
- **Frontend**: React + Vite + Tailwind CSS + React Router + TanStack Query + socket.io-client
- **Tracking DB**: Separate MySQL database `migration_tracker` with 4 tables (migration_runs, id_mappings, row_status, migration_errors)

## Key Architecture Rules

1. **Exactly-once guarantee**: Check `row_status` before processing. INSERT + status write in a MySQL transaction. UNIQUE constraint on `(entity_type, source_id)` in id_mappings.

2. **FK resolution from tracker DB**: Instead of loading JSON files, query `id_mappings` table. Static FKs (like TerminalId: {1→1, 4→2}) stay inline in mapping JSON.

3. **Safe expression evaluator**: Replace `eval()` with `new Function('value', 'row', ...)` — scoped to `value` and `row` only.

4. **Pause/Resume/Restart**: In-memory flag for pause (checked per batch). Resume from `last_processed_source_id`. Restart cleans tracking + target rows.

5. **RTL support**: The UI should support Hebrew (RTL) via Tailwind's `dir="rtl"`.

6. **Mapping format**: Reuse existing JSON format 100% backward-compatible. Add optional `_meta` field with entityType, sourceTable, targetTable, sourcePrimaryKey, dependsOn, order.

## Migration Order (Dependencies)

```
1. Project (Funds)        — no dependencies
2. Project (Collections)  — no dependencies
3. Prayers                — no dependencies (creates Projects of type 2)
4. RecruitersGroup        — depends on: Project
5. Recruiter              — depends on: Project, RecruitersGroup
6. RecruiterLocalization  — depends on: Recruiter
7. Donations              — depends on: Project, Recruiter
8. Gallery (Images)       — no dependencies
9. Gallery (Videos)       — no dependencies
10. Affiliates            — no dependencies
11. CustomerUsers         — no dependencies
```

## Progress Tracking — MANDATORY

You MUST update the `MIGRATION_SYSTEM_PLAN.md` file after completing each step. At the bottom of the file there is a `## Progress Log` section. After every step you complete:

1. Mark the step as done with a timestamp and short summary
2. If a step failed or had issues, document what happened and how you resolved it
3. If you're stopping mid-work, write exactly where you stopped and what remains

Format:
```
## Progress Log

### Phase 1: Foundation
- [x] Step 1 — Server initialized, deps installed (express, mssql, mysql2, socket.io, winston)
- [x] Step 2 — React client scaffolded with Vite + Tailwind
- [ ] Step 3 — IN PROGRESS: database.js created, mysql-tracker.js pending
```

This is critical because:
- We work in multiple sessions — the next agent needs to know exactly where you left off
- If you crash or the session ends, we need to resume without re-doing work
- It gives the user visibility into what was done vs what's left

**Before writing any code, first add the `## Progress Log` section to `MIGRATION_SYSTEM_PLAN.md` with all steps listed as `[ ]` (pending).**

## Start Here

1. Read `MIGRATION_SYSTEM_PLAN.md` for the full architectural plan
2. Add the `## Progress Log` section to `MIGRATION_SYSTEM_PLAN.md` with all 32 steps listed as pending
3. Read `legacy/config/database.js` for connection patterns
4. Read `legacy/mappings/ProjectMapping.json` for the mapping format
5. Start building Phase A, step by step, following the plan's implementation steps (Section 6)
6. After each step: update the Progress Log in `MIGRATION_SYSTEM_PLAN.md`
