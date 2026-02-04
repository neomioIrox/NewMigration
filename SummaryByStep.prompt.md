# Step 1: מיגרציית קרנות (Funds)

## סקירה כללית

מערכת המיגרציה מעבירה נתונים מ-**MSSQL** (קופת העיר - מערכת ישנה) ל-**MySQL** (מערכת חדשה).

### ארכיטקטורה
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MSSQL Source   │────▶│  Migration       │────▶│  MySQL Target   │
│  (Kupat1 DB)    │     │  Engine          │     │  (KupatHair DB) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                        ┌──────┴──────┐
                        │  Mapping    │
                        │  JSON Files │
                        └─────────────┘
```

### רכיבי המערכת
- **Server** (Node.js + Express) - פורט 3001
- **Client** (React + Vite) - פורט 5173
- **WebSocket** - עדכוני התקדמות בזמן אמת
- **Tracker DB** (MySQL) - מעקב אחר הרצות ומיפויי ID

---

## מיפוי קרנות (Funds)

**קובץ:** `server/mappings/ProjectMapping_Funds_Fixed.json`

```
Source: products (MSSQL)  →  Target: project (MySQL)
סה"כ שורות: 1,271
```

### תנאי סינון (whereClause)
```sql
IsNull([Certificate],0)=0 AND IsNull([Donation],0)=0
AND productsid NOT IN (SELECT ProductsId FROM news)
```

**משמעות:**
- `Certificate = 0` - לא תעודה
- `Donation = 0` - לא תרומה
- `NOT IN news` - לא מופיע בטבלת news
- **התוצאה = קרנות בלבד**

---

## מיפוי העמודות

### טבלה ראשית: project

| עמודת מקור (products) | עמודת יעד (project) | סוג המרה | הערות |
|----------------------|---------------------|----------|-------|
| Name | Name | expression | חיתוך ל-150 תווים |
| productsid | KupatFundNo | direct | מזהה מקורי |
| - | ProjectType | const = 1 | 1 = Fund |
| - | RecordStatus | const = 2 | פעיל |
| productsid | CreatedAt | FK mapping | תאריך לפי מיפוי חיצוני |
| productsid | StatusChangedAt | FK mapping | תאריך לפי מיפוי חיצוני |
| TerminalId | TerminalId | FK mapping | מיפוי טרמינלים |
| - | DisplayAsSelfView | const = 0 | |
| - | StatusChangedBy | const = -1 | מערכת |
| - | CreatedBy | const = -1 | מערכת |
| - | UpdatedBy | const = -1 | מערכת |

### מיפוי תאריכים מיוחד
```json
{
  "CreatedAt": {
    "convertType": "direct",
    "oldColumn": "productsid",
    "useFkMapping": true,
    "mappingFile": "ProductCreatedDate.json",
    "defaultValue": "GETDATE()",
    "comment": "כל ProductId ממופה לתאריך ייחודי"
  }
}
```

---

## טבלאות נלוות

### 1. projectlocalization (תרגומים)

לכל project נוצרות **3 שורות** - עברית, אנגלית, צרפתית:

| שדה יעד | מקור עברית | מקור אנגלית | מקור צרפתית |
|---------|------------|-------------|-------------|
| Title | Name | Name_en | Name_fr |
| Description | ShortDescription | ShortDescription_en | ShortDescription_fr |
| RecruitmentTarget | DefaultDonationsSum | DefaultDonationsSum_en | DefaultDonationsSum_fr |
| DisplayInSite | !Hide && ShowMainPage | !Hide_en && ShowMainPage | !Hide_fr && ShowMainPage |
| LanguageId | 1 | 2 | 3 |

### 2. projectitem (פריטים)

לכל fund נוצר projectitem:

| שדה | ערך | הסבר |
|-----|-----|------|
| ItemType | 1 | סוג fund |
| ItemName | מ-Name | שם הפריט |
| PriceType | 2 | מחיר משתנה |
| HasEngravingName | 1 | מאפשר שם חריטה |
| ProjectId | FK | קשר לפרויקט שנוצר |

### 3. projectitemlocalization

לכל projectitem נוצרות 3 שורות תרגום:

| שדה | ערך |
|-----|-----|
| Title | שם הפריט בשפה |
| PaymentSum | סכום ברירת מחדל |
| DisplayInSite | 1 |
| ProjectItemId | FK לפריט |
| LanguageId | 1/2/3 |

---

## בעיות ופתרונות

### בעיה 1: מילה שמורה `Order` ב-MySQL

**שגיאה:**
```
Error: You have an error in your SQL syntax near 'Order'
```

**סיבה:** העמודה `Order` היא מילה שמורה ב-MySQL

**פתרון:** עטיפת כל שמות העמודות ב-backticks

**קובץ:** `server/src/engine/batch-runner.js`
```javascript
// לפני (שגוי)
var sql = "INSERT INTO " + tableName + " (" + cols.join(",") + ")..."

// אחרי (תקין)
var sql = "INSERT INTO `" + tableName + "` (" +
  cols.map(function(c){ return "`" + c + "`" }).join(",") +
  ") VALUES (" + placeholders + ")";
```

---

### בעיה 2: BIT(1) מקבל string במקום number

**שגיאה:**
```
Error: Incorrect integer value: '1' for column 'DisplayInSite'
```

**סיבה:** ב-JSON הערך `"1"` הוא string, אבל MySQL BIT(1) צריך number

**פתרון:** המרה אוטומטית של string מספרי ל-number

**קובץ:** `server/src/engine/row-processor.js`
```javascript
if(convertType === "const") {
  value = colDef.value;
  if(value === "GETDATE()") {
    value = processGetDate();
  }
  // תיקון: המרת string מספרי ל-number
  else if(typeof value === "string" && value.trim() !== "" && !isNaN(value)) {
    value = Number(value);
  }
  return value;
}
```

---

### בעיה 3: `undefined` ב-SQL parameters

**שגיאה:**
```
Error: Column 'X' cannot be null (received undefined)
```

**סיבה:** ערכים חסרים מוחזרים כ-`undefined` במקום `null`

**פתרון:** המרת `undefined` ל-`null` לפני שליחה ל-DB

**קובץ:** `server/src/engine/batch-runner.js`
```javascript
var vals = cols.map(function(c) {
  var v = data[c];
  return v === undefined ? null : v;  // תיקון
});
```

---

### בעיה 4: Infinite Loop בפגינציה (קריטי!)

**תסמין:**
```
processed_rows: 10,285 (כאשר יש רק 1,271 שורות מקור!)
```

**סיבה:** ה-whereClause מכיל `OR` והפגינציה מוסיפה `AND`:

```sql
-- השאילתה שנבנתה (שגויה):
SELECT TOP 500 * FROM products
WHERE a=1 OR b=1 OR c IN (...) AND productsid > 500

-- MySQL מפרש כ (AND קודם ל-OR):
WHERE a=1 OR b=1 OR (c IN (...) AND productsid > 500)

-- התוצאה: a=1 OR b=1 תמיד מחזיר את אותן שורות = לולאה אינסופית!
```

**פתרון:** עטיפת whereClause בסוגריים

**קובץ:** `server/src/engine/migration-engine.js` (שורה 66)
```javascript
// לפני (שגוי)
var whereClause = m.whereClause ? " WHERE " + m.whereClause : "";

// אחרי (תקין)
var whereClause = m.whereClause ? " WHERE (" + m.whereClause + ")" : "";

// עכשיו השאילתה:
// WHERE (a=1 OR b=1 OR c IN (...)) AND productsid > 500
```

---

### בעיה 5: Data too long for ItemDefinition

**שגיאה:**
```
Error: Data too long for column 'ItemDefinition' at row 1
sourceId: 1104
```

**סטטוס:** שגיאה בודדת - לא חסמה את המיגרציה

**פתרון אפשרי:** הוספת חיתוך לעמודה או הגדלת העמודה ב-DB

---

## תוצאות ההרצה

```
Migration: ProjectMapping_Funds_Fixed
Status: completed

Results:
- Total source rows: 1,271
- Processed: 1,271
- Inserted: 1,271
- Skipped: 0
- Errors: 1 (sourceId 1104 - ItemDefinition too long)
```

---

## קבצים רלוונטיים

| קובץ | תיאור |
|------|-------|
| `server/mappings/ProjectMapping_Funds_Fixed.json` | קובץ המיפוי |
| `server/src/engine/migration-engine.js` | מנוע המיגרציה |
| `server/src/engine/row-processor.js` | עיבוד שורות |
| `server/src/engine/batch-runner.js` | הכנסה ל-DB |
| `server/src/services/tracker.js` | מעקב התקדמות |
| `server/data/fk-mappings/ProductCreatedDate.json` | מיפוי תאריכים |
| `server/data/fk-mappings/TerminalId.json` | מיפוי טרמינלים |

---

## סדר הרצה כולל (לידיעה)

```
Step 1: LutFundCategoryMapping          ← Lookup tables
Step 2: ProjectMapping_Funds_Fixed      ← קרנות (זה המסמך הנוכחי)
Step 3: ProjectMapping_Collections_Fixed ← אוספים
Step 4: ProjectMapping_Collections_Type2 ← אוספים Type2
Step 5: PrayerMapping                    ← תפילות
Step 6: RecruitersGroupMapping           ← קבוצות מגייסים
Step 7: RecruiterMapping                 ← מגייסים
Step 8: RecruiterLocalizationMapping     ← תרגומי מגייסים
Step 9: GalleryMapping_Images/Videos     ← מדיה
```
