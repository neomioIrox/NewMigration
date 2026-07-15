# DisplayInSite Hebrew Logic Fix - מדריך שימוש

## 🐛 תיאור הבעיה

**הבעיה שזוהתה:** ההסבה לעברית של השדה `DisplayInSite` בטבלה `projectLocalization` השתמשה בלוגיקה שונה מאנגלית וצרפתית.

### הלוגיקה הישנה (שגויה):
```javascript
// עברית - בודק רק Hide
"expression": "row.Hide ? 0 : 1"

// אנגלית/צרפתית - בודק גם Hide וגם ShowMainPage
"expression": "(!row.Hide_en && row.ShowMainPage) ? 1 : 0"
```

### התוצאה:
פרויקטים עם `Hide=0` אבל `ShowMainPage=0` סומנו בטעות כ-`DisplayInSite=1` בעברית.

**דוגמה:** ProductsId=248 → ProjectId=207
- במקור: `Hide=0`, `ShowMainPage=0`
- צפוי: `DisplayInSite=0` (לא להציג)
- בפועל: `DisplayInSite=1` בעברית ✗ (שגוי!)

---

## ✅ התיקון

עודכנו **4 קבצי מיפוי** עם הלוגיקה הנכונה:

```javascript
// כל השפות - לוגיקה אחידה
"expression": "(!row.Hide && row.ShowMainPage) ? 1 : 0"
```

**קבצים שתוקנו:**
1. `mappings/ProjectMapping_Funds_Fixed.json`
2. `mappings/ProjectMapping_Collections_Fixed.json`
3. `mappings/ProjectMapping_Collections_Type2.json`
4. `mappings/ProjectMapping.json`

---

## 🔧 איך להשתמש בתיקון מה-UI

### שלב 1: פתיחת ה-UI
```
http://localhost:3030
```

### שלב 2: טעינת המיפוי המעודכן

1. לחץ על הכפתור **"טען מיפוי"** בראש העמוד
2. בחר את קובץ המיפוי המתאים:
   - `ProjectMapping_Funds_Fixed` - למיגרציית קרנות (Funds)
   - `ProjectMapping_Collections_Fixed` - למיגרציית מגביות (Collections)
   - `ProjectMapping_Collections_Type2` - למגביות מסוג 2
   - `ProjectMapping` - למיפוי כללי
3. לחץ על הקובץ כדי לטעון אותו

### שלב 3: וידוא שהמיפוי נטען

לאחר הטעינה, תראה הודעה:
```
✓ המיפוי נטען בהצלחה
```

### שלב 4: הרצת המיגרציה

1. לחץ על **"הגדרות חיבור ומיגרציה"**
2. ודא שההגדרות נכונות
3. לחץ על **"בצע מיגרציה"**

---

## ⚠️ חשוב מאוד!

### אם כבר טענת מיפוי לפני התיקון:

**חובה לטעון את המיפוי מחדש מהקובץ!**

הסיבה: ה-UI שומר את המיפוי בזיכרון. אם טענת את המיפוי לפני שתיקנו את הקבצים, הוא עדיין מכיל את הלוגיקה הישנה.

### כדי לטעון מחדש:
1. **"טען מיפוי"** → בחר את הקובץ המעודכן
2. אשר החלפת המיפוי הנוכחי
3. המיפוי החדש (המתוקן) יטען מהדיסק

---

## 🧪 בדיקת התיקון

### בדיקה אוטומטית של קבצי המיפוי:
```bash
node scripts/checks/verify-displayinsite-fix.js
```

תוצאה צפויה:
```
✅ כל קבצי המיפוי תוקנו בהצלחה!
```

### בדיקת מקרה ספציפי (ProductId=248):
```bash
node scripts/checks/check-product-248.js
```

---

## 🔄 איך השרת עובד עם המיפוי

### זרימת העבודה:

1. **טעינת מיפוי מקובץ:**
   ```
   UI → GET /api/load-mapping/ProjectMapping_Funds_Fixed
       → Server קורא את הקובץ מהדיסק
       → Server מחזיר JSON למשתמש
       → UI שומר בזיכרון (localizationMappings)
   ```

2. **הרצת מיגרציה:**
   ```
   UI → POST /api/migrate
       Body: { localizationMappings: {...} }
       → Server מעריך ביטויים באמצעות eval()
       → Server מריץ INSERT לטבלת projectLocalization
   ```

### הערכת ביטויים:

השרת משתמש ב-`eval()` כדי להעריך את הביטוי:

```javascript
// src/server.js line ~698, ~2462
if (mapping.expression) {
  try {
    value = eval(mapping.expression);
  } catch (e) {
    // Keep original value
  }
}
```

**לדוגמה:**
```javascript
// הביטוי המתוקן:
expression: "(!row.Hide && row.ShowMainPage) ? 1 : 0"

// עבור row = {Hide: 0, ShowMainPage: 0}:
eval("(!row.Hide && row.ShowMainPage) ? 1 : 0")
// → (!0 && 0) ? 1 : 0
// → (true && false) ? 1 : 0
// → false ? 1 : 0
// → 0 ✓
```

---

## 📊 השפעת התיקון

### נתונים להסבה מחדש:

לפי ההגדרה הנוכחית:
- **Funds:** ~1,271 Products
- **Collections:** ~181 Products (מסוג 1) + מספר לא ידוע (מסוג 2)

כל פרויקט יוצר:
- 1 שורה ב-`project`
- 3 שורות ב-`projectLocalization` (עברית, אנגלית, צרפתית)

**הערכת ההשפעה:**
- ייתכן שמאות שורות ב-`projectLocalization` לעברית סומנו בטעות כ-`DisplayInSite=1`
- יש להריץ מחדש את המיגרציה כדי לתקן את הנתונים

---

## ✅ סיכום פעולות נדרשות

### אם עדיין לא הרצת מיגרציה:
1. ✅ התיקון כבר בקבצים
2. ✅ פשוט טען את המיפוי והרץ מיגרציה

### אם כבר הרצת מיגרציה:
1. ⚠️ נקה את הטבלאות (project, projectLocalization)
2. ✅ טען את המיפוי המתוקן מהקובץ
3. ✅ הרץ מיגרציה מחדש

---

## 🔗 קישורים נוספים

- [MIGRATION_STATUS.md](../MIGRATION_STATUS.md#8-displayinsite-hebrew-logic-missing-showmainpage-check---critical) - תיעוד הבעיה
- [check-product-248.js](../scripts/checks/check-product-248.js) - סקריפט בדיקה
- [verify-displayinsite-fix.js](../scripts/checks/verify-displayinsite-fix.js) - אימות התיקון

---

**תאריך תיקון:** 31 בדצמבר 2025
**גרסה:** 1.0
