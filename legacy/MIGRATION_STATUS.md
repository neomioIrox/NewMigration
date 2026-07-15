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
| Affiliate | ParentSources | 99 (+6 ghosts) | ✅ תוקן 2026-04-22: UserId=99/99, DefaultSourceId=96/99 (3 ללא Source כלל), 99 Users חדשים ב-RoleId=3 |
| Source | UserSources | 2,240 (+7 ghosts) | ✅ תוקן 2026-04-22: Description NULL 1,478→0 ע"י fallback ל-Name |
| User (AffiliateUser) | ParentSources | 99 | ✅ נוצר ב-afterInsertMappings, רשום ב-tracker כ-`AffiliateUser` |
| LinkSetting (video gallery) | Videos | 127 | ✅ 100% |
| Media (video gallery) | Videos | 256 | ✅ 100% (deduped by URL) |
| VideoGalleryMedia | Videos | 327 | ✅ 100% (127 he + 106 en + 94 fr — matches old site) |

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

10. **Affiliate UserId=NULL - לא נוצר User לכל מקור אב** (תוקן 2026-04-20, תיקון נוסף 2026-04-22)
   - Problem: AffiliateMapping.json הגדיר UserId כ-NULL קבוע, לא יצר User לכל affiliate
   - Impact: 99 affiliates ללא UserId - לא ניתן להתחבר למערכת
   - Root Cause: לוגיקת יצירת User הייתה רק בסקריפט legacy, לא ב-JSON mapping
   - Solution (2026-04-20): הוספת `afterInsertMappings` ב-AffiliateMapping.json שיוצר User מ-ParentSources.UserName/Password
   - Engine Enhancement: תמיכה ב-`lookupKey` (מניעת כפילויות) ו-`updateParentColumn` (עדכון UserId חזרה)
   - **תיקון משלים 2026-04-22**: `afterInsertMappings[0].targetTable` היה `"user"` lowercase — AWS RDS case-sensitive, זה נכשל בשקט ולא נוצרו Users. תוקן ל-`"User"` PascalCase.
   - Files Fixed:
     - `server/mappings/AffiliateMapping.json` - afterInsertMappings ליצירת User + `"User"` PascalCase + הסרת `postMigrationScript` המת
     - `server/src/engine/migration-engine.js` - lookupKey + updateParentColumn + `postMigrationRunners` hook
     - `server/src/engine/batch-runner.js` - findExistingId function
     - `legacy/scripts/migration/migrate-affiliates-sources-all.js` - RoleId 1→3
   - **Action Required**: הריצו `create-affiliate-role.js` לפני מיגרציה חדשה, ואז הריצו מחדש

12. **Video Gallery — יעד שגוי בתחילה** (תוקן 2026-04-22)
   - Problem: `GalleryMapping_Videos.json` מיגרר ל-`Gallery` + `GalleryLocalization` + `GalleryMedia` + `Media`, אבל ה-FE קורא וידאו **אך ורק** מ-`VideoGalleryMedia` (דרך `GET /api/gallery/getVideoGalleryQuickView/{langId}`)
   - Impact: 127 גלריות נוצרו אבל לא נגישות מהאתר
   - Root Cause: `GalleryMedia` חסר עמודת `Language` ולכן לא יכול לתמוך ב-URL שונה לכל שפה (46% מהוידאו במקור יש להם Link_en/Link_fr שונים). `VideoGalleryMedia` נבנה בדיוק למטרה הזו.
   - Solution:
     - ניקוי המיגרציה הישנה: `scripts/migration/cleanup-wrong-gallery-videos.js` (מחק 127 Gallery + 381 GalleryLocalization + 127 GalleryMedia + 127 Media)
     - סקריפט מיגרציה חדש ייעודי (לא JSON, כי הלוגיקה מורכבת מדי): `scripts/migration/migrate-video-gallery-media.js`
     - LinkSetting דמה (127 שורות) כי `LinkSetting.ProjectId NOT NULL` — כולם מצביעים ל-`Project.Id=1`
     - Fallback לעברית כש-`Name_X` ריק אבל `Hide_X=0` (match אתר ישן)
   - Verification: `scripts/checks/verify-video-gallery-media.js --api` — API החי החזיר 135/114/94 entities (תואם)
   - Result: 122 he + 89 en + 89 fr visible — **בדיוק כמו https://www.kupat.org.il/videos**

11. **Source Description=NULL כש-Title ריק** (תוקן 2026-04-20, תיקון data ב-2026-04-22)
   - Problem: SourceMapping.json מיפה Description מ-UserSources.Title בלבד, כש-Title ריק Description=NULL
   - Impact: 1,478 מ-2,240 מקורות ללא תיאור כלל
   - Solution: הוספת fallback ל-UserSources.Name כש-Title ריק
   - File Fixed: `server/mappings/SourceMapping.json` (expression: `Title.trim() || Name.trim() || null`)
   - **Data Fix 2026-04-22**: `scripts/rerun-affiliate-source/04-inplace-fix.js` Phase A עדכן את 1,478 השורות הקיימות במקום (Description NULL → 0)

13. **Affiliate.DefaultSourceId לא מתמלא ע"י המנוע** (תוקן 2026-04-22)
   - Problem: ה-`postMigrationScript` ב-AffiliateMapping.json היה dead code (המנוע לא קרא לו) והפנה לעמודה לא קיימת `originalSourceId`
   - Impact: DefaultSourceId=NULL בכל ה-Affiliates גם אחרי ריצה מלאה
   - Solution: שלושה שינויים:
     - הוסר ה-`postMigrationScript` המת מ-AffiliateMapping.json
     - Hook חדש במנוע: `postMigrationRunners` — מריץ מודולים אחרי הלולאה העיקרית (`migration-engine.js` סוף `run()`)
     - מודול חדש: `server/src/engine/post-runners/set-default-source-id.js` (Code↔SourceCode + fallback ל-lowest Source.Id)
     - SourceMapping.json מחובר: `"postMigrationRunners": ["set-default-source-id"]`
   - **Result**: בריצה נקייה מה-UI הכל יעבוד אוטומטית. DefaultSourceId יתמלא ב-96/99 (3 אפיליאטים ללא Source יישארו NULL).

14. **FK חסימה ל-Donation.SourceId מונעת cleanup מלא של Source** (גילוי 2026-04-22)
   - Problem: `FK_Donation_SI_Source` עם 1.39M Donations מונע DELETE FROM Source
   - Workaround: `scripts/rerun-affiliate-source/04-inplace-fix.js` — עדכון במקום במקום ניקוי. שומר על Source.Id היציב ולא שובר FKs.
   - **Future clean re-run**: דורש סקריפט re-link — snapshot של Donation↔UserSources.Id דרך SourceCode, NULL ל-Donation.SourceId, מחיקה+מיגרציה, ואז re-link לפי ה-snapshot. לא מומש; מתועד ב-[scripts/rerun-affiliate-source/README.md](../scripts/rerun-affiliate-source/README.md).

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

*Last updated: April 22, 2026*
