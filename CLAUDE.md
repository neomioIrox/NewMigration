# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Database Migration Helper - An interactive web-based tool for managing and mapping field-level migration from SQL Server to MySQL. The tool provides a visual interface for mapping Project table fields from the old Products table, with automatic loading of existing mappings from CSV.

## Development Commands

```bash
# Start the web server
npm start

# Server runs on http://localhost:3030
# Main interface: http://localhost:3030
# Gallery migration: http://localhost:3030/gallery-migration.html
```

### Server Management (Windows)

```bash
# Find running server
netstat -ano | findstr :3030

# Stop server (replace PID)
taskkill /PID <PID> /F

# Or use PowerShell
powershell -Command "Stop-Process -Id <PID> -Force"

# Start in background
start /B npm start
```

### Server Management (Linux/Mac)

```bash
# Find running process
ps aux | grep "node src/server.js"

# Stop server (replace PID)
kill <PID>
```

## Architecture

### Core Components

**Backend (src/server.js)**
- Express server serving both web UI and REST API
- SQL parser (`parseSQLFile`) extracts table definitions, columns, and foreign keys using regex
- CSV parser (`parseMappingFile`) processes migration mappings from Mapping.csv
- Relationship analyzer (`findRelatedTables`) identifies bidirectional table relationships via foreign keys
- Migration engine with support for expressions, FK mappings, and localization
- Winston logger outputs to both console and `logs/migration-logs.log`

**Frontend**
- `public/index.html` - Main project migration interface (single-page app, vanilla JS)
  - Three-panel layout: New DB structure, Old DB explorer, Field mappings
  - Interactive table exploration with selectable columns
- `public/gallery-migration.html` - Gallery migration interface (Hebrew RTL)
  - Specialized UI for ProductMedia → Media/Gallery migration
  - Support for both image and video gallery items

### Project Structure

```
NewMigration/
├── src/                    # Server code
│   └── server.js          # Main Express server
├── public/                # Frontend UI
│   └── index.html
├── database/              # SQL files
│   ├── schemas/           # Database schemas
│   └── queries/           # SQL queries for checks
├── scripts/               # Helper scripts
│   ├── migration/         # Migration runners
│   ├── utils/             # Utility scripts
│   └── checks/            # Validation scripts
├── mappings/              # Mapping configurations
├── data/                  # Data files
│   ├── Mapping.csv
│   └── fk-mappings/       # FK translation files
├── reports/               # Migration reports
├── logs/                  # Log files
└── docs/                  # Documentation
```

### Key Data Files

**SQL Schemas**
- `database/schemas/KupatHairNewMySQL.sql` - Target MySQL database schema
- `database/schemas/create-kupat-db-generic.sql` - Source SQL Server database schema

**Migration Mapping**
- `data/Mapping.csv` - Field-by-field conversion rules with columns:
  - Step, New Table/Column, Convert Type, Old Table/Column, Comments
  - Convert types: direct, auto, const, expression, FK

### How SQL Parsing Works

The SQL parser (`parseSQLFile`) supports both MySQL and SQL Server formats:
- **MySQL**: `CREATE TABLE \`tablename\``
- **SQL Server**: `CREATE TABLE [dbo].[tablename]`

The parser is line-based, extracting:
1. Table names from `CREATE TABLE` statements
2. Column definitions (name + type) - handles both backtick and bracket syntax
3. Foreign key constraints (currently MySQL format only)

Foreign keys are stored bidirectionally:
- `referencedBy` array: tables pointing TO this table
- `references` array: tables this table points TO

### Interactive Mapping Interface

The main UI (index.html) provides field-level mapping:

**Features:**
- Each Project table column displays with 2 dropdowns
- First dropdown: select source table from old DB (67 tables available)
- Second dropdown: select source column (loaded dynamically when table selected)
- Mappings from CSV are auto-loaded on page load
- JavaScript object `columnMappings` stores current selections

**Data Flow:**
1. Page loads → fetch `/api/analyze/project` and `/api/old-tables`
2. `renderNewDB()` creates mapping UI with pre-selected values from CSV
3. User changes trigger `onTableSelected()` → loads columns via `/api/old-table/:name`
4. `loadColumnDropdown()` populates column options and stores mapping
5. Mappings tracked in `columnMappings` object (logged to console)

### Migration Focus

The tool centers on the **Project table** which maps to the old **Products table**. The Project table has multiple types (Fund=1, Collection=2) created from different Products filters (Steps 1 and 1.1 in mapping).

Key related tables:
- Child tables: ProjectItem, ProjectLocalization, Lead, Recruiter, etc.
- Parent/lookup tables: lutprojecttype, terminal, user, media, lutrecordstatus

Migration order matters: parent tables must be migrated before children due to foreign key constraints.

## Server API Reference

**Schema Analysis:**
- `GET /api/analyze/:tableName` - Full table analysis with FK relationships and mappings
- `GET /api/old-tables` - List all source database tables
- `GET /api/old-table/:tableName` - Get specific source table structure

**Database Configuration:**
- `POST /api/config/mssql` - Set SQL Server connection config
- `POST /api/config/mysql` - Set MySQL connection config
- `GET /api/test-connections` - Test both database connections

**Migration Execution:**
- `POST /api/migrate` - Execute migration with mapping configuration
  - Body: `{ tableName, mappings, fkMappings, localizationMappings, projectItemMappings, whereClause }`

## Database Configuration

The server requires connection to both MSSQL (source) and MySQL (target) databases.

**Setup before migration:**
1. Configure MSSQL: `POST /api/config/mssql` with connection details
2. Configure MySQL: `POST /api/config/mysql` with connection details
3. Test connections: `GET /api/test-connections`

**Note:** Connection configs are stored in memory. In production, use environment variables or secure configuration management.

## Running Migrations

**Test Migration (10 rows with rollback):**
```bash
node scripts/migration/run-migration-test.js
```

**Dry Run (simulation only, no database writes):**
```bash
node scripts/migration/run-migration.js
```

**Production Migration (full migration):**
```bash
node scripts/migration/run-final-migration.js
```

**Utility Scripts:**
```bash
# Clear all migrated tables
node scripts/utils/clear-tables.js

# Clear only ProjectItem data
node scripts/utils/clear-projectitem.js

# List available databases
node scripts/utils/list-databases.js
```

**Validation Scripts:**
```bash
# Check source data integrity
node scripts/checks/check-source-data.js

# Validate ProjectItem migration
node scripts/checks/check-projectitem.js
```

## Gallery Migration

**Feature:** Specialized interface for migrating ProductMedia gallery items (images and videos).

**Files:**
- `public/gallery-migration.html` - Hebrew RTL interface for gallery migration
- `mappings/GalleryMapping_Images.json` - Image gallery field mappings
- `mappings/GalleryMapping_Videos.json` - Video gallery field mappings

**Access:** http://localhost:3030/gallery-migration.html

**Purpose:** Migrate ProductMedia records from old database to new Media/Gallery structure with support for both image and video types.

## File Modification Guidelines

**When modifying server.js:**
- SQL regex patterns are fragile - test thoroughly with both SQL files
- Foreign key extraction depends on specific CONSTRAINT syntax
- API responses must match frontend expectations (see `renderNewDB`, `renderMappings`)

**When modifying index.html:**
- Vanilla JS only - no build step
- Column selection state tracked in `selectedColumns` Set
- Table dropdown dynamically populated from `/api/old-tables`

**When working with SQL files:**
- These are source files for parsing - do not modify unless changing actual schemas
- Parser now supports both MySQL (backticks) and SQL Server (brackets) syntax

## Documentation Structure

**For AI-assisted development, start here:**
- **PROMPT.md** - Master prompt with project context, rules, mapping patterns, and usage instructions
- **docs/INDEX.md** - Documentation navigation guide with use cases and quick search

**Technical reference:**
- **docs/TECHNICAL_PATTERNS.md** - Code patterns, common pitfalls, and best practices
- **docs/mappings/mapping-project.md** - Project table mapping details (75% complete)
- **docs/mappings/mapping-projectlocalization.md** - Multi-language localization mapping (55% complete)
- **docs/mappings/mapping-projectitem.md** - ProjectItem mapping with variable cardinality (59% complete)

**Status and tracking:**
- **MIGRATION_STATUS.md** - Current migration status, results, and known issues
- **reports/Mapping-Coverage.html** - Visual progress report (127/3,137 lines = 4%)
- **logs/migration-logs.log** - Migration execution logs
- **SESSION_SUMMARY_2025-11-12.md** - Latest session summary and changes

**Configuration:**
- **mappings/ProjectMapping.json** - Active mapping configuration (nested structure for CLI)
- **mappings/ProjectMapping_Funds_Fixed.json** - Funds migration (flat structure for UI)
- **mappings/ProjectMapping_Collections_Fixed.json** - Collections migration (flat structure for UI)
- **mappings/GalleryMapping_Images.json** - Image gallery migration mappings
- **mappings/GalleryMapping_Videos.json** - Video gallery migration mappings
- **data/fk-mappings/*.json** - Foreign key translation tables
- **data/Mapping.csv** - Original mapping reference (3,137 lines)

## AI Agents

**Claude Code Agents** - Specialized subagents for automation:

### Mapping Generator Agent (`.claude/agents/mapping-generator/`)
Automatically generates JSON mapping configurations from CSV file.

**Capabilities:**
- Reads and parses Mapping.csv
- Identifies patterns (localization, FK, expressions)
- Generates UI or CLI format mappings
- Adds NULL safety automatically
- Handles multi-language localizations

**Usage:**
```
Table: [table_name]
Steps: [step_range]
Format: [ui|cli]
```

**Documentation:**
- `prompt.md` - Agent instructions and rules
- `rules.md` - Mapping patterns and examples
- `example.md` - Practical use cases
- `README.md` - User guide

### Migration Executor Agent (`.claude/agents/migration-executor/`)
Executes database migrations using JSON mappings against live databases.

**Capabilities:**
- Connects to MSSQL and MySQL
- Executes migrations (test/dry-run/production modes)
- Handles errors with retry logic
- Generates detailed reports
- Supports rollback

**Modes:**
- `test` - 10 rows, with rollback
- `dry-run` - Simulates without writing
- `production` - Full migration

**Documentation:**
- `prompt.md` - Execution instructions
- `strategies.md` - Advanced patterns
- `README.md` - User guide

**Complete workflow:** `.claude/agents/USAGE_EXAMPLES.md`

## Current State

**Note:** This status snapshot may be outdated. Check [MIGRATION_STATUS.md](MIGRATION_STATUS.md) for the latest migration results and detailed reports.

**Last Updated:** Nov 12, 2025

**Migration Results:**
- project: 1,750/1,750 rows (100% ✅)
- projectLocalization: 5,250/5,250 rows (100% ✅ - NULL title issue fixed)
- projectItem: 3,500/3,500 items (100% ✅)

**Server:** Port 3030
**Overall Progress:** 127/3,137 CSV mapping lines (4%)
**Status:** Three core tables successfully migrated with 100% success rate
