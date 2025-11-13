# Mapping Generator Agent

## 🎯 מה זה עושה?

סוכן חכם שקורא את קובץ ה-CSV (Mapping.csv) ומייצר קובצי JSON mapping עבור כל טבלה במיגרציה.

## 🚀 איך להשתמש

### שימוש בסיסי

1. **הפעל את הסוכן:**
   ```
   /agent mapping-generator
   ```

2. **תן לו הוראה:**
   ```
   Table: projectitemlocalization
   Steps: 3.1-3.2
   Format: ui
   ```

3. **קבל תוצאה:**
   - הסוכן יקרא את ה-CSV
   - יזהה את כל השדות הרלוונטיים
   - ייצר קובץ JSON מוכן לשימוש

### פרמטרים

| פרמטר | תיאור | דוגמה |
|-------|-------|-------|
| Table | שם הטבלה למיפוי | `projectitemlocalization` |
| Steps | טווח צעדים מה-CSV | `3.1-3.2` או `1` או `1-1.1` |
| Format | פורמט פלט | `ui` (default) או `cli` |

## 📊 טבלאות נתמכות

- ✅ project (Steps 1-1.1)
- ✅ projectlocalization (Step 2)
- ✅ projectitem (Step 3)
- ✅ projectitemlocalization (Steps 3.1-3.2)
- 🔄 lead (Step 4)
- 🔄 recruiter (Step 4.1)
- 🔄 payment (Step 5)
- 🔄 order (Step 6)
- 🔄 media (Step 7)

## 🛠️ יכולות מיוחדות

### 1. זיהוי אוטומטי של Localization
הסוכן מזהה אוטומטית טבלאות עם תמיכה בשפות:
- Hebrew (ללא suffix)
- English (_en)
- French (_fr)

### 2. טיפול ב-ProjectItem
מבין את ההבדל בין:
- Funds (ProjectType=1) - פריט אחד
- Collections (ProjectType=2) - שני פריטים

### 3. ניהול Expressions
ממיר הערות ל-JavaScript expressions:
- `substring(0;150)` → `value.substring(0, 150)`
- `Hide=0` → `row.Hide ? 0 : 1`

### 4. FK Mappings
מזהה ומטפל ב-Foreign Keys עם תרגום ערכים

## 📝 דוגמאות

### דוגמה 1: טבלה פשוטה
```
Table: lead
Steps: 4
Format: ui
```

### דוגמה 2: טבלה עם Localization
```
Table: projectlocalization
Steps: 2
Format: ui
```

### דוגמה 3: Project עם סוגים
```
Table: project
Steps: 1-1.1
Format: cli
```

## ⚠️ נקודות חשובות

1. **עמודת Comments (K)** - מכילה מידע קריטי!
2. **NULL Safety** - הסוכן מוסיף fallbacks אוטומטית
3. **ערכי ברירת מחדל** - מוסיף GETDATE(), -1 לשדות מערכת
4. **בדיקת תקינות** - מוודא JSON תקין

## 🐛 פתרון בעיות

### הסוכן לא מוצא את הטבלה
- בדוק שהשם נכון (case sensitive)
- וודא שה-Step range מדויק

### חסרים שדות במיפוי
- בדוק את ה-CSV לשורות נוספות
- ייתכן שיש שדות ב-Step אחר

### Expressions לא עובדים
- בדוק syntax של JavaScript
- וודא NULL handling

## 📁 קבצי Output

הסוכן ייצר קבצים ב:
```
mappings/[TableName]_Mapping.json
```

## 🔗 קבצים קשורים

- `data/Mapping.csv` - קובץ המקור
- `database/schemas/*.sql` - סכמות DB
- `mappings/*.json` - קבצי output

## 💡 טיפים

1. **תמיד בדוק את ה-output** - הסוכן עושה best effort
2. **שמור גיבויים** - לפני override של קבצים קיימים
3. **בדוק NULL handling** - במיוחד בשדות חובה
4. **הרץ validation** - אחרי יצירת המיפוי

---

📧 **צריך עזרה?** פנה למפתח או בדוק את הדוקומנטציה ב-`docs/`