# 📋 סיכום 3 סוגי Project במערכת קופת האיר

## מסמך זה מפרט את 3 סוגי ה-Project במיגרציה מ-SQL Server ל-MySQL

---

## 🔵 **Type 1: Funds (קרנות)**
**ProjectType = 1**

### תנאי WHERE:
```sql
Certificate = 0
AND NOT EXISTS (
  SELECT 1 FROM ProductGroup g
  WHERE g.ParentProductId = Products.ProductsId
  OR g.SubProductId = Products.ProductsId
)
```

### מאפיינים:
- **מקור:** טבלת Products (קרנות רגילות ללא תעודה)
- **מספר מגביות:** ~1,251 קרנות
- **ProjectItems:** כנראה 1-2 פריטים לכל קרן
- **דוגמה:** קרן חינוך, קרן עניים, קרן חסד וכו'
- **קובץ מיפוי:** `mappings/ProjectMapping_Funds_Fixed.json`

---

## 🟢 **Type 2: Campaign - Certificate Only (מגביות עם תעודה)**
**ProjectType = 2**

### תנאי WHERE:
```sql
Certificate = 1
AND NOT EXISTS (
  SELECT 1 FROM ProductGroup g
  WHERE g.ParentProductId = Products.ProductsId
  OR g.SubProductId = Products.ProductsId
)
```

### מאפיינים:
- **מקור:** טבלת Products (Products עם Certificate=1, אבל לא ב-ProductGroup)
- **מספר מגביות:** 26 מגביות
- **ProjectItems:** **תמיד 2 פריטים קבועים**
  1. **Certificate** (ItemType=2) - התעודה עצמה
  2. **Donation** (ItemType=4) - תרומה נוספת למגבית
- **קובץ מיפוי:** `mappings/ProjectMapping_Collections_Type2.json`
- **סקריפט מיגרציה:** משתמש ב-`/api/migrate` endpoint עם המיפוי
- **UI:** `public/campaign-type2-migration.html`
- **דוגמה:** מגבית עם תעודת הוקרה אחת + אפשרות לתרום נוסף

---

## 🟣 **Type 3: Campaign - ProductGroup (מגביות מורכבות)**
**ProjectType = 2** (גם Type 3 הוא ProjectType=2!)

### תנאי WHERE:
```sql
EXISTS (
  SELECT 1 FROM ProductGroup g
  WHERE g.ParentProductId = Products.ProductsId
)
```

### מאפיינים:
- **מקור:** טבלת ProductGroup (ParentProductId → Projects, SubProductId → Items)
- **מספר מגביות:** 194 מגביות
- **ProjectItems:** **משתנה - 1 עד 11 פריטים לכל מגבית**
  - **SubProducts מ-ProductGroup:**
    - אם `SubProduct.Certificate = 1` → **ItemType = 2** (Certificate)
    - אם `SubProduct.Certificate = 0` → **ItemType = 5** (FundDonation)
  - **+ 1 Donation אחד קבוע** (ItemType=4) - תרומה נוספת כללית למגבית
- **סקריפט מיגרציה:** `scripts/migration/migrate-campaign-type3.js`
- **UI:** `public/campaign-type3-migration.html`
- **דוגמה:** מגבית עם מספר סוגי תעודות שונות (זהב, כסף, ארד) או מספר מוצרים שונים

---

## ⚠️ **כלל זהב - חובה לשמור!**

### אי-חפיפה בין הסוגים:
```
Product יכול להיות רק באחד מהסוגים הבאים:
✅ Funds (Type 1)
✅ Campaign Type 2 (Certificate only)
✅ Campaign Type 3 (ProductGroup)

❌ Product לא יכול להיות ב-2 סוגים בו-זמנית!
```

### סדר עדיפויות (Priority Order):
```javascript
if (Product מופיע ב-ProductGroup) {
  → Type 3 (ProductGroup campaigns)
  // ProductGroup מנצח על הכל!
} else if (Product.Certificate === 1) {
  → Type 2 (Certificate-only campaigns)
} else {
  → Type 1 (Funds)
}
```

---

## 📊 סיכום מספרי:

| סוג | ProjectType | כמות Products | פריטים למגבית | WHERE קריטי |
|-----|-------------|---------------|----------------|-------------|
| **Funds** | 1 | ~1,251 | 1-2 | `Certificate=0 AND NOT IN ProductGroup` |
| **Type 2** | 2 | 26 | **תמיד 2** | `Certificate=1 AND NOT IN ProductGroup` |
| **Type 3** | 2 | 194 | **1-11 (משתנה)** | `IN ProductGroup` |
| **סה"כ** | - | **~1,471** | - | - |

---

## 🔍 איך לזהות לאיזה סוג Product שייך?

### שלב 1: בדיקת ProductGroup (עדיפות ראשונה)
```sql
SELECT COUNT(*)
FROM ProductGroup
WHERE ParentProductId = [ProductsId]
   OR SubProductId = [ProductsId]
```
- **אם נמצא** → Type 3 (ProductGroup)
- **אם לא נמצא** → עבור לשלב 2

### שלב 2: בדיקת Certificate
```sql
SELECT Certificate
FROM Products
WHERE ProductsId = [ProductsId]
```
- **אם Certificate = 1** → Type 2 (Certificate-only)
- **אם Certificate = 0** → Type 1 (Funds)

---

## 🛠️ טבלאות ותלויות:

### טבלאות שנוצרות לכל סוג:
1. **project** - הרשומה הראשית
2. **projectLocalization** - 3 שורות (עברית, אנגלית, צרפתית)
3. **projectItem** - מספר משתנה לפי הסוג
4. **projectItemLocalization** - 3 שורות לכל פריט
5. **linkSetting** - 2 שורות לכל פרויקט (Main + ListView)
6. **entityContent** - תוכן טקסט
7. **entityContentItem** - פריטי תוכן

### תלויות (FK):
- `TerminalId` → terminal.Id
- `CreatedBy` / `UpdatedBy` → -1 (System user)
- `RecordStatus` → 2 (Accepted)

---

## 📁 קבצים רלוונטיים:

### Funds (Type 1):
- **Mapping:** `mappings/ProjectMapping_Funds_Fixed.json`
- **Migration:** דרך `/api/migrate` endpoint
- **UI:** `public/index.html` (כפתור "מיגרציית קרנות")

### Campaign Type 2:
- **Mapping:** `mappings/ProjectMapping_Collections_Type2.json`
- **Migration:** דרך `/api/migrate` endpoint
- **UI:** `public/campaign-type2-migration.html`

### Campaign Type 3:
- **Script:** `scripts/migration/migrate-campaign-type3.js`
- **Migration:** דרך `/api/run-all-campaign-type3` endpoint
- **UI:** `public/campaign-type3-migration.html`
- **Analysis:** `scripts/checks/analyze-duplicate-products.js`
- **Cleanup:** `scripts/utils/delete-productgroup-duplicates.js`

---

## ⚙️ ProductsMapping.json - מיפוי אוטומטי

### מיקום הקובץ:
`data/fk-mappings/ProductsMapping.json`

### מטרה:
מיפוי אוטומטי של `Products.ProductsId` (ישן) → `project.Id + projectitem.Id[]` (חדש)

### מבנה:
```json
{
  "metadata": {
    "createdAt": "2025-11-30T...",
    "totalProducts": 1750,
    "mapped": 1397,
    "notMigrated": 353,
    "byProjectType": {
      "type1_Funds": 1251,
      "type2_Campaign": 144,
      "type3_Campaign_ProductGroup": 0
    },
    "productsWithMultipleItems": 213
  },
  "mapping": {
    "1": {
      "ProductsId": 1,
      "Name": "משפחת פרץ",
      "ProjectId": 1,
      "ProjectType": 2,
      "ProjectItemIds": [
        { "Id": 1, "ItemName": "תרומה למגבית", "ItemType": 4 }
      ],
      "Status": "MIGRATED",
      "Note": "1 items, ProjectType=2"
    }
  }
}
```

### שימוש במיגרציית Donation:
```javascript
const mapping = require('./data/fk-mappings/ProductsMapping.json');
const oldProjectId = order.ProjectId; // from Orders table
const productMapping = mapping.mapping[oldProjectId];
const newProjectId = productMapping.ProjectId;
const projectItems = productMapping.ProjectItemIds; // choose correct ItemId
```

### יצירה אוטומטית:
הקובץ נוצר **אוטומטית** אחרי כל מיגרציה דרך ה-UI.
- סקריפט: `scripts/checks/create-products-mapping.js`
- מופעל ב-5 endpoints: `/api/migrate`, `/api/run-all-recruiters`, `/api/run-all-affiliates-sources`, `/api/run-all-customerusers`, `/api/run-all-campaign-type3`

---

## 🚨 בעיות ידועות ופתרונות:

### בעיה: Products כפולים (187 products)
**תיאור:** 187 Products קיימים גם ב-Funds/Type2 וגם ב-ProductGroup (צריכים להיות רק Type 3)

**סיבה:** WHERE clauses במיפויים לא נאכפו כראוי במיגרציות הקודמות

**פתרון:**
1. הריצי: `node scripts/utils/delete-productgroup-duplicates.js` (אחרי הסרת `process.exit(0)`)
2. הריצי מחדש Type 3 migration
3. וודאי שכל 194 ה-Products נכנסו בהצלחה

**מניעה:**
- Smart Skip בודק כעת **כל** ProjectType (לא רק Type 2)
- אזהרה אם Product קיים עם ProjectType שגוי

---

## 📞 שאלות נפוצות:

**Q: למה Type 2 וגם Type 3 הם ProjectType=2?**
A: שניהם "מגביות" (Campaign), ההבדל הוא במורכבות - Type 2 פשוט (תעודה אחת), Type 3 מורכב (מספר פריטים).

**Q: מה קורה אם Product יש Certificate=1 וגם ב-ProductGroup?**
A: ProductGroup מנצח! Product יהיה רק Type 3.

**Q: איך יודעים כמה ProjectItems יהיו ל-Type 3?**
A: מספר ה-SubProducts ב-ProductGroup + 1 Donation קבוע.

**Q: למה ProductsMapping.json חשוב?**
A: הוא קריטי למיגרציית Donation - מאפשר למצוא את ה-ItemId הנכון לכל הזמנה מה-Orders table.

---

## 📅 תאריך עדכון:
נוצר: 30 נובמבר 2025

## 👤 מחבר:
נוצר על ידי Claude Code במהלך מיגרציית קופת האיר

---

**לשאלות או בעיות:** עיינו ב-`LESSONS_LEARNED.md` ו-`CONTINUE_PROMPT.md`
