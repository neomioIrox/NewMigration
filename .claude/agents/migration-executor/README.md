# Migration Executor Agent

## 🚀 מה זה עושה?

סוכן חכם שמבצע מיגרציה של נתונים מ-SQL Server ל-MySQL באמצעות קובצי JSON mapping שנוצרו על ידי ה-Mapping Generator Agent.

## 🎯 יכולות מרכזיות

- ✅ מבצע מיגרציה מלאה מ-MSSQL ל-MySQL
- ✅ תומך ב-3 מצבי הרצה (test, dry-run, production)
- ✅ מטפל ב-Localization (3 שפות אוטומטית)
- ✅ מנהל FK relationships ותרגום ערכים
- ✅ יוצר דוחות מפורטים
- ✅ תומך ב-rollback ו-retry
- ✅ מעקב progress בזמן אמת

## 🔧 איך להשתמש

### שימוש בסיסי

1. **הפעל את הסוכן:**
   ```
   /agent migration-executor
   ```

2. **תן לו הוראה:**
   ```
   Mapping: ProjectMapping_Funds_Fixed.json
   Mode: production
   Options: { clearTarget: false }
   ```

3. **עקוב אחרי התהליך:**
   - הסוכן יתחבר לשני ה-DBs
   - יבצע את המיגרציה
   - ידווח על התקדמות
   - ייצר דוח מפורט

### פרמטרים

| פרמטר | תיאור | ערכים |
|-------|-------|--------|
| Mapping | קובץ JSON mapping | `ProjectMapping_Funds_Fixed.json` |
| Mode | מצב הרצה | `test` / `dry-run` / `production` |
| Options | אפשרויות נוספות | Object |

### Options

```javascript
{
  clearTarget: true,     // נקה טבלת יעד לפני מיגרציה
  limit: 100,           // הגבל מספר שורות
  whereClause: "id < 1000", // סנן נתוני מקור
  skipValidation: false, // דלג על בדיקות
  parallel: true        // הרץ במקביל
}
```

## 📊 מצבי הרצה

### 🧪 test
```
Mode: test
```
- מעביר רק 10 שורות ראשונות
- מבצע rollback אוטומטי בסוף
- מפרט כל פעולה
- מושלם לבדיקת המיפוי

### 👁️ dry-run
```
Mode: dry-run
```
- קורא מה-source
- מבצע את כל החישובים
- **לא כותב** לטבלת יעד
- מדווח מה היה קורה

### 🚀 production
```
Mode: production
```
- מיגרציה מלאה
- ללא rollback אוטומטי
- ממוטב לביצועים
- מתעד את כל השגיאות

## 📈 סדר מיגרציה

הסוכן יודע להריץ בסדר הנכון:

```
1. Lookup Tables (קודם):
   └── lutprojecttype
   └── terminal
   └── user
   └── media

2. Main Tables:
   └── project
       └── projectlocalization (x3 languages)
       └── projectitem
           └── projectitemlocalization (x3)

3. Dependent Tables:
   └── lead
   └── recruiter
   └── payment
   └── order
```

## 🔍 דוגמאות

### דוגמה 1: Test Run
```
Mapping: ProjectMapping_Collections_Fixed.json
Mode: test
Options: {
  clearTarget: true,
  limit: 10
}
```

### דוגמה 2: Full Migration
```
Mapping: ProjectMapping_Funds_Fixed.json
Mode: production
Options: {
  clearTarget: false
}
```

### דוגמה 3: Dry Run with Filter
```
Mapping: ProjectItemLocalization_Mapping.json
Mode: dry-run
Options: {
  whereClause: "productsid BETWEEN 100 AND 200"
}
```

## 📊 דוח פלט

הסוכן מייצר דוח JSON מפורט:

```json
{
  "status": "success",
  "summary": {
    "duration": "2m 34s",
    "tablesProcessed": 3,
    "totalRows": 10500,
    "successfulInserts": 10485,
    "errors": 15,
    "errorRate": "0.14%"
  },
  "tables": {
    "project": {
      "total": 1750,
      "inserted": 1750,
      "errors": 0,
      "duration": "45s"
    },
    "projectlocalization": {
      "total": 5250,
      "inserted": 5235,
      "errors": 15,
      "duration": "1m 20s"
    }
  },
  "errors": [
    {
      "table": "projectlocalization",
      "row": 123,
      "error": "Data too long",
      "field": "Title",
      "value": "...",
      "suggestion": "Truncate or increase column"
    }
  ]
}
```

## ⚡ אופטימיזציות

הסוכן משתמש באסטרטגיות מתקדמות:

### Batch Processing
מעבד בקבוצות של 1000 שורות למניעת עומס זיכרון

### Parallel Execution
מריץ טבלאות בלתי תלויות במקביל

### Connection Pooling
משתמש ב-connection pools לביצועים מיטביים

### Retry Logic
מנסה שוב עם exponential backoff בכשלונות זמניים

## 🛡️ טיפול בשגיאות

### אסטרטגיות
1. **Connection errors** → retry עם המתנה
2. **Constraint violations** → דלג ותעד
3. **Data type errors** → המרה אוטומטית
4. **NULL violations** → השתמש ב-defaultValue
5. **Duplicate keys** → דלג או עדכן

### מגבלות
- מקסימום 3 ניסיונות חוזרים לכל שורה
- עצירה אוטומטית אחרי 100 שגיאות
- שמירת checkpoint כל 1000 שורות

## 🔄 Rollback

במקרה של בעיה:
```
Operation: rollback
Table: project
FromTimestamp: "2025-11-12T10:00:00Z"
```

הסוכן ימחק את כל הרשומות שנוצרו אחרי ה-timestamp.

## 📁 קבצי Output

```
reports/
├── migration_[timestamp].json    # דוח מלא
├── errors_[timestamp].log       # רשימת שגיאות
└── checkpoint_[table].json      # נקודות שמירה
```

## ⚠️ אזהרות חשובות

1. **clearTarget** - השתמש רק ב-test environment!
2. **production mode** - אין rollback אוטומטי
3. **FK constraints** - וודא שהורים קיימים לפני ילדים
4. **Disk space** - בדוק שיש מספיק מקום ללוגים

## 💡 טיפים

1. **תמיד הרץ test קודם** - בדוק על 10 שורות
2. **השתמש ב-dry-run** - לפני production
3. **עקוב אחר הלוגים** - במיוחד error rate
4. **שמור דוחות** - לצורך audit
5. **בדוק FK mappings** - לפני הרצה

## 🔗 קבצים קשורים

- `mappings/*.json` - קובצי מיפוי
- `src/server.js` - לוגיקת מיגרציה
- `data/fk-mappings/*.json` - תרגום FK
- `.claude/agents/mapping-generator/` - הסוכן שיוצר mappings

## 🐛 פתרון בעיות

### "Connection refused"
- בדוק שה-DBs רצים
- וודא credentials נכונים
- בדוק firewall

### "Column cannot be NULL"
- בדוק defaultValue במיפוי
- הוסף fallback expression

### "FK constraint fails"
- הרץ parent tables קודם
- בדוק FK mappings

### "Out of memory"
- הקטן batch size
- הגדל Node memory: `--max-old-space-size=4096`

---

📧 **צריך עזרה?** בדוק את strategies.md או prompt.md לפרטים נוספים