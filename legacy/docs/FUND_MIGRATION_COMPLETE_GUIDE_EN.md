# 📘 Complete Guide to Funds Migration

## 🎯 Overview

The Funds migration transfers **donation fund data** from the legacy system (MSSQL) to the new system (MySQL).

- **Mapping File**: `ProjectMapping_Funds_Fixed.json`
- **Source Table**: `products` (MSSQL - kupatOld)
- **Target Tables**: 9 tables (MySQL - kupathairnew)
- **ProjectType**: 1 (Funds)
- **Expected Quantity**: ~1,271 funds

---

## 🔄 Process Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       UI - Migration Page                        │
│  1. Click "Load Mapping" → Select ProjectMapping_Funds_Fixed    │
│  2. Click "Connection Settings & Migration" → Process starts    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    POST /api/migrate (server.js)                │
│  • Load mappings from JSON file                                  │
│  • Connect to MSSQL (kupatOld) + MySQL (kupathairnew)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            Fetch Data from MSSQL (products table)                │
│  SELECT [dynamic columns] FROM products WHERE [filter conditions]│
│  → ~1,271 rows                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Create Records in MySQL (9 tables)                  │
│  1. Project (1,271)                                             │
│  2. ProjectLocalization (3,813 = 1,271 × 3 languages)           │
│  3. ProjectItem (1,271)                                         │
│  4. ProjectItemLocalization (3,813)                             │
│  5. Media (~2,000)                                              │
│  6. LinkSetting (7,626 = 2 types × 3 languages × 1,271)         │
│  7. EntityContent (~3,813)                                      │
│  8. EntityContentItem (~3,813)                                  │
│  + Updates: Project, ProjectLocalization, ProjectItem, etc.     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            Save ID Mapping Files (CRITICAL)                      │
│  1. ProductsMapping.json - Full mapping with metadata            │
│     (oldProductId → newProjectId + ProjectItemIds + Status)      │
│  2. ProjectId.json - Simple FK mapping (MERGED with existing)    │
│     (oldProductsId → newProjectId)                               │
│     Used by downstream migrations (Recruiters, Donations)        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                        ✅ Success
```

---

## 📂 Step 1: Fetching Data from Legacy Database (MSSQL)

### Source Table: `products`

#### SELECT Query (Dynamically Built)

**Note**: The actual SELECT query is built **dynamically** at runtime by extracting all `oldColumn` values and `row.X` references from the mapping file. The query below shows the equivalent columns that will be selected:

```sql
SELECT
  -- Identifiers
  productsid,

  -- Basic data
  Name, Name_en, Name_fr,
  ProjectNumber,
  Terminal,
  WithoutKupatView,

  -- Descriptions
  ShortDescription, ShortDescription_en, ShortDescription_fr,

  -- Display settings
  Hide, Hide_en, Hide_fr,
  ShowMainPage,
  Sort,

  -- Prices and payments
  Price, Price_en, Price_fr,
  DefaultDonationSumFixed, DefaultDonationSumFixed_en, DefaultDonationSumFixed_fr,
  DefaultPaymentsNumFixed, DefaultPaymentsNumFixed_en, DefaultPaymentsNumFixed_fr,
  DefaultDonationsSum, DefaultDonationsSum_en, DefaultDonationsSum_fr,
  DefaultPaymentsNumber, DefaultPaymentsNumber_en, DefaultPaymentsNumber_fr,

  -- Prayer settings
  ShowPrayerNames,
  HideDonationAmount,

  -- Names for different pages
  ProjectNameForDonationPage,
  ProjectNameForInvoice, ProjectNameForInvoice_en, ProjectNameForInvoice_fr,

  -- Media
  Pic, Pic_en, Pic_fr,
  ProjectVideo, ProjectVideo_en, ProjectVideo_fr,
  DonationPageBanner1, DonationPageBanner1_en, DonationPageBanner1_fr

FROM products WITH (NOLOCK)

WHERE
  -- Condition 1: Not a certificate
  IsNull([Certificate], 0) != 1

  -- Condition 2: Not part of ProductGroup
  AND NOT EXISTS (
    SELECT 1
    FROM ProductGroup g WITH (NOLOCK)
    WHERE g.ParentProductId = products.productsid
       OR g.SubProductId = products.productsid
  )

  -- Condition 3: Not in the blacklist of Collection IDs (long list)
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

**Result**: ~1,271 rows

#### Filter Conditions Explained

| Condition | Purpose |
|-----------|---------|
| `IsNull([Certificate],0) != 1` | Not certificates (Collections) |
| `NOT EXISTS ProductGroup` | Not products that are part of a group |
| `NOT IN (...)` | Blacklist of known Collection IDs |

---

## 📊 Step 2: Creating Records in New System (MySQL)

### 🔑 Critical: In-Memory ID Mapping (`idMappings`)

During the Project INSERT step, the server maintains an **in-memory dictionary** called `idMappings`:

```javascript
let idMappings = {};  // Store oldId -> newId mappings

// After each successful Project INSERT:
idMappings[oldProductId] = newProjectId;  // e.g., idMappings[1] = 26
```

This dictionary is the **backbone of the entire migration** - every subsequent step (ProjectLocalization, ProjectItem, Media, LinkSetting, EntityContent) uses `idMappings` to link new records back to the correct Project.

At the end of migration, `idMappings` is persisted to two files:
1. **`ProductsMapping.json`** - Full mapping with metadata
2. **`ProjectId.json`** - Simple FK mapping for downstream migrations

---

### 1️⃣ Table: **Project**

#### INSERT Query

```sql
INSERT INTO Project (
  Name, ProjectType, KupatFundNo, DisplayAsSelfView,
  RecordStatus, StatusChangedAt, StatusChangedBy,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, TerminalId
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping

| Target Field (Project) | Source | Processing | Notes |
|------------------------|--------|------------|-------|
| **Name** | `products.Name` | `substring(0, 150)` | Limited to 150 chars |
| **ProjectType** | - | `1` (const) | Always 1 = Funds |
| **KupatFundNo** | `products.ProjectNumber` | Direct | Fund number |
| **DisplayAsSelfView** | `products.WithoutKupatView` | Direct | Self view display? |
| **RecordStatus** | - | `2` (const) | 2 = Active |
| **StatusChangedAt** | `productsid` | FK mapping | From mapped date |
| **StatusChangedBy** | - | `-1` (const) | System |
| **CreatedAt** | `productsid` | FK mapping | From `ProductCreatedDate.json` |
| **CreatedBy** | - | `-1` (const) | System |
| **UpdatedAt** | - | `GETDATE()` | Now |
| **UpdatedBy** | - | `-1` | System |
| **TerminalId** | `products.Terminal` | FK mapping | 1→1, 4→2 |

#### FK Mapping: ProductCreatedDate.json

```json
{
  "metadata": {
    "generatedAt": "2025-12-31T06:56:55.557Z",
    "totalProducts": 1954,
    "startDate": "2020-12-31T06:56:55.550Z",
    "endDate": "2031-09-11T06:56:55.550Z",
    "incrementDays": 2
  },
  "mapping": {
    "1": { "CreatedAt": "2020-12-31T06:56:55.550Z", "index": 0, "daysFromStart": 0 },
    "2": { "CreatedAt": "2021-01-02T06:56:55.550Z", "index": 1, "daysFromStart": 2 },
    "3": { "CreatedAt": "2021-01-04T06:56:55.550Z", "index": 2, "daysFromStart": 4 },
    ...
  }
}
```

**Format**: Each entry is an **object** with `CreatedAt` (ISO date string), `index`, and `daysFromStart`. The server code extracts the `CreatedAt` property from each object.

**Logic**: Each ProductId gets a unique date, starting from ~5 years ago (`2020-12-31`), +2 days per product.

**Rows Created**: **1,271**

---

### 2️⃣ Table: **ProjectLocalization**

#### INSERT Query (Executed 3 times per Project)

```sql
INSERT INTO ProjectLocalization (
  ProjectId, Language,
  Title, Description, DisplayInSite, RecruitmentTarget,
  HideDonationsInSite, OrderInProjectsPageView,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping - Hebrew (LanguageId = 1)

| Field | Source | Expression | Notes |
|-------|--------|------------|-------|
| **ProjectId** | - | `newProjectId` | From created Project |
| **Language** | - | `1` | Hebrew |
| **Title** | `Name` | `substring(0, 150)` | |
| **Description** | `ShortDescription` | Direct | |
| **DisplayInSite** | `Hide, ShowMainPage` | `(!Hide && ShowMainPage) ? 1 : 0` | |
| **RecruitmentTarget** | `Price` | `(value === 0 \|\| null) ? null : value` | Recruitment goal |
| **HideDonationsInSite** | `HideDonationAmount` | Direct | |
| **OrderInProjectsPageView** | `Sort` | `value <= 30 ? value : null` | Only top 30 |

#### Field Mapping - English (LanguageId = 2)

| Field | Source | Expression | Fallback |
|-------|--------|------------|----------|
| **Title** | `Name_en` | `substring(0, 150)` | If null → `Name` (Hebrew) |
| **Description** | `ShortDescription_en` | Direct | |
| **DisplayInSite** | `Hide_en, ShowMainPage` | `(!Hide_en && ShowMainPage) ? 1 : 0` | |
| **RecruitmentTarget** | `Price_en` | `(value === 0 \|\| null) ? null : value` | |
| **HideDonationsInSite** | `HideDonationAmount` | Direct | Same source for all languages |

#### Field Mapping - French (LanguageId = 3)

Same as English, but with `_fr` instead of `_en`.

**Note**: `HideDonationsInSite` uses the **same Hebrew source field** (`HideDonationAmount`) for all 3 languages - there are no `_en` / `_fr` variants for this field.

**Rows Created**: **3,813** (1,271 × 3)

---

### 3️⃣ Table: **ProjectItem**

#### INSERT Query (1 item per Fund)

```sql
INSERT INTO ProjectItem (
  ProjectId, ItemName, ItemType, PriceType,
  HasEngravingName, AllowFreeAddPrayerNames,
  RecordStatus, StatusChangedAt, StatusChangedBy,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping

| Field | Source | Value | Notes |
|-------|--------|-------|-------|
| **ProjectId** | - | `newProjectId` | Link to Project |
| **ItemName** | `Name` | `substring(0, 150)` | |
| **ItemType** | - | `5` (const) | 5 = FundDonation |
| **PriceType** | - | `2` (const) | 2 = Free amount |
| **HasEngravingName** | - | `0` | No engraving |
| **AllowFreeAddPrayerNames** | `ShowPrayerNames` | `value ? 1 : 0` | |
| **RecordStatus** | - | `2` | Active |
| **CreatedAt** | - | `GETDATE()` | |

**Rows Created**: **1,271**

---

### 4️⃣ Table: **ProjectItemLocalization**

#### INSERT Query (3 per ProjectItem)

```sql
INSERT INTO ProjectItemLocalization (
  ItemId, Language,
  DisplayInSite, Title, PaymentSum, DefaultPaymentType, DefaultPaymentsCount,
  NameForReceipt, OrderInItemsPageView, OrderInProjectPageFooter,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping - Hebrew (LanguageId = 1)

| Field | Source | Expression | Notes |
|-------|--------|------------|-------|
| **ItemId** | - | `newItemId` | From ProjectItem |
| **Language** | - | `1` | Hebrew |
| **DisplayInSite** | `Hide, ShowMainPage` | `(!Hide && ShowMainPage) ? 1 : 0` | |
| **Title** | `ProjectNameForDonationPage` | If different from Name → this, else Name | Title for donation page |
| **PaymentSum** | `DefaultDonationSumFixed, DefaultPaymentsNumFixed, DefaultDonationsSum` | `DefaultDonationSumFixed > 0 ? (DefaultDonationSumFixed * DefaultPaymentsNumFixed) : DefaultDonationsSum` | Total payment amount |
| **DefaultPaymentType** | `DefaultDonationSumFixed` | `DefaultDonationSumFixed > 0 ? 1 : 2` | 1=Fixed, 2=Free |
| **DefaultPaymentsCount** | `DefaultPaymentsNumFixed, DefaultPaymentsNumber` | `DefaultDonationSumFixed > 0 ? DefaultPaymentsNumFixed : DefaultPaymentsNumber` | Number of payments |
| **NameForReceipt** | `ProjectNameForInvoice` | `substring(0, 150)` | Name for receipt |
| **OrderInItemsPageView** | `Sort` | `value <= 30 ? value : null` | |
| **OrderInProjectPageFooter** | - | `1` (const) | |

#### Field Mapping - English (LanguageId = 2)

| Field | Source | Expression | Fallback |
|-------|--------|------------|----------|
| **DisplayInSite** | `Hide_en, ShowMainPage` | `(!row.Hide_en && row.ShowMainPage) ? 1 : 0` | |
| **Title** | `Name_en` | `value.substring(0, 150)` | If null → `Name` (Hebrew) |
| **PaymentSum** | `DefaultDonationSumFixed_en` + others | See below | Falls back to Hebrew via `\|\|` |
| **DefaultPaymentType** | `DefaultDonationSumFixed_en` | See below | Falls back to Hebrew |
| **DefaultPaymentsCount** | `DefaultDonationSumFixed_en` | See below | Falls back to Hebrew |
| **NameForReceipt** | `ProjectNameForInvoice_en` | `value.substring(0, 150)` | |

**PaymentSum fallback logic** (English/French):
```javascript
// Try language-specific values first, fall back to Hebrew via JavaScript || operator
(row.DefaultDonationSumFixed_en > 0
  ? (row.DefaultDonationSumFixed_en * (row.DefaultPaymentsNumFixed_en || 1))
  : row.DefaultDonationsSum_en)
|| (row.DefaultDonationSumFixed > 0
  ? (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1))
  : row.DefaultDonationsSum)
```

**Important**: The `||` operator means that if the English/French value evaluates to `0` (falsy), it will fall back to the Hebrew value. This is intentional behavior.

#### Field Mapping - French (LanguageId = 3)

Same structure as English, but with `_fr` suffix instead of `_en`.

**Rows Created**: **3,813** (1,271 × 3)

---

### 5️⃣ Table: **Media**

#### INSERT Query (Up to 3 per language)

```sql
INSERT INTO Media (
  ProjectId, LanguageId, RelativePath,
  YearDirectory, MonthDirectory, SourceType, MediaType,
  FriendlyName, MatchToPlatform, RecordStatus,
  StatusChangedAt, StatusChangedBy, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Media Types (per language):

##### 5.1 Project Image (projectImage)

| Field | Value | Notes |
|-------|-------|-------|
| **RelativePath** | `Pic` / `Pic_en` / `Pic_fr` | Adds prefix: `2020/01/` |
| **MediaType** | `1` | Image |
| **SourceType** | `1` | Legacy |
| **MatchToPlatform** | `3` | All platforms |
| **condition** | `row.Pic != null && row.Pic != ''` | Only if exists |

##### 5.2 Project Video (projectVideo)

| Field | Value |
|-------|-------|
| **RelativePath** | `ProjectVideo` / `ProjectVideo_en` / `ProjectVideo_fr` |
| **MediaType** | `2` (video) |

##### 5.3 Donation Banner (donationBanner)

| Field | Value |
|-------|-------|
| **RelativePath** | `DonationPageBanner1` / `_en` / `_fr` |
| **MediaType** | `1` (image) |

**Rows Created**: **~2,000** (Depends on actual images/videos in data)

#### FK Updates After Media Creation

```sql
-- Update Project
UPDATE Project
SET MainMedia = ?, ImageForListsView = ?
WHERE Id = ?

-- Update ProjectLocalization (3 languages)
UPDATE ProjectLocalization
SET MainMedia = ?, ImageForListsView = ?
WHERE ProjectId = ? AND Language = ?

-- Update ProjectItem
UPDATE ProjectItem
SET MainMedia = ?, ImageForListsView = ?
WHERE Id = ?

-- Update ProjectItemLocalization (3 languages)
UPDATE ProjectItemLocalization
SET MainMedia = ?, ImageForListsView = ?
WHERE ItemId = ? AND Language = ?
```

---

### 6️⃣ Table: **LinkSetting** (Main Donation Button)

#### INSERT Query (3 per Project)

```sql
INSERT INTO LinkSetting (
  LinkType, LinkTargetType, ProjectId, ItemId, LinkText,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping

| Field | Value | Notes |
|-------|-------|-------|
| **LinkType** | `1` | 1 = Button |
| **LinkTargetType** | `3` | 3 = Link to Execution Page |
| **ProjectId** | `newProjectId` | |
| **ItemId** | `itemId` | The FundDonation created |
| **LinkText** | `'לתרומה'` / `'Donate'` / `'Pour faire un don'` | By language |
| **CreatedAt** | `NOW()` | |
| **CreatedBy** | `1` | System user |

**Creation Order**: Hebrew (1), French (3), English (2)

**Rows Created**: **3,813** (1,271 × 3)

#### FK Update in ProjectLocalization

```sql
UPDATE ProjectLocalization
SET MainLinkButtonSettingId = ?
WHERE ProjectId = ? AND Language = ?
```

**Updates**: **3,813**

---

### 7️⃣ Table: **LinkSetting** (List View)

#### INSERT Query (3 more per Project)

```sql
INSERT INTO LinkSetting (
  LinkType, LinkTargetType, ProjectId, ItemId, LinkText,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping

| Field | Value | Notes |
|-------|-------|-------|
| **LinkType** | `3` | 3 = List View Link |
| **LinkTargetType** | `1` | 1 = Link to Project Page |
| **ProjectId** | `newProjectId` | |
| **ItemId** | `null` | No item (project-level link) |
| **LinkText** | `null` | No text (display handled by UI) |
| **CreatedBy** | `1` | System user |
| **UpdatedBy** | `1` | System user |

**Rows Created**: **3,813** more (1,271 × 3)

**Total LinkSetting**: **7,626** (3,813 + 3,813)

#### FK Update in ProjectLocalization

```sql
UPDATE ProjectLocalization
SET LinkSettingIdInListView = ?
WHERE ProjectId = ? AND Language = ?
```

**Updates**: **3,813**

---

### 8️⃣ Table: **EntityContent**

#### INSERT Query (3 per Project)

```sql
INSERT INTO EntityContent (
  Name, IsTemplate,
  CreatedAt, CreatedBy
) VALUES (?, ?, ?, ?)
```

#### Field Mapping

| Field | Value | Notes |
|-------|-------|-------|
| **Name** | `null` | |
| **IsTemplate** | `0` | Not a template |
| **CreatedAt** | `NOW()` | |
| **CreatedBy** | `1` | System user |

**Note**: The content text is stored in the **EntityContentItem** child table (see below), not in EntityContent itself.

**Data Source**: A separate query fetches `Description`, `Description_en`, `Description_fr` from the `products` table for each product. Only rows where the description is **not empty** generate EntityContent records.

**Condition**: Only if `Description` (NOT `ShortDescription`) is not empty for the given language!

**Rows Created**: **~3,813** (Depends on actual descriptions in data)

---

### 9️⃣ Table: **EntityContentItem**

#### INSERT Query (1 per EntityContent)

```sql
INSERT INTO EntityContentItem (
  ContentId, ItemType, ItemDefinition, Name,
  CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

#### Field Mapping

| Field | Value | Notes |
|-------|-------|-------|
| **ContentId** | `contentId` (from created EntityContent) | FK to EntityContent |
| **ItemType** | `11` | Content item type |
| **ItemDefinition** | `JSON.stringify({ Text: description })` | JSON format wrapping the HTML description |
| **Name** | `null` | |
| **CreatedAt** | `NOW()` | |
| **CreatedBy** | `1` | System user |
| **UpdatedAt** | `NOW()` | |
| **UpdatedBy** | `1` | System user |

**Note**: The description content (from `Description` / `Description_en` / `Description_fr`) is stored as JSON in `ItemDefinition`, e.g.: `{"Text":"<p>content here...</p>"}`

**Rows Created**: **~3,813**

#### FK Update in ProjectLocalization

```sql
UPDATE ProjectLocalization
SET ContentId = ?
WHERE ProjectId = ? AND Language = ?
```

**Updates**: **~3,813**

---

## 📊 Quantity Summary

### Tables with INSERT (New Row Creation)

| # | Table | Rows | Calculation |
|---|-------|------|-------------|
| 1 | Project | 1,271 | 1 per Fund |
| 2 | ProjectLocalization | 3,813 | 1,271 × 3 languages |
| 3 | ProjectItem | 1,271 | 1 per Fund |
| 4 | ProjectItemLocalization | 3,813 | 1,271 × 3 languages |
| 5 | Media | ~2,000 | Depends on data |
| 6 | LinkSetting (button) | 3,813 | 1,271 × 3 languages |
| 7 | LinkSetting (list) | 3,813 | 1,271 × 3 languages |
| 8 | EntityContent | ~3,813 | Depends on descriptions |
| 9 | EntityContentItem | ~3,813 | 1 per Content |
| | **Total New Rows** | **~27,420** | |

### Tables with UPDATE (Existing Row Updates)

| # | Table | Updated Field | Updates | Notes |
|---|-------|--------------|---------|-------|
| 1 | Project | MainMedia, ImageForListsView | ~1,271 | 1 per project (Hebrew media) |
| 2 | ProjectLocalization | MainMedia, ImageForListsView | ~3,813 | 3 languages × 1,271 projects |
| 3 | ProjectLocalization | MainLinkButtonSettingId | 3,813 | 3 languages × 1,271 projects |
| 4 | ProjectLocalization | LinkSettingIdInListView | 3,813 | 3 languages × 1,271 projects |
| 5 | ProjectLocalization | ContentId | ~3,813 | Only where description exists |
| 6 | ProjectItem | MainMedia, ImageForListsView | ~1,271 | 1 per item (Hebrew media) |
| 7 | ProjectItemLocalization | MainMedia, ImageForListsView | ~3,813 | 3 languages × 1,271 items |
| 8 | ProjectItemLocalization | ImageForListsView (projectImage only) | ~3,813 | Separate pass: only projectImage media |
| | **Total Updates** | | **~25,420** | |

### Total DB Operations

**INSERT**: ~27,420 rows
**UPDATE**: ~25,420 updates
**TOTAL**: **~52,840 operations**

---

## 🗂️ Helper Files

### ProductCreatedDate.json

```json
{
  "metadata": {
    "generatedAt": "2025-12-31T06:56:55.557Z",
    "totalProducts": 1954,
    "minProductId": 1,
    "maxProductId": 2092,
    "startDate": "2020-12-31T06:56:55.550Z",
    "endDate": "2031-09-11T06:56:55.550Z",
    "incrementDays": 2,
    "description": "ProductId -> CreatedAt mapping. Each ProductId gets a date 2 days after the previous one."
  },
  "mapping": {
    "1": { "CreatedAt": "2020-12-31T06:56:55.550Z", "index": 0, "daysFromStart": 0 },
    "2": { "CreatedAt": "2021-01-02T06:56:55.550Z", "index": 1, "daysFromStart": 2 },
    "3": { "CreatedAt": "2021-01-04T06:56:55.550Z", "index": 2, "daysFromStart": 4 },
    ...
  }
}
```

**Location**: `data/fk-mappings/ProductCreatedDate.json`

### ProductsMapping.json (Created at End of Migration)

```json
{
  "metadata": {
    "createdAt": "2026-01-22T19:18:31.010Z",
    "lastUpdated": "2026-01-22T19:18:31.082Z",
    "totalProducts": 1954,
    "migratedInThisRun": 1271
  },
  "mapping": {
    "1": {
      "ProductsId": 1,
      "Name": "משפחת פרץ",
      "ProjectId": 26,
      "ProjectType": 1,
      "ProjectItemIds": [
        {
          "Id": 40,
          "ItemName": "Item",
          "ItemType": null
        }
      ],
      "Status": "MIGRATED",
      "Note": "1 items, ProjectType=1",
      "LastUpdated": "2026-01-22T19:18:31.074Z"
    },
    ...
  }
}
```

**Note**: The `ProjectId` values are auto-incremented by MySQL and depend on existing data in the target database. They do NOT start at 1.

**Location**: `data/fk-mappings/ProductsMapping.json`

---

### ProjectId.json (Critical FK Mapping - Created at End of Migration)

This file provides the **simple old-to-new ID mapping** that downstream migrations (Recruiters, Donations) depend on.

```json
{
  "columnName": "ProjectId",
  "sourceTable": "Products",
  "targetTable": "project",
  "keyColumn": "productsid",
  "description": "Mapping from old Products.ProductsId to new project.Id (AUTO_INCREMENT)",
  "totalMappings": 1989,
  "mappings": {
    "1": 1297,
    "2": 1298,
    "3": 1299,
    "4": 1300,
    "5": 1301,
    ...
  },
  "createdAt": "2026-01-22T...",
  "lastUpdated": "2026-01-22T..."
}
```

**Key**: old `products.productsid` → **Value**: new `project.Id`

**CRITICAL**: This mapping is **merged** with existing mappings on each run (not overwritten), so it accumulates mappings from Funds + Collections migrations.

**Location**: `data/fk-mappings/ProjectId.json`

---

## 🔍 Verification Queries

### Check Quantities After Migration

```sql
-- Check Project
SELECT COUNT(*) FROM Project WHERE ProjectType = 1;
-- Expected: 1,271

-- Check ProjectLocalization
SELECT COUNT(*) FROM ProjectLocalization
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- Expected: 3,813

-- Check ProjectItem
SELECT COUNT(*) FROM ProjectItem
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- Expected: 1,271

-- Check LinkSetting
SELECT COUNT(*) FROM LinkSetting
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- Expected: 7,626 (2 types × 3 languages × 1,271)

-- Check Media
SELECT COUNT(*) FROM Media
WHERE ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1);
-- Expected: ~2,000

-- Check EntityContent (linked via ProjectLocalization.ContentId)
SELECT COUNT(*) FROM EntityContent ec
WHERE ec.Id IN (
  SELECT pl.ContentId FROM ProjectLocalization pl
  WHERE pl.ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1)
    AND pl.ContentId IS NOT NULL
);
-- Expected: ~3,813
```

### Verify ID Mapping Files

```bash
# Check ProductsMapping.json
node -e "const m = require('./data/fk-mappings/ProductsMapping.json'); console.log('Total:', m.metadata.totalProducts, 'Migrated:', m.metadata.migratedInThisRun)"

# Check ProjectId.json
node -e "const m = require('./data/fk-mappings/ProjectId.json'); console.log('Total mappings:', m.totalMappings); const entries = Object.entries(m.mappings); console.log('Sample:', entries.slice(0,5).map(([k,v]) => k+'->'+v).join(', '))"
```

### Check FK Integrity

```sql
-- Check ProjectLocalization is linked to LinkSetting
SELECT COUNT(*) FROM ProjectLocalization pl
WHERE pl.ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1)
  AND pl.MainLinkButtonSettingId IS NULL;
-- Expected: 0 (everything should be linked)

-- Check ProjectLocalization is linked to Media
SELECT COUNT(*) FROM ProjectLocalization pl
WHERE pl.ProjectId IN (SELECT Id FROM Project WHERE ProjectType = 1)
  AND pl.MainMedia IS NULL;
-- Depends on number of Funds with images

-- Check ProjectItem is linked to valid Project
SELECT COUNT(*) FROM ProjectItem pi
LEFT JOIN Project p ON pi.ProjectId = p.Id
WHERE p.Id IS NULL;
-- Expected: 0 (no orphans allowed)
```

---

## ⚠️ Known Issues and Solutions

### Issue 1: NULL Title

**Description**: In rare cases `Name` can be NULL
**Solution** (implemented in mapping):
```javascript
expression: "value ? value.substring(0, 150) : 'No Translation'"
defaultValue: "No Translation"
```

### Issue 2: Inconsistent convertType (STILL OPEN)

**Description**: `OrderInProjectsPageView` is defined as `convertType: "direct"` but also has an `expression` field in the mapping JSON. The server applies expressions regardless of `convertType`, so the behavior is correct in practice, but the mapping definition is inconsistent.

**Status**: NOT YET FIXED in `ProjectMapping_Funds_Fixed.json`

**Recommended Fix**: Change to `convertType: "expression"` in all 3 language entries.

### Issue 3: Complex PaymentSum

**Description**: PaymentSum calculation depends on 3 fields and includes fallback logic for English/French
**Hebrew Solution**:
```javascript
expression: "row.DefaultDonationSumFixed > 0 ?
  (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1)) :
  row.DefaultDonationsSum"
```
**English/French Solution** (with Hebrew fallback):
```javascript
expression: "(langSpecificValue) || (hebrewValue)"
// Falls back to Hebrew if language-specific value is 0/null/undefined
```

### Issue 4: EntityContent uses Description, not ShortDescription

**Description**: The EntityContent migration queries `Description`, `Description_en`, `Description_fr` fields (full HTML content) - NOT the `ShortDescription` fields used in ProjectLocalization. These are different source fields.

---

## 🚀 Running the Migration

### Method 1: UI

1. Open browser: `http://localhost:3030`
2. Click **"Load Mapping"**
3. Select **"ProjectMapping_Funds_Fixed.json"**
4. Click **"Connection Settings & Migration"**
5. Wait for completion (expected: ~2-3 minutes)

### Method 2: Direct Script

```bash
cd legacy
node scripts/run-funds-migration.js
```

### Method 3: Direct API

```bash
curl -X POST http://localhost:3030/api/migrate \
  -H "Content-Type: application/json" \
  -d @mappings/ProjectMapping_Funds_Fixed.json
```

---

## 📁 Related Files

| File | Description |
|------|-------------|
| [`ProjectMapping_Funds_Fixed.json`](../mappings/ProjectMapping_Funds_Fixed.json) | Main mapping file |
| [`server.js`](../src/server.js) | Migration logic (lines 1650-3400) |
| [`database.js`](../config/database.js) | Database connection settings |
| [`ProductCreatedDate.json`](../data/fk-mappings/ProductCreatedDate.json) | Date mappings |
| [`ProductsMapping.json`](../data/fk-mappings/ProductsMapping.json) | Full products → projects mapping (output) |
| [`ProjectId.json`](../data/fk-mappings/ProjectId.json) | Simple old→new ID FK mapping (output, critical for downstream) |
| [`run-funds-migration.js`](../scripts/run-funds-migration.js) | Execution script |

---

## 📞 Support and Troubleshooting

### Logs

Log file: `migration.log`

```bash
# View log in real-time
tail -f migration.log

# Search for errors
grep ERROR migration.log
```

### Common Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| "Connection timeout" | MSSQL unavailable | Check `database.js` |
| "Duplicate entry" | Migration already ran | Clear tables or use `clear-tables.js` |
| "FK constraint fails" | Wrong migration order | Ensure Project is created before ProjectLocalization |
| "NULL title" | Empty Name in source | Check expression fallback |

---

## ✅ Post-Migration Checklist

- [ ] Project: 1,271 rows
- [ ] ProjectLocalization: 3,813 rows
- [ ] ProjectItem: 1,271 rows
- [ ] ProjectItemLocalization: 3,813 rows
- [ ] Media: >0 rows
- [ ] LinkSetting: 7,626 rows
- [ ] EntityContent: >0 rows
- [ ] EntityContentItem: >0 rows
- [ ] `ProductsMapping.json` created with correct structure
- [ ] `ProjectId.json` created/updated with old→new ID mappings
- [ ] No errors in `migration.log`
- [ ] All FKs are properly linked
- [ ] `ProjectId.json` has correct `totalMappings` count

---

**Last Updated**: 2026-01-29
**Version**: 2.0 (Revised - corrected EntityContent/EntityContentItem schema, ProductCreatedDate format, ProductsMapping format, added ProjectId.json, fixed update counts)
**Author**: Claude Code Migration System
