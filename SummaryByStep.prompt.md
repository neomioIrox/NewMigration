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

### 4. linksetting (כפתורי קישור)

לכל project נוצרים **3 סוגי LinkSetting** לכל שפה (עד 9 רשומות):

| סוג כפתור | LinkType | LinkTargetType | ItemId | שימוש |
|-----------|----------|----------------|--------|-------|
| mainButton | 1 (Button) | 3 (ToExecutionPage) | מוגדר (FK לפריט) | כפתור תרומה ראשי |
| footerButton | 1 (Button) | 3 (ToExecutionPage) | מוגדר (FK לפריט) | כפתור תרומה בתחתית |
| listViewButton | 3 (ListItem) | 1 (ToProjectPage) | NULL | כפתור בתצוגת רשימה |

**חיבורים חזרה (POST-INSERT UPDATEs):**

| טבלת יעד | עמודה | מקור |
|----------|-------|------|
| projectlocalization | MainLinkButtonSettingId | mainButton LinkSetting ID |
| projectlocalization | LinkSettingIdInListView | listViewButton LinkSetting ID |
| projectitemlocalization | MainButtonLinkSettingId | mainButton LinkSetting ID |
| projectitemlocalization | ProjectFooterLinkSettingId | footerButton LinkSetting ID |

**LinkText דינמי:**
- mainButton/footerButton: טקסט קבוע מתוך ה-JSON (למשל "לתרומה", "Donate")
- listViewButton: **שם הפרויקט המתורגם** מתוך עמודת המקור (`Name`, `Name_en`, `Name_fr`)
  - נתמך ע"י `LinkTextColumn` במיפוי (במקום `LinkText` סטטי)

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

### בעיה 6: listViewButton LinkSetting - LinkType שגוי וטקסט גנרי

**תסמין:** השוואה מול פרויקט ייחוס (ID 4) חשפה שני באגים ב-LinkSetting

**אבחון:** סקריפט `scripts/checks/dump-linksetting-reference.js` השווה בין:
- **פרויקט 4** (ייחוס, נוצר ידנית) - 11 LinkSettings
- **פרויקט 26** (מיגרציה) - 6 LinkSettings

**באג 1: LinkType שגוי**
```
ייחוס: LinkSettingIdInListView → LinkType=3 (ListItem), TargetType=1
מיגרציה: LinkSettingIdInListView → LinkType=1 (Button), TargetType=1  ← שגוי!
```

**באג 2: LinkText גנרי במקום שם הפרויקט**
```
ייחוס: LinkText = "קרן משפחת כהן" (שם הפרויקט)
מיגרציה: LinkText = "לתרומה" (טקסט קבוע גנרי)  ← שגוי!
```

**פתרון:**

1. שינוי LinkType ב-3 קבצי מיפוי (Funds, Collections, Type2):
```json
// לפני (שגוי)
"listViewButton": { "LinkType": 1, "LinkText": "לתרומה" }

// אחרי (תקין)
"listViewButton": { "LinkType": 3, "LinkTextColumn": "Name" }
```

2. תמיכה ב-`LinkTextColumn` במנוע המיגרציה:

**קובץ:** `server/src/engine/migration-engine.js` (שורה 337)
```javascript
// לפני: טקסט סטטי בלבד
LinkText: langDef.LinkText

// אחרי: תמיכה בטקסט דינמי מעמודת המקור
var linkText = langDef.LinkTextColumn ? row[langDef.LinkTextColumn] : langDef.LinkText;
if(linkText && linkText.length > 200) linkText = linkText.substring(0, 200);
```

**ממצאים נוספים מהאבחון (לא תוקנו, לא קריטי):**
- `LinkSettingIdInButtonListView` - NULL גם בייחוס וגם במיגרציה (תקין)
- ProjectItemLocalization: בייחוס כל ה-FK-ים NULL, במיגרציה מוגדרים (הבדל מקובל)
- עמודות אופציונליות (`Description`, `MediaId`, `DonationPagePaymentType`) - מוגדרות בייחוס, NULL במיגרציה

---

### בעיה 7: Recruiter - Duplicate entry for unique key

**שגיאה:**
```
Error: Duplicate entry 'XXX-שם מגייס' for key 'recruiter.UK_Recruiter_Name_ProjectId'
```

**סיבה:** אילוץ ייחודי על שילוב (Name + ProjectId) בטבלת היעד, אבל בנתוני המקור יש כפילויות

**27 שגיאות - דוגמאות:**
| sourceId | שם המגייס | ProjectId |
|----------|-----------|-----------|
| 2, 7, 8, 9 | ללא שם | 2015, 2006 |
| 389 | יהודית כהנא | 530 |
| 1006, 1349 | שמות שונים | 640 |

**סטטוס:** 6,110 מתוך 6,137 הועברו (99.6%) - השגיאות הן כפילויות לגיטימיות בנתוני המקור

**פתרונות אפשריים:**
1. הסרת האילוץ (אם כפילויות לגיטימיות)
2. מיזוג רשומות במקור
3. הוספת מזהה ייחודי לאילוץ
4. דילוג על כפילויות (המצב הנוכחי)

---

## תוצאות ההרצה

### הרצה ראשונה (2026-02-04)
```
Step 1: LutFundCategoryMapping
Status: completed
Results: 5/5 inserted, 0 errors

Step 2: ProjectMapping_Funds_Fixed
Status: completed
Results: 1,271/1,271 inserted, 1 error (sourceId 1104 - ItemDefinition too long)

Step 3: ProjectMapping_Collections_Fixed
Status: completed
Results: 683/683 inserted, 0 errors

Step 4: ProjectMapping_Collections_Type2
Status: completed
Results: 26/26 inserted, 0 errors

Step 5: PrayerMapping
Status: completed
Results: 294/294 inserted, 0 errors
```
**סה"כ:** 2,280 שורות הועברו בהצלחה, שגיאה אחת בלבד

### הרצה שנייה (2026-02-08)
```
Step 6: RecruitersGroupMapping
Status: completed
Results: 235/235 inserted, 0 errors

Step 7: RecruiterMapping
Status: completed with errors
Results: 6,110/6,137 inserted, 27 errors (duplicate key violations)
```
**סה"כ:** 6,345 שורות, 27 שגיאות כפילות

---

## קבצים רלוונטיים

| קובץ | תיאור |
|------|-------|
| `server/mappings/AffiliateMapping.json` | מיפוי מקורות אב (ParentSources → affiliate) |
| `server/mappings/SourceMapping.json` | מיפוי מקורות (UserSources → source) |
| `server/mappings/ProjectMapping_Funds_Fixed.json` | מיפוי קרנות |
| `server/mappings/ProjectMapping_Collections_Fixed.json` | מיפוי אוספים |
| `server/mappings/ProjectMapping_Collections_Type2.json` | מיפוי אוספים Type2 |
| `server/mappings/RecruitersGroupMapping.json` | מיפוי קבוצות מגייסים |
| `server/mappings/RecruiterMapping.json` | מיפוי מגייסים |
| `server/src/engine/migration-engine.js` | מנוע המיגרציה (כולל LinkSetting) |
| `server/src/engine/row-processor.js` | עיבוד שורות |
| `server/src/engine/batch-runner.js` | הכנסה ל-DB |
| `server/src/services/tracker.js` | מעקב התקדמות |
| `server/data/fk-mappings/ProductCreatedDate.json` | מיפוי תאריכים |
| `server/data/fk-mappings/TerminalId.json` | מיפוי טרמינלים |
| `scripts/checks/dump-linksetting-reference.js` | אבחון LinkSetting - השוואה מול פרויקט ייחוס |
| `scripts/checks/check-linksetting-for-projects.js` | בדיקת LinkSetting כוללת |

---

## סדר הרצה כולל

```
Step 0:  AffiliateMapping                ← מקורות אב              [ ] טרם הורץ (חדש)
Step 0.1: SourceMapping                  ← מקורות                 [ ] טרם הורץ (חדש)
Step 1:  LutFundCategoryMapping          ← Lookup tables           [v] 5/5
Step 2:  ProjectMapping_Funds_Fixed      ← קרנות                   [v] 1,271/1,271
Step 3:  ProjectMapping_Collections_Fixed ← אוספים                 [v] 683/683
Step 4:  ProjectMapping_Collections_Type2 ← אוספים Type2           [v] 26/26
Step 5:  PrayerMapping                    ← תפילות                 [v] 294/294
Step 6:  RecruitersGroupMapping           ← קבוצות מגייסים         [v] 235/235
Step 7:  RecruiterMapping                 ← מגייסים                [v] 6,110/6,137 (27 כפילויות)
Step 8:  RecruiterLocalizationMapping     ← תרגומי מגייסים         [ ] טרם הורץ
Step 9:  GalleryMapping_Images/Videos     ← מדיה                   [ ] טרם הורץ
Step 10: FundCategoryMapping              ← קטגוריות קרנות         [ ] טרם הורץ
```
