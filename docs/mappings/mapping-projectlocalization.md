# ProjectLocalization Table Mapping

## מידע כללי

**טבלת מקור**: products (MSSQL)
**טבלת יעד**: projectLocalization (MySQL)
**CSV Lines**:
- Hebrew: 1882-1925 (Funds), 2097-2141 (Collections)
- English: 1926-1969 (Funds), 2058-2096 (Collections)
- French: 1968-2013 (Funds), 2142+ (Collections)

**התקדמות**: 6/11 שדות (55%)

## עקרון הטבלה

**Multi-language support**: כל project מייצר **3 שורות** ב-projectLocalization:
1. **LanguageId = 1** (עברית)
2. **LanguageId = 2** (אנגלית)
3. **LanguageId = 3** (צרפתית)

סה"כ: 1,750 projects × 3 = **5,250 שורות**.

## שדות קבועים לכל שפה

### ProjectId
**Type**: int (FK → project.Id)
**Mapping**: אוטומטי - מה-ID שנוצר ב-project migration
```javascript
// ב-server.js
const newProjectId = idMappings[oldProductId];
```

### LanguageId
**Type**: int (FK → lutlanguage.Id)
**Mapping**: אוטומטי
```javascript
const languages = [
  { id: 1, name: 'hebrew' },
  { id: 2, name: 'english' },
  { id: 3, name: 'french' }
];
```

---

## שדות שהושלמו (6/11)

### 1. Title
**CSV Lines**: 1887-1888 (Hebrew), 1926-1927 (English), 1968-1969 (French)

#### עברית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name",
  "expression": "value ? value.substring(0, 150) : null"
}
```

#### אנגלית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name_en",
  "expression": "(value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null))"
}
```

#### צרפתית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name_fr",
  "expression": "(value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null))"
}
```

**הסבר**:
- עברית: תמיד מ-`Name`
- אנגלית/צרפתית: מ-`Name_en`/`Name_fr`, אם NULL → fallback ל-`Name` (עברית)

**בעיה ידועה**: 6 שורות נכשלו כי `Name_en`/`Name_fr` היו NULL ו-fallback לא עבד כמצופה.

---

### 2. Description
**CSV Lines**: 1901 (Hebrew), 1940 (English), 1982 (French)

#### עברית:
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "ShortDescription"
}
```

#### אנגלית:
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "ShortDescription_en"
}
```

#### צרפתית:
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "ShortDescription_fr"
}
```

**הסבר**: תיאור קצר לפי שפה.

---

### 3. DisplayInSite
**CSV Lines**: ??? (לא מופיע במפורש ב-Mapping.csv)

#### עברית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Hide",
  "expression": "row.Hide ? 0 : 1"
}
```

#### אנגלית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Hide_en",
  "expression": "(!row.Hide_en && row.ShowMainPage) ? 1 : 0"
}
```

#### צרפתית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Hide_fr",
  "expression": "(!row.Hide_fr && row.ShowMainPage) ? 1 : 0"
}
```

**לוגיקה**:
- עברית: הפוך את `Hide` (אם Hide=true → DisplayInSite=0)
- אנגלית/צרפתית: הצג רק אם לא מוסתר **ו**גם ShowMainPage=true

---

### 4. RecruitmentTarget
**CSV Lines**: 1902 (Hebrew), 1941 (English), 1983 (French)

#### עברית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Price",
  "expression": "(value === 0 || value === null) ? null : value",
  "defaultValue": "0"
}
```

#### אנגלית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Price_en",
  "expression": "(value === 0 || value === null) ? null : value"
}
```

#### צרפתית:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Price_fr",
  "expression": "(value === 0 || value === null) ? null : value"
}
```

**לוגיקה**:
- אם Price = 0 או NULL → שמור NULL
- אחרת → שמור את הערך
- עבור עברית: אם התוצאה NULL, defaultValue="0" מיושם

**הערה**: ראה בעיה ידועה מס' 2 ב-MIGRATION_STATUS.md לגבי defaultValue.

---

### 5. HideDonationsInSite
**CSV Lines**: 1915 (Hebrew), 1954 (English), 1996 (French)

#### כל השפות:
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "HideDonationAmount"
}
```

**הסבר**: אותו ערך לכל השפות (לא תלוי בשפה).

---

### 6. OrderInProjectsPageView
**CSV Lines**: 1916 (Hebrew), 1955 (English), 1997 (French)

#### כל השפות:
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "Sort",
  "expression": "value <= 30 ? value : null"
}
```

**שים לב**: יש `expression` אבל `convertType: "direct"` - זה לא עקבי!
**צריך להיות**: `convertType: "expression"`

**לוגיקה**: רק אם Sort <= 30, אחרת NULL (סדר תצוגה רק עד 30 הראשונים).

---

## שדות שטרם יושמו (5/11)

### 7. Content
**Type**: nvarchar(MAX)
**Nullable**: Yes
**הערה**: תוכן מלא של הפרויקט (HTML?). לא ברור מהיכן לקחת.

---

### 8. MainMedia
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך Media table migration קודם.

---

### 9. ImageForListsView
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך Media table migration קודם.

---

### 10. LinkSettings
**Type**: int (FK → linkSetting.Id)
**Nullable**: Yes
**הערה**: צריך LinkSettings migration קודם.

---

### 11. OrderInNewsView
**Type**: int
**Nullable**: Yes
**הערה**: סדר תצוגה בעמוד חדשות. לא ברור מהיכן לקחת.

---

## דוגמה למיפוי מלא

```json
{
  "localizationMappings": {
    "Title": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name",
        "expression": "value ? value.substring(0, 150) : null"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name_en",
        "expression": "(value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null))"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name_fr",
        "expression": "(value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null))"
      }
    },
    "Description": {
      "hebrew": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "ShortDescription"
      },
      "english": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "ShortDescription_en"
      },
      "french": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "ShortDescription_fr"
      }
    },
    "DisplayInSite": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Hide",
        "expression": "row.Hide ? 0 : 1"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Hide_en",
        "expression": "(!row.Hide_en && row.ShowMainPage) ? 1 : 0"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Hide_fr",
        "expression": "(!row.Hide_fr && row.ShowMainPage) ? 1 : 0"
      }
    },
    "RecruitmentTarget": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Price",
        "expression": "(value === 0 || value === null) ? null : value",
        "defaultValue": "0"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Price_en",
        "expression": "(value === 0 || value === null) ? null : value"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Price_fr",
        "expression": "(value === 0 || value === null) ? null : value"
      }
    },
    "HideDonationsInSite": {
      "hebrew": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "HideDonationAmount"
      },
      "english": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "HideDonationAmount"
      },
      "french": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "HideDonationAmount"
      }
    },
    "OrderInProjectsPageView": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Sort",
        "expression": "value <= 30 ? value : null"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Sort",
        "expression": "value <= 30 ? value : null"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Sort",
        "expression": "value <= 30 ? value : null"
      }
    }
  }
}
```

## שאילתת SQL שנבנית

```sql
SELECT
  productsid,
  Name, Name_en, Name_fr,
  ShortDescription, ShortDescription_en, ShortDescription_fr,
  Hide, Hide_en, Hide_fr,
  ShowMainPage,
  Price, Price_en, Price_fr,
  HideDonationAmount,
  Sort
FROM products
```

ה-server.js בונה את השאילתה אוטומטית על סמך כל ה-oldColumn fields ב-localizationMappings.

## תוצאות מיגרציה אחרונה

**Date**: 2025-11-11 10:24
- **Rows expected**: 5,250 (1,750 × 3)
- **Rows migrated**: 5,244/5,250 (99.9% ⚠️)
- **Errors**: 6 (Title cannot be null)
- **Duration**: ~28 שניות

### שורות שנכשלו:
1. Project 335 (French): Name_fr is null
2. Project 373 (French): Name_fr is null
3. Project 1000 (English): Name_en is null
4. Project 1000 (French): Name_fr is null
5. Project 1399 (English): Name_en is null
6. Project 1399 (French): Name_fr is null

## בעיות ידועות

### 1. NULL Title Fallback
**בעיה**: Expression fallback לא עובד כשורה.
```javascript
"expression": "(value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null))"
```

**פתרון אפשרי**:
1. בדוק ש-`row.Name` באמת זמין בזמן evaluation
2. או: שנה את ה-defaultValue logic ב-server.js

### 2. convertType עקבי
**בעיה**: `OrderInProjectsPageView` מוגדר כ-`convertType: "direct"` אבל יש לו `expression`.

**פתרון**: שנה ל-`convertType: "expression"`.

### 3. DefaultValue אחרי Expression
**בעיה**: defaultValue לא תמיד מיושם אחרי expression שמחזיר null.

**מיקום**: server.js:684-689

**פתרון**: החל defaultValue **אחרי** expression evaluation.

## Foreign Keys

הטבלה מקושרת ל:
- **project** (ProjectId) - חייב לקיים קודם!
- **lutlanguage** (LanguageId)
- **media** (MainMedia, ImageForListsView)
- **linkSetting** (LinkSettings)

## צעדים הבאים

1. ✅ **DONE**: 6 basic fields (Title, Description, DisplayInSite, RecruitmentTarget, HideDonationsInSite, OrderInProjectsPageView)
2. ⏳ **TODO**: תיקון 6 השורות שנכשלו (NULL titles)
3. ⏳ **TODO**: Content (צריך לברר מקור)
4. ⏳ **TODO**: MainMedia (צריך Media migration)
5. ⏳ **TODO**: ImageForListsView (צריך Media migration)
6. ⏳ **TODO**: LinkSettings (צריך LinkSettings migration)
7. ⏳ **TODO**: OrderInNewsView (צריך לברר מקור)
