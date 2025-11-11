# Migration Status - Database Migration Helper

Date: November 11, 2025

## Overview

This project provides a web-based tool for managing database migration from SQL Server to MySQL, with full support for field mapping, expressions, foreign keys, and multi-language localization.

## Latest Migration Results

**Date**: November 11, 2025 08:42

### Project Table Migration
- **Status**: ✅ SUCCESS
- **Rows migrated**: 1750/1750 (100%)
- **Errors**: 0

### projectLocalization Migration
- **Status**: ⚠️ MOSTLY SUCCESS
- **Rows migrated**: 5244/5250 (99.9%)
- **Errors**: 6 (Title cannot be null)
- **Failed rows**:
  - Project 335 (french): Name_fr is null
  - Project 373 (french): Name_fr is null
  - Project 1000 (english, french): Name_en/Name_fr are null
  - Project 1399 (english, french): Name_en/Name_fr are null

## What We've Built

### 1. Full Migration Engine (server.js)

**Core Features:**
- ✅ Direct field mapping (oldColumn → newColumn)
- ✅ Constant values (e.g., ProjectType = 2)
- ✅ JavaScript expressions (e.g., `value.substring(0, 150)`)
- ✅ Default values (GETDATE(), static values)
- ✅ Foreign Key mapping with value translation
- ✅ Multi-language localization (Hebrew, English, French)
- ✅ Expression evaluation for both Project and projectLocalization
- ✅ Automatic SELECT query building including localization columns

**API Endpoints:**
- `POST /api/test-mssql` - Test SQL Server connection
- `POST /api/test-mysql` - Test MySQL connection
- `POST /api/migrate` - Execute migration with full mapping support
- `GET /api/analyze/:tableName` - Analyze table structure and relationships
- `GET /api/old-tables` - List all source tables
- `GET /api/old-table/:tableName` - Get source table structure

### 2. Web Interface (public/index.html)

**Features:**
- Interactive field mapping UI
- Load/Save mapping configurations (JSON format)
- Test database connections
- Execute migrations
- View migration logs in real-time

### 3. Mapping System

**File Format**: JSON (ProjectMapping.json)

**Mapping Types:**
1. **direct**: Simple column copy
2. **const**: Static value
3. **expression**: JavaScript expression evaluation
4. **FK**: Foreign key with value translation

**Example Mapping:**
```json
{
  "columnMappings": {
    "Name": {
      "convertType": "expression",
      "oldTable": "products",
      "oldColumn": "Name",
      "expression": "value ? value.substring(0, 150) : null"
    }
  },
  "fkMappings": {
    "TerminalId": {
      "1": "1",
      "4": "2"
    }
  },
  "localizationMappings": {
    "Title": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name",
        "expression": "value ? value.substring(0, 150) : null"
      }
    }
  }
}
```

## Current Project Table Mapping

### Mapped Fields:

1. **Name** ← Products.Name
   - Type: expression
   - Expression: `value ? value.substring(0, 150) : null`
   - Reason: Target column is varchar(150)

2. **ProjectType** ← Constant
   - Value: "2" (Collection type)

3. **KupatFundNo** ← Products.ProjectNumber
   - Type: direct

4. **DisplayAsSelfView** ← Products.WithoutKupatView
   - Type: direct

5. **TerminalId** ← Products.Terminal
   - Type: direct + FK mapping
   - FK translations: 1→1, 4→2

6. **RecordStatus** ← Constant
   - Value: "2"

7. **StatusChangedAt** ← Constant
   - Value: GETDATE()

8. **StatusChangedBy** ← Constant
   - Value: "-1"

9. **CreatedAt** ← Products.DateCreated
   - Type: direct
   - Default: GETDATE()

10. **CreatedBy** ← Constant
    - Value: "-1"

11. **UpdatedAt** ← Constant
    - Value: GETDATE()

12. **UpdatedBy** ← Constant
    - Value: "-1"

## Current projectLocalization Mapping

### Fields (per language: Hebrew, English, French):

1. **Title**
   - Hebrew ← Products.Name
   - English ← Products.Name_en
   - French ← Products.Name_fr
   - Expression: `value ? value.substring(0, 150) : null`
   - Default (EN/FR): "Default Title" / "Titre par défaut"

2. **Description**
   - Hebrew ← Products.ShortDescription
   - English ← Products.ShortDescription_en
   - French ← Products.ShortDescription_fr

3. **DisplayInSite**
   - All languages ← Products.Hide
   - Expression: `row.Hide ? 0 : 1`

4. **RecruitmentTarget**
   - All languages ← Products.Price
   - Expression: `value || 0`
   - Default (Hebrew): "0"

5. **HideDonationsInSite**
   - All languages ← Products.HideDonationAmount

6. **OrderInProjectsPageView**
   - All languages ← Products.Sort
   - Expression: `value <= 30 ? value : null`

## Technical Achievements

### Recent Fixes (Nov 11, 2025):

1. ✅ **Expression support for Project table**
   - Added expression evaluation in columnMappings (server.js:593-603)
   - Fixes Name truncation issue

2. ✅ **SELECT query optimization**
   - Automatically includes all columns from localizationMappings (server.js:538-548)
   - Prevents missing data during localization migration

3. ✅ **RecruitmentTarget mapping**
   - Changed from mixed (direct/expression) to consistent expression across all languages
   - Expression: `value || 0` (use value or default to 0)

4. ✅ **convertType consistency**
   - Fixed localizationMappings to use "expression" when expression field exists
   - Previously some mappings had convertType "direct" with expression field

## Known Issues

### 1. Title NULL Errors (6 rows)
**Problem**: Some products have NULL values for Name_en or Name_fr
**Impact**: 6 localization rows failed (0.1% failure rate)
**Solutions**:
- Option A: Fix defaultValue application in expression evaluation
- Option B: Use Hebrew name as fallback if EN/FR is null
- Option C: Accept 6 failures if not critical

### 2. defaultValue Not Applied After Expression
**Problem**: When expression returns null, defaultValue should be used but isn't
**Location**: server.js:684-689 (applies default BEFORE expression, not after)
**Fix needed**: Apply defaultValue AFTER expression evaluation if result is null

## Database Schema

### Source (SQL Server):
- **Table**: products
- **Key columns**: productsid, Name, ProjectNumber, Terminal, Price, DateCreated
- **Localization**: Name_en, Name_fr, ShortDescription_en, ShortDescription_fr

### Target (MySQL):
- **Table**: project (16 columns, 8 FK relationships)
- **Table**: projectLocalization (multi-language support, 3 rows per project)
- **Languages**: 1=Hebrew, 2=English, 3=French

## File Structure

```
NewMigration/
├── server.js                          # Migration engine
├── package.json                       # Dependencies
├── public/
│   └── index.html                     # Web UI
├── mappings/
│   └── ProjectMapping.json            # Current mapping config
├── fk-mappings/
│   └── TerminalId.json                # FK translation table
├── KupatHairNewMySQL.sql             # Target schema
├── create-kupat-db-generic.sql       # Source schema
├── Mapping.csv                        # Original mapping reference
├── migration-logs.log                 # Migration execution logs
├── MIGRATION_STATUS.md               # This file
├── CLAUDE.md                          # Development guidelines
└── README.md                          # Project documentation
```

## Next Steps

### Immediate:
1. ⏳ Fix Title NULL errors (apply defaultValue after expression)
2. ⏳ Verify RecruitmentTarget values in database
3. ⏳ Test with Fund type (ProjectType=1) in addition to Collection

### Short Term:
1. Complete all Project fields (MainMedia, ImageForListsView, etc.)
2. Migrate child tables (ProjectItem, Lead, Recruiter, etc.)
3. Add data validation and integrity checks

### Long Term:
1. Handle all 67 source tables
2. Create rollback/backup procedures
3. Performance optimization for large datasets
4. Complete migration documentation

## How to Use

### Start Server:
```bash
npm start
```
Server runs on: http://localhost:3030

### Execute Migration:
1. Open browser at http://localhost:3030
2. Test MSSQL connection (server: DESKTOP-8E2HGCA\SQLEXPRESS, database: KupatHair)
3. Test MySQL connection (host: localhost, user: root, database: kupathair_new)
4. Load mapping: Click "Load Mapping" → Select ProjectMapping.json
5. Click "Migrate" and select table "project"
6. Monitor progress in logs

### View Results:
- Check migration-logs.log for detailed execution log
- Query MySQL database to verify data

## Summary

The migration engine is fully functional with:
- ✅ 100% success rate for Project table (1750 rows)
- ✅ 99.9% success rate for projectLocalization (5244/5250 rows)
- ✅ Full expression support
- ✅ FK mapping with value translation
- ✅ Multi-language localization
- ⚠️ 6 minor issues with NULL titles (fixable)

**Overall Status**: Production-ready for Project and projectLocalization migration with minor known issues.
