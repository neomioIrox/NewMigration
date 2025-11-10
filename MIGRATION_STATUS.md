# Migration Status - Database Migration Helper

Date: November 9, 2025

## Overview

This project is a tool for managing database migration from SQL Server to MySQL, focusing on the Project table and its relationships.

## What We've Built So Far

### 1. Node.js Server with Express (server.js)

**Features:**
- **Dual SQL Parser**: Supports both MySQL and SQL Server formats
  - MySQL: `CREATE TABLE \`tablename\``
  - SQL Server: `CREATE TABLE [dbo].[tablename]`
- **3 API Endpoints**:
  - `GET /api/analyze/:tableName` - Analyzes a table with all its relationships
  - `GET /api/old-tables` - Returns list of all tables from the old DB
  - `GET /api/old-table/:tableName` - Returns structure of specific table from the old DB
- **CSV Parser**: Reads Mapping.csv file and parses migration rules

### 2. Web Interface (public/index.html)

**Features:**
- **Interactive field mapping interface**
- **Top Panel**: Displays all Project table columns
- **Each column has 2 dropdowns**:
  - First dropdown: Select table from old DB
  - Second dropdown: Select column from chosen table (enabled dynamically)
- **Auto-load mappings**: Interface reads Mapping.csv and automatically loads existing mappings
- **Bottom Panel**: Table displaying all mappings from CSV for reference

### 3. Data Files

- **KupatHairNewMySQL.sql**: MySQL schema of the new DB
- **create-kupat-db-generic.sql**: SQL Server schema of the old DB
- **Mapping.csv**: Detailed mapping file with conversion rules

## Current Project Table Mapping Status

### Fields with Existing Mapping (from Mapping.csv):

1. **Name** ← Products.Name (expression)
   - Truncate to 150 characters: `LEFT(name, 150)`

2. **KupatFundNo** ← Products.ProjectNumber (direct)

3. **CreditCardTerminalId** ← Products.Terminal (direct)
   - Note: In the new DB the field is called `TerminalId`, not `CreditCardTerminalId`

4. **DisplayAsSelfView** ← Products.WithoutKupatView (direct)

5. **CreatedAt** ← Products.DateCreated (direct)

### Fields Without Mapping:

- Id (auto-generated)
- ProjectType (const: 1 for Fund, 2 for Collection)
- MainMedia
- ImageForListsView
- DisplayItemsInProjectPage
- RecordStatus (const: 2)
- StatusChangedAt (const: GETDATE())
- StatusChangedBy (const: -1)
- CreatedBy (const: -1)
- UpdatedAt (const: GETDATE())
- UpdatedBy (const: -1)

## Old DB Status

**Total tables found: 67**

Including:
- products (main source table)
- orders, orderproducts
- users, usersources
- prayers, prayernames
- funds, nadarimdonations
- and more...

## New DB Status

**Project Table** contains:
- 16 columns
- 8 Foreign Keys (relationships to other tables)

**Child Tables** (referencing Project):
1. FundCategory
2. Lead
3. LinkSetting
4. MoreItemLink
5. ProjectItem
6. ProjectLocalization
7. Recruiter
8. RecruitersGroup

**Parent/Lookup Tables** (referenced by Project):
1. lutprojecttype
2. terminal
3. user
4. media
5. lutrecordstatus

## How to Use the Tool

### Starting the Server:
```bash
npm start
```

Server runs on: **http://localhost:3030**

### Workflow:

1. **Open the interface in browser**
2. **View existing mappings** that were auto-loaded from CSV
3. **Edit mappings**:
   - Select table from first dropdown
   - Select column from second dropdown
4. **Mappings are saved in JavaScript** (currently in-memory only)

## Next Steps

### Short Term:
1. ✅ ~~Build field mapping interface~~ - **Completed!**
2. ⏳ **Save mappings**: Add button to save mappings to file
3. ⏳ **SQL Export**: Generate INSERT/UPDATE scripts based on mappings
4. ⏳ **Validation**: Verify all required fields are mapped

### Medium Term:
1. Handle Expression type fields (calculations)
2. Handle Foreign Keys
3. Handle Constant values
4. Deal with two types of Projects (Fund=1, Collection=2)

### Long Term:
1. Migration of all dependent tables
2. Data integrity checks
3. Backup and rollback scripts
4. Complete migration process documentation

## Important Notes

### Issues Fixed:
1. **SQL Parser**: Fixed to support both MySQL and SQL Server
2. **Mapping Load**: Mappings from CSV auto-load on page open
3. **Dynamic Dropdowns**: Columns load only after table selection

### Potential Issues:
1. **Name Mismatch**: `CreditCardTerminalId` in mapping vs `TerminalId` in schema
2. **Duplicate Mappings**: 3 records of same field (Steps 1, 1.1, 1.1)
3. **Missing Fields**: Not all required fields are mapped (e.g., ProjectType)

## File System

```
NewMigration/
├── server.js                      # Node.js server
├── package.json                   # Dependencies
├── public/
│   └── index.html                 # User interface
├── KupatHairNewMySQL.sql         # New DB schema
├── create-kupat-db-generic.sql   # Old DB schema
├── Mapping.csv                    # Mapping rules
├── README.md                      # General documentation
├── CLAUDE.md                      # Claude Code guidelines
└── MIGRATION_STATUS.md           # This file
```

## Summary

The tool provides a convenient and visual interface for managing data migration. The current stage focuses on mapping Project table fields, with the ability to edit mappings interactively.

**Final Goal**: Complete and reliable migration of all data from SQL Server to MySQL, while maintaining data integrity and relationships.
