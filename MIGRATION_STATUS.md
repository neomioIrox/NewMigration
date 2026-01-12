# Migration Status - January 5, 2026

## Current State

### Completed Migrations

| Table | Source | Rows | Status |
|-------|--------|------|--------|
| project | products | 1,350 | ✅ 100% |
| projectLocalization | products | 4,050 | ✅ 100% (3 languages) |
| projectItem | products | 1,350 | ✅ 100% |
| projectItemLocalization | products | 4,050 | ✅ 100% (3 languages) |
| media | products | 1,916 | ✅ 100% |
| linkSetting | products | 8,100 | ✅ 100% |
| entityContent | products | 2,443 | ✅ ~99% (5 errors - Data too long) |
| entityContentItem | products | 2,438 | ✅ ~99% |
| recruitersGroup | ProductsGroup | 47 | ✅ 100% |
| recruitersGroupLanguage | ProductsGroup | 111 | ✅ 100% (37 groups × 3 languages) |
| recruiter | ProductStock | 3,828 | ✅ 100% |
| recruiterLocalization | ProductStock | 3,337 | ✅ 100% (3,321 HE, 15 EN, 1 FR) |
| affiliate | ParentSources | 78 | ✅ 100% |
| source | UserSources | 1,863 | ✅ 100% |

### Known Issues Fixed

1. **UTF8MB4 Collation Error** - Hebrew text insertion failed
   - Solution: Added `charset: 'UTF8MB4_GENERAL_CI'` + `SET NAMES utf8mb4`

2. **Prepared Statement Cache Overflow** - Errors after 1000 inserts
   - Solution: Changed `execute()` to `query()` for projectItemLocalization

3. **Non-existent Columns** - RecordStatus, StatusChangedAt, StatusChangedBy
   - Solution: Removed from mapping files

4. **Data Too Long** - ItemDefinition column
   - Solution: `ALTER TABLE entitycontentitem MODIFY COLUMN ItemDefinition LONGTEXT`

5. **Recruiter Localization Cascade Failures** - FK mapping dependencies failed due to duplicates
   - Solution: Created simplified script [migrate-recruiter-localization-simple.js](scripts/migration/migrate-recruiter-localization-simple.js) that:
     - Matches recruiters by Name instead of complex FK mappings
     - Inserts localization only for languages with non-empty data
     - Handles string "null" values correctly
   - Result: 3,337 rows (3,321 Hebrew, 15 English, 1 French) with 0 errors

6. **Centralized Database Configuration** - Connection settings duplicated across files
   - Solution: Created [config/database.js](config/database.js) with shared MSSQL and MySQL settings
   - All scripts now import from single source

7. **Funds Migration Missing News Check** - 181 Products wrongly classified as Funds (CRITICAL)
   - Problem: Products referenced in News table were being migrated as Funds (ProjectType=1) instead of Collections (ProjectType=2)
   - Impact: 181 out of 1,452 Products would have wrong ProjectType
   - Root Cause: WHERE clause in [ProjectMapping_Funds_Fixed.json](mappings/ProjectMapping_Funds_Fixed.json) was missing the third condition
   - Solution: Added News check to WHERE clause:
     ```sql
     AND NOT EXISTS (
       SELECT 1 FROM News
       WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
          OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
          OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
     )
     ```
   - Result: Funds migration now correctly excludes 181 Products (1,452 → 1,271)
   - Verification: Created [scripts/checks/find-products-in-news.js](scripts/checks/find-products-in-news.js)
   - Date Fixed: December 30, 2025

8. **DisplayInSite Hebrew Logic Missing ShowMainPage Check** - (CRITICAL)
   - Problem: Hebrew localization used `row.Hide ? 0 : 1` while English/French used `(!row.Hide_en && row.ShowMainPage) ? 1 : 0`
   - Impact: Projects with `Hide=0` but `ShowMainPage=0` were incorrectly marked as visible in Hebrew (DisplayInSite=1)
   - Example: ProductsId=248 → ProjectId=207 had DisplayInSite=1 for Hebrew but should be 0
   - Root Cause: Inconsistent logic between languages in projectLocalization.DisplayInSite mapping
   - Solution: Updated all Project mapping files to use consistent logic:
     ```javascript
     // Before (Hebrew only):
     "expression": "row.Hide ? 0 : 1"

     // After (all languages):
     "expression": "(!row.Hide && row.ShowMainPage) ? 1 : 0"
     ```
   - Files Fixed:
     - [mappings/ProjectMapping_Funds_Fixed.json](mappings/ProjectMapping_Funds_Fixed.json)
     - [mappings/ProjectMapping_Collections_Fixed.json](mappings/ProjectMapping_Collections_Fixed.json)
     - [mappings/ProjectMapping_Collections_Type2.json](mappings/ProjectMapping_Collections_Type2.json)
     - [mappings/ProjectMapping.json](mappings/ProjectMapping.json)
   - Verification: Created [scripts/checks/check-product-248.js](scripts/checks/check-product-248.js)
   - Date Fixed: December 31, 2025
   - **Action Required**: Re-run project and projectLocalization migration to fix existing data

9. **AWS MySQL Case Sensitivity for Table Names** - (CRITICAL)
   - Problem: AWS MySQL (Linux) is **case-sensitive** for table names, unlike Windows MySQL
   - Impact: All migrations failed with `Table 'kupathairnew.projectitemlocalization' doesn't exist` because actual name is `ProjectItemLocalization`
   - Root Cause: All SQL queries used lowercase table names (`project`, `projectitem`, etc.) instead of PascalCase
   - Solution: Updated all SQL queries to use **PascalCase** table names:
     - `project` → `Project`
     - `projectlocalization` → `ProjectLocalization`
     - `projectitem` → `ProjectItem`
     - `projectitemlocalization` → `ProjectItemLocalization`
     - `recruiter` → `Recruiter`
     - `recruitersgroup` → `RecruitersGroup`
     - And all other tables...
   - Files Fixed:
     - [src/server.js](src/server.js) - 30+ UPDATE/INSERT/SELECT queries
     - [scripts/migration/migrate-campaign-type3.js](scripts/migration/migrate-campaign-type3.js) - 11 queries
     - [scripts/migration/migrate-donations.js](scripts/migration/migrate-donations.js) - 1 query
     - [scripts/migration/migrate-recruiter-localization-simple.js](scripts/migration/migrate-recruiter-localization-simple.js) - 4 queries
     - [scripts/migration/migrate-recruitersgroup-localization-simple.js](scripts/migration/migrate-recruitersgroup-localization-simple.js) - 4 queries
     - [scripts/migration/run-projectitemlocalization-migration.js](scripts/migration/run-projectitemlocalization-migration.js) - 2 queries
   - Documentation: [docs/CASE_SENSITIVITY_FIX.md](docs/CASE_SENSITIVITY_FIX.md)
   - Date Fixed: January 5, 2026
   - **Result**: Migration now works on both AWS MySQL (case-sensitive) and Windows MySQL (case-insensitive)

---

## ID Mappings

Location: `data/fk-mappings/` (auto-generated during migration)

```javascript
// Project ID mapping
const projectMapping = require('./data/fk-mappings/ProjectId.json');
const newProjectId = projectMapping[oldProductId];

// Recruiter Group ID mapping
const recruiterGroupMapping = require('./data/fk-mappings/RecruiterGroupId.json');
const newRecruiterGroupId = recruiterGroupMapping[oldProductsGroupId];
```

---

## Pending Migrations

### Priority 1 - Core Tables
- [ ] Lead
- [x] ~~Recruiter~~ ✅ Completed
- [ ] CustomerUser
- [ ] Donation / Payment

### Priority 2 - Related Tables
- [ ] User assignments
- [ ] Permissions
- [ ] Reports

### Priority 3 - Historical Data
- [ ] Transaction history
- [ ] Audit logs

---

## Technical Notes

### MySQL Connection Settings
```javascript
const conn = await mysql.createConnection({
  ...config,
  charset: 'UTF8MB4_GENERAL_CI'
});
await conn.execute("SET NAMES utf8mb4 COLLATE utf8mb4_general_ci");
```

### Avoiding Prepared Statement Cache Issues
```javascript
// Use query() instead of execute() for bulk inserts
await conn.query(insertQuery, values);  // ✅
await conn.execute(insertQuery, values); // ❌ Fails after ~1000
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `config/database.js` | Centralized MSSQL & MySQL connection settings |
| `mappings/RecruiterMapping.json` | Recruiter mapping config |
| `mappings/RecruitersGroupMapping.json` | Recruiter group mapping config |
| `mappings/ProjectMapping_Funds_Fixed.json` | Project mapping config (Funds) |
| `mappings/ProjectItemLocalizationMapping.json` | ItemLocalization mapping |
| `data/fk-mappings/ProjectId.json` | Product→Project ID translation |
| `data/fk-mappings/RecruiterGroupId.json` | ProductsGroup→RecruitersGroup ID translation |
| `data/fk-mappings/AffiliateId.json` | ParentSources→Affiliate ID translation |
| `public/recruiter-migration.html` | Recruiter migration UI (Hebrew RTL) |
| `public/affiliates-migration.html` | Affiliates/Sources migration UI (Hebrew RTL) |
| `scripts/migration/migrate-recruiter-localization-simple.js` | Simplified recruiter localization script |
| `scripts/migration/migrate-affiliates-sources-all.js` | Affiliates & Sources migration |
| `scripts/checks/check-orders-data.js` | Orders data analysis |
| `scripts/checks/check-donation-dependencies.js` | Donation dependencies checker |
| `scripts/checks/check-funds-validation.js` | Funds WHERE clause validation |
| `scripts/checks/find-products-in-news.js` | Find Products referenced in News |
| `scripts/checks/check-funds-news-mismatch.js` | Check Funds/Collections misclassification |
| `docs/DONATION_MIGRATION_PLAN.md` | Complete Donation migration plan |
| `src/server.js` | Migration engine with REST API |

---

## Next Steps

1. Review pending tables for migration
2. Create mapping files for each table
3. Test with small batches first
4. Run full migration
5. Verify data integrity

---

*Last updated: January 5, 2026*
