# Lessons Learned - Database Migration

## הסטוריה

### Video Gallery Migration — יעד שגוי בתחילה (Apr 22, 2026) ⚠️
**הלקח החשוב ביותר: אמת תחילה מאיזו טבלה ה-FE קורא, לא איזו טבלה "נראית נכונה" סמנטית.**

- כתבנו מיפוי שמעביר `Videos` ל-`Gallery`+`GalleryMedia`+`GalleryLocalization`+`Media` — שהן הטבלאות "הלוגיות" לגלריה.
- הרצנו, קיבלנו 127 גלריות מוצלחות. המיגרציה עברה 100%.
- אבל ה-FE **לא קרא** מהטבלאות האלה בכלל — הוא קורא מ-`VideoGalleryMedia` דרך `POST /api/gallery/getVideoGalleryQuickView/{langId}`.
- המיגרציה הלכה לטבלה שאין לה שימוש באפליקציה.

**איך אימתנו לבסוף:**
1. הורדנו את ה-JS bundle של האתר (`main.js`)
2. חיפשנו `videoGallery` / `VideoGallery` במחרוזות
3. מצאנו את ה-URL `gallery/getVideoGalleryQuickView/{langId}`
4. `POST`-נו עם `languageId=1/2/3` וראינו בדיוק איזו טבלה ה-API מחזיר שורות ממנה

**תחקיר ראשוני שהיה צריך לעשות לפני המיפוי:**
- לא להסיק מסכמת DB — להוריד bundle ולחפש מאיזה endpoint האתר קורא
- אם יש כמה טבלאות עם שם דומה (`GalleryMedia` vs `VideoGalleryMedia`), לבדוק אילו מהן באמת מכילות נתונים באתר החי
- לבדוק FKs — `GalleryMedia` אין לה `Language` column, אז היא **מבנית** לא יכולה לתמוך ברב-לשוניות; זה אמור לעורר חשד מיידי

**בעיה מבנית שנחשפה:**
- `VideoGalleryMedia.LinkSettingId NOT NULL`, וה-`LinkSetting.ProjectId NOT NULL` — ז"א שכל וידאו *חייב* להיות מקושר לפרויקט. אצלנו הוידאו הם "מידע כללי" ללא פרויקט → השתמשנו ב-`Project.Id=1` ("מגבית כללית") כברירת מחדל.

**אימות מול האתר הישן:**
- השוואה מול `https://www.kupat.org.il/videos` (122 visible בעברית), `https://www.kupat.org/videos` (89 EN), `https://www.koupathair.com/videos` (89 FR) — התאמה מלאה לאחר Hebrew-fallback למקרה שבו `Name_X` ריק אבל `Hide_X=0`.

**קבצים:**
- `scripts/migration/migrate-video-gallery-media.js` — המיגרציה הנכונה (VideoGalleryMedia)
- `scripts/migration/cleanup-wrong-gallery-videos.js` — ניקוי המיגרציה השגויה הראשונה
- `scripts/checks/verify-video-gallery-media.js` — אימות עם קריאה ל-API החי

---

### Campaign Type 3 Migration (Nov 29, 2025) ⚠️
**בעיה קריטית בסדר המיגרציות - לא הושלמה!**

התחלנו מיגרציה של Campaign Type 3 (ProductGroup campaigns) ומצאנו בעיה חמורה:
- **194 Products** ב-ProductGroup צריכים להיות רק Type 3
- **70 מהם כבר קיימים** בבסיס החדש כ-ProjectType=1 (Funds)
- **117 מהם כבר קיימים** כ-ProjectType=2 (Campaign Type 2)
- **הסיבה:** WHERE clauses ב-Funds/Type2 לא נאכפו כמו שצריך

**WHERE Clause הנכון** (מופיע בכל המיפויים):
```sql
NOT EXISTS (
  SELECT 1 FROM ProductGroup g
  WHERE g.ParentProductId = Products.ProductsId
  OR g.SubProductId = Products.ProductsId
)
```

**הפתרון:**
1. מחיקת 187 Products שמופיעים גם ב-ProductGroup מטבלת project
2. הרצת Type 3 migration מחדש

**קבצים שנוצרו:**
- `scripts/utils/delete-productgroup-duplicates.js` - סקריפט cleanup
- תיקון ב-`migrate-campaign-type3.js` - Smart Skip משופר

**לקח חשוב:**
⚠️ **Smart Skip צריך לבדוק ProjectType בכלל**, לא רק ProjectType ספציפי!
⚠️ **WHERE clauses חייבים להיאכף** - לא מספיק לכתוב אותם, צריך לוודא שהמנוע מאכף!

---

### CustomerUser Migration (Nov 27, 2025)
השלמנו בהצלחה את מיגרציית ה-CustomerUser (3,839 משתמשים) עם 100% הצלחה - Phase 2 למיגרציית Donation.

**תוצאות סופיות:**
- Total Users migrated: 3,839/3,839 (100%)
- First run: 3,837/3,839 (2 duplicate UserName errors)
- Fixed duplicate detection + suffix
- Second run: 2/2 remaining users
- 0 errors after fix ⭐

### Affiliates & Sources Migration (Nov 27, 2025)
השלמנו בהצלחה את מיגרציית ה-Affiliates & Sources (3 טבלאות, ~1,941 שורות).

### Recruiter Migration (Nov 26, 2025)
השלמנו בהצלחה את מיגרציית ה-Recruiters (4 טבלאות, 7,313 שורות) עם 100% הצלחה.

### תוצאות סופיות
| טבלה | שורות | הצלחה |
|------|-------|-------|
| recruitersGroup | 47 | ✅ 100% |
| recruitersGroupLanguage | 111 | ✅ 100% |
| recruiter | 3,828 | ✅ 100% |
| recruiterLocalization | 3,337 | ✅ 86.7% (אבל 0 שגיאות - הנתונים לא קיימים) |

---

## תובנות מרכזיות 💡

### 1. **פתרון הפשטה עובד טוב יותר מ-FK Mappings מורכבים**

**הבעיה המקורית:**
- ניסינו להשתמש ב-FK cascading: RecruitersGroups → RecruiterGroupId mapping → Recruiters → RecruiterId mapping → RecruiterLocalization
- שלב 1 נכשל בגלל duplicates ב-RecruitersGroups
- כל השרשרת קרסה

**הפתרון שעבד:**
```javascript
// במקום FK dependencies - Name matching ישיר
const productStockLookup = {};
for (const ps of oldRecruiters.recordset) {
  productStockLookup[ps.Name] = ps;  // ← Key insight!
}

for (const recruiter of newRecruiters) {
  const oldData = productStockLookup[recruiter.Name];
  // עכשיו יש לנו גישה ישירה לנתונים
}
```

**תוצאה:**
- 3,337 שורות הוכנסו בהצלחה
- 0 שגיאות
- פשוט לתחזק ולקרוא

**המלצה:**
✅ תמיד נסה Name-based או direct matching לפני FK cascading
✅ פחות dependencies = פחות נקודות כשל

---

### 2. **בעיית סינכרון בין UI ל-Standalone Scripts**

**מה קרה:**
- כתבנו `migrate-recruitersgroup-localization-simple.js` והוא עבד מצוין (111 שורות)
- המשתמש ריצה דרך ה-UI והטבלה נשארה ריקה
- הבעיה: ב-`server.js` בכלל לא היה שלב שמריץ recruitersGroupLanguage!

**השלבים שהיו (5):**
1. RecruitersGroups
2. RecruiterGroupId mapping
3. Recruiters
4. RecruiterId mapping
5. RecruiterLocalization

**חסר:** STEP 1.5 - RecruitersGroupLanguage

**התיקון:**
```javascript
// src/server.js:657-705
// STEP 1.5: Run RecruitersGroupLanguage migration
const [allGroups] = await mysqlConn.query('SELECT Id, Name FROM recruitersgroup');

for (const group of allGroups) {
  // Insert Hebrew, English, French with same Name
  await mysqlConn.execute('INSERT INTO recruitersgrouplanguage...');
}
```

**לקח:**
⚠️ כשכותבים standalone script - מיד שלב את הלוגיקה גם ב-server.js
⚠️ תמיד בדוק את שני הפלואים (UI + standalone) לפני commit

---

### 3. **Server Caching - קוד ישן נשאר בזיכרון**

**מה קרה פעמים רבות:**
- עדכנו קוד ב-`server.js`
- המשתמש ריצה דרך UI
- הקוד הישן רץ!
- אותה בעיה שוב ושוב...

**הסיבה:**
- תהליכי Node.js ישנים נשארו ב-port 3030
- Node לא עושה hot-reload אוטומטית

**הפתרון שעבד:**
```bash
# 1. מצא תהליכים
netstat -ano | findstr :3030

# 2. הרוג את התהליך
powershell -Command "Stop-Process -Id <PID> -Force"

# 3. הפעל מחדש
npm start
```

**לקח:**
🔴 אחרי כל שינוי בקוד - הרוג תהליכים ישנים והפעל מחדש!
🔴 אל תניח שהקוד עודכן - בדוק שהשרת רץ מחדש

---

### 4. **Centralized Configuration - הצלחה גדולה**

**מה עשינו:**
```javascript
// config/database.js - יצרנו קובץ אחד
const mssqlConfig = { server, database, authentication, ... };
const mysqlConfig = { host, user, password, database };
module.exports = { mssqlConfig, mysqlConfig };
```

**תוצאה:**
- כל הסקריפטים (20+) מייבאים מ-config אחד
- שינוי של password פעם אחת במקום 20
- 0 שגיאות connection
- קל לתחזק

**לקח:**
✅ תמיד התחל עם centralized config
✅ אל תשכפל הגדרות חיבור בין קבצים

---

### 5. **בדיקת מבנה הטבלה הישנה - קריטי!**

**מה גילינו בהפתעה:**

**RecruitersGroups:**
```sql
-- מה שחשבנו שיהיה:
ID, Name, Name_en, Name_fr, ProjectId, DonationTarget

-- מה שבאמת יש:
ID, Name, ProjectId, DonationTarget  ← רק 4 עמודות!
```
אין שדות רב-לשוניים בכלל!

**ProductStock:**
```sql
SELECT Name, Name_en, Name_fr FROM ProductStock
-- תוצאה:
Name='אברהם כהן', Name_en='null', Name_fr='null'  ← String "null"!
```

**הפתרון:**
```javascript
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str === 'null';  // ← Critical!
};
```

**לקח:**
⚠️ לעולם אל תניח מבנה טבלה
⚠️ תמיד בדוק: `DESCRIBE table` (MySQL) או `sp_help table` (MSSQL)
⚠️ תמיד בדוק sample data: `SELECT TOP 10 * FROM table`
⚠️ שים לב ל-string "null" vs NULL האמיתי

---

## נקודות חולשה שזיהינו 🔍

### 1. **גילוי איטי של בעיות UI**
- לא בדקנו מספיק מוקדם שה-UI חסר שלב
- פתרנו רק אחרי שהמשתמש גילה את הבעיה
- המשתמש התסכל: "זה מתחיל לעייף אותי"

**מה היינו צריכים לעשות:**
✅ אחרי כתיבת standalone script, לבדוק מיד את server.js
✅ לוודא שיש תאימות מלאה בין הפלואים

### 2. **חוסר תיעוד של ההבדלים בין הרצות**
- לא תיעדנו שיש הבדל בין standalone ו-UI
- זה גרם לבלבול

**מה צריך לעשות:**
📝 לתעד בבירור: "קובץ זה זמין דרך standalone בלבד / גם דרך UI"

### 3. **שכפול לוגיקה בין קבצים**
- אותה לוגיקה (recruitersGroupLanguage) נכתבה פעמיים:
  - פעם ב-`migrate-recruitersgroup-localization-simple.js`
  - פעם ב-`server.js`
- זה DRY violation

**פתרון עתידי:**
💡 לשקול ליצור helper functions משותxxxxxxxxxxx לגרום ל-server.js לקרוא לסקריפטים הישירים

---

## המלצות פרקטיות להמשך 📋

### לפני כל מיגרציה חדשה:

#### שלב 1: חקור את הטבלה הישנה (5 דקות)
```sql
-- MSSQL
sp_help [TableName]
SELECT TOP 10 * FROM [TableName]

-- MySQL
DESCRIBE tablename;
SELECT * FROM tablename LIMIT 10;
```

**מה לחפש:**
- [ ] אילו עמודות יש?
- [ ] האם יש שדות רב-לשוניים (Name_en, Name_fr)?
- [ ] האם יש NULL strings?
- [ ] מה סוגי הנתונים?

#### שלב 2: חקור את הטבלה החדשה (3 דקות)
```sql
DESCRIBE newtable;
```

**מה לוודא:**
- [ ] האם כל העמודות קיימות?
- [ ] האם יש טבלת localization נפרדת?
- [ ] מה ה-FK constraints?

#### שלב 3: תכנן את הגישה (5 דקות)
**שאל את עצמך:**
- [ ] האם יש שדה ייחודי לחיבור? (Name, Email, ID)
- [ ] האם צריך FK mapping או Name matching מספיק?
- [ ] האם יש dependencies מורכבות?

**עקרון זהב:**
> פשוט = טוב. Name matching > FK cascading

#### שלב 4: כתוב standalone script תחילה
```javascript
// scripts/migration/migrate-[table]-simple.js
// תמיד התחל עם "simple" approach
```

**מבנה מומלץ:**
1. Connect to databases
2. Get data from new DB
3. Create lookup map from old DB (by Name)
4. Match and insert
5. Report results

#### שלב 5: שלב ב-server.js מיד
- [ ] הוסף STEP חדש ב-`/api/run-all-*` endpoint
- [ ] העתק את הלוגיקה מה-standalone script
- [ ] עדכן את ה-`results` object
- [ ] עדכן את הודעות הלוג (X STEPS)

#### שלב 6: בדוק את שני הפלואים
- [ ] הרץ standalone: `node scripts/migration/migrate-*.js`
- [ ] נקה טבלה: `DELETE FROM table`
- [ ] הרץ דרך UI: http://localhost:3030/...
- [ ] השווה תוצאות

#### שלב 7: תיעוד וקומיט
- [ ] עדכן `MIGRATION_STATUS.md`
- [ ] הוסף ל-Known Issues אם רלוונטי
- [ ] קומיט עם הסבר מפורט

---

## טיפים טכניים 🛠️

### isEmpty Helper (חובה!)
```javascript
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str === 'null';  // ← Handle string "null"
};
```

### UNIQUE Constraint Duplicate Detection (CustomerUser Migration) ⭐NEW
**הבעיה:**
- ה-UserName field יש לו UNIQUE constraint
- שני משתמשים עם אותו UserName → שגיאת duplicate entry
- MySQL UNIQUE constraints הם case-insensitive (utf8mb4_general_ci)

**הפתרון:**
```javascript
// 1. Truncate UserName to leave room for suffix (max 40 chars)
let userName = user.UserName ? user.UserName.substring(0, 35) : `user${user.Id}`;

// 2. Check for duplicates BEFORE INSERT
const [dupUserName] = await mysqlConn.query(
  'SELECT Id FROM customeruser WHERE UserName = ?',
  [userName]
);

// 3. Add unique suffix if duplicate exists
if (dupUserName.length > 0) {
  userName = `${userName}_${user.Id}`;  // e.g., "john_doe_2798"
}

// 4. Now INSERT with unique UserName
await mysqlConn.query(insertQuery, [userName, ...otherFields]);
```

**תוצאה:**
- First run: 3,837/3,839 success (2 duplicates)
- After fix: 2/2 remaining users (100% success)
- 0 errors ⭐

**לקחים:**
✅ Always check UNIQUE constraints before INSERT
✅ Add unique suffix (ID, timestamp) for duplicates
✅ Truncate strings to leave room for suffix
✅ Test with edge cases (duplicate names, NULL values)

### Name-based Lookup Pattern
```javascript
// Old DB → Lookup map
const oldDataLookup = {};
for (const row of oldData.recordset) {
  oldDataLookup[row.Name] = row;
}

// New DB → Match by Name
for (const newRow of newData) {
  const oldRow = oldDataLookup[newRow.Name];
  if (!oldRow) {
    skipped++;
    continue;
  }
  // Use oldRow data...
}
```

### UTF8MB4 Connection (עברית!)
```javascript
const mysqlConn = await mysql.createConnection({
  ...mysqlConfig,
  charset: 'utf8mb4'  // ← חובה לעברית!
});
```

### Server Restart (Windows)
```bash
# Kill + Restart in one command
powershell -Command "Stop-Process -Id <PID> -Force; Start-Sleep -Seconds 2" && npm start
```

---

## דוגמאות לפתרונות מוצלחים ✨

### 1. Recruiter Localization - Name Matching
**קובץ:** `scripts/migration/migrate-recruiter-localization-simple.js`

**מה עבד:**
- ביטול FK dependencies
- Name-based direct matching
- isEmpty helper ל-string "null"
- Insert רק אם יש data

**תוצאה:** 3,337/3,848 (86.7%), 0 errors

### 2. RecruitersGroup Language - Simple Copy
**קובץ:** `scripts/migration/migrate-recruitersgroup-localization-simple.js`

**מה עבד:**
- זיהוי שאין Name_en/Name_fr בטבלה הישנה
- שימוש באותו Name לכל 3 השפות
- לולאה פשוטה על הקבוצות

**תוצאה:** 111/111 (100%), 0 errors

### 3. Centralized Config
**קובץ:** `config/database.js`

**מה עבד:**
- קובץ אחד, 20+ סקריפטים משתמשים
- קל לעדכן password
- אפס שכפולים

---

## תובנות ממיגרציית Affiliates & Sources 🔗

### 6. **Foreign Key Validation - בדוק תלויות לפני INSERT**

**הבעיה שנתקלנו:**
- ניסינו להכניס users עם RoleId=3
- הטבלה `role` לא הכילה RoleId=3
- כל ה-78 users נכשלו עם שגיאת FK constraint:
```
Cannot add or update a child row: a foreign key constraint fails
FK_User_RI_Role FOREIGN KEY (RoleId) REFERENCES role (Id)
```

**מה שניסינו:**
1. ריצה ראשונה: RoleId=3 לא קיים → 78 errors
2. יצירת role חדש: `scripts/utils/create-affiliate-role.js` → RoleId=3 "שותף"
3. החלטה פשוטה יותר: שימוש ב-RoleId=1 (admin) קיים

**הפתרון הסופי (מעודכן 2026-04-20):**
```javascript
const AFFILIATE_ROLE_ID = 3; // Role "שותף" - run create-affiliate-role.js first
```

**עדכון:** ה-RoleId תוקן ל-3 (שותף) במקום 1 (מנהל מערכת). חובה להריץ `create-affiliate-role.js` לפני המיגרציה.

בנוסף, ב-`AffiliateMapping.json` נוספו `afterInsertMappings` שיוצרים User אוטומטית לכל Affiliate ומעדכנים את affiliate.UserId - כך שלא צריך יותר את Step 0.5 בסקריפט הישן.

**לקח:**
⚠️ לפני יצירת רשומות עם FK - בדוק שהרשומות המקושרות קיימות!
⚠️ השתמש ב-Role ייעודי (RoleId=3 שותף) ולא ב-admin (RoleId=1)
✅ afterInsertMappings + updateParentColumn = יצירת רשומות תלויות בתוך המנוע

---

### 7. **Smart Skip Logic - תן למשתמש שליטה על מחיקות**

**הבעיה המקורית:**
- הסקריפט מחק אוטומטית את כל הנתונים בכל הרצה
```javascript
// Old approach - BAD!
await mysqlConn.query('DELETE FROM user WHERE RoleId = ?', [AFFILIATE_ROLE_ID]);
await mysqlConn.query('DELETE FROM affiliate');
await mysqlConn.query('DELETE FROM source');
```

**בעיות:**
1. המשתמש איבדה שליטה - הכל נמחק בלי שאלה
2. לא ניתן להריץ מיגרציה על DB עם נתונים קיימים
3. מסוכן - עלול למחוק דברים שלא צריך

**הפתרון - Smart Skip:**
```javascript
// Check if user exists before inserting
const [existingUser] = await mysqlConn.query(
  'SELECT Id FROM user WHERE UserName = ?',
  [userName]
);

if (existingUser.length > 0) {
  userIdMapping[row.Id] = existingUser[0].Id;
  usersSkipped++;
  continue;  // Skip, don't error!
}

// Insert only if doesn't exist
await mysqlConn.query(insertQuery, values);
usersInserted++;
```

**תוצאה:**
```
✅ Step 0.5 completed: 5 new users, 73 skipped (already exist)
✅ Step 1 completed: 3 new affiliates, 75 skipped (already exist)
✅ Step 3 completed: 12 new sources, 1,851 skipped (already exist)
```

**לקח:**
✅ בדוק קיום לפני INSERT - מונע duplicates ונותן גמישות
✅ דווח "X new, Y skipped" - תמיד תן visibility למשתמש
✅ המשתמש שולט על מחיקות - לא הסקריפט!
📝 השאר `clear-*.js` כעזר ידני - לא חלק מהמיגרציה האוטומטית

**שיטות בדיקה:**
- Users: `WHERE UserName = ?` (unique field)
- Affiliates: `WHERE Id = ?` (PK)
- Sources: `WHERE AffiliateId = ? AND SourceCode = ?` (composite unique)

---

### 8. **Case-Insensitive UNIQUE Constraints במMySQL**

**הבעיה:**
- רצינו להכניס user עם UserName='YNET'
- כבר היה user עם UserName='ynet' (lowercase)
- שגיאה:
```
Duplicate entry 'YNET' for key 'user.UserName'
```

**הסיבה:**
- MySQL מטפל ב-UNIQUE constraints כ-case-insensitive (default collation)
- 'ynet' = 'YNET' = 'YnEt' - כולם נחשבים זהים

**הפתרון:**
```javascript
// Check with case-insensitive comparison
const [existingUser] = await mysqlConn.query(
  'SELECT Id FROM user WHERE UserName = ?',  // MySQL handles case-insensitivity
  [userName]
);
```

**הבנה נוספת:**
```sql
-- These are considered duplicates in MySQL (default utf8mb4_general_ci)
INSERT INTO user (UserName) VALUES ('ynet');
INSERT INTO user (UserName) VALUES ('YNET');  -- ❌ Error!
```

**לקח:**
⚠️ שים לב: MySQL UNIQUE constraints הם case-insensitive (ברירת מחדל)
✅ תמיד בדוק קיום עם אותה השוואה שהמערכת משתמשת
📝 אם צריך case-sensitive: השתמש ב-BINARY collation או בדוק ידנית

---

### 9. **FK Constraints ומחיקות - סדר חשוב!**

**הבעיה:**
כשניסינו למחוק affiliates, קיבלנו:
```
Cannot delete or update a parent row: a foreign key constraint fails
(`kupathairnew`.`source`, CONSTRAINT `FK_Source_AI_Affiliate`
FOREIGN KEY (`AffiliateId`) REFERENCES `affiliate` (`Id`))
```

**הסיבה:**
- `source.AffiliateId` מצביע על `affiliate.Id`
- לא ניתן למחוק affiliate אם יש sources שמצביעים אליו

**הפתרון (למחיקות בלבד!):**
```javascript
// Disable FK checks temporarily
await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 0');

// Now we can delete in any order
await mysqlConn.query('DELETE FROM source');
await mysqlConn.query('DELETE FROM affiliate');
await mysqlConn.query('DELETE FROM user WHERE RoleId = 3');

// Re-enable FK checks
await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 1');
```

**⚠️ אזהרה:**
- השתמש ב-`SET FOREIGN_KEY_CHECKS = 0` רק לסקריפטי ניקוי!
- לעולם אל תשתמש בזה במיגרציה רגילה
- תמיד enable מחדש אחרי המחיקות

**לקח:**
✅ כשמוחקים - השתמש ב-SET FOREIGN_KEY_CHECKS=0 (בזהירות!)
✅ כשמכניסים - שמור על הסדר הנכון (parent → child)
❌ אל תשתמש ב-flag הזה במיגרציה רגילה - רק בסקריפטי cleanup

**סדר נכון להכנסה:**
1. user (אין תלויות)
2. affiliate (תלוי ב-user.Id)
3. source (תלוי ב-affiliate.Id)

---

### 10. **Multi-Table Migration עם Intermediate Mappings**

**הארכיטקטורה:**
```
Old DB                    New DB
┌─────────────────┐      ┌─────────────┐
│ ParentSources   │ ───→ │ user        │ (RoleId=3 שותף, afterInsertMappings)
│ (78 rows)       │   ┌→ │ affiliate   │ (UserId ← user.Id via updateParentColumn)
└─────────────────┘   │  └─────────────┘
                      │         ↓
┌─────────────────┐   │  ┌─────────────┐
│ UserSources     │ ──┴→ │ source      │ (Description fallback: Title → Name)
│ (1,902 rows)    │      └─────────────┘
└─────────────────┘
```

**4 שלבים (מעודכן 2026-04-20 - Step 0.5 משולב ב-afterInsertMappings):**
1. ~~STEP 0.5~~ → משולב: יצירת `user` אוטומטית ע"י afterInsertMappings ב-AffiliateMapping
2. STEP 1: `ParentSources` → `affiliate` (78 affiliates) + `user` (afterInsertMappings + updateParentColumn)
3. STEP 2: Generate `AffiliateId.json` mapping (ParentSourcesId → AffiliateId)
4. STEP 3: `UserSources` → `source` (1,902 sources) using mapping

**קובץ המיפוי:**
```json
// data/fk-mappings/AffiliateId.json
{
  "1": 1,   // ParentSourcesId=1 → AffiliateId=1
  "2": 2,
  "3": 3,
  ...
  "83": 83
}
```

**שימוש במיפוי:**
```javascript
// Load mapping
const affiliateMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// Use it for source migration
for (const row of userSources) {
  const affiliateId = affiliateMapping[row.ParentSourcesId];

  if (!affiliateId) {
    console.error(`No FK mapping for ParentSourcesId=${row.ParentSourcesId}`);
    continue;
  }

  await mysqlConn.query(
    'INSERT INTO source (AffiliateId, SourceCode, ...) VALUES (?, ?, ...)',
    [affiliateId, row.Name, ...]
  );
}
```

**יתרונות הגישה:**
✅ ברור וקריא - כל שלב עצמאי
✅ ניתן לשחזור - המיפוי נשמר בקובץ JSON
✅ ניתן לבדיקה - אפשר לראות בדיוק איזה ID הפך למה
✅ ניתן לדיבוג - אם source נכשל, אפשר לבדוק את המיפוי

**לקח:**
✅ מיגרציות מרובות טבלאות - שבור לשלבים ברורים
✅ שמור FK mappings בקבצי JSON - שקיxxxxxxיבוג
✅ בדוק קיום mapping לפני שימוש - מונע שגיאות FK

---

### 11. **Orphaned Data Handling - מה לעשות עם שורות בלי parent**

**הגילוי:**
```sql
SELECT COUNT(*) FROM UserSources WHERE ParentSourcesId IS NULL;
-- Result: 5,703 orphaned sources

SELECT COUNT(*) FROM UserSources WHERE ParentSourcesId = 0;
-- Result: 23 orphaned sources

SELECT COUNT(*) FROM UserSources WHERE ParentSourcesId IN (4, 8);
-- Result: 16 sources pointing to non-existent parents
```

**החלטת המשתמש:**
- לא למגרר שורות orphaned (אין להן affiliate parent)
- סה"כ: 5,703 + 23 + 16 = 5,742 שורות שלא מיגרציה

**המימוש:**
```javascript
const userSourcesQuery = `
  SELECT UserSourcesId, Name, ParentSourcesId, Title, ExpirationNum
  FROM UserSources
  WHERE ParentSourcesId IS NOT NULL    -- Exclude NULL
    AND ParentSourcesId <> 0           -- Exclude 0
  ORDER BY UserSourcesId
`;

// After querying, also check if parent exists in mapping
for (const row of userSources) {
  const affiliateId = affiliateMapping[row.ParentSourcesId];

  if (!affiliateId) {
    sourcesErrors.push({
      id: row.UserSourcesId,
      error: `No FK mapping found for ParentSourcesId=${row.ParentSourcesId}`
    });
    continue;  // Skip orphaned source
  }

  // Proceed with migration...
}
```

**תוצאה:**
```
Total UserSources: 7,605
- Valid (migrated): 1,863
- Orphaned (skipped): 5,742
  • NULL parent: 5,703
  • Zero parent: 23
  • Non-existent parent: 16
```

**לקח:**
⚠️ תמיד בדוק orphaned data לפני מיגרציה
✅ שאל את המשתמש: "מה לעשות עם X שורות orphaned?"
✅ דווח בבירור: "Migrated X, Skipped Y orphaned"
📝 תעדוק את ההחלטה - למה לא מיגרציה orphans

---

### 12. **AWS RDS Case-Sensitive Table Names** (Apr 22, 2026) ⚠️

**הגילוי:**
ה-DB החדש מתארח ב-AWS RDS (Linux) עם `lower_case_table_names=0` — כל שמות הטבלאות PascalCase (Affiliate, Source, User, Project...) ורגישים לאותיות. ב-`AffiliateMapping.json` ה-`afterInsertMappings[0].targetTable` היה `"user"` lowercase. המנוע ניסה `INSERT INTO user` ונכשל בשקט. תוצאה: 99 Affiliates נוצרו אבל 0 Users — `tracker.AffiliateUser = 0` בכל הריצות.

**התסמין:**
- `Affiliate.UserId IS NULL` בכל השורות למרות ש-`afterInsertMappings` מוגדר נכון
- `id_mappings` ריק ל-entity_type `AffiliateUser`
- אין שגיאה בלוגים של המיגרציה (המנוע תופס את השגיאה ומדווח שורה בודדת נכשלה, אבל הריצה ממשיכה)

**פתרון:**
✅ תמיד לכתוב שמות טבלאות ב-PascalCase בכל מיפוי JSON (כולל ב-`afterInsertMappings[].targetTable`)
✅ ה-`"targetTable"` העיקרי של המפה האב היה נכון (`"Affiliate"`, `"Source"`) — הבאג היה רק בשדה המקונן
📝 כלל: אם עוברים ב-DB מקומי (Windows MySQL case-insensitive) ל-RDS, לוודא PascalCase בכל שורה שמגיעה ל-SQL

---

### 13. **postMigrationRunners — Engine Hook להרצת צעדים אחרי המיגרציה** (Apr 22, 2026) ⭐NEW

**הצורך:**
`Affiliate.DefaultSourceId` דורש מידע שקיים רק אחרי ש-Source כולה נכנסה. זה לא יכול להיות עמודה רגילה ב-`columnMappings` של Affiliate. ב-AffiliateMapping.json היה שדה מדומה `postMigrationScript` שהגדיר SQL — אבל המנוע **מעולם לא הריץ אותו** (dead field), וה-SQL עצמו הפנה לעמודה לא קיימת `originalSourceId`.

**הפתרון:**
נוסף למנוע hook חדש שמריץ מודולים אחרי שהלולאה העיקרית מסתיימת:

```json
// server/mappings/SourceMapping.json
{
  ...
  "postMigrationRunners": ["set-default-source-id"]
}
```

```javascript
// server/src/engine/migration-engine.js (סוף run())
if(m.postMigrationRunners&&Array.isArray(m.postMigrationRunners)){
  for(var runnerName of m.postMigrationRunners){
    try{
      var runner=require("./post-runners/"+runnerName);
      await runner.run();
    }catch(err){
      logger.error("Post-migration runner failed",{runner:runnerName,error:err.message});
      // לא נכשל על הריצה הראשית
    }
  }
}
```

המודול [server/src/engine/post-runners/set-default-source-id.js](../server/src/engine/post-runners/set-default-source-id.js) idempotent — מעדכן רק `Affiliate` עם `DefaultSourceId=NULL`. אסטרטגיה: Code↔SourceCode, ואם אין התאמה — `MIN(Source.Id)` לאותו Affiliate.

**לקח:**
✅ דברים שדורשים שכל הנתונים קיימים — hook ייעודי בסוף המיגרציה, לא SQL ב-JSON
✅ post-runners best-effort: כישלון לא שובר את הריצה הראשית
✅ idempotent — בטוח להריץ חוזר אחרי ריצה חלקית

---

### 14. **FK Chain ל-Donation חוסם clean re-run של Source** (Apr 22, 2026) 🔴

**הגילוי:**
בניסיון `DELETE FROM Source` לפני מיגרציה מחדש, קיבלנו:
```
Cannot delete or update a parent row: a foreign key constraint fails
(`Donation`, CONSTRAINT `FK_Donation_SI_Source` FOREIGN KEY (`SourceId`) REFERENCES `Source` (`Id`))
```

עם **1.39 מיליון Donations** המצביעות על Source. לא אפשרי "פשוט למחוק".

**הפתרון שנבחר (in-place fix):**
במקום למחוק ולהריץ מחדש — עדכון נתונים קיימים במקום. שמר על `Source.Id` היציב → Donation FKs לא נשברו.
- [scripts/rerun-affiliate-source/04-inplace-fix.js](../scripts/rerun-affiliate-source/04-inplace-fix.js) — Phase A (Description) + Phase B (Users)
- [scripts/rerun-affiliate-source/03-set-default-source-id.js](../scripts/rerun-affiliate-source/03-set-default-source-id.js) — DefaultSourceId

**לקח:**
⚠️ לפני שמתכננים clean re-run, לבדוק את כל ה-FKs היוצאים מהטבלה: `SELECT ... FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME='Source'`
✅ אם יש FKs חיצוניים עם הרבה נתונים — in-place fix עדיף
✅ אם חייבים clean re-run: לבנות snapshot של ה-FKs, לנקות, למגרר, ו-re-link

---

### 15. **Case-Insensitive UNIQUE על UserName גורם duplicate error למרות lookup צולח** (Apr 22, 2026)

**הגילוי:**
ניסיון `INSERT INTO User (UserName='YNET', ...)` נכשל עם `Duplicate entry 'YNET' for key 'User.UserName'` — כי משתמש קיים עם `UserName='ynet'` (case-insensitive UNIQUE). אבל **ה-lookup שלנו לא תפס**: `SELECT Id FROM User WHERE UserName IN ('YNET', ...)` החזיר את `'ynet'` (case-insensitive match ב-SELECT), אבל ה-Map ב-JS המקשה לפי `r.UserName` (הערך 'ynet') ולקאפ לפי `'YNET'` נכשל.

**הפתרון:**
```javascript
// set key in lowercase
rows.forEach(r => existingUsers.set(String(r.UserName).toLowerCase(), r.Id));
// get in lowercase
let userId = existingUsers.get(String(p.userName).toLowerCase());
// also: try/catch על INSERT + fallback ל-SELECT במקרה של ER_DUP_ENTRY
```

**לקח:**
✅ SELECT של MySQL case-insensitive, אבל JS Map case-sensitive — normalize ל-lowercase בשני הצדדים
✅ לעטוף INSERT ב-try/catch עם חזרת נפילה ל-SELECT על `ER_DUP_ENTRY` — מטפל ב-race conditions וב-edge cases

---

## סיכום לשיחה הבאה 📝

### מה השלמנו:
✅ 7 טבלאות (Recruiters + Affiliates) - 9,254 שורות
✅ 4 טבלאות Recruiter (7,313 שורות) - 100% הצלחה
✅ 3 טבלאות Affiliates & Sources (1,941 שורות) - 99.1% הצלחה
✅ Centralized database config
✅ Smart skip logic - אין מחיקות אוטומטיות
✅ Standalone scripts + UI integration

### מה למדנו (Recruiters):
1. Name matching > FK cascading
2. תמיד בדוק מבנה טבלה לפני!
3. שלב UI + standalone ביחד
4. הרוג server אחרי כל שינוי
5. isEmpty עם "null" string handling

### מה למדנו (Affiliates & Sources):
6. בדוק שFK targets קיימים לפני INSERT
7. Smart skip logic > auto-delete
8. MySQL UNIQUE constraints = case-insensitive
9. SET FOREIGN_KEY_CHECKS=0 רק לניקוי (בזהירות!)
10. Multi-table migration עם intermediate JSON mappings
11. זהה ופלטר orphaned data לפני מיגרציה
12. **afterInsertMappings + updateParentColumn** - יצירת רשומות תלויות ועדכון FK חזרה לאב
13. **lookupKey** - מניעת כפילויות ב-afterInsertMappings (בדיקה לפני INSERT)
14. **Description fallback** - תמיד הגדר fallback כש-source column עלול להיות NULL
15. **AWS RDS PascalCase** - כל שמות הטבלאות ב-JSON mappings חייבים להיות PascalCase (Affiliate, Source, User...), כולל ב-afterInsertMappings[].targetTable
16. **postMigrationRunners** - hook חדש במנוע להרצת מודולים אחרי הלולאה הראשית. מתאים לשדות שדורשים את כל הנתונים (כמו DefaultSourceId)
17. **FK chain ל-Donation חוסם clean re-run** - in-place fix עדיף על cleanup מלא כש-FKs חיצוניים עם הרבה נתונים
18. **normalize case** בשני הצדדים של lookup (SELECT + JS Map) כש-UNIQUE constraint case-insensitive

### הכנה למיגרציה הבאה:
1. קרא LESSONS_LEARNED.md (10 דקות) ⭐
2. תחקור טבלה ישנה וחדשה
   ```sql
   sp_help [TableName]           -- MSSQL
   SELECT TOP 10 * FROM [table]  -- Sample data
   DESCRIBE table;               -- MySQL
   ```
3. בדוק FK dependencies ו-orphaned data
4. תכתוב standalone script עם:
   - Smart skip logic (check existing before INSERT)
   - Name matching או FK mapping (JSON file)
   - Orphaned data filtering
5. תשלב מיד ב-server.js
6. תבדוק שני הפלואים (standalone + UI)
7. תתעד ותקמיט

### הטבלאות הבאות בתור (Priority 1):
- [ ] Lead (טבלת לידים)
- [ ] Donation / Payment (תרומות)

---

**נוצר:** 26-27 נובמבר 2025
**עדכון אחרון:** 20 אפריל 2026
**מיגרציות:**
- Recruiters (4 tables, 7,313 rows) - ✅ 100% Success
- Affiliates & Sources (3 tables, 1,941 rows) - ✅ 99.1% Success
**סה"כ:** 7 tables, 9,254 rows

**תיקוני Affiliates & Sources (2026-04-20):**
- תוקן RoleId מ-1 (admin) ל-3 (שותף)
- נוספו afterInsertMappings ב-AffiliateMapping ליצירת User אוטומטית
- נוספו lookupKey + updateParentColumn במנוע המיגרציה
- תוקן Description ב-SourceMapping עם fallback ל-Name
