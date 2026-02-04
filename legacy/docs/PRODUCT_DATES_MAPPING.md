# מיפוי תאריכי יצירה לטבלת Products

## תיאור הבעיה

כאשר ממיגרים את טבלת Products לקרנות (Funds) ומגביות (Collections), כל ProjectType עובר בנפרד:
- **Step 1**: Funds (ProjectType=1)
- **Step 1.1**: Collections (ProjectType=2)

אם כל מיגרציה מחשבת את תאריך היצירה בזמן אמת, התאריכים לא יהיו עקביים עם ה-ProductId המקורי.

## הפתרון

**מיפוי מראש של ProductId → תאריך יצירה**, כך שכל ProductId תמיד מקבל את אותו תאריך בדיוק, ללא קשר למתי הוא עובר במיגרציה.

## כיצד זה עובד

### 1. יצירת המיפוי

```bash
node scripts/utils/create-product-dates-mapping.js
```

הסקריפט:
- שולף את כל ה-ProductIds מהטבלה (ממוינים לפי ProductId עולה)
- מתחיל מתאריך לפני 5 שנים
- כל ProductId הבא מקבל תאריך גדול ב-**2 ימים** מהקודם
- שומר את המיפוי ב-`data/fk-mappings/ProductCreatedDate.json`

### 2. מבנה הקובץ

```json
{
  "metadata": {
    "generatedAt": "2025-12-31T06:56:55.557Z",
    "totalProducts": 1954,
    "minProductId": 1,
    "maxProductId": 2092,
    "startDate": "2020-12-31T06:56:55.550Z",
    "endDate": "2031-09-11T06:56:55.550Z",
    "incrementDays": 2
  },
  "mapping": {
    "1": {
      "CreatedAt": "2020-12-31T06:56:55.550Z",
      "index": 0,
      "daysFromStart": 0
    },
    "2": {
      "CreatedAt": "2021-01-02T06:56:55.550Z",
      "index": 1,
      "daysFromStart": 2
    },
    ...
  }
}
```

### 3. שימוש במיפויים

המיפויים של Funds ו-Collections עודכנו להשתמש במיפוי:

**Before:**
```json
"CreatedAt": {
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "DateCreated",
  "expression": "value ? value : new Date(946684800000 + ((row.productsid || row.sourceId) * 1000))"
}
```

**After:**
```json
"CreatedAt": {
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "productsid",
  "useFkMapping": true,
  "mappingFile": "ProductCreatedDate.json"
}
```

### 4. עדכון ב-server.js

המנוע של המיגרציה עודכן לתמוך במיפויים מורכבים:
- תמיכה ב-`mappingFile` מותאם אישית
- תמיכה במבנה `{ "CreatedAt": "..." }` (לא רק ערך פשוט)
- המרה אוטומטית ל-Date object

## קבצים שנוצרו/שונו

### קבצים חדשים:
1. **scripts/utils/create-product-dates-mapping.js** - יוצר את המיפוי
2. **scripts/utils/product-date-helper.js** - פונקציות עזר
3. **scripts/checks/verify-product-dates.js** - בדיקת המיפוי
4. **scripts/checks/test-product-date-mapping.js** - בדיקת אינטגרציה
5. **data/fk-mappings/ProductCreatedDate.json** - המיפוי עצמו

### קבצים ששונו:
1. **mappings/ProjectMapping_Funds_Fixed.json** - עודכן להשתמש במיפוי
2. **mappings/ProjectMapping_Collections_Fixed.json** - עודכן להשתמש במיפוי
3. **src/server.js** - תמיכה במיפויים מורכבים

## סטטיסטיקות

- **סך הכל Products**: 1,954
- **טווח ProductId**: 1 → 2,092
- **תאריך ראשון**: 2020-12-31
- **תאריך אחרון**: 2031-09-11
- **סך הכל ימים**: 3,906 ימים (~10.7 שנים)
- **הפרש בין כל שניים**: 2 ימים בדיוק

## דוגמאות

| ProductId | תאריך יצירה | ימים מההתחלה |
|-----------|-------------|--------------|
| 1         | 2020-12-31  | 0            |
| 100       | 2021-06-15  | 166          |
| 500       | 2023-06-23  | 904          |
| 1000      | 2026-02-13  | 1,870        |
| 1957      | 2030-12-15  | 3,636        |
| 2000      | 2031-03-11  | 3,722        |

## בדיקות

```bash
# בדיקת המיפוי
node scripts/checks/verify-product-dates.js

# בדיקת אינטגרציה
node scripts/checks/test-product-date-mapping.js
```

## יתרונות

✅ **עקביות**: כל ProductId תמיד מקבל את אותו תאריך
✅ **פשטות**: לא צריך חישובים מורכבים בזמן המיגרציה
✅ **מהירות**: המיפוי נטען פעם אחת בתחילת המיגרציה
✅ **גמישות**: קל לשנות את הלוגיקה (למשל, 3 ימים במקום 2)
✅ **ניפוי באגים**: קל לבדוק בדיוק איזה תאריך ProductId מסוים קיבל

## עדכון המיפוי

אם צריך לעדכן את המיפוי (למשל, הוספו Products חדשים):

```bash
# צור מיפוי חדש
node scripts/utils/create-product-dates-mapping.js

# בדוק שהכל תקין
node scripts/checks/verify-product-dates.js

# הרץ מחדש את המיגרציה של Funds/Collections
```

## הערות

- מיגרציית **Donations** לא משתמשת במיפוי הזה, כי לה יש תאריך אמיתי (`Orders.DateCreated`)
- אם `Products.DateCreated` קיים בטבלה הישנה, ניתן להשתמש בו במקום המיפוי
- המיפוי שומר גם את `index` ו-`daysFromStart` לצרכי דיבוג
