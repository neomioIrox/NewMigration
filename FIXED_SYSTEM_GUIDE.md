# 🎯 Fixed Migration System - User Guide

**Date**: 2025-12-04
**Status**: ✅ System Fixed and Ready for Use

---

## 📊 What Was Fixed

### Problem Summary

The recruiter migration system had a **catastrophic failure** with 99.6% data loss (6,113 out of 6,137 recruiters missing).

**Root Cause**: The FK mapping file (`ProjectId.json`) was never created automatically, causing recruiter migration to silently skip nearly all records.

---

## ✅ Fixes Implemented

### Fix #1: Auto-Create ProjectId.json

**File**: `src/server.js` (lines 2697-2727)

**What it does**:
- During project migration, captures ALL `idMappings` (oldProductId → newProjectId)
- Saves them to `ProjectId.json` **immediately** after migration
- Before memory is cleared and connections are closed

**Result**: Every time you run project migration through UI, `ProjectId.json` is automatically created with complete mappings!

---

### Fix #2: Validation Before Recruiter Migration

**File**: `src/server.js` (lines 751-828)

**What it does**:
- Before STEP 3 (recruiter migration), validates that `ProjectId.json` exists
- Checks if ALL ProductIds from ProductStock have mappings
- **Warns** if any mappings are missing and shows impact (how many recruiters will be skipped)
- **Fails fast** if ProjectId.json doesn't exist

**Result**: You'll know BEFORE migration if there are any issues!

---

### Fix #3: Improved Reporting

**File**: `src/server.js` (lines 591-674, 860-869)

**What it does**:
- Tracks 3 metrics separately: **Inserted**, **Skipped**, **Errors**
- Shows clear breakdown at end of migration
- Logs WHY rows were skipped (e.g., "Missing FK mapping: ProjectId=1957")
- Groups skip reasons by type

**Result**: You'll see exactly what happened during migration!

**Example Output**:
```
Step 3 completed:
  ✅ Inserted: 6,137
  ⏭️  Skipped: 0
  ❌ Errors: 0
  📊 Total: 6,137
```

---

## 🚀 How to Use the Fixed System

### Step-by-Step Migration Process

#### 1. Start Fresh (if needed)

If you want to start from scratch:
```sql
-- Clear recruiter tables
DELETE FROM recruiterlocalization;
DELETE FROM recruiter;
DELETE FROM recruitersgrouplanguage;
DELETE FROM recruitersgroup;

-- Clear project tables (optional)
DELETE FROM projectitemlocalization;
DELETE FROM projectitem;
DELETE FROM projectlocalization;
DELETE FROM project;
```

Or just DROP and CREATE the new database from schema.

---

#### 2. Run Project Migration (via UI)

**URL**: `http://localhost:3030`

1. Select **Project** mapping (Funds or Collections)
2. Click **"Run Migration"**
3. Watch the logs - you should see:
   ```
   ✅ Products mapping saved: 1350 products updated
   ✅ ProjectId.json saved: 1350 mappings
      Sample mappings: 110→1, 111→2, 112→3, ...
   ✅ Products mapping fully regenerated
   ```

**✅ Verification**: Check that `data/fk-mappings/ProjectId.json` exists and has ~1,350+ mappings

---

#### 3. Run Recruiter Migration (via UI)

**URL**: `http://localhost:3030/recruiters-migration.html`

1. Click **"Run All Recruiters Migration"**
2. Watch the logs:

**STEP 2.5 (New!)**: Validation
```
STEP 2.5: Validating ProjectId.json FK mapping...
✅ ProjectId.json found: 1350 mappings loaded
✅ All ProductIds have valid mappings in ProjectId.json
Step 2.5 completed: Validation OK
```

**STEP 3**: Recruiter Migration
```
STEP 3: Migrating Recruiters...
Step 3 completed:
  ✅ Inserted: 6,137
  ⏭️  Skipped: 0
  ❌ Errors: 0
  📊 Total: 6,137
```

**✅ Expected Result**: All 6,137 recruiters migrated successfully!

---

### What If There Are Warnings?

#### Scenario 1: Missing Mappings Warning

```
⚠️  WARNING: Some ProductIds are missing from ProjectId.json!
   Missing mappings for 100 ProductIds
   First 10 missing: 1957, 2024, ...
   ⚠️  This will affect 500 recruiters!
```

**What to do**:
1. **Don't panic!** The migration will continue but skip those recruiters.
2. Check if those Products were actually migrated (look in `project` table)
3. If they weren't migrated: decide if you want to migrate them
4. If they were migrated: Re-run project migration to regenerate `ProjectId.json`

---

#### Scenario 2: ProjectId.json Not Found

```
❌ CRITICAL ERROR: ProjectId.json not found!
   This file is required for recruiter migration.
   Please run project migration first
```

**What to do**:
1. Go back to UI and run **project migration** first
2. Then come back and run recruiter migration

---

#### Scenario 3: Some Recruiters Skipped

```
Step 3 completed:
  ✅ Inserted: 6,000
  ⏭️  Skipped: 137
  ❌ Errors: 0

⚠️  WARNING: 137 recruiters were skipped!

⚠️  Skipped 137 rows:
   Missing FK mapping: ProjectId=1957: 111 rows
   Missing FK mapping: ProjectId=2024: 26 rows
```

**What to do**:
1. Note which ProductIds are missing
2. Check if those Products exist in `project` table
3. Add missing mappings to `ProjectId.json` manually, OR
4. Re-run project migration to auto-generate complete mappings

---

## 🔍 Verifying Success

### After Project Migration

**Check 1**: ProjectId.json exists
```bash
# Check file exists
ls data/fk-mappings/ProjectId.json

# Check size (should have 1000+ mappings)
node -e "const f = require('./data/fk-mappings/ProjectId.json'); console.log('Mappings:', Object.keys(f.mappings).length)"
```

**Check 2**: Sample mapping looks correct
```bash
node -e "const f = require('./data/fk-mappings/ProjectId.json'); console.log('Sample:', JSON.stringify(Object.entries(f.mappings).slice(0, 5), null, 2))"
```

---

### After Recruiter Migration

**Check 1**: Count recruiters
```sql
SELECT COUNT(*) as total FROM recruiter;
-- Expected: ~6,137 (or close to it)
```

**Check 2**: Check specific project (e.g., Products 1957 → project 1401)
```bash
node scripts/checks/check-1957-recruiters.js
```

Expected output:
```
Found 111 recruiters in NEW DB
✅ All recruiters migrated successfully!
```

**Check 3**: Sample recruiter data
```sql
SELECT Id, Name, ProjectId FROM recruiter LIMIT 10;
```

---

## 📝 Common Scenarios

### Scenario A: First-Time Migration

1. Fresh database (DROP + CREATE)
2. Run project migration → ✅ ProjectId.json created
3. Run recruiter migration → ✅ All 6,137 recruiters migrated
4. **Success!** 🎉

---

### Scenario B: Re-running After Fixes

1. Clear recruiter tables only (DELETE)
2. **DON'T** clear project table
3. Check that ProjectId.json still exists
4. Run recruiter migration → ✅ Should work!

---

### Scenario C: Partial Migration (Some Products Not Migrated)

1. Run project migration for Funds only (1,350 products)
2. ProjectId.json has 1,350 mappings
3. Run recruiter migration → Some recruiters skipped (those linked to Collections)
4. **Expected!** Finish migrating Collections, then re-run recruiters

---

## 🛠️ Troubleshooting

### Issue: "ProjectId.json has wrong mappings"

**Symptoms**: Recruiters still skipped even though ProjectId.json exists

**Solution**:
1. Delete `data/fk-mappings/ProjectId.json`
2. Re-run project migration through UI
3. New ProjectId.json will be regenerated with correct mappings

---

### Issue: "Recruiters keep getting skipped"

**Symptoms**: Always getting "Missing FK mapping: ProjectId=X"

**Debug Steps**:
1. Check if ProductsId X exists in old DB:
   ```sql
   SELECT * FROM Products WHERE ProductsId = X
   ```

2. Check if project X exists in new DB:
   ```sql
   SELECT * FROM project WHERE Id = X
   ```

3. Check if mapping exists in ProjectId.json:
   ```bash
   node -e "const f = require('./data/fk-mappings/ProjectId.json'); console.log('X →', f.mappings['X'])"
   ```

4. If project exists but mapping doesn't: Re-run project migration!

---

### Issue: "Server crashes during migration"

**Symptoms**: Migration stops midway

**Solution**:
1. Check logs: `logs/migration-logs.log`
2. Look for actual error (not warnings)
3. Fix the underlying issue (usually FK constraint or NULL value)
4. Clear failed data and re-run

---

## 🎓 Key Lessons for Future Migrations

### 1. Always Check FK Mappings First

Before running ANY migration that depends on FK mappings:
- Check that mapping file exists
- Check that it has complete data
- Don't assume - validate!

---

### 2. Never Trust "Silent Success"

If migration reports "24/6137 rows" - **ASK WHY**!
- Were 6,113 errors?
- Or skips?
- Or something else?

With the fixed system, you'll always know!

---

### 3. ID Preservation ≠ Guaranteed

**AUTO_INCREMENT** means IDs WILL change:
- Products 1957 → project 1401
- Products 110 → project 1
- **Never assume** old ID = new ID

Always use mapping files!

---

## 📊 Expected Results (Full Migration)

| Table | Expected Rows | Notes |
|-------|---------------|-------|
| project | ~3,500 | Depends on WHERE clause (Funds vs Collections vs Type3) |
| projectLocalization | ~10,500 | 3 languages × projects |
| projectItem | ~5,000 | Variable (1-2 items per project) |
| recruitersGroup | ~47 | Fixed count |
| recruitersGroupLanguage | ~141 | 3 languages × 47 groups |
| recruiter | **~6,137** | ⭐ This is what we fixed! |
| recruiterLocalization | ~10,000+ | Variable (1-3 languages per recruiter) |

---

## 🚀 Next Steps

After successfully migrating recruiters:
1. ✅ Verify counts (see tables above)
2. ✅ Spot-check 5-10 random projects
3. ✅ Check that Products 1957 has 111 recruiters
4. ✅ Move on to next migration (Donations, etc.)

---

**System Status**: ✅ **FIXED AND READY**
**Test Status**: ⏳ **Ready for User Testing**
**Documentation**: ✅ **Complete**

**Good luck with your migrations!** 🎉
