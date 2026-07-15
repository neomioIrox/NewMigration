# Project Table Mapping

## מידע כללי

**טבלת מקור**: products (MSSQL)
**טבלת יעד**: project (MySQL)
**CSV Lines**: 145-254 (Funds), 383-534 (Collections)
**התקדמות**: 12/16 שדות (75%)

## הבדל בין Funds ל-Collections

שתי הקטגוריות נוצרות מאותה טבלת products, אבל עם `ProjectType` שונה:
- **Funds** (Step 1): `ProjectType = 1`
- **Collections** (Step 1.1): `ProjectType = 2`

כל שאר השדות זהים לחלוטין.

## מבנה הטבלה

### שדות שהושלמו (12/16)

#### 1. Name
**CSV Line**: 149 (Funds), 387 (Collections)
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name",
  "expression": "value ? value.substring(0, 150) : null"
}
```
**הסבר**: חותך ל-150 תווים כי הטבלה החדשה מוגבלת ל-varchar(150).

---

#### 2. ProjectType
**CSV Line**: 151 (Funds), 389 (Collections)
```json
{
  "convertType": "const",
  "value": "2"  // או "1" עבור Funds
}
```
**ערכים אפשריים**:
- 1 = Fund (קופה)
- 2 = Collection (גביה)

**שים לב**: הערך הקבוע ב-ProjectMapping.json הוא "2" (Collections). עבור Funds צריך mapping נפרד.

---

#### 3. KupatFundNo
**CSV Line**: 153 (Funds), 391 (Collections)
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "ProjectNumber"
}
```
**הסבר**: מספר הפרויקט מהמערכת הישנה.

---

#### 4. DisplayAsSelfView
**CSV Line**: 158 (Funds), 396 (Collections)
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "WithoutKupatView"
}
```
**הסבר**: האם להציג בתצוגה עצמאית.

---

#### 5. TerminalId (עם FK Mapping)
**CSV Line**: 161 (Funds), 399 (Collections)
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "Terminal",
  "defaultValue": "1",
  "useFkMapping": true
}
```

**קובץ FK Mapping**: `fk-mappings/TerminalId.json`
```json
{
  "1": "1",
  "4": "2"
}
```

**הסבר**:
- Terminal ישן 1 → Terminal חדש 1
- Terminal ישן 4 → Terminal חדש 2
- כל ערך אחר → defaultValue (1)

---

#### 6. RecordStatus
**CSV Line**: 165-166 (Funds), 403-404 (Collections)
```json
{
  "convertType": "const",
  "value": "2"
}
```
**ערכים אפשריים**:
- 1 = Draft
- 2 = Active ✅
- 3 = Archived

---

#### 7. StatusChangedAt
**CSV Line**: 167-168 (Funds), 405-406 (Collections)
```json
{
  "convertType": "const",
  "value": "GETDATE()"
}
```
**שים לב**: `GETDATE()` מוחלף ב-server.js ל-JavaScript Date.

---

#### 8. StatusChangedBy
**CSV Line**: 169-170 (Funds), 407-408 (Collections)
```json
{
  "convertType": "const",
  "value": "-1"
}
```
**הסבר**: -1 = System user (מיגרציה אוטומטית).

---

#### 9. CreatedAt
**CSV Line**: 173-174 (Funds), 411-412 (Collections)
```json
{
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "DateCreated",
  "defaultValue": "GETDATE()"
}
```
**הסבר**: לוקח תאריך יצירה מהמערכת הישנה, אם לא קיים - שם תאריך נוכחי.

---

#### 10. CreatedBy
**CSV Line**: 175-176 (Funds), 413-414 (Collections)
```json
{
  "convertType": "const",
  "value": "-1"
}
```

---

#### 11. UpdatedAt
**CSV Line**: 177-178 (Funds), 415-416 (Collections)
```json
{
  "convertType": "const",
  "value": "GETDATE()"
}
```

---

#### 12. UpdatedBy
**CSV Line**: 179-180 (Funds), 417-418 (Collections)
```json
{
  "convertType": "const",
  "value": "-1"
}
```

---

### שדות שטרם יושמו (4/16)

#### 13. MainMedia
**CSV Line**: ??? (לא מופיע ב-mapping הנוכחי)
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך לקשר לטבלת media אחרי שתעבור מיגרציה.

---

#### 14. ImageForListsView
**CSV Line**: ??? (לא מופיע ב-mapping הנוכחי)
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: תמונה לתצוגת רשימות.

---

#### 15. Content
**CSV Line**: ??? (לא מופיע ב-mapping הנוכחי)
**Type**: nvarchar(MAX)
**Nullable**: Yes
**הערה**: תוכן עשיר (HTML?).

---

#### 16. MediaForExecutePage
**CSV Line**: ??? (לא מופיע ב-mapping הנוכחי)
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: מדיה לעמוד ביצוע.

---

## Foreign Keys

הטבלה מקושרת ל:
- **lutprojecttype** (ProjectType)
- **terminal** (TerminalId)
- **media** (MainMedia, ImageForListsView, MediaForExecutePage)
- **lutrecordstatus** (RecordStatus)
- **user** (CreatedBy, UpdatedBy, StatusChangedBy)

## טבלאות תלויות (Children)

הטבלאות האלה תלויות ב-project ויש למגרר אותן רק AFTER project:
- projectLocalization
- projectItem
- lead
- linkSetting
- recruiter
- fundCategory

## דוגמה למיפוי מלא

```json
{
  "filename": "ProjectMapping",
  "columnMappings": {
    "Name": {
      "convertType": "expression",
      "oldTable": "products",
      "oldColumn": "Name",
      "expression": "value ? value.substring(0, 150) : null"
    },
    "ProjectType": {
      "convertType": "const",
      "value": "2"
    },
    "KupatFundNo": {
      "convertType": "direct",
      "oldTable": "products",
      "oldColumn": "ProjectNumber"
    },
    "DisplayAsSelfView": {
      "convertType": "direct",
      "oldTable": "products",
      "oldColumn": "WithoutKupatView"
    },
    "TerminalId": {
      "convertType": "direct",
      "oldTable": "products",
      "oldColumn": "Terminal",
      "defaultValue": "1",
      "useFkMapping": true
    },
    "RecordStatus": {
      "convertType": "const",
      "value": "2"
    },
    "StatusChangedAt": {
      "convertType": "const",
      "value": "GETDATE()"
    },
    "StatusChangedBy": {
      "convertType": "const",
      "value": "-1"
    },
    "CreatedAt": {
      "convertType": "direct",
      "oldTable": "products",
      "oldColumn": "DateCreated",
      "defaultValue": "GETDATE()"
    },
    "CreatedBy": {
      "convertType": "const",
      "value": "-1"
    },
    "UpdatedAt": {
      "convertType": "const",
      "value": "GETDATE()"
    },
    "UpdatedBy": {
      "convertType": "const",
      "value": "-1"
    }
  },
  "fkMappings": {
    "TerminalId": {
      "1": "1",
      "4": "2"
    }
  }
}
```

## שאילתת SQL שנבנית

```sql
SELECT
  productsid,
  Name,
  ProjectNumber,
  WithoutKupatView,
  DateCreated,
  Terminal
FROM products
```

ה-server.js בונה את השאילתה אוטומטית על סמך השדות ב-columnMappings.

## תוצאות מיגרציה אחרונה

**Date**: 2025-11-11 10:23
- **Rows migrated**: 1,750/1,750 (100% ✅)
- **Errors**: 0
- **Duration**: ~10 שניות

## צעדים הבאים

1. ✅ **DONE**: Basic 12 fields
2. ⏳ **TODO**: MainMedia (צריך Media table migration קודם)
3. ⏳ **TODO**: ImageForListsView (צריך Media table migration קודם)
4. ⏳ **TODO**: Content (צריך לברר מהיכן לקחת)
5. ⏳ **TODO**: MediaForExecutePage (צריך Media table migration קודם)

## בעיות ידועות

אין בעיות ידועות ב-Project table migration.
כל 1,750 השורות עברו בהצלחה ב-100%.
