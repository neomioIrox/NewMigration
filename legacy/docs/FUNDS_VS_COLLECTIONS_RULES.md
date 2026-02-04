# Funds vs Collections Migration Rules

**Date Created:** December 30, 2025
**Last Updated:** December 30, 2025

---

## Overview

This document defines the exact business rules for classifying Products from the old database as either **Funds (ProjectType=1)** or **Collections (ProjectType=2)** in the new database.

---

## Business Rules

### Products Classification Logic

All Products in the old database must be classified into one of two categories:

#### 1. Funds (ProjectType = 1)

**Definition:** Individual, standalone fundraising projects that are NOT certificates, NOT part of a group, and NOT referenced in News.

**SQL Criteria:**
```sql
SELECT * FROM Products p
WHERE
  -- Not a certificate
  IsNull([Certificate], 0) != 1

  -- Not in any ProductGroup (neither parent nor child)
  AND NOT EXISTS (
    SELECT 1 FROM ProductGroup g
    WHERE g.ParentProductId = p.productsid
       OR g.SubProductId = p.productsid
  )

  -- Not referenced in any News article
  AND NOT EXISTS (
    SELECT 1 FROM News
    WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
       OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
       OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
  )
```

**Expected Count:** ~1,271 Products (as of Dec 2025)

---

#### 2. Collections (ProjectType = 2)

**Definition:** Products that represent grouped campaigns, certificates, or are prominently featured in News.

**SQL Criteria (any ONE of the following):**

1. **Certificate Products:**
   ```sql
   Certificate = 1
   ```
   - Count: 231 Products
   - Examples: Gift certificates, donation certificates

2. **ProductGroup Members:**
   ```sql
   EXISTS (
     SELECT 1 FROM ProductGroup g
     WHERE g.ParentProductId = p.productsid
        OR g.SubProductId = p.productsid
   )
   ```
   - Count: 476 Products
   - Examples: Grouped fundraising campaigns

3. **News Referenced Products:**
   ```sql
   EXISTS (
     SELECT 1 FROM News
     WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
        OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
        OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), p.productsid) + '&%'
   )
   ```
   - Count: 457 Products (181 unique after overlap)
   - Examples: Featured campaigns in news articles

**Total Collections Count:** ~683 Products (231 + 476 + 181 - overlaps)

---

## Migration Implementation

### Funds Migration

**File:** [mappings/ProjectMapping_Funds_Fixed.json](../mappings/ProjectMapping_Funds_Fixed.json)

**WHERE Clause:**
```sql
IsNull([Certificate],0) != 1
AND NOT EXISTS (
  SELECT 1 FROM ProductGroup g WITH (NOLOCK)
  WHERE g.ParentProductId=products.productsid
     OR g.SubProductId=products.productsid
)
AND NOT EXISTS (
  SELECT 1 FROM News
  WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
     OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
     OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
)
```

**Target Table:** `project` with `ProjectType = 1`

**Script:** [scripts/run-funds-migration.js](../scripts/run-funds-migration.js)

---

### Collections Migration

**File:** [mappings/ProjectMapping_Collections_Fixed.json](../mappings/ProjectMapping_Collections_Fixed.json)

**WHERE Clause:**
```sql
IsNull([Certificate],0) = 1
OR EXISTS (
  SELECT 1 FROM ProductGroup g WITH (NOLOCK)
  WHERE g.ParentProductId=products.productsid
     OR g.SubProductId=products.productsid
)
OR EXISTS (
  SELECT 1 FROM News
  WHERE content1 LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
     OR content1_en LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
     OR content1_fr LIKE '%pid=' + CONVERT(NVARCHAR(50), products.productsid) + '&%'
)
```

**Target Table:** `project` with `ProjectType = 2`

---

## Database Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Products** | 1,954 | 100% |
| **Funds (Type 1)** | 1,271 | 65.0% |
| **Collections (Type 2)** | 683 | 35.0% |

### Collections Breakdown

| Category | Count | Notes |
|----------|-------|-------|
| Certificate Products | 231 | `Certificate = 1` |
| ProductGroup Members | 476 | Referenced in ProductGroup table |
| News Referenced | 181 | Unique products after overlap |
| **Total Collections** | 683 | Some products meet multiple criteria |

---

## Critical Bug Fixed (Dec 30, 2025)

### Issue
The original Funds WHERE clause was **missing the News check**, causing 181 Products to be wrongly classified as Funds when they should be Collections.

### Impact
- **Before Fix:** 1,452 Products → Funds
- **After Fix:** 1,271 Products → Funds
- **Prevented:** 181 misclassifications

### Examples of Affected Products

| ID | Name | Why It's a Collection |
|----|------|----------------------|
| 13 | קרן יתומי משפחת כהן | Referenced in News 15 |
| 28 | מתנות לאביונים | Referenced in 9 News articles |
| 77 | מגבית בהוראת מרן שר התורה הגר"ח קניבסקי שליט''א | Referenced in 8 News articles |
| 296 | מיוחד!!! רשכבה''ג מרן הגר''ח קניבסקי במכתב בכתי"ק... | Referenced in 14 News articles |

---

## Validation Scripts

### 1. Check Funds Validation
**File:** [scripts/checks/check-funds-validation.js](../scripts/checks/check-funds-validation.js)

**Purpose:** Quick overview of Products counts and News table contents

**Usage:**
```bash
node scripts/checks/check-funds-validation.js
```

---

### 2. Find Products in News
**File:** [scripts/checks/find-products-in-news.js](../scripts/checks/find-products-in-news.js)

**Purpose:** Detailed analysis of which Products are referenced in News

**Usage:**
```bash
node scripts/checks/find-products-in-news.js
```

**Output:**
- Lists all Products referenced in News (457 total)
- Shows which News articles reference each Product
- Identifies Products wrongly classified as Funds (181)

---

### 3. Check Funds/News Mismatch
**File:** [scripts/checks/check-funds-news-mismatch.js](../scripts/checks/check-funds-news-mismatch.js)

**Purpose:** Compare old and new WHERE clauses

**Usage:**
```bash
node scripts/checks/check-funds-news-mismatch.js
```

---

## News Reference Format

Products are considered "referenced in News" if the News content contains a link in this format:

```
pid=<ProductsId>&
```

### Examples:
- Hebrew: `content1 LIKE '%pid=13&%'`
- English: `content1_en LIKE '%pid=296&%'`
- French: `content1_fr LIKE '%pid=77&%'`

### Why This Matters
Products linked in News are typically:
- Featured campaigns
- Special fundraising drives
- High-priority initiatives
- Celebrity/Rabbi-endorsed projects

These should be grouped as **Collections** (ProjectType=2) for visibility and special handling in the new system.

---

## Migration Order

To maintain referential integrity:

1. **First:** Migrate Funds (Type 1)
   - Run: `node scripts/run-funds-migration.js`
   - Creates: `project` records with ProjectType=1

2. **Second:** Migrate Collections (Type 2)
   - Run: `node scripts/run-collections-migration.js`
   - Creates: `project` records with ProjectType=2

3. **Verify:** No overlaps
   ```sql
   -- Should return 0
   SELECT COUNT(*) FROM project
   GROUP BY Id
   HAVING COUNT(*) > 1
   ```

---

## References

- Original requirement: User request on Dec 30, 2025
- Bug discovered: Dec 30, 2025 during analysis
- Fix implemented: Dec 30, 2025
- Documentation created: Dec 30, 2025

---

*End of document*
