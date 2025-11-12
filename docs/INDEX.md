# Documentation Index

מערכת התיעוד המלאה של פרויקט המיגרציה.

## 📚 התחלה מהירה

### לעבודה עם AI (Claude Code)
1. **קרא תחילה**: [../PROMPT.md](../PROMPT.md) - הקובץ הראשי עם כללי עבודה ומפת הפרויקט
2. **סטטוס נוכחי**: [../MIGRATION_STATUS.md](../MIGRATION_STATUS.md) - התקדמות מפורטת
3. **מיפויים ספציפיים**: ראה למטה ↓

### לפיתוח ידני
1. **README**: [../README.md](../README.md) - מידע כללי והפעלת server
2. **CLAUDE.md**: [../CLAUDE.md](../CLAUDE.md) - הנחיות לעבודה עם Claude

---

## 🗂️ מבנה התיעוד

```
docs/
├── INDEX.md                          ← הקובץ הזה
├── TECHNICAL_PATTERNS.md             ← תבניות קוד ו-best practices
└── mappings/
    ├── mapping-project.md            ← מיפוי Project (75% הושלם)
    ├── mapping-projectlocalization.md ← מיפוי ProjectLocalization (55% הושלם)
    └── mapping-projectitem.md        ← מיפוי ProjectItem (59% הושלם)
```

---

## 📖 מדריכים לפי נושא

### מיפויים (Mappings)

#### ✅ הושלמו
1. **[Project Table](mappings/mapping-project.md)**
   - 12/16 שדות (75%)
   - CSV Lines: 145-254 (Funds), 383-534 (Collections)
   - סטטוס: 1,750/1,750 (100% ✅)

2. **[ProjectLocalization](mappings/mapping-projectlocalization.md)**
   - 6/11 שדות (55%)
   - CSV Lines: 1882-1925, 1926-1969, 1968-1997
   - סטטוס: 5,244/5,250 (99.9% ⚠️ - 6 שורות נכשלו)

3. **[ProjectItem](mappings/mapping-projectitem.md)**
   - 13/22 שדות (59%)
   - CSV Lines: 1827-1846 (Funds), 2594-2629 (Collections)
   - סטטוס: טרם נבדק בפועל

#### ⏳ הבאים בתור
4. **ProjectItemLocalization** (טרם נוצר)
   - CSV Lines: 1975-2096
   - תלוי ב-ProjectItem

5. **Media Table** (טרם נוצר)
   - CSV Lines: 1850-1881

6. **LinkSettings** (טרם נוצר)
   - CSV Lines: 1958-1973

---

### טכני (Technical)

#### [תבניות קוד](TECHNICAL_PATTERNS.md)
מכיל:
- ✅ 10 תבניות קוד חוזרות
- ✅ 10 מלכודות נפוצות ופתרונות
- ✅ Checklist לפני commit
- ✅ Performance tips
- ✅ שאילתות SQL שימושיות

נושאים:
- Expression Evaluation Pattern
- GETDATE() Replacement
- FK Mapping Pattern
- Multi-Language Localization
- Variable Items (ProjectItem)
- Dynamic SELECT Query Building
- ID Mapping
- Error Handling
- Logging
- INSERT Query Building

---

## 🎯 מקרי שימוש

### מקרה 1: מתחילים עבודה בחלון חדש
```markdown
1. קרא: PROMPT.md (הקשר כללי)
2. קרא: MIGRATION_STATUS.md (סטטוס עדכני)
3. קרא: mapping-reports/Mapping-Coverage.html (דוח חזותי)
4. בחר את המיפוי הבא לעבוד עליו
```

### מקרה 2: מוסיפים מיפוי חדש לטבלה קיימת
```markdown
1. קרא: docs/mappings/mapping-[table-name].md
2. קרא: docs/TECHNICAL_PATTERNS.md (Section 1-10)
3. ערוך: mappings/ProjectMapping.json
4. עדכן: mapping-reports/add-mapping-status.js (completedLines)
5. עדכן: docs/mappings/mapping-[table-name].md
6. בדוק: Code Review Checklist (TECHNICAL_PATTERNS.md)
```

### מקרה 3: מטפלים בשגיאות במיגרציה
```markdown
1. בדוק: migration-logs.log
2. קרא: docs/TECHNICAL_PATTERNS.md (Common Pitfalls)
3. קרא: docs/mappings/mapping-[table-name].md (בעיות ידועות)
4. בדוק: MIGRATION_STATUS.md (Known Issues)
```

### מקרה 4: מתכננים טבלה חדשה למיגרציה
```markdown
1. קרא: PROMPT.md (סדר ביצוע מיגרציה)
2. בדוק FK dependencies בין טבלאות
3. צור: docs/mappings/mapping-[new-table].md
4. תכנן: projectItemIdMappings או מבנה דומה (אם נדרש)
5. בדוק: TECHNICAL_PATTERNS.md (Patterns רלוונטיים)
```

---

## 📊 מעקב אחר התקדמות

### דוחות אוטומטיים
```bash
cd mapping-reports
node add-mapping-status.js
start Mapping-Coverage.html
```

**תוצאה**:
- ✅ שורות ירוקות: הושלמו (127/3,137 = 4%)
- ⏳ שורות צהובות: ממתינות

### שאילתות ידניות (MySQL)
```sql
-- כמות projects
SELECT COUNT(*) FROM project;

-- כמות localizations (צריך להיות 3x projects)
SELECT COUNT(*) FROM projectLocalization;

-- פילוח לפי שפה
SELECT LanguageId, COUNT(*)
FROM projectLocalization
GROUP BY LanguageId;

-- בדיקת שורות שנכשלו
SELECT * FROM projectLocalization WHERE Title IS NULL;
```

---

## 🔍 חיפוש מהיר

### איך למצוא...

**"איך לטפל ב-expression עם fallback?"**
→ [TECHNICAL_PATTERNS.md](TECHNICAL_PATTERNS.md#1-expression-evaluation-pattern)

**"מה הסדר הנכון למיגרציה?"**
→ [PROMPT.md](../PROMPT.md#2-סדר-ביצוע-מיגרציה-חשוב)

**"איך עובד multi-language?"**
→ [mapping-projectlocalization.md](mappings/mapping-projectlocalization.md#עקרון-הטבלה)

**"למה יש לי 6 שגיאות?"**
→ [MIGRATION_STATUS.md](../MIGRATION_STATUS.md#1-null-titles-6-שורות---01)

**"איך מוסיפים FK mapping?"**
→ [TECHNICAL_PATTERNS.md](TECHNICAL_PATTERNS.md#3-fk-mapping-pattern)

**"איך ProjectItem שונה מ-ProjectLocalization?"**
→ [mapping-projectitem.md](mappings/mapping-projectitem.md#עקרון-הטבלה)

---

## 🚨 אזהרות חשובות

### ⚠️ לפני ריצת מיגרציה
1. גבה את בסיס הנתונים (MySQL)
2. נקה טבלאות קיימות (TRUNCATE)
3. ודא שה-server רץ
4. בדוק חיבורים לשני בסיסי הנתונים

### ⚠️ אחרי ריצת מיגרציה
1. בדוק migration-logs.log
2. ספור שורות בבסיס הנתונים
3. הרץ שאילתות בדיקה
4. עדכן MIGRATION_STATUS.md
5. עדכן mapping-reports

### ⚠️ בעיות ידועות
- **NULL Title Fallback** לא עובד ב-100% מהמקרים → 6 שורות נכשלות
- **defaultValue אחרי Expression** לפעמים לא מיושם כראוי
- **OrderInProjectsPageView** יש `convertType: "direct"` אבל צריך `"expression"`

---

## 🔗 קישורים מהירים

### קבצי קונפיגורציה
- [ProjectMapping.json](../mappings/ProjectMapping.json) - המיפוי הפעיל
- [TerminalId.json](../fk-mappings/TerminalId.json) - FK mapping לדוגמה
- [.gitignore](../.gitignore) - קבצים להתעלם

### קבצי קוד
- [server.js](../server.js) - Migration engine
- [public/index.html](../public/index.html) - Web UI

### דוחות
- [Mapping.csv](../Mapping.csv) - מיפוי מקורי (3,137 שורות)
- [migration-logs.log](../migration-logs.log) - לוגים אחרונים
- [Mapping-Coverage.html](../mapping-reports/Mapping-Coverage.html) - דוח חזותי

### תיעוד כללי
- [README.md](../README.md) - תיעוד ראשי
- [CLAUDE.md](../CLAUDE.md) - הנחיות Claude
- [MIGRATION_STATUS.md](../MIGRATION_STATUS.md) - סטטוס מפורט

---

## 💡 טיפים

### עבור AI (Claude Code)
- תמיד התחל מ-PROMPT.md
- השתמש במילון המונחים (בתחתית PROMPT.md)
- בדוק Common Pitfalls לפני כתיבת קוד
- עקוב אחר Code Review Checklist

### עבור מפתחים
- השתמש ב-mapping-reports לעקוב אחר התקדמות
- בדוק migration-logs.log אחרי כל ריצה
- הרץ queries לבדוק תוצאות
- עדכן את התיעוד עם כל שינוי

### עבור תכנון
- עקוב אחר FK dependencies
- תכנן ID mappings מראש (projectItemIdMappings)
- ספור שורות צפויות לפני ריצה
- בדוק שכל הטבלאות ההורות קיימות

---

**עדכון אחרון**: 2025-11-11
**מסמכים**: 5 (PROMPT.md + 4 docs)
**התקדמות**: 127/3,137 (4%)
