# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Database Migration Helper - An interactive web-based tool for managing and mapping field-level migration from SQL Server to MySQL. The tool provides a visual interface for mapping Project table fields from the old Products table, with automatic loading of existing mappings from CSV.

## Development Commands

```bash
# Start the web server
npm start

# Server runs on http://localhost:3030

# Find running process (if needed)
ps aux | grep "node src/server.js"

# Stop server (replace PID)
kill <PID>
```

## Architecture

### Core Components

**Backend (src/server.js)**
- Express server with three main API endpoints:
  - `/api/analyze/:tableName` - Returns complete analysis of a table including foreign key relationships and mappings
  - `/api/old-tables` - Lists all tables from old SQL Server schema
  - `/api/old-table/:tableName` - Returns specific old table structure
- SQL parser (`parseSQLFile`) extracts table definitions, columns, and foreign keys using regex
- CSV parser (`parseMappingFile`) processes migration mappings from Mapping.csv
- Relationship analyzer (`findRelatedTables`) identifies bidirectional table relationships via foreign keys

**Frontend (public/index.html)**
- Single-page application with no framework dependencies
- Three-panel layout:
  1. Left: New MySQL database structure (Project table + related tables)
  2. Right: Old SQL Server database explorer with dropdown
  3. Bottom: Field mapping table from CSV
- Interactive table exploration with selectable columns

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
- **data/fk-mappings/*.json** - Foreign key translation tables
- **data/Mapping.csv** - Original mapping reference (3,137 lines)

## Current State (As of Nov 12, 2025)

**Migration Results:**
- project: 1,750/1,750 rows (100% ✅)
- projectLocalization: 5,250/5,250 rows (100% ✅ - NULL title issue fixed)
- projectItem: 3,500/3,500 items (100% ✅)

**Server:** Running on port 3030
**Progress:** 127/3,137 CSV lines (4%)
