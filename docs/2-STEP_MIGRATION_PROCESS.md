# תהליך מיגרציה בשני שלבים - Funds ו-Collections

## סקירה כללית

טבלת **Project** מכילה 2 סוגי פרויקטים שונים:
1. **Funds (קרנות)** - ProjectType=1
2. **Collections (מגביות)** - ProjectType=2

כל סוג צריך מיגרציה נפרדת עם פילטר שונה מטבלת Products.

---

## קבצי המיפוי

### 1. **ProjectMapping_Funds.json**
- מיועד ל-**ProjectType=1** (Funds)
- **פילטר המקור** (מוגדר אוטומטית ב-whereClause):
  ```sql
  ISNULL(Certificate,0) != 1
  AND NOT EXISTS (SELECT 1 FROM ProductGroup g WHERE g.ParentProductId=products.productsid)
  ```
  - Products שבהם `Certificate != 1` (או NULL)
  - **ואין** להם רשומה ב-ProductGroup כ-ParentProductId
- **ProjectItem**: יוצר **1 פריט** (ItemType=5, FundDonation) לכל project
- **שדות ייחודיים**:
  - ProjectType = 1
  - ItemType = 5

### 2. **ProjectMapping_Collections.json**
- מיועד ל-**ProjectType=2** (Collections)
- **פילטר המקור** (מוגדר אוטומטית ב-whereClause):
  ```sql
  Certificate = 1
  OR EXISTS (SELECT 1 FROM ProductGroup g WHERE g.ParentProductId=products.productsid)
  ```
  - Products שבהם `Certificate = 1` (מגביות)
  - **או** יש להם רשומה ב-ProductGroup כ-ParentProductId (קבוצות = מגביות)
- **ProjectItem**: יוצר **2 פריטים** לכל project:
  - Certificate (ItemType=2)
  - Donation (ItemType=4)
- **שדות ייחודיים**:
  - ProjectType = 2
  - ItemType = 2 + 4
  - DeliveryMethod = 1 (רק ל-Certificate)

---

## ⚙️ פילטור אוטומטי

**חדש!** מערכת המיגרציה כוללת כעת תמיכה בפילטור אוטומטי של שורות המקור:

- כל קובץ מיפוי יכול לכלול שדה `whereClause`
- הפילטר מוחל אוטומטית בזמן בניית שאילתת ה-SELECT
- אין צורך להוסיף את התנאים ידנית - הם מוגדרים בקובץ ה-JSON
- הלוגים יציגו את הפילטר שהוחל בפועל

**דוגמה מהקובץ ProjectMapping_Funds.json:**
```json
{
  "whereClause": "ISNULL(Certificate,0) != 1 AND NOT EXISTS (...)"
}
```

---

## תהליך המיגרציה

### שלב 1: מיגרציית Funds

1. **פתח את הדפדפן**: http://localhost:3030

2. **טען את קובץ המיפוי**:
   - לחץ "טען מיפוי"
   - בחר: `ProjectMapping_Funds.json`
   - ודא שהמיפוי נטען בהצלחה

3. **בדוק חיבורים**:
   - לחץ "הגדרות חיבור ומיגרציה"
   - בדוק חיבור MSSQL
   - בדוק חיבור MySQL

4. **הרץ מיגרציה**:
   - לחץ "בצע מיגרציה"
   - המתן עד סיום
   - בדוק logs ב-`migration-logs.log`

5. **אמת תוצאות**:
   ```sql
   SELECT COUNT(*) FROM project WHERE ProjectType = 1;
   SELECT COUNT(*) FROM projectlocalization WHERE ProjectId IN
       (SELECT Id FROM project WHERE ProjectType = 1);
   SELECT COUNT(*) FROM projectitem WHERE ProjectId IN
       (SELECT Id FROM project WHERE ProjectType = 1);
   ```

### שלב 2: מיגרציית Collections

1. **טען קובץ מיפוי חדש**:
   - לחץ "טען מיפוי"
   - בחר: `ProjectMapping_Collections.json`
   - ודא שהמיפוי נטען בהצלחה

2. **הרץ מיגרציה שנייה**:
   - לחץ "בצע מיגרציה"
   - המתן עד סיום
   - בדוק logs

3. **אמת תוצאות**:
   ```sql
   SELECT COUNT(*) FROM project WHERE ProjectType = 2;
   SELECT COUNT(*) FROM projectlocalization WHERE ProjectId IN
       (SELECT Id FROM project WHERE ProjectType = 2);
   SELECT COUNT(*) FROM projectitem WHERE ProjectId IN
       (SELECT Id FROM project WHERE ProjectType = 2);
   ```

---

## הבדלים עיקריים בין Funds ל-Collections

| תכונה | Funds | Collections |
|-------|-------|-------------|
| **ProjectType** | 1 | 2 |
| **פילטר Products** | Certificate != 1 | Certificate = 1 |
| **מספר ProjectItems** | 1 | 2 |
| **ItemType** | 5 (FundDonation) | 2 (Certificate) + 4 (Donation) |
| **PriceType** | 2 (Free) | 1 (Closed) + 2 (Free) |
| **HasEngravingName** | 0 | 1 (Certificate), 0 (Donation) |
| **DeliveryMethod** | - | 1 (רק Certificate) |

---

## בדיקות מומלצות

### לפני המיגרציה:
- [ ] גיבוי מלא של MySQL database
- [ ] ספירת שורות ב-Products: `SELECT COUNT(*) FROM products`
- [ ] זיהוי Funds: `SELECT COUNT(*) FROM products WHERE ISNULL(Certificate,0) != 1`
- [ ] זיהוי Collections: `SELECT COUNT(*) FROM products WHERE Certificate = 1`

### אחרי כל שלב:
- [ ] ספירת project לפי type
- [ ] ספירת projectLocalization (צריך להיות x3)
- [ ] ספירת projectItem
- [ ] בדיקת שגיאות ב-logs
- [ ] דגימת 5-10 רשומות ידנית

### בסיום:
- [ ] סה"כ Projects = Funds + Collections
- [ ] כל project יש לו 3 localization rows
- [ ] כל Funds project יש לו 1 projectItem
- [ ] כל Collections project יש לו 2 projectItems

---

## פתרון בעיות

### בעיה: "המיפוי נטען אבל לא נשמר"
**פתרון**: רענן את הדף ואז טען שוב את הקובץ

### בעיה: "שגיאות FK ב-ProjectItem"
**פתרון**: ודא ש-Project migration הושלמה בהצלחה לפני ProjectItem

### בעיה: "חלק מה-Products חסרים"
**פתרון**: בדוק את הפילטר - ייתכן ש-Products לא עומדים בתנאי הפילטר

---

## קבצים קשורים

- **קבצי מיפוי**:
  - `mappings/ProjectMapping_Funds.json`
  - `mappings/ProjectMapping_Collections.json`

- **תיעוד**:
  - `docs/mappings/mapping-project.md`
  - `docs/mappings/mapping-projectitem.md`
  - `MIGRATION_STATUS.md`

- **לוגים**:
  - `migration-logs.log`

---

**תאריך יצירה**: 2025-11-11
**גרסה**: 1.0
