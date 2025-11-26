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

### Known Issues Fixed

1. **UTF8MB4 Collation Error** - Hebrew text insertion failed
   - Solution: Added `charset: 'UTF8MB4_GENERAL_CI'` + `SET NAMES utf8mb4`

2. **Prepared Statement Cache Overflow** - Errors after 1000 inserts
   - Solution: Changed `execute()` to `query()` for projectItemLocalization

3. **Non-existent Columns** - RecordStatus, StatusChangedAt, StatusChangedBy
   - Solution: Removed from mapping files

4. **Data Too Long** - ItemDefinition column
   - Solution: `ALTER TABLE entitycontentitem MODIFY COLUMN ItemDefinition LONGTEXT`

---

## ID Mappings

Location: `data/id-mappings/product-to-project.json` (local only, not in git)

```javascript
// Usage:
const mapping = require('./data/id-mappings/product-to-project.json');
const newProjectId = mapping.mappings[oldProductId];
```

---

## Pending Migrations

### Priority 1 - Core Tables
- [ ] Lead
- [ ] Recruiter
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
| `mappings/ProjectMapping_Funds_Fixed.json` | Main mapping config |
| `mappings/ProjectItemLocalizationMapping.json` | ItemLocalization mapping |
| `data/id-mappings/product-to-project.json` | ID translation (local) |
| `src/server.js` | Migration engine |

---

## Next Steps

1. Review pending tables for migration
2. Create mapping files for each table
3. Test with small batches first
4. Run full migration
5. Verify data integrity

---

*Last updated: November 26, 2025*
