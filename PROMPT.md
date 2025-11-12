# Database Migration Project - Master Prompt

## הקשר הכללי

פרויקט מיגרציה של בסיס נתונים מ-MSSQL (SQL Server) ל-MySQL.
- **Database ישן**: KupatHair (MSSQL)
- **Database חדש**: kupathair_new (MySQL)
- **Table מקור עיקרי**: products
- **Tables יעד**: project, projectLocalization, projectItem (+ עוד בעתיד)

## מבנה הפרויקט

```
NewMigration/
├── PROMPT.md                          # ← הקובץ הזה - נקודת כניסה ראשית
├── docs/
│   └── mappings/
│       ├── mapping-project.md         # פירוט מיפוי Project
│       ├── mapping-projectlocalization.md  # פירוט מיפוי ProjectLocalization
│       └── mapping-projectitem.md     # פירוט מיפוי ProjectItem
├── server.js                          # Migration engine
├── public/index.html                  # Web UI
├── mappings/ProjectMapping.json       # קובץ המיפוי הפעיל
├── mapping-reports/                   # דוחות התקדמות
│   ├── add-mapping-status.js
│   ├── Mapping-WithStatus.csv
│   └── Mapping-Coverage.html
├── Mapping.csv                        # הגדרות מיפוי מקוריות (3,137 שורות)
├── MIGRATION_STATUS.md               # סטטוס נוכחי מפורט
└── migration-logs.log                # לוגים של ריצות מיגרציה
```

## כללי עבודה

### 1. עקרונות בסיסיים
- **אין לשנות נתונים בבסיס הנתונים הישן** - read-only
- **כל שינוי ב-mapping צריך להתעדכן ב-3 מקומות**:
  1. `mappings/ProjectMapping.json`
  2. `public/index.html` (UI)
  3. `mapping-reports/add-mapping-status.js` (completed lines)
- **תמיד לבדוק לוגים** ב-`migration-logs.log` אחרי ריצה
- **לעדכן MIGRATION_STATUS.md** עם כל התקדמות

### 2. סדר ביצוע מיגרציה (חשוב!)
בגלל Foreign Keys, יש לשמור על סדר:
1. **project** (הטבלה ההורה)
2. **projectLocalization** (תלויה ב-project)
3. **projectItem** (תלויה ב-project)
4. **projectItemLocalization** (תלויה ב-projectItem) - עתידי

### 3. סוגי Mapping נתמכים

#### 3.1 direct
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "ProjectNumber"
}
```

#### 3.2 const
```json
{
  "convertType": "const",
  "value": "2"
}
```

#### 3.3 expression
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name",
  "expression": "value ? value.substring(0, 150) : null",
  "defaultValue": "Default Name"  // אופציונלי
}
```

#### 3.4 FK (Foreign Key with mapping)
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "Terminal",
  "useFkMapping": true,
  "defaultValue": "1"
}
```
עם קובץ `fk-mappings/TerminalId.json`:
```json
{
  "1": "1",
  "4": "2"
}
```

### 4. Patterns חשובים

#### 4.1 Multi-language (Localization)
כל project יוצר **3 שורות** ב-projectLocalization:
- LanguageId = 1 (עברית)
- LanguageId = 2 (אנגלית)
- LanguageId = 3 (צרפתית)

#### 4.2 Variable Items (ProjectItem)
לפי ProjectType:
- **ProjectType=1 (Funds)**: 1 פריט (ItemType=5 FundDonation)
- **ProjectType=2 (Collections)**: 2 פריטים (ItemType=2 Certificate + ItemType=4 Donation)

#### 4.3 Expression Evaluation
ה-engine מעריך expressions עם גישה ל:
- `value` - ערך העמודה הנוכחית
- `row` - כל השורה מהטבלה הישנה

דוגמה:
```javascript
"expression": "(value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null))"
```

#### 4.4 DefaultValue Logic
- אם `convertType: "const"` - משתמש ב-`value`
- אם `convertType: "expression"`:
  1. מחיל expression על value
  2. אם התוצאה `null` ויש `defaultValue` - משתמש ב-defaultValue

### 5. הרצת מיגרציה

```bash
# הפעלת server
npm start

# פתיחת UI
http://localhost:3030

# צעדים:
1. Test MSSQL Connection
2. Test MySQL Connection
3. Load Mapping (ProjectMapping.json)
4. Migrate (בחר project)
5. בדוק logs ב-migration-logs.log
```

### 6. מעקב אחרי התקדמות

```bash
# יצירת דוח חזותי
cd mapping-reports
node add-mapping-status.js

# פתיחת דוח
start Mapping-Coverage.html
```

הדוח מציג:
- ✅ שורות ירוקות: הושלמו (127/3,137 = 4%)
- ⏳ שורות צהובות: ממתינות

## מפת המיפויים

### ✅ הושלמו
1. **[Project Table](docs/mappings/mapping-project.md)** - 12/16 שדות (75%)
   - CSV Lines: 145-254 (Funds), 383-534 (Collections)

2. **[ProjectLocalization](docs/mappings/mapping-projectlocalization.md)** - 6/11 שדות (55%)
   - CSV Lines: 1882-1925 (Hebrew), 1926-1969 (English), 1968-1997 (French)

3. **[ProjectItem](docs/mappings/mapping-projectitem.md)** - 13/22 שדות (59%)
   - CSV Lines: 1827-1846 (Funds), 2594-2629 (Collections)

### ⏳ הבאים בתור
4. **ProjectItemLocalization** - 0% (טרם התחיל)
   - CSV Lines: 1975-2096

5. **Media Table** - 0% (טרם התחיל)
   - CSV Lines: 1850-1881

6. **LinkSettings** - 0% (טרם התחיל)
   - CSV Lines: 1958-1973

## בעיות ידועות

### 1. NULL Titles (6 שורות - 0.1%)
projectLocalization נכשלות כאשר Name_en או Name_fr הם NULL.
**פתרון אפשרי**: השתמש ב-Name (עברית) כ-fallback.

### 2. Expression + DefaultValue
DefaultValue לא תמיד מיושם אחרי expression שמחזיר null.
**מיקום**: server.js:684-689
**מצב**: תוקן חלקית - עדיין צריך בדיקה מעמיקה.

## נתונים טכניים

### Database Connections
**MSSQL**:
- Server: `DESKTOP-8E2HGCA\SQLEXPRESS`
- Database: `KupatHair`
- Trusted connection

**MySQL**:
- Host: `localhost`
- User: `root`
- Database: `kupathair_new`

### סטטיסטיקות מיגרציה אחרונה
**Date**: 2025-11-11 10:24
- **project**: 1,750/1,750 (100% ✅)
- **projectLocalization**: 5,244/5,250 (99.9% ⚠️)
- **projectItem**: טרם נבדק בפועל

## הוראות שימוש בפרומפט

כשמתחילים חלון חדש:

1. **קרא קובץ זה** (PROMPT.md) להקשר כללי
2. **קרא MIGRATION_STATUS.md** לסטטוס מעודכן
3. **קרא את קובץ המיפוי הרלוונטי** מ-docs/mappings/
4. **בדוק את mapping-reports/Mapping-Coverage.html** לראות מה חסר

### דוגמה לפרומפט המשך עבודה:
```
אני עובד על מיגרציית בסיס נתונים מ-MSSQL ל-MySQL.
קרא את PROMPT.md להבנת ההקשר הכללי.
קרא את docs/mappings/mapping-projectitemlocalization.md.
אנחנו צריכים ליישם את המיפוי הזה עכשיו.
```

## קבצים חשובים לעריכה

### כשמוסיפים mapping חדש:
1. **mappings/ProjectMapping.json** - הוסף/ערוך mapping
2. **server.js** - הוסף לוגיקת migration (אם צריך)
3. **public/index.html** - הוסף UI accordion (אם רלוונטי)
4. **mapping-reports/add-mapping-status.js** - הוסף line numbers ל-completedLines
5. **MIGRATION_STATUS.md** - עדכן סטטוס

### כשבודקים תוצאות:
1. **migration-logs.log** - לוגים של הריצה
2. **mapping-reports/Mapping-Coverage.html** - דוח חזותי
3. MySQL query - בדיקה ידנית בבסיס הנתונים

## מילון מונחים

- **products** - טבלת המקור הישנה (MSSQL)
- **project** - טבלת היעד החדשה (MySQL)
- **ProjectType** - 1=Funds, 2=Collections
- **ItemType** - 2=Certificate, 4=Donation, 5=FundDonation
- **LanguageId** - 1=Hebrew, 2=English, 3=French
- **RecordStatus** - 2=Active (ברירת מחדל)
- **FK** - Foreign Key
- **convertType** - סוג המיפוי (direct/const/expression)
- **defaultValue** - ערך ברירת מחדל אם המקור NULL

## תזכורות חשובות

⚠️ **לפני כל ריצת מיגרציה**:
1. גבה את בסיס הנתונים החדש (MySQL)
2. נקה טבלאות (TRUNCATE) או מחק נתונים קודמים
3. בדוק שה-server רץ (`npm start`)
4. בדוק חיבורים לשני בסיסי הנתונים

⚠️ **אחרי כל ריצת מיגרציה**:
1. בדוק migration-logs.log לשגיאות
2. ספור שורות בבסיס הנתונים
3. בצע queries לדוגמה לוודא תקינות
4. עדכן MIGRATION_STATUS.md
5. הרץ add-mapping-status.js לעדכון דוח

---

**אחרון עדכון**: 2025-11-11
**התקדמות כוללת**: 127/3,137 שורות (4%)
**טבלאות מושלמות**: project (100%), projectLocalization (99.9%), projectItem (טרם נבדק)
