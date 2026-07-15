# ProjectItem Table Mapping

## מידע כללי

**טבלת מקור**: products (MSSQL)
**טבלת יעד**: projectItem (MySQL)
**CSV Lines**:
- Funds: 1827-1846
- Collections Certificate: 2594-2611
- Collections Donation: 2613-2629

**התקדמות**: 13/22 שדות (59%)

## עקרון הטבלה

**Variable cardinality**: בניגוד ל-projectLocalization (3 קבועים), כאן מספר הפריטים **תלוי ב-ProjectType**:

### Funds (ProjectType=1)
**1 פריט** לכל project:
- ItemType = 5 (FundDonation)
- PriceType = 2 (Free)
- HasEngravingName = 0

### Collections (ProjectType=2)
**2 פריטים** לכל project:

#### פריט 1: Certificate
- ItemType = 2 (Certificate)
- PriceType = 1 (Closed)
- HasEngravingName = 1
- DeliveryMethod = 1 (Post)

#### פריט 2: Donation
- ItemType = 4 (Donation)
- PriceType = 2 (Free)
- HasEngravingName = 0

**סה"כ**: אם יש 1,000 Funds + 750 Collections = 1,000×1 + 750×2 = **2,500 פריטים**.

## שדות קבועים

### ProjectId
**Type**: int (FK → project.Id)
**Mapping**: אוטומטי - מה-ID שנוצר ב-project migration
```javascript
const newProjectId = idMappings[oldProductId];
```

---

## שדות שהושלמו (13/22)

### 1. ItemName
**CSV Lines**: 1830 (Funds), 2597 (Certificate), 2616 (Donation)

#### כל הסוגים:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name",
  "expression": "value ? value.substring(0, 150) : null"
}
```

**הסבר**: שם הפריט = שם המוצר, חתוך ל-150 תווים.

---

### 2. ItemType
**CSV Lines**: 1832 (Funds), 2599 (Certificate), 2618 (Donation)

#### Funds:
```json
{
  "convertType": "const",
  "value": "5"
}
```

#### Certificate:
```json
{
  "convertType": "const",
  "value": "2"
}
```

#### Donation:
```json
{
  "convertType": "const",
  "value": "4"
}
```

**ערכים אפשריים** (מתוך lutitemtype):
- 1 = ???
- 2 = Certificate (תעודה)
- 3 = ???
- 4 = Donation (תרומה)
- 5 = FundDonation (תרומה לקופה)

---

### 3. PriceType
**CSV Lines**: 1833 (Funds), 2600 (Certificate), 2619 (Donation)

#### Funds & Donation:
```json
{
  "convertType": "const",
  "value": "2"
}
```

#### Certificate:
```json
{
  "convertType": "const",
  "value": "1"
}
```

**ערכים אפשריים** (מתוך lutpricetype):
- 1 = Closed (מחיר קבוע)
- 2 = Free (מחיר חופשי)

---

### 4. HasEngravingName
**CSV Lines**: 1835 (Funds), 2601 (Certificate), 2620 (Donation)

#### Funds & Donation:
```json
{
  "convertType": "const",
  "value": "0"
}
```

#### Certificate:
```json
{
  "convertType": "const",
  "value": "1"
}
```

**הסבר**:
- 1 = יש חריטת שם (רק ב-Certificate)
- 0 = אין חריטה

---

### 5. AllowFreeAddPrayerNames
**CSV Lines**: 1836 (Funds), ??? (Certificate), ??? (Donation)

#### כל הסוגים:
```json
{
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "ShowPrayerNames",
  "expression": "value || 0",
  "defaultValue": "0"
}
```

**הסבר**: האם לאפשר הוספת שמות לתפילה בחינם.
- אם ShowPrayerNames = 1 → 1
- אחרת → 0

---

### 6. DeliveryMethod
**CSV Lines**: 2603 (Certificate רק!)

#### Certificate בלבד:
```json
{
  "convertType": "const",
  "value": "1"
}
```

**ערכים אפשריים** (מתוך lutdeliverymethod):
- 1 = Post (דואר)
- 2 = ???

**הערה**: רלוונטי רק ל-Certificate כי צריך משלוח פיזי.

---

### 7-13. Audit Fields (RecordStatus, StatusChangedAt/By, CreatedAt/By, UpdatedAt/By)

**CSV Lines**: 1840-1846 (Funds), 2605-2611 (Certificate), 2624-2629 (Donation)

#### RecordStatus:
```json
{
  "convertType": "const",
  "value": "2"
}
```

#### StatusChangedAt, CreatedAt, UpdatedAt:
```json
{
  "convertType": "const",
  "value": "GETDATE()"
}
```

#### StatusChangedBy, CreatedBy, UpdatedBy:
```json
{
  "convertType": "const",
  "value": "-1"
}
```

**הסבר**: שדות ניהול סטנדרטיים, זהים לשאר הטבלאות.

---

## שדות שטרם יושמו (9/22)

### 14. KupatFundNo
**Type**: varchar(50)
**Nullable**: Yes
**הערה**: מספר קופה/קרן. לא ברור מהיכן לקחת.

---

### 15. AllowAddDedication
**Type**: bit
**Nullable**: Yes
**הערה**: האם לאפשר הקדשה. לא ברור מהיכן לקחת.

---

### 16. AllowSelfPickup
**Type**: bit
**Nullable**: Yes
**הערה**: האם לאפשר איסוף עצמי. רלוונטי ל-Certificate.

---

### 17. MainMedia
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך Media table migration קודם.

---

### 18. ImageForListsView
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך Media table migration קודם.

---

### 19. MediaForExecutePage
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך Media table migration קודם.

---

### 20. MobileMediaForExecutePage
**Type**: int (FK → media.Id)
**Nullable**: Yes
**הערה**: צריך Media table migration קודם.

---

### 21. DisplayOrder
**Type**: int
**Nullable**: Yes
**הערה**: סדר תצוגה. לא ברור מהיכן לקחת.

---

### 22. ItemLocalizationId
**Type**: int (FK → projectItemLocalization.Id)
**Nullable**: Yes
**הערה**: קישור ל-localization. זה יעודכן ב-ProjectItemLocalization migration.

---

## דוגמה למיפוי מלא

```json
{
  "projectItemMappings": {
    "funds": {
      "ItemName": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name",
        "expression": "value ? value.substring(0, 150) : null"
      },
      "ItemType": {
        "convertType": "const",
        "value": "5"
      },
      "PriceType": {
        "convertType": "const",
        "value": "2"
      },
      "HasEngravingName": {
        "convertType": "const",
        "value": "0"
      },
      "AllowFreeAddPrayerNames": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "ShowPrayerNames",
        "expression": "value || 0",
        "defaultValue": "0"
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
        "convertType": "const",
        "value": "GETDATE()"
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
    "collections": {
      "certificate": {
        "ItemName": {
          "convertType": "expression",
          "oldTable": "products",
          "oldColumn": "Name",
          "expression": "value ? value.substring(0, 150) : null"
        },
        "ItemType": {
          "convertType": "const",
          "value": "2"
        },
        "PriceType": {
          "convertType": "const",
          "value": "1"
        },
        "HasEngravingName": {
          "convertType": "const",
          "value": "1"
        },
        "AllowFreeAddPrayerNames": {
          "convertType": "expression",
          "oldTable": "products",
          "oldColumn": "ShowPrayerNames",
          "expression": "value || 0",
          "defaultValue": "0"
        },
        "DeliveryMethod": {
          "convertType": "const",
          "value": "1"
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
          "convertType": "const",
          "value": "GETDATE()"
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
      "donation": {
        "ItemName": {
          "convertType": "expression",
          "oldTable": "products",
          "oldColumn": "Name",
          "expression": "value ? value.substring(0, 150) : null"
        },
        "ItemType": {
          "convertType": "const",
          "value": "4"
        },
        "PriceType": {
          "convertType": "const",
          "value": "2"
        },
        "HasEngravingName": {
          "convertType": "const",
          "value": "0"
        },
        "AllowFreeAddPrayerNames": {
          "convertType": "expression",
          "oldTable": "products",
          "oldColumn": "ShowPrayerNames",
          "expression": "value || 0",
          "defaultValue": "0"
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
          "convertType": "const",
          "value": "GETDATE()"
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
      }
    }
  }
}
```

## לוגיקה ב-server.js

```javascript
// קבע ProjectType
const projectTypeMapping = mappings['ProjectType'];
let projectType = 2; // Default to Collection
if (projectTypeMapping && projectTypeMapping.value) {
  projectType = parseInt(projectTypeMapping.value);
}

// אתחל array לשמירת IDs
projectItemIdMappings[oldProductId] = [];

if (projectType === 1 && projectItemMappings.funds) {
  // צור 1 FundDonation item
  const itemMapping = projectItemMappings.funds;
  const itemData = { ProjectId: newProjectId };

  // בנה itemData מה-mapping
  for (const [fieldName, mapping] of Object.entries(itemMapping)) {
    // ... evaluate value
    itemData[fieldName] = value;
  }

  // INSERT
  const [result] = await mysqlConnection.execute(insertQuery, values);
  projectItemIdMappings[oldProductId].push(result.insertId);

} else if (projectType === 2 && projectItemMappings.collections) {
  // צור 2 items: Certificate + Donation

  // 1. Certificate
  const certMapping = projectItemMappings.collections.certificate;
  // ... build and insert
  projectItemIdMappings[oldProductId].push(certResult.insertId);

  // 2. Donation
  const donationMapping = projectItemMappings.collections.donation;
  // ... build and insert
  projectItemIdMappings[oldProductId].push(donationResult.insertId);
}
```

## מבנה projectItemIdMappings

```javascript
projectItemIdMappings = {
  "1": [101],           // Fund → 1 item
  "2": [102, 103],      // Collection → 2 items
  "3": [104],           // Fund → 1 item
  "4": [105, 106]       // Collection → 2 items
}
```

זה ישמש ל-ProjectItemLocalization migration בעתיד.

## תוצאות מיגרציה

**Date**: 2025-11-12 13:03
**מצב**: ✅ SUCCESS

**תוצאות בפועל**:
- **Items created**: 3,500
- **Breakdown**: 1,750 projects × 2 items = 3,500
  - All projects are Collections (ProjectType=2)
  - Each creates: Certificate (ItemType=2) + Donation (ItemType=4)
- **Errors**: 0
- **Duration**: ~13 שניות

## Foreign Keys

הטבלה מקושרת ל:
- **project** (ProjectId) - חייב לקיים קודם!
- **lutitemtype** (ItemType)
- **lutpricetype** (PriceType)
- **lutdeliverymethod** (DeliveryMethod)
- **media** (MainMedia, ImageForListsView, MediaForExecutePage, MobileMediaForExecutePage)
- **lutrecordstatus** (RecordStatus)
- **user** (CreatedBy, UpdatedBy, StatusChangedBy)
- **projectItemLocalization** (ItemLocalizationId) - יעודכן אחר כך

## טבלאות תלויות (Children)

הטבלאות האלה תלויות ב-projectItem ויש למגרר אותן רק AFTER projectItem:
- **projectItemLocalization** (3 שורות לכל item = 3,500×3 = 10,500 שורות!)

## צעדים הבאים

1. ✅ **DONE**: 13 basic fields (ItemName, ItemType, PriceType, HasEngravingName, AllowFreeAddPrayerNames, DeliveryMethod, audit fields)
2. ⏳ **TODO**: בדיקת migration בפועל
3. ⏳ **TODO**: KupatFundNo (צריך לברר מקור)
4. ⏳ **TODO**: AllowAddDedication (צריך לברר מקור)
5. ⏳ **TODO**: AllowSelfPickup (צריך לברר מקור)
6. ⏳ **TODO**: MainMedia (צריך Media migration)
7. ⏳ **TODO**: ImageForListsView (צריך Media migration)
8. ⏳ **TODO**: MediaForExecutePage (צריך Media migration)
9. ⏳ **TODO**: MobileMediaForExecutePage (צריך Media migration)
10. ⏳ **TODO**: DisplayOrder (צריך לברר מקור)

## בעיות ידועות

אין בעיות ידועות. Migration עבר בהצלחה 100%.

## הערות חשובות

1. **DeliveryMethod רק ל-Certificate**: ודא שהקוד לא מנסה להכניס DeliveryMethod ל-Donation/Fund.

2. **projectItemIdMappings חשוב מאוד**: זה המפתח ל-ProjectItemLocalization migration הבא.

3. **ShowPrayerNames**: בדוק שהעמודה הזו קיימת ב-products. אם לא - תקבל שגיאה.
