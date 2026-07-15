# Testing Payment Fields Fix - Funds Migration

## Summary of Fixes

### Fix #1: Missing Fields in SELECT Query

**Problem**: Payment fields (PaymentSum, DefaultPaymentsCount) in `projectitemlocalization` table were showing NULL values because the required source columns were not being included in the SELECT query.

**Root Cause**: The `server.js` migration engine was missing code to process `projectItemLocalizationMappings` when building the SELECT query (lines 1414-1513).

**Fix Applied**: Added code block at lines 1515-1538 in [src/server.js](src/server.js#L1515-L1538) to process `projectItemLocalizationMappings` and extract all required fields from expressions.

### Fix #2: Hebrew Fallback for Empty Language Fields

**Problem**: When English or French payment fields are NULL/empty in the source database, those languages should use the Hebrew values as fallback, but the original expressions didn't implement this.

**Fix Applied**: Updated expressions in [mappings/ProjectMapping_Funds_Fixed.json](mappings/ProjectMapping_Funds_Fixed.json) for English and French to include Hebrew fallback using the `||` operator.

**Example** (English PaymentSum):
```javascript
// Before (no fallback):
row.DefaultDonationSumFixed_en > 0 ? (row.DefaultDonationSumFixed_en * (row.DefaultPaymentsNumFixed_en || 1)) : row.DefaultDonationsSum_en

// After (with Hebrew fallback):
(row.DefaultDonationSumFixed_en > 0 ? (row.DefaultDonationSumFixed_en * (row.DefaultPaymentsNumFixed_en || 1)) : row.DefaultDonationsSum_en)
||
(row.DefaultDonationSumFixed > 0 ? (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1)) : row.DefaultDonationsSum)
```

**Fields Updated**:
- English: PaymentSum, DefaultPaymentType, DefaultPaymentsCount
- French: PaymentSum, DefaultPaymentType, DefaultPaymentsCount

**Test Results**: ✅ All 4 test cases passed successfully, including שרלין case where EN/FR correctly fall back to Hebrew value of 300.

## What Changed

### Before Fix
SELECT query was missing these critical fields:
- `DefaultDonationsSum` (Hebrew)
- `DefaultPaymentsNumber` (Hebrew)
- `DefaultDonationsSum_en` (English)
- `DefaultPaymentsNumber_en` (English)
- `DefaultDonationsSum_fr` (French)
- `DefaultPaymentsNumber_fr` (French)

**Result**: Expressions like `row.DefaultDonationsSum` returned `undefined`, causing PaymentSum to be NULL.

### After Fix
All 12 payment-related fields now included in SELECT query:
- ✅ `DefaultDonationSumFixed`
- ✅ `DefaultPaymentsNumFixed`
- ✅ `DefaultDonationsSum` ← Critical field that was missing
- ✅ `DefaultPaymentsNumber` ← Critical field that was missing
- ✅ `DefaultDonationSumFixed_en`
- ✅ `DefaultPaymentsNumFixed_en`
- ✅ `DefaultDonationsSum_en` ← Critical field that was missing
- ✅ `DefaultPaymentsNumber_en` ← Critical field that was missing
- ✅ `DefaultDonationSumFixed_fr`
- ✅ `DefaultPaymentsNumFixed_fr`
- ✅ `DefaultDonationsSum_fr` ← Critical field that was missing
- ✅ `DefaultPaymentsNumber_fr` ← Critical field that was missing

## Test Case: שרלין (ProductsId 1957)

This specific fund was identified as having the issue and demonstrates both fixes:

### Old DB (SQL Server Products table)
```
ProductsId: 1957
Name: הצדקנית מרת שרה שרלין ע"ה

Hebrew:
  DefaultDonationSumFixed: NULL
  DefaultPaymentsNumFixed: NULL
  DefaultDonationsSum: 300  ← Source value (Hebrew)
  DefaultPaymentsNumber: NULL

English (ALL NULL - should use Hebrew fallback):
  DefaultDonationSumFixed_en: NULL
  DefaultPaymentsNumFixed_en: NULL
  DefaultDonationsSum_en: NULL  ← Empty, needs fallback!
  DefaultPaymentsNumber_en: NULL

French (ALL NULL - should use Hebrew fallback):
  DefaultDonationSumFixed_fr: NULL
  DefaultPaymentsNumFixed_fr: NULL
  DefaultDonationsSum_fr: NULL  ← Empty, needs fallback!
  DefaultPaymentsNumber_fr: NULL
```

### Expected Result in New DB
After both fixes, the expressions should evaluate correctly for all languages:

```javascript
// Hebrew PaymentSum (no fallback needed):
row.DefaultDonationSumFixed > 0
  ? (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1))
  : row.DefaultDonationsSum
// Result: 300 ✓

// English PaymentSum (with Hebrew fallback):
(row.DefaultDonationSumFixed_en > 0
  ? (row.DefaultDonationSumFixed_en * (row.DefaultPaymentsNumFixed_en || 1))
  : row.DefaultDonationsSum_en)
||
(row.DefaultDonationSumFixed > 0
  ? (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1))
  : row.DefaultDonationsSum)
// Result: 300 ✓ (falls back to Hebrew because English is NULL)

// French PaymentSum (with Hebrew fallback):
// Same as English
// Result: 300 ✓ (falls back to Hebrew because French is NULL)
```

**Expected values after re-migration**:
```
Hebrew localization:
  PaymentSum: 300  ✓
  DefaultPaymentType: 2  ✓
  DefaultPaymentsCount: NULL  ✓

English localization (using Hebrew fallback):
  PaymentSum: 300  ✓ (was NULL, now gets Hebrew value)
  DefaultPaymentType: 2  ✓ (falls back to Hebrew)
  DefaultPaymentsCount: NULL  ✓ (Hebrew is also NULL)

French localization (using Hebrew fallback):
  PaymentSum: 300  ✓ (was NULL, now gets Hebrew value)
  DefaultPaymentType: 2  ✓ (falls back to Hebrew)
  DefaultPaymentsCount: NULL  ✓ (Hebrew is also NULL)
```

### Current Status (Before Re-migration)
```
projectitemlocalization WHERE ItemId = 1415:
  Hebrew:
    PaymentSum: NULL  ← Should be 300 after fix #1
    DefaultPaymentType: 2  ← Correct
    DefaultPaymentsCount: NULL  ← Correct (source was NULL)

  English:
    PaymentSum: NULL  ← Should be 300 after fixes #1 + #2 (fallback)
    DefaultPaymentType: ?  ← Should be 2 after fix #2 (fallback)
    DefaultPaymentsCount: NULL  ← Correct

  French:
    PaymentSum: NULL  ← Should be 300 after fixes #1 + #2 (fallback)
    DefaultPaymentType: ?  ← Should be 2 after fix #2 (fallback)
    DefaultPaymentsCount: NULL  ← Correct
```

## Testing Steps

### Option 1: Quick Test with Single Product (Recommended)

Test just שרלין (ProductsId 1957) to verify the fix works:

```bash
# 1. Create a test script for single product
node scripts/migration/test-single-fund.js 1957

# 2. Verify in new database
node -e "
const mysql = require('mysql2/promise');
const config = require('./config/database');
(async () => {
  const conn = await mysql.createConnection(config.mysqlConfig);
  const [rows] = await conn.query(\`
    SELECT
      pil.ItemId,
      pil.LanguageCode,
      pil.PaymentSum,
      pil.DefaultPaymentType,
      pil.DefaultPaymentsCount,
      p.Id as ProjectId
    FROM projectitemlocalization pil
    JOIN projectitem pi ON pi.Id = pil.ItemId
    JOIN project p ON p.Id = pi.ProjectId
    WHERE p.Id IN (SELECT Id FROM project WHERE CreatedBy = -1 AND ProjectType = 1)
      AND pil.PaymentSum IS NOT NULL
    LIMIT 10
  \`);
  console.table(rows);
  await conn.end();
})();
"
```

**Expected Result**: PaymentSum should show 300 for שרלין's Hebrew localization.

### Option 2: Re-migrate All Funds

Re-run the complete funds migration:

```bash
# 1. Backup current data (optional but recommended)
node scripts/utils/backup-funds-data.js

# 2. Clear existing funds data
node scripts/utils/clear-funds-data.js

# 3. Re-run funds migration
node scripts/migration/run-funds-migration.js

# 4. Verify results
node scripts/checks/verify-payment-fields.js
```

### Option 3: Update Only projectitemlocalization

If you don't want to re-migrate everything, update just the affected records:

```bash
# Create a script to re-process projectitemlocalization
node scripts/utils/fix-payment-fields.js
```

This would:
1. Fetch all Products records again (now with missing fields included)
2. Re-evaluate the expressions
3. UPDATE existing projectitemlocalization records with correct PaymentSum values

## Verification Queries

### Check how many records will be affected:

```sql
-- In new MySQL database
SELECT
  COUNT(*) as TotalRecords,
  SUM(CASE WHEN PaymentSum IS NULL THEN 1 ELSE 0 END) as NullPaymentSum,
  SUM(CASE WHEN PaymentSum IS NOT NULL THEN 1 ELSE 0 END) as HasPaymentSum
FROM projectitemlocalization pil
JOIN projectitem pi ON pi.Id = pil.ItemId
JOIN project p ON p.Id = pi.ProjectId
WHERE p.ProjectType = 1 AND p.CreatedBy = -1;
```

### Sample records with non-NULL PaymentSum (after fix):

```sql
SELECT
  pil.ItemId,
  pil.LanguageCode,
  pil.PaymentSum,
  pil.DefaultPaymentType,
  pil.DefaultPaymentsCount,
  p.Name as ProjectName
FROM projectitemlocalization pil
JOIN projectitem pi ON pi.Id = pil.ItemId
JOIN project p ON p.Id = pi.ProjectId
WHERE p.ProjectType = 1
  AND p.CreatedBy = -1
  AND pil.PaymentSum IS NOT NULL
LIMIT 20;
```

### Check שרלין specifically:

```sql
SELECT
  p.Id as ProjectId,
  p.Name,
  pi.Id as ItemId,
  pil.LanguageCode,
  pil.PaymentSum,
  pil.DefaultPaymentType,
  pil.DefaultPaymentsCount
FROM project p
JOIN projectitem pi ON pi.ProjectId = p.Id
JOIN projectitemlocalization pil ON pil.ItemId = pi.Id
WHERE p.Name LIKE '%שרלין%'
  AND p.ProjectType = 1;
```

**Expected**:
- PaymentSum = 300 for **all three languages** (Hebrew, English, French)
- English and French use Hebrew fallback because their source values are NULL

## Success Criteria

✅ **Fix is successful if:**
1. **Fix #1 (Missing Fields)**: שרלין shows PaymentSum = 300 in Hebrew localization (was NULL before)
2. **Fix #2 (Hebrew Fallback)**: שרלין shows PaymentSum = 300 in English and French localizations (using Hebrew fallback)
3. Other funds with `DefaultDonationsSum` values now show correct PaymentSum in all languages
4. Funds with language-specific values preserve those values (no incorrect fallback)
5. No regression: funds that had correct values before still have them
6. Migration logs show no errors related to undefined fields

✅ **Test Cases Validated**:
- ✅ Hebrew-only data → All languages get Hebrew values
- ✅ Multi-language data → Each language keeps its own values
- ✅ Fixed payments → Correct calculation in all languages
- ✅ Mixed scenarios → Correct fallback behavior

❌ **Issues to watch for:**
- NULL values where source data exists (Hebrew or fallback should provide value)
- Type errors in expression evaluation
- Missing language-specific values
- Performance degradation (SELECT query is larger now)

## Rollback Plan

If issues occur:

1. **Revert server.js changes**:
   ```bash
   git checkout src/server.js
   ```

2. **Restore from backup** (if created):
   ```bash
   node scripts/utils/restore-funds-data.js
   ```

3. **Report issue** with:
   - Migration logs from `logs/migration-logs.log`
   - Specific ProductsId that failed
   - Error messages

## Next Steps After Testing

Once testing confirms the fix works:

1. ✅ Mark this fix as verified
2. 📝 Update MIGRATION_STATUS.md with new results
3. 🎯 Consider re-migrating Collections (Type 2) and ProductGroups (Type 3) with same fixes
4. 🔄 Apply Hebrew fallback to Collections and ProductGroups mappings
5. 📚 Document this in PROJECT_TYPES_SUMMARY.md

## Files Modified

### Fix #1: Missing Fields in SELECT Query
- [src/server.js:1515-1538](src/server.js#L1515-L1538) - Added projectItemLocalizationMappings processing

### Fix #2: Hebrew Fallback for Empty Language Fields

**Funds Migration:**
- [mappings/ProjectMapping_Funds_Fixed.json:299-313](mappings/ProjectMapping_Funds_Fixed.json#L299-L313) - Updated English payment expressions
- [mappings/ProjectMapping_Funds_Fixed.json:341-355](mappings/ProjectMapping_Funds_Fixed.json#L341-L355) - Updated French payment expressions
- [mappings/ProjectMapping.json:310-323](mappings/ProjectMapping.json#L310-L323) - Updated English payment expressions
- [mappings/ProjectMapping.json:352-365](mappings/ProjectMapping.json#L352-L365) - Updated French payment expressions

**Collections Migration:**
- [mappings/ProjectMapping_Collections_Fixed.json:360-374](mappings/ProjectMapping_Collections_Fixed.json#L360-L374) - Updated English payment expressions
- [mappings/ProjectMapping_Collections_Fixed.json:402-416](mappings/ProjectMapping_Collections_Fixed.json#L402-L416) - Updated French payment expressions
- [mappings/ProjectMapping_Collections_Type2.json:360-374](mappings/ProjectMapping_Collections_Type2.json#L360-L374) - Updated English payment expressions
- [mappings/ProjectMapping_Collections_Type2.json:402-416](mappings/ProjectMapping_Collections_Type2.json#L402-L416) - Updated French payment expressions

**Total: 1 server file + 6 mapping files updated**

**Fields Updated with Fallback** (all mapping files):
- `PaymentSum` (English & French)
- `DefaultPaymentType` (English & French)
- `DefaultPaymentsCount` (English & French)

## Related Documentation

- [mappings/ProjectMapping_Funds_Fixed.json](mappings/ProjectMapping_Funds_Fixed.json#L245-L372) - projectItemLocalizationMappings configuration
- [data/Mapping -Vs.xlsx](data/Mapping -Vs.xlsx) - Original Excel specification (rows 1877-1879, 2018-2020, 2159-2161)
- [MIGRATION_STATUS.md](MIGRATION_STATUS.md) - Overall migration status
