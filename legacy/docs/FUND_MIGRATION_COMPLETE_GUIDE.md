# 📘 מדריך מלא למיגרציית Funds (קרנות)

## 🎯 סקירה כללית

מיגרציית ה-Funds מעבירה נתונים של **קרנות תרומה** מהמערכת הישנה (MSSQL) למערכת החדשה (MySQL).

- **קובץ מיפוי**: `ProjectMapping_Funds_Fixed.json`
- **טבלת מקור**: `products` (MSSQL - kupatOld)
- **טבלאות יעד**: 9 טבלאות (MySQL - kupathairnew)
- **ProjectType**: 1 (Funds)
- **כמות צפויה**: ~1,271 קרנות

---

## 🔄 תרשים זרימת התהליך

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI - דף המיגרציה                         │
│  1. לוחצים "טען מיפוי" → בוחרים ProjectMapping_Funds_Fixed     │
│  2. לוחצים "הגדרות חיבור ומיגרציה" → מתחיל התהליך               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    POST /api/migrate (server.js)                │
│  • טוען מיפויים מהקובץ JSON                                      │
│  • מתחבר ל-MSSQL (kupatOld) + MySQL (kupathairnew)              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              שליפת נתונים מ-MSSQL (טבלת products)               │
│  SELECT * FROM products WHERE [תנאי סינון מורכב]                │
│  → ~1,271 שורות                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   יצירת רשומות ב-MySQL (9 טבלאות)               │
│  1. Project (1,271)                                             │
│  2. ProjectLocalization (3,813 = 1,271 × 3 שפות)               │
│  3. ProjectItem (1,271)                                         │
│  4. ProjectItemLocalization (3,813)                             │
│  5. Media (~2,000)                                              │
│  6. LinkSetting (7,626 = 2 סוגים × 3 שפות × 1,271)             │
│  7. EntityContent (~3,813)                                      │
│  8. EntityContentItem (~3,813)                                  │
│  + עדכונים: Project, ProjectLocalization, ProjectItem, etc.    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    שמירת מיפוי ProductsMapping.json             │
│  מיפוי: oldProductId → newProjectId + ProjectItems              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                        ✅ סיום מוצלח
```

---

## 📂 שלב 1: שליפת נתונים מבסיס הנתונים הישן (MSSQL)

### טבלת מקור: `products`

#### שאילתת SELECT המלאה

```sql
SELECT
  -- מזהים
  productsid,

  -- נתונים בסיסיים
  Name, Name_en, Name_fr,
  ProjectNumber,
  Terminal,
  WithoutKupatView,

  -- תיאורים
  ShortDescription, ShortDescription_en, ShortDescription_fr,

  -- הגדרות תצוגה
  Hide, Hide_en, Hide_fr,
  ShowMainPage,
  Sort,

  -- מחירים ותשלומים
  Price, Price_en, Price_fr,
  DefaultDonationSumFixed, DefaultDonationSumFixed_en, DefaultDonationSumFixed_fr,
  DefaultPaymentsNumFixed, DefaultPaymentsNumFixed_en, DefaultPaymentsNumFixed_fr,
  DefaultDonationsSum, DefaultDonationsSum_en, DefaultDonationsSum_fr,
  DefaultPaymentsNumber, DefaultPaymentsNumber_en, DefaultPaymentsNumber_fr,

  -- הגדרות תפילה
  ShowPrayerNames,
  HideDonationAmount,

  -- שמות לעמודים שונים
  ProjectNameForDonationPage,
  ProjectNameForInvoice, ProjectNameForInvoice_en, ProjectNameForInvoice_fr,

  -- מדיה
  Pic, Pic_en, Pic_fr,
  ProjectVideo, ProjectVideo_en, ProjectVideo_fr,
  DonationPageBanner1, DonationPageBanner1_en, DonationPageBanner1_fr

FROM products WITH (NOLOCK)

WHERE
  -- תנאי 1: לא תעודה
  IsNull([Certificate], 0) != 1

  -- תנאי 2: לא חלק מקבוצת מוצרים (ProductGroup)
  AND NOT EXISTS (
    SELECT 1
    FROM ProductGroup g WITH (NOLOCK)
    WHERE g.ParentProductId = products.productsid
       OR g.SubProductId = products.productsid
  )

  -- תנאי 3: לא רשימת IDs של Collections (רשימה ארוכה)
  AND products.productsid NOT IN (
    8,10,11,12,13,14,18,23,25,26,27,28,29,30,31,33,64,66,76,77,78,79,80,81,82,84,87,89,90,91,
    108,109,110,112,157,181,213,224,252,253,255,262,269,280,288,290,291,292,295,296,300,304,
    305,306,307,308,310,311,312,316,323,324,325,326,331,333,334,335,424,445,457,520,522,545,
    550,551,556,557,558,618,619,620,625,669,671,690,702,750,751,765,766,767,774,775,810,811,
    812,819,820,824,832,845,847,851,858,859,860,862,872,881,904,905,918,919,920,929,930,931,
    941,942,949,960,961,963,970,971,972,979,980,984,985,986,987,988,989,990,997,998,999,1019,
    1020,1027,1028,1029,1036,1037,1039,1040,1041,1042,1046,1055,1056,1061,1062,1063,1068,1069,
    1105,1106,1114,1115,1121,1122,1123,1124,1137,1138,1139,1140,1141,1150,1151,1158,1161,1162,
    1183,1184,1185,1190,1192,1193,1194,1201,1202,1209,1210,1215,1216,1217,1218,1219,1224,1228,
    1229,1239,1240,1248,1250,1251,1253,1254,1266,1267,1268,1269,1284,1285,1286,1295,1296,1298,
    1299,1300,1301,1302,1304,1305,1306,1307,1311,1312,1313,1314,1315,1316,1322,1323,1324,1325,
    1326,1329,1332,1333,1334,1335,1337,1338,1340,1341,1342,1343,1345,1350,1354,1356,1358,1360,
    1363,1372,1375,1380,1383,1384,1385,1389,1390,1393,1394,1398,1399,1403,1404,1405,1406,1408,
    1409,1414,1415,1416,1419,1421,1422,1429,1438,1439,1442,1451,1456,1461,1462,1463,1464,1465,
    1466,1469,1470,1471,1472,1487,1488,1493,1502,1503,1504,1505,1507,1508,1509,1510,1517,1519,
    1520,1521,1522,1523,1525,1526,1531,1532,1533,1534,1539,1540,1543,1544,1552,1553,1554,1555,
    1556,1560,1561,1562,1566,1567,1571,1572,1576,1577,1588,1590,1591,1592,1593,1594,1595,1596,
    1597,1599,1603,1604,1608,1609,1610,1611,1612,1616,1617,1626,1627,1628,1629,1639,1643,1644,
    1651,1652,1653,1654,1655,1656,1663,1664,1666,1667,1668,1670,1671,1676,1677,1678,1679,1680,
    1681,1683,1684,1687,1689,1694,1696,1697,1699,1700,1701,1703,1707,1721,1723,1735,1736,1737,
    1738,1739,1740,1746,1747,1751,1752,1753,1754,1761,1762,1767,1768,1770,1772,1773,1799,1800,
    1814,1815,1816,1819,1822,1823,1828,1829,1831,1842,1843,1844,1850,1851,1860,1861,1868,1869,
    1875,1876,1877,1878,1889,1906,1907,1908,1909,1914,1915,1927,1928,1930,1931,1932,1933,1937,
    1940,1941,1956,1960,1962,1972,2031,2046,2063,2064,2077
  )
```

**תוצאה**: ~1,271 שורות

#### הסבר תנאי הסינון

| תנאי | מטרה |
|------|------|
| `IsNull([Certificate],0) != 1` | לא תעודות (Collections) |
| `NOT EXISTS ProductGroup` | לא מוצרים שחלק מקבוצה |
| `NOT IN (...)` | רשימה שחורה של IDs ידועים שהם Collections |

---

## 📊 שלב 2: יצירת רשומות במערכת החדשה (MySQL)

### 1️⃣ טבלה: **Project**

#### שאילתת INSERT

```sql
INSERT INTO Project (
  Name, ProjectType, KupatFundNo, DisplayAsSelfView,
  RecordStatus, StatusChangedAt, StatusChangedBy,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, TerminalId
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות

| שדה ביעד (Project) | מקור | טיפול | הערות |
|-------------------|------|--------|-------|
| **Name** | `products.Name` | `substring(0, 150)` | מוגבל ל-150 תווים |
| **ProjectType** | - | `1` (const) | תמיד 1 = Funds |
| **KupatFundNo** | `products.ProjectNumber` | ישיר | מספר קרן |
| **DisplayAsSelfView** | `products.WithoutKupatView` | ישיר | תצוגה עצמאית? |
| **RecordStatus** | - | `2` (const) | 2 = פעיל |
| **StatusChangedAt** | `productsid` | FK mapping | מתאריך ממופה |
| **StatusChangedBy** | - | `-1` (const) | מערכת |
| **CreatedAt** | `productsid` | FK mapping | מ-`ProductCreatedDate.json` |
| **CreatedBy** | - | `-1` (const) | מערכת |
| **UpdatedAt** | - | `GETDATE()` | עכשיו |
| **UpdatedBy** | - | `-1` | מערכת |
| **TerminalId** | `products.Terminal` | FK mapping | 1→1, 4→2 |

#### FK Mapping: ProductCreatedDate.json

```json
{
  "1": "2020-01-29T00:00:00.000Z",
  "2": "2020-01-31T00:00:00.000Z",
  "3": "2020-02-02T00:00:00.000Z",
  ...
}
```

**לוגיקה**: כל ProductId מקבל תאריך ייחודי, התחלה מ-5 שנים אחורה, +2 ימים לכל מוצר.

**שורות שנוצרות**: **1,271**

---

### 2️⃣ טבלה: **ProjectLocalization**

#### שאילתת INSERT (מופעלת 3 פעמים לכל Project)

```sql
INSERT INTO ProjectLocalization (
  ProjectId, Language,
  Title, Description, DisplayInSite, RecruitmentTarget,
  HideDonationsInSite, OrderInProjectsPageView,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות - עברית (LanguageId = 1)

| שדה | מקור | expression | הערות |
|-----|------|------------|-------|
| **ProjectId** | - | `newProjectId` | מה-Project שנוצר |
| **Language** | - | `1` | עברית |
| **Title** | `Name` | `substring(0, 150)` | |
| **Description** | `ShortDescription` | ישיר | |
| **DisplayInSite** | `Hide, ShowMainPage` | `(!Hide && ShowMainPage) ? 1 : 0` | |
| **RecruitmentTarget** | `Price` | `(value === 0 \|\| null) ? null : value` | יעד גיוס |
| **HideDonationsInSite** | `HideDonationAmount` | ישיר | |
| **OrderInProjectsPageView** | `Sort` | `value <= 30 ? value : null` | רק 30 ראשונים |

#### מיפוי שדות - אנגלית (LanguageId = 2)

| שדה | מקור | expression | Fallback |
|-----|------|------------|----------|
| **Title** | `Name_en` | `substring(0, 150)` | אם null → `Name` (עברית) |
| **Description** | `ShortDescription_en` | ישיר | |
| **DisplayInSite** | `Hide_en, ShowMainPage` | `(!Hide_en && ShowMainPage) ? 1 : 0` | |
| **RecruitmentTarget** | `Price_en` | `(value === 0 \|\| null) ? null : value` | |

#### מיפוי שדות - צרפתית (LanguageId = 3)

זהה לאנגלית, אבל עם `_fr` במקום `_en`.

**שורות שנוצרות**: **3,813** (1,271 × 3)

---

### 3️⃣ טבלה: **ProjectItem**

#### שאילתת INSERT (1 פריט לכל Fund)

```sql
INSERT INTO ProjectItem (
  ProjectId, ItemName, ItemType, PriceType,
  HasEngravingName, AllowFreeAddPrayerNames,
  RecordStatus, StatusChangedAt, StatusChangedBy,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות

| שדה | מקור | ערך | הערות |
|-----|------|-----|-------|
| **ProjectId** | - | `newProjectId` | קישור ל-Project |
| **ItemName** | `Name` | `substring(0, 150)` | |
| **ItemType** | - | `5` (const) | 5 = FundDonation |
| **PriceType** | - | `2` (const) | 2 = סכום חופשי |
| **HasEngravingName** | - | `0` | אין חריטה |
| **AllowFreeAddPrayerNames** | `ShowPrayerNames` | `value ? 1 : 0` | |
| **RecordStatus** | - | `2` | פעיל |
| **CreatedAt** | - | `GETDATE()` | |

**שורות שנוצרות**: **1,271**

---

### 4️⃣ טבלה: **ProjectItemLocalization**

#### שאילתת INSERT (3 לכל ProjectItem)

```sql
INSERT INTO ProjectItemLocalization (
  ItemId, Language,
  DisplayInSite, Title, PaymentSum, DefaultPaymentType, DefaultPaymentsCount,
  NameForReceipt, OrderInItemsPageView, OrderInProjectPageFooter,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות - עברית (LanguageId = 1)

| שדה | מקור | expression | הערות |
|-----|------|------------|-------|
| **ItemId** | - | `newItemId` | מ-ProjectItem |
| **Language** | - | `1` | עברית |
| **DisplayInSite** | `Hide, ShowMainPage` | `(!Hide && ShowMainPage) ? 1 : 0` | |
| **Title** | `ProjectNameForDonationPage` | אם שונה מ-Name → זה, אחרת Name | כותרת לעמוד תרומה |
| **PaymentSum** | `DefaultDonationSumFixed, DefaultPaymentsNumFixed, DefaultDonationsSum` | `DefaultDonationSumFixed > 0 ? (DefaultDonationSumFixed * DefaultPaymentsNumFixed) : DefaultDonationsSum` | סכום תשלום כולל |
| **DefaultPaymentType** | `DefaultDonationSumFixed` | `DefaultDonationSumFixed > 0 ? 1 : 2` | 1=קבוע, 2=חופשי |
| **DefaultPaymentsCount** | `DefaultPaymentsNumFixed, DefaultPaymentsNumber` | `DefaultDonationSumFixed > 0 ? DefaultPaymentsNumFixed : DefaultPaymentsNumber` | מספר תשלומים |
| **NameForReceipt** | `ProjectNameForInvoice` | `substring(0, 150)` | שם לקבלה |
| **OrderInItemsPageView** | `Sort` | `value <= 30 ? value : null` | |
| **OrderInProjectPageFooter** | - | `1` (const) | |

#### מיפוי שדות - אנגלית/צרפתית

דומה לעברית, אבל עם שדות `_en` / `_fr` ו-fallback לעברית אם ריק.

**שורות שנוצרות**: **3,813** (1,271 × 3)

---

### 5️⃣ טבלה: **Media**

#### שאילתת INSERT (עד 3 לכל שפה)

```sql
INSERT INTO Media (
  ProjectId, LanguageId, RelativePath,
  YearDirectory, MonthDirectory, SourceType, MediaType,
  FriendlyName, MatchToPlatform, RecordStatus,
  StatusChangedAt, StatusChangedBy, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### סוגי מדיה (לכל שפה):

##### 5.1 תמונת פרויקט (projectImage)

| שדה | ערך | הערות |
|-----|-----|-------|
| **RelativePath** | `Pic` / `Pic_en` / `Pic_fr` | מוסיף prefix: `2020/01/` |
| **MediaType** | `1` | תמונה |
| **SourceType** | `1` | Legacy |
| **MatchToPlatform** | `3` | כל הפלטפורמות |
| **condition** | `row.Pic != null && row.Pic != ''` | רק אם קיים |

##### 5.2 וידאו פרויקט (projectVideo)

| שדה | ערך |
|-----|-----|
| **RelativePath** | `ProjectVideo` / `ProjectVideo_en` / `ProjectVideo_fr` |
| **MediaType** | `2` (וידאו) |

##### 5.3 באנר תרומה (donationBanner)

| שדה | ערך |
|-----|-----|
| **RelativePath** | `DonationPageBanner1` / `_en` / `_fr` |
| **MediaType** | `1` (תמונה) |

**שורות שנוצרות**: **~2,000** (תלוי בכמות תמונות/וידאו בפועל)

#### עדכוני FK לאחר יצירת Media

```sql
-- עדכון Project
UPDATE Project
SET MainMedia = ?, ImageForListsView = ?
WHERE Id = ?

-- עדכון ProjectLocalization (3 שפות)
UPDATE ProjectLocalization
SET MainMedia = ?, ImageForListsView = ?
WHERE ProjectId = ? AND Language = ?

-- עדכון ProjectItem
UPDATE ProjectItem
SET MainMedia = ?, ImageForListsView = ?
WHERE Id = ?

-- עדכון ProjectItemLocalization (3 שפות)
UPDATE ProjectItemLocalization
SET MainMedia = ?, ImageForListsView = ?
WHERE ItemId = ? AND Language = ?
```

---

### 6️⃣ טבלה: **LinkSetting** (כפתור תרומה ראשי)

#### שאילתת INSERT (3 לכל Project)

```sql
INSERT INTO LinkSetting (
  LinkType, LinkTargetType, ProjectId, ItemId, LinkText,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות

| שדה | ערך | הערות |
|-----|-----|-------|
| **LinkType** | `1` | 1 = כפתור |
| **LinkTargetType** | `3` | 3 = Link to Execution Page |
| **ProjectId** | `newProjectId` | |
| **ItemId** | `itemId` | ה-FundDonation שנוצר |
| **LinkText** | `'לתרומה'` / `'Donate'` / `'Pour faire un don'` | לפי שפה |
| **CreatedAt** | `NOW()` | |
| **CreatedBy** | `1` | System user |

**סדר יצירה**: עברית (1), צרפתית (3), אנגלית (2)

**שורות שנוצרות**: **3,813** (1,271 × 3)

#### עדכון FK ב-ProjectLocalization

```sql
UPDATE ProjectLocalization
SET MainLinkButtonSettingId = ?
WHERE ProjectId = ? AND Language = ?
```

**עדכונים**: **3,813**

---

### 7️⃣ טבלה: **LinkSetting** (תצוגת רשימה)

#### שאילתת INSERT (3 נוספים לכל Project)

```sql
INSERT INTO LinkSetting (
  LinkType, LinkTargetType, ProjectId, ItemId, LinkText,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות

| שדה | ערך | הערות |
|-----|-----|-------|
| **LinkType** | `3` | 3 = ??? |
| **LinkTargetType** | `1` | 1 = ??? |
| **ProjectId** | `newProjectId` | |
| **ItemId** | `null` | ללא item |
| **LinkText** | `null` | ללא טקסט |

**שורות שנוצרות**: **3,813** נוספות (1,271 × 3)

**סה"כ LinkSetting**: **7,626** (3,813 + 3,813)

#### עדכון FK ב-ProjectLocalization

```sql
UPDATE ProjectLocalization
SET LinkSettingIdInListView = ?
WHERE ProjectId = ? AND Language = ?
```

**עדכונים**: **3,813**

---

### 8️⃣ טבלה: **EntityContent**

#### שאילתת INSERT (3 לכל Project)

```sql
INSERT INTO EntityContent (
  EntityType, EntityId, Content,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות

| שדה | ערך | הערות |
|-----|-----|-------|
| **EntityType** | `1` | 1 = Project |
| **EntityId** | `newProjectId` | |
| **Content** | `ShortDescription` / `_en` / `_fr` | רק אם לא ריק |
| **CreatedAt** | `NOW()` | |
| **CreatedBy** | `1` | |

**condition**: רק אם `ShortDescription` לא ריק!

**שורות שנוצרות**: **~3,813** (תלוי בכמות תיאורים בפועל)

---

### 9️⃣ טבלה: **EntityContentItem**

#### שאילתת INSERT (1 לכל EntityContent)

```sql
INSERT INTO EntityContentItem (
  ContentId, ItemType, SortOrder, ItemValue,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

#### מיפוי שדות

| שדה | ערך |
|-----|-----|
| **ContentId** | `contentId` (מ-EntityContent שנוצר) |
| **ItemType** | `1` |
| **SortOrder** | `1` |
| **ItemValue** | `ShortDescription` / `_en` / `_fr` |
| **CreatedAt** | `NOW()` |

**שורות שנוצרות**: **~3,813**

#### עדכון FK ב-ProjectLocalization

```sql
UPDATE ProjectLocalization
SET ContentId = ?
WHERE ProjectId = ? AND Language = ?
```

**עדכונים**: **~3,813**

---

## 📊 סיכום כמויות

### טבלאות עם INSERT (יצירת שורות חדשות)

| # | טבלה | שורות | חישוב |
|---|------|-------|-------|
| 1 | Project | 1,271 | 1 לכל Fund |
| 2 | ProjectLocalization | 3,813 | 1,271 × 3 שפות |
| 3 | ProjectItem | 1,271 | 1 לכל Fund |
| 4 | ProjectItemLocalization | 3,813 | 1,271 × 3 שפות |
| 5 | Media | ~2,000 | תלוי בנתונים |
| 6 | LinkSetting (כפתור) | 3,813 | 1,271 × 3 שפות |
| 7 | LinkSetting (רשימה) | 3,813 | 1,271 × 3 שפות |
| 8 | EntityContent | ~3,813 | תלוי בתיאורים |
| 9 | EntityContentItem | ~3,813 | 1 לכל Content |
| | **סה"כ שורות חדשות** | **~27,420** | |

### טבלאות עם UPDATE (עדכון שורות קיימות)

| # | טבלה | שדה מעודכן | עדכונים |
|---|------|------------|----------|
| 1 | Project | MainMedia, ImageForListsView | ~1,271 |
| 2 | ProjectLocalization | MainMedia, ImageForListsView | ~11,439 (3 שפות × 3,813) |
| 3 | ProjectLocalization | MainLinkButtonSettingId | 3,813 |
| 4 | ProjectLocalization | LinkSettingIdInListView | 3,813 |
| 5 | ProjectLocalization | ContentId | ~3,813 |
| 6 | ProjectItem | MainMedia, ImageForListsView | ~1,271 |
| 7 | ProjectItemLocalization | MainMedia, ImageForListsView | ~11,439 |
| 8 | ProjectItemLocalization | ImageForListsView (נוסף) | ~3,813 |
| | **סה"כ עדכונים** | | **~40,672** |

### סה"כ פעולות DB

**INSERT**: ~27,420 שורות
**UPDATE**: ~40,672 עדכונים
**סה"כ**: **~68,092 פעולות**

---

## 🗂️ קבצי עזר

### ProductCreatedDate.json

```json
{
  "metadata": {
    "description": "Maps ProductId to unique creation dates",
    "startDate": "2020-01-29",
    "incrementDays": 2,
    "totalProducts": 1954
  },
  "1": "2020-01-29T00:00:00.000Z",
  "2": "2020-01-31T00:00:00.000Z",
  "3": "2020-02-02T00:00:00.000Z",
  ...
}
```

**מיקום**: `data/fk-mappings/ProductCreatedDate.json`

### ProductsMapping.json (נוצר בסוף המיגרציה)

```json
{
  "metadata": {
    "lastUpdate": "2025-11-23T12:00:00.000Z",
    "totalMapped": 1271
  },
  "mapping": {
    "1": {
      "ProjectId": 1,
      "ProjectType": 1,
      "ProjectItems": [
        {
          "Id": 1,
          "ItemType": 5,
          "ItemName": "קרן כללית"
        }
      ]
    },
    ...
  }
}
```

**מיקום**: `data/fk-mappings/ProductsMapping.json`

---

## 🔍 שאילתות בדיקה

### בדיקת כמויות לאחר מיגרציה

```sql
-- בדיקת Project
SELECT COUNT(*) FROM Project WHERE ProjectType = 1;
-- צפוי: 1,271

-- בדיקת ProjectLocalization
SELECT COUNT(*) FROM ProjectLocalization
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- צפוי: 3,813

-- בדיקת ProjectItem
SELECT COUNT(*) FROM ProjectItem
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- צפוי: 1,271

-- בדיקת LinkSetting
SELECT COUNT(*) FROM LinkSetting
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- צפוי: 7,626 (2 סוגים × 3 שפות × 1,271)

-- בדיקת Media
SELECT COUNT(*) FROM Media
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- צפוי: ~2,000

-- בדיקת EntityContent
SELECT COUNT(*) FROM EntityContent
WHERE EntityType = 1
  AND EntityId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- צפוי: ~3,813
```

### בדיקת FK Integrity

```sql
-- בדיקה ש-ProjectLocalization מקושר ל-LinkSetting
SELECT COUNT(*) FROM ProjectLocalization pl
WHERE pl.ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1)
  AND pl.MainLinkButtonSettingId IS NULL;
-- צפוי: 0 (הכל אמור להיות מקושר)

-- בדיקה ש-ProjectLocalization מקושר ל-Media
SELECT COUNT(*) FROM ProjectLocalization pl
WHERE pl.ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1)
  AND pl.MainMedia IS NULL;
-- תלוי בכמות Funds עם תמונות

-- בדיקה ש-ProjectItem מקושר לפרויקט תקין
SELECT COUNT(*) FROM ProjectItem pi
LEFT JOIN Project p ON pi.ProjectId = p.Id
WHERE p.Id IS NULL;
-- צפוי: 0 (אסור שיהיו orphans)
```

---

## ⚠️ בעיות ידועות ופתרונות

### בעיה 1: Title עם NULL

**תיאור**: במקרים נדירים `Name` יכול להיות NULL
**פתרון**:
```javascript
expression: "value ? value.substring(0, 150) : 'No Translation'"
defaultValue: "No Translation"
```

### בעיה 2: convertType לא עקבי

**תיאור**: `OrderInProjectsPageView` מוגדר כ-`direct` אבל יש לו `expression`
**פתרון**: שנה ל-`convertType: "expression"`

### בעיה 3: PaymentSum מורכב

**תיאור**: חישוב PaymentSum תלוי ב-3 שדות
**פתרון**:
```javascript
expression: "DefaultDonationSumFixed > 0 ?
  (DefaultDonationSumFixed * (DefaultPaymentsNumFixed || 1)) :
  DefaultDonationsSum"
```

---

## 🚀 הרצת המיגרציה

### דרך 1: UI

1. פתח דפדפן: `http://localhost:3030`
2. לחץ **"טען מיפוי"**
3. בחר **"ProjectMapping_Funds_Fixed.json"**
4. לחץ **"הגדרות חיבור ומיגרציה"**
5. המתן לסיום (צפוי: ~2-3 דקות)

### דרך 2: Script ישיר

```bash
cd legacy
node scripts/run-funds-migration.js
```

### דרך 3: API ישיר

```bash
curl -X POST http://localhost:3030/api/migrate \
  -H "Content-Type: application/json" \
  -d @mappings/ProjectMapping_Funds_Fixed.json
```

---

## 📁 קבצים קשורים

| קובץ | תיאור |
|------|-------|
| [`ProjectMapping_Funds_Fixed.json`](../mappings/ProjectMapping_Funds_Fixed.json) | קובץ המיפוי הראשי |
| [`server.js`](../src/server.js) | לוגיקת המיגרציה (שורות 1650-3300) |
| [`database.js`](../config/database.js) | הגדרות חיבור למסדי נתונים |
| [`ProductCreatedDate.json`](../data/fk-mappings/ProductCreatedDate.json) | מיפוי תאריכים |
| [`run-funds-migration.js`](../scripts/run-funds-migration.js) | סקריפט הרצה |

---

## 📞 תמיכה ופתרון בעיות

### לוגים

קובץ הלוג: `migration.log`

```bash
# צפייה בלוג בזמן אמת
tail -f migration.log

# חיפוש שגיאות
grep ERROR migration.log
```

### בעיות נפוצות

| תסמין | גורם אפשרי | פתרון |
|-------|-----------|--------|
| "Connection timeout" | MSSQL לא זמין | בדוק את `database.js` |
| "Duplicate entry" | המיגרציה רצה כבר | נקה טבלאות או השתמש ב-`clear-tables.js` |
| "FK constraint fails" | סדר מיגרציה שגוי | ודא ש-Project נוצר לפני ProjectLocalization |
| "NULL title" | Name ריק במקור | בדוק את ה-expression fallback |

---

## ✅ רשימת בדיקה לאחר מיגרציה

- [ ] Project: 1,271 שורות
- [ ] ProjectLocalization: 3,813 שורות
- [ ] ProjectItem: 1,271 שורות
- [ ] ProjectItemLocalization: 3,813 שורות
- [ ] Media: >0 שורות
- [ ] LinkSetting: 7,626 שורות
- [ ] EntityContent: >0 שורות
- [ ] EntityContentItem: >0 שורות
- [ ] ProductsMapping.json נוצר
- [ ] אין שגיאות ב-`migration.log`
- [ ] כל ה-FK מקושרים תקין

---

**עודכן לאחרונה**: 2026-01-29
**גרסה**: 1.0
**מחבר**: Claude Code Migration System
