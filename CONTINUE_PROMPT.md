# Continue Prompt - For Next Session

Copy and paste this into your next Claude Code session:

---

## 📋 Context

I'm working on a database migration project from SQL Server to MySQL for a fundraising system (Kupat Hair).

**Current Status:**
- ✅ Completed: 15 tables (18,877 rows total)
- ✅ Last migration: Affiliates & Sources (3 tables, 1,941 rows) - 99.1% success
- ✅ Previous: Recruiters (4 tables, 7,313 rows) - 100% success
- 📂 Working directory: `c:\Users\NeomiOs\Documents\NewMigration`

**Key Files:**
- `MIGRATION_STATUS.md` - Full migration status and results
- `LESSONS_LEARNED.md` - Important insights from recruiter migration ⭐ READ THIS FIRST!
- `config/database.js` - Centralized database connections (MSSQL + MySQL)
- `src/server.js` - Migration engine with REST API (runs on port 3030)

---

## 🎯 What We Accomplished Last Session

**Affiliates & Sources Migration - Near Perfect Success:**

1. **user** (78 affiliate users) - 100%
   - Migrated from ParentSources table
   - RoleId=1 (existing admin role)
   - UserName max 20 chars (truncated if needed)
   - **Smart skip logic:** Check existing users before INSERT

2. **affiliate** (78 rows) - 100%
   - Migrated from ParentSources table
   - Links to user.Id (FK)
   - **Smart skip logic:** Skip existing affiliates by Id

3. **source** (1,863 rows) - 99.1%
   - Migrated from UserSources table (1,902 valid rows)
   - Excluded 5,742 orphaned sources (NULL or invalid ParentSourcesId)
   - Uses AffiliateId.json FK mapping (ParentSourcesId → AffiliateId)
   - **Smart skip logic:** Check AffiliateId+SourceCode before INSERT

**Technical Achievements:**
- ✅ Smart skip logic - NO auto-deletion, user controls cleanup
- ✅ FK validation - Check RoleId exists before creating users
- ✅ Case-insensitive UNIQUE handling (MySQL default)
- ✅ Orphaned data filtering (5,742 sources excluded)
- ✅ Multi-table migration with intermediate JSON mapping
- ✅ UI integration: `public/affiliates-migration.html`
- ✅ Server endpoint: `/api/run-all-affiliates-sources`

**Previous Session - Recruiter Migration (100% Success):**
- recruitersGroup (47), recruitersGroupLanguage (111), recruiter (3,828), recruiterLocalization (3,337)
- Name-based matching, isEmpty helper, UI+standalone sync

---

## 🔑 Critical Lessons (Read LESSONS_LEARNED.md!)

**Top 11 Insights (from both Recruiter & Affiliates migrations):**

1. **Name-based matching > FK cascading** (Recruiters)
   - Fewer dependencies = fewer failure points
   - Result: 0 errors vs. dozens with FK approach

2. **Always verify old DB structure** (Recruiters)
   - Don't assume multilingual fields exist
   - Check for string "null" vs actual NULL
   - Use: `sp_help [table]` (MSSQL) or `DESCRIBE table` (MySQL)

3. **Sync UI and standalone scripts immediately** (Recruiters)
   - Issue: `recruitersGroupLanguage` worked standalone but missing from UI
   - Fix: Added STEP 1.5 to `/api/run-all-recruiters` endpoint

4. **Server caching - Always restart after code changes** (Both)
   - Old Node.js processes cache code in memory
   - Kill process and restart: `netstat -ano | findstr :3030`

5. **isEmpty helper for "null" strings** (Recruiters)
   - Handle both NULL and string "null"
   - Critical for old data with inconsistent NULL representation

6. **FK validation - Check targets exist first** (Affiliates) ⭐NEW
   - Before creating users with RoleId=3, verify role exists!
   - Solution: Use existing RoleId=1 instead of creating new role

7. **Smart skip logic > Auto-delete** (Affiliates) ⭐NEW
   - Check existing records before INSERT
   - Report "X new, Y skipped" for visibility
   - User controls cleanup - not the migration script!

8. **MySQL UNIQUE constraints = case-insensitive** (Affiliates) ⭐NEW
   - 'ynet' = 'YNET' = 'YnEt' (default utf8mb4_general_ci)
   - Always check existing with same comparison

9. **SET FOREIGN_KEY_CHECKS=0 for cleanup only** (Affiliates) ⭐NEW
   - Use ONLY in cleanup scripts, not migrations
   - Always re-enable after: `SET FOREIGN_KEY_CHECKS=1`

10. **Multi-table with JSON FK mappings** (Affiliates) ⭐NEW
    - Save intermediate mappings: `AffiliateId.json`
    - Enables debugging and manual verification

11. **Orphaned data filtering** (Affiliates) ⭐NEW
    - Identify orphaned records early (NULL/invalid FKs)
    - Ask user: migrate or skip?
    - Document the decision

**Critical Helpers:**
```javascript
// 1. Handle string "null" values (Recruiters)
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str === 'null';  // ← Critical!
};

// 2. Name-based lookup pattern (Recruiters)
const oldDataLookup = {};
for (const row of oldData.recordset) {
  oldDataLookup[row.Name] = row;
}

// 3. Smart skip logic pattern (Affiliates) ⭐NEW
const [existing] = await mysqlConn.query(
  'SELECT Id FROM table WHERE uniqueField = ?',
  [value]
);

if (existing.length > 0) {
  skipped++;
  continue;  // Skip existing, don't error!
}

// Only insert if doesn't exist
await mysqlConn.query(insertQuery, values);
inserted++;
```

---

## 🎯 Next Migration Task

**Priority 1 Tables (choose one):**
- [ ] **Lead** - Lead/contact management table
- [ ] **Donation / Payment** - Transaction records

**Before Starting:**
1. Read `LESSONS_LEARNED.md` (10 min) ⭐⭐⭐
2. Check old DB structure: `sp_help [TableName]`
3. Check sample data: `SELECT TOP 10 * FROM [TableName]`
4. Identify unique matching field (ID, Name, Email)
5. Check for orphaned data: `SELECT COUNT(*) WHERE FK IS NULL`
6. Verify FK targets exist (e.g., RoleId in role table)

**Recommended Workflow:**
1. Create standalone script: `scripts/migration/migrate-[table]-simple.js`
   - Add smart skip logic (check existing before INSERT)
   - Filter orphaned data (NULL or invalid FKs)
   - Generate FK mapping JSON if needed
   - Report: "X new, Y skipped, Z orphaned"
2. Test standalone migration
3. Integrate into `server.js` immediately (don't delay!)
4. Test UI workflow
5. Update `MIGRATION_STATUS.md`
6. Commit with detailed explanation (both implementation AND generated files)

---

## 💾 Database Connection Info

**Connections are centralized in:** `config/database.js`

```javascript
// MSSQL (Old DB)
server: 'DESKTOP-7QELS7G'
database: 'kupat1_28262025'
user: 'on'
password: '1234567890'

// MySQL (New DB)
host: 'localhost'
user: 'root'
password: '1234'
database: 'kupathairnew'
```

**Server Status:**
- Migration server: http://localhost:3030
- API endpoint for recruiters: POST `/api/run-all-recruiters`
- API endpoint for affiliates: POST `/api/run-all-affiliates-sources`

---

## 🛠️ Common Commands

**Check migration status:**
```bash
node scripts/checks/check-tables-status.js
```

**Clear tables (for testing):**
```bash
node scripts/utils/clear-recruiters-all.js     # Recruiters migration
node scripts/utils/clear-affiliates-all.js     # Affiliates migration
```

**Start server:**
```bash
npm start
```

**Kill old server processes (Windows):**
```bash
netstat -ano | findstr :3030
powershell -Command "Stop-Process -Id <PID> -Force"
```

**Git status:**
```bash
git status
git log --oneline -5
```

---

## ⚠️ Important Reminders

1. **Always restart server after code changes** ⭐
   - Old Node.js processes cache code in memory
   - Kill: `netstat -ano | findstr :3030` → `powershell -Command "Stop-Process -Id <PID> -Force"`
   - Restart: `npm start`

2. **Check both UI and standalone flows** ⭐
   - Don't assume they're in sync
   - Test both after implementation

3. **Smart skip logic - NO auto-deletion** ⭐NEW
   - Check existing records before INSERT
   - Report "X new, Y skipped"
   - User controls cleanup, not the migration!

4. **Verify FK targets exist** ⭐NEW
   - Before using RoleId=3, check if role exists
   - Solution: Use existing RoleId=1 or create role first

5. **Filter orphaned data** ⭐NEW
   - Identify NULL or invalid FK values
   - Ask user: migrate or skip?
   - Document the decision

6. **Use centralized config**
   - All scripts import from `config/database.js`
   - Never hardcode connection strings

7. **UTF8MB4 for Hebrew**
   ```javascript
   const conn = await mysql.createConnection({
     ...mysqlConfig,
     charset: 'utf8mb4'
   });
   ```

8. **Prefer simplicity**
   - Name matching > FK cascading
   - Existing roles > Creating new ones
   - Direct approach > Complex dependencies

---

## 📊 Current Progress

**Completed Tables (15):**
- ✅ project (1,350)
- ✅ projectLocalization (4,050)
- ✅ projectItem (1,350)
- ✅ projectItemLocalization (4,050)
- ✅ media (1,916)
- ✅ linkSetting (8,100)
- ✅ entityContent (2,443)
- ✅ entityContentItem (2,438)
- ✅ recruitersGroup (47)
- ✅ recruitersGroupLanguage (111)
- ✅ recruiter (3,828)
- ✅ recruiterLocalization (3,337)
- ✅ user (78 affiliate users) ⭐NEW
- ✅ affiliate (78) ⭐NEW
- ✅ source (1,863) ⭐NEW

**Total migrated:** 18,877 rows across 15 tables

**Next up:** Lead or Donation tables

---

## 🚀 Ready to Continue!

Ask me to continue with the next migration task, or to:
- Review the current migration status
- Check a specific table structure
- Create a new migration script
- Debug any issues

**Remember to:**
1. Read `LESSONS_LEARNED.md` first! ⭐⭐⭐ (now includes 11 key lessons!)
2. Check old DB structure & orphaned data
3. Use smart skip logic (check existing before INSERT)
4. Filter orphaned data (NULL/invalid FKs)
5. Verify FK targets exist (e.g., RoleId in role table)
6. Test both UI and standalone flows
7. Document and commit immediately (code + generated files)

Let's continue! 💪
