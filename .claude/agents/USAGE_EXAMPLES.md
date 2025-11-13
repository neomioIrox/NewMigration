# Agent Usage Examples - תרחישי שימוש בסוכנים

## 🎯 מטרת המסמך

מדריך מעשי לשימוש בשני הסוכנים החכמים למיגרציה. העתק והדבק את הדוגמאות לשיחה חדשה עם Claude.

---

## 📋 לפני שמתחילים

וודא שיש לך:
- ✅ קובץ `data/Mapping.csv` עם כל המיפויים
- ✅ סכמות DB ב-`database/schemas/`
- ✅ חיבור לשני ה-DBs (MSSQL + MySQL)

---

## 🤖 Agent 1: Mapping Generator

### תרחיש 1: יצירת mapping לטבלת projectitemlocalization

#### קלט לשיחה:
```
אני רוצה ליצור mapping לטבלת projectitemlocalization.

לפי הקובץ Mapping.csv, הטבלה נמצאת ב-Steps 3.1-3.2:
- Step 3.1: Hebrew localization
- Step 3.2: English localization
- צריך להוסיף גם French (Step 3.3) עם fallback לעברית

הטבלה צריכה לכלול:
- ItemId (FK לprojectitem)
- LanguageId (1=Hebrew, 2=English, 3=French)
- Title (עם NULL fallback)
- Description (אופציונלי)
- Price (אם 0 אז NULL)

פורמט פלט: UI (עבור ה-Web interface)

בבקשה צור את הקובץ ProjectItemLocalization_Mapping.json
```

#### פלט צפוי:
הסוכן צריך:
1. לקרוא את `data/Mapping.csv`
2. למצוא שורות עם Step 3.1-3.2
3. ליצור מבנה `localizationMappings` עם 3 שפות
4. להוסיף NULL handling לכל expression
5. לשמור ב-`mappings/ProjectItemLocalization_Mapping.json`

---

### תרחיש 2: יצירת mapping לטבלת lead

#### קלט לשיחה:
```
צור mapping לטבלת lead.

לפי Mapping.csv, זה Step 4.

הטבלה מכילה:
- מידע על תורמים פוטנציאלים
- קשר לproject (FK)
- שדות contact (שם, טלפון, מייל)
- תאריכי follow-up

פורמט: UI
שם קובץ: Lead_Mapping.json
```

#### פלט צפוי:
```json
{
  "filename": "Lead_Mapping",
  "whereClause": null,
  "columnMappings": {
    "ProjectId": {
      "convertType": "FK",
      "oldTable": "leads",
      "oldColumn": "ProductId",
      "useFkMapping": true
    },
    "FirstName": {
      "convertType": "direct",
      "oldTable": "leads",
      "oldColumn": "FirstName"
    },
    ...
  },
  "savedAt": "2025-11-13T..."
}
```

---

### תרחיש 3: mapping לproject עם funds ו-collections

#### קלט לשיחה:
```
צור mapping לטבלת project.

לפי Mapping.csv:
- Step 1: Funds (ProjectType=1, Certificate=0)
- Step 1.1: Collections (ProjectType=2, Certificate=1)

הטבלה דורשת:
- WHERE clause שונה לכל סוג
- FK mappings לTerminal
- expressions לטיפול ב-NULL

פורמט: CLI (nested structure)
שם קובץ: ProjectMapping_Complete.json
```

#### פלט צפוי:
```json
{
  "filename": "ProjectMapping_Complete",
  "projectMappings": {
    "funds": {
      "whereClause": "ISNULL(Certificate,0) != 1",
      "mappings": { ... }
    },
    "collections": {
      "whereClause": "Certificate = 1",
      "mappings": { ... }
    }
  }
}
```

---

## 🚀 Agent 2: Migration Executor

### תרחיש 4: Test run על 10 שורות

#### קלט לשיחה:
```
הרץ מיגרציה במצב test עבור ProjectItemLocalization.

פרמטרים:
- Mapping: mappings/ProjectItemLocalization_Mapping.json
- Mode: test (10 שורות בלבד)
- Options:
  * clearTarget: true (נקה את הטבלה לפני)
  * limit: 10

בצע את השלבים הבאים:
1. בדוק חיבורים ל-DBs
2. טען את המיפוי
3. נקה את projectitemlocalization
4. העבר 10 שורות ראשונות
5. בדוק שנוצרו 30 רשומות (10 x 3 שפות)
6. בצע rollback
7. צור דוח מפורט
```

#### פלט צפוי:
```json
{
  "status": "success",
  "mode": "test",
  "summary": {
    "sourceRows": 10,
    "targetRows": 30,
    "duration": "5s",
    "rollback": true
  },
  "validation": {
    "hebrewRows": 10,
    "englishRows": 10,
    "frenchRows": 10,
    "nullFields": 0,
    "errors": 0
  }
}
```

---

### תרחיש 5: Dry-run עם סינון

#### קלט לשיחה:
```
הרץ dry-run למיגרציה של project (Funds בלבד).

פרמטרים:
- Mapping: mappings/ProjectMapping_Funds_Fixed.json
- Mode: dry-run (אל תכתוב ל-DB!)
- Options:
  * whereClause: "productsid BETWEEN 1 AND 100"

בצע:
1. קרא 100 שורות מ-products
2. החל את כל ה-mappings
3. בדוק expressions
4. בדוק FK translations
5. **אל תכתוב** ל-MySQL
6. דווח מה היה קורה
```

#### פלט צפוי:
```json
{
  "status": "dry-run",
  "summary": {
    "wouldProcess": 100,
    "wouldCreate": {
      "project": 100,
      "projectlocalization": 300,
      "projectitem": 100
    },
    "potentialIssues": [
      {
        "row": 45,
        "issue": "Name_en is NULL, will use fallback",
        "action": "Will insert 'No Translation'"
      }
    ]
  }
}
```

---

### תרחיש 6: Production migration מלאה

#### קלט לשיחה:
```
הרץ מיגרציה PRODUCTION למיגרציה מלאה של Collections.

⚠️ זו הרצה אמיתית - תכתוב ל-DB!

פרמטרים:
- Mapping: mappings/ProjectMapping_Collections_Fixed.json
- Mode: production
- Options:
  * clearTarget: false (שמור נתונים קיימים)
  * parallel: true (הרץ במקביל כשאפשר)

בצע:
1. בדוק שה-mapping תקין
2. בדוק חיבורים
3. העבר project rows (צפוי: 1,750)
4. לכל project, צור 3 localizations (צפוי: 5,250)
5. לכל project, צור 2 items (צפוי: 3,500)
6. תעד שגיאות אם יש
7. צור דוח סופי

צפוי:
- 1,750 projects
- 5,250 localizations (x3 languages)
- 3,500 items (x2 per project)
```

#### פלט צפוי:
```json
{
  "status": "success",
  "mode": "production",
  "summary": {
    "duration": "4m 23s",
    "totalRows": 10500,
    "successRate": "99.8%"
  },
  "tables": {
    "project": {
      "processed": 1750,
      "inserted": 1750,
      "errors": 0,
      "duration": "1m 12s"
    },
    "projectlocalization": {
      "processed": 5250,
      "inserted": 5238,
      "errors": 12,
      "duration": "2m 05s"
    },
    "projectitem": {
      "processed": 3500,
      "inserted": 3500,
      "errors": 0,
      "duration": "1m 06s"
    }
  },
  "errors": [
    {
      "table": "projectlocalization",
      "language": "french",
      "count": 12,
      "reason": "Used fallback 'No Translation'"
    }
  ],
  "report": "reports/migration_2025-11-13_080000.json"
}
```

---

## 🔗 תרחיש מלא: מתחילה ועד סוף

### שלב 1: יצירת Mapping
```
/agent mapping-generator

אני רוצה ליצור mapping חדש לטבלת recruiter.

לפי הקובץ Mapping.csv, זה Step 4.1.

הטבלה מכילה:
- מידע על מגייסים
- קשר לproject
- שדות אישיים (שם, מייל, טלפון)
- נתוני ביצועים

פורמט: UI
שם קובץ: Recruiter_Mapping.json
```

### שלב 2: בדיקה ב-Test
```
/agent migration-executor

הרץ test run למיפוי החדש של recruiter.

Mapping: mappings/Recruiter_Mapping.json
Mode: test
Options: { clearTarget: true, limit: 10 }

בדוק:
1. שכל השדות ממופים נכון
2. FK ל-project עובד
3. אין NULL issues
4. דווח אם יש בעיות
```

### שלב 3: Dry-Run על נתונים אמיתיים
```
/agent migration-executor

dry-run עם 100 שורות אמיתיות.

Mapping: mappings/Recruiter_Mapping.json
Mode: dry-run
Options: { whereClause: "recruiterid < 101" }

דווח:
- כמה שורות יועברו
- האם יש שגיאות פוטנציאליות
- האם ה-FK mappings עובדים
```

### שלב 4: Production Run
```
/agent migration-executor

אם הכל תקין מה-dry-run, הרץ production.

Mapping: mappings/Recruiter_Mapping.json
Mode: production
Options: { clearTarget: false }

העבר את כל הנתונים וצור דוח מפורט.
```

---

## 📊 בדיקת תוצאות

### אחרי כל migration, בדוק:

```sql
-- MySQL
-- בדוק row count
SELECT COUNT(*) FROM recruiter;

-- בדוק לא נוצרו NULLs
SELECT * FROM recruiter WHERE required_field IS NULL;

-- בדוק FKs תקינים
SELECT r.* FROM recruiter r
LEFT JOIN project p ON r.ProjectId = p.Id
WHERE p.Id IS NULL;

-- בדוק localization (אם רלוונטי)
SELECT LanguageId, COUNT(*)
FROM recruiterlocalization
GROUP BY LanguageId;
```

---

## 🐛 טיפול בבעיות נפוצות

### בעיה: "Column cannot be NULL"
```
/agent mapping-generator

תקן את המיפוי עבור השדה [field_name].

הוסף:
1. defaultValue: "0" או ערך מתאים
2. expression עם NULL fallback
3. וודא שה-Comments בCSV מכיל הנחיות

צור מיפוי מתוקן.
```

### בעיה: "FK constraint fails"
```
/agent migration-executor

הבעיה: FK constraint נכשל ב-[table_name].

בדוק:
1. האם parent table (project) כבר הועבר?
2. האם יש FK mapping ב-data/fk-mappings/?
3. האם defaultValue מוגדר?

אם צריך, הרץ את parent table קודם.
```

### בעיה: "Expression evaluation failed"
```
/agent mapping-generator

תקן את ה-expression עבור [field_name].

Expression הנוכחי: [current_expression]
שגיאה: [error_message]

צור expression מתוקן עם:
1. NULL safety
2. Type conversion נכון
3. Fallback value
```

---

## ✅ Checklist לפני production

```
לפני הרצת production migration, וודא:

Agent 1 (Mapping Generator):
□ הרצת את הסוכן וקיבלת JSON תקין
□ בדקת שכל השדות מהטבלה החדשה ממופים
□ וידאת NULL handling לכל expression
□ FK mappings קיימים בdata/fk-mappings/
□ localization כולל 3 שפות (אם רלוונטי)

Agent 2 (Migration Executor):
□ הרצת test mode (10 rows) בהצלחה
□ הרצת dry-run בהצלחה
□ בדקת את הדוח ל-potential issues
□ שמרת backup של target DB
□ התראת לצוות שמיגרציה רצה

Production Run:
□ clearTarget = false (אם יש נתונים קיימים!)
□ יש מספיק disk space
□ יש זמן לתהליך (צפי: 5-10 דקות ל-10k שורות)
□ מישהו עוקב אחרי הלוגים
```

---

## 📝 טיפים לשימוש

1. **תמיד התחל מ-test** - 10 שורות מספיק לגלות רוב הבעיות
2. **השתמש ב-dry-run** - לפני production, תמיד
3. **שמור דוחות** - לצורך audit ו-debugging
4. **הרץ טבלאות בסדר** - parents לפני children
5. **בדוק FK mappings** - לפני שמריצים
6. **עקוב אחר error rate** - אם מעל 1%, עצור וחקור

---

**מוכנים להתחיל? פשוט העתק אחת מהדוגמאות לשיחה חדשה!** 🚀