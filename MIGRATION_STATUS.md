# Migration Status - November 26, 2025

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
| `public/recruiter-migration.html` | Recruiter migration UI (Hebrew RTL) |
| `scripts/migration/migrate-recruiter-localization-simple.js` | Simplified recruiter localization script |
| `src/server.js` | Migration engine with REST API |

---

## Next Steps

1. Review pending tables for migration
2. Create mapping files for each table
3. Test with small batches first
4. Run full migration
5. Verify data integrity

---

*Last updated: November 26, 2025*
