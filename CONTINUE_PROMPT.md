# Continue Prompt - For Next Session

Copy and paste this into your next Claude Code session:

---

## 📋 Context

I'm working on a database migration project from SQL Server to MySQL for a fundraising system (Kupat Hair).

**Current Status:**
- ✅ Completed: 12 tables (16,936 rows total)
- ✅ Last migration: Recruiters (4 tables, 7,313 rows) - 100% success
- 📂 Working directory: `c:\Users\NeomiOs\Documents\NewMigration`

**Key Files:**
- `MIGRATION_STATUS.md` - Full migration status and results
- `LESSONS_LEARNED.md` - Important insights from recruiter migration ⭐ READ THIS FIRST!
- `config/database.js` - Centralized database connections (MSSQL + MySQL)
- `src/server.js` - Migration engine with REST API (runs on port 3030)

---

## 🎯 What We Accomplished Last Session

**Recruiter Migration - Complete Success:**

1. **recruitersGroup** (47 rows) - 100%
   - Migrated from RecruitersGroups table

2. **recruitersGroupLanguage** (111 rows) - 100%
   - Created standalone script: `scripts/migration/migrate-recruitersgroup-localization-simple.js`
   - Integrated into UI: Added STEP 1.5 in `server.js`
   - Key insight: Old table has NO multilingual fields (Name_en, Name_fr)
   - Solution: Use same Name for all 3 languages (Hebrew, English, French)

3. **recruiter** (3,828 rows) - 100%
   - Migrated from ProductStock table

4. **recruiterLocalization** (3,337 rows) - 86.7% coverage, 0 errors
   - Created simplified approach: `scripts/migration/migrate-recruiter-localization-simple.js`
   - **Breakthrough:** Name-based matching instead of FK cascade dependencies
   - Handles string "null" values correctly with isEmpty() helper
   - Result: 3,321 Hebrew, 15 English, 1 French

**Technical Achievements:**
- ✅ Centralized database config (`config/database.js`)
- ✅ Synchronized UI and standalone script workflows
- ✅ Simple Name matching > Complex FK dependencies
- ✅ UTF8MB4 charset for Hebrew text

---

## 🔑 Critical Lessons (Read LESSONS_LEARNED.md!)

**Top 3 Insights:**

1. **Name-based matching works better than FK cascading**
   - Fewer dependencies = fewer failure points
   - Result: 0 errors vs. dozens with FK approach

2. **Always verify old DB table structure before migration**
   - Don't assume multilingual fields exist
   - Check for string "null" vs actual NULL
   - Use: `sp_help [table]` (MSSQL) or `DESCRIBE table` (MySQL)

3. **Sync UI and standalone scripts immediately**
   - Issue we had: `recruitersGroupLanguage` worked standalone but missing from UI
   - Fix: Added STEP 1.5 to `/api/run-all-recruiters` endpoint
   - Always test both flows!

**Critical Helpers:**
```javascript
// Handle string "null" values
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str === 'null';  // ← Critical!
};

// Name-based lookup pattern
const oldDataLookup = {};
for (const row of oldData.recordset) {
  oldDataLookup[row.Name] = row;
}
```

---

## 🎯 Next Migration Task

**Priority 1 Tables (choose one):**
- [ ] **Lead** - Lead/contact management table
- [ ] **Donation / Payment** - Transaction records

**Before Starting:**
1. Read `LESSONS_LEARNED.md` (5 min) ⭐
2. Check old DB structure: `sp_help [TableName]`
3. Check sample data: `SELECT TOP 10 * FROM [TableName]`
4. Identify unique matching field (ID, Name, Email)

**Recommended Workflow:**
1. Create standalone script first: `scripts/migration/migrate-[table]-simple.js`
2. Test standalone migration
3. Integrate into `server.js` immediately
4. Test UI workflow
5. Update `MIGRATION_STATUS.md`
6. Commit with detailed explanation

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

---

## 🛠️ Common Commands

**Check migration status:**
```bash
node scripts/checks/check-tables-status.js
```

**Clear recruiter tables (for testing):**
```bash
node scripts/utils/clear-recruiters-all.js
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

1. **Always restart server after code changes**
   - Old Node.js processes cache code
   - Kill process and restart: `netstat -ano | findstr :3030`

2. **Check both UI and standalone flows**
   - Don't assume they're in sync
   - Test both after implementation

3. **Use centralized config**
   - All scripts import from `config/database.js`
   - Never hardcode connection strings

4. **UTF8MB4 for Hebrew**
   ```javascript
   const conn = await mysql.createConnection({
     ...mysqlConfig,
     charset: 'utf8mb4'
   });
   ```

5. **Prefer simplicity**
   - Name matching > FK cascading
   - Direct approach > Complex dependencies

---

## 📊 Current Progress

**Completed Tables (12):**
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

**Total migrated:** 16,936 rows across 12 tables

**Next up:** Lead or Donation tables

---

## 🚀 Ready to Continue!

Ask me to continue with the next migration task, or to:
- Review the current migration status
- Check a specific table structure
- Create a new migration script
- Debug any issues

**Remember to:**
1. Read `LESSONS_LEARNED.md` first! ⭐
2. Check old DB table structure before starting
3. Follow the "simple approach" pattern
4. Test both UI and standalone flows
5. Document and commit immediately

Let's continue! 💪
