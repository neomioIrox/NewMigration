# תכנית מיגרציית Donation - החלטות סופיות

**תאריך:** 27 נובמבר 2025
**טבלה:** Orders → donation
**סה"כ רשומות:** 1,065,393

---

## 📊 סיכום נתונים

| קטגוריה | כמות | אחוז | תכנון |
|---------|------|------|-------|
| **A: ProjectId תקין** | 813,949 | 76.4% | ✅ Phase 3 |
| **B: PrayerId תקין** | 38,149 | 3.6% | ✅ Phase 5 (אחרי Prayer) |
| **C: Orphaned** | 213,295 | 20.0% | ✅ Phase 3 (ItemId=1) |
| **סה"כ** | 1,065,393 | 100% | |

---

## ✅ החלטות שהתקבלו

### 1️⃣ **Prayer Migration - לבצע לפני Donation** ⭐
**החלטה:** מגרר Prayers → project לפני שמתחילים Donation

**סיבה:** 38,149 Orders תלויים ב-PrayerId

**שלבים:**
```
1. מגרר Prayers → project (ProjectType=3)
2. ליצור ProjectItem לכל Prayer (ItemType=3)
3. לשמור מיפוי: PrayerId → ProjectItemId
4. להשתמש במיפוי במהלך Donation migration
```

**קבצים שיווצרו:**
- `scripts/migration/migrate-prayers.js`
- `data/fk-mappings/PrayerProjectItemId.json`

---

### 2️⃣ **Orphaned Orders - ItemId=1 (ברירת מחדל)** ✅
**החלטה:** כל 213,295 Orders ללא Project/Prayer יקבלו ItemId=1

**הסבר:**
- ItemId=1 = "קרן קופת העיר" (default fund)
- בדיוק כמו שהמיפוי המקורי אומר
- כל התרומות נשמרות במערכת

**קוד:**
```javascript
if (!projectId && !prayerId) {
  ItemId = 1;  // Default: קרן קופת העיר
}
```

---

### 3️⃣ **CustomerUser Migration - לבצע לפני Donation** ⭐
**החלטה:** מגרר Users → user לפני Donation

**סיבה:** 16,767 Orders תלויים ב-UserId

**שלבים:**
```
1. מגרר Users → user (עם RoleId מתאים)
2. לשמור מיפוי: oldUserId → newUserId
3. להשתמש במיפוי במהלך Donation migration
```

**קבצים שיווצרו:**
- `scripts/migration/migrate-customerusers.js`
- `data/fk-mappings/CustomerUserId.json`

**הערות:**
- להשתמש בגישת Smart Skip (כמו במיגרציית Affiliates)
- לבדוק קיום User לפני INSERT

---

### 4️⃣ **Address - יצירה Inline במהלך Donation** ✅
**החלטה:** ניצור Address records במהלך מיגרציית Donation

**לוגיקה:**
```javascript
// For ReceiptAddress (billing)
if (BillingStreet || BillingCity) {
  const addressId = await createAddressIfNotExists({
    street: BillingStreet,
    city: BillingCity,
    country: BillingCountry,
    zip: BillingZip
  });
  ReceiptAddress = addressId;
}

// For ShippingAddress (certificate/shipping)
if (CertificateStreet || ShippingStreet) {
  const addressId = await createAddressIfNotExists({
    street: CertificateStreet || ShippingStreet,
    city: CertificateCity || ShippingCity,
    country: CertificateCountry || ShippingCountry,
    zip: CertificateZip || ShippingZip
  });
  ShippingAddress = addressId;
}
```

**יתרונות:**
- ✅ אין duplicates (check existing)
- ✅ Address מתואם מושלם לתרומות
- ✅ חיסכון בזמן (אין מיגרציה נפרדת)

---

### 5️⃣ **שדות חסרים במיפוי - פתרונות**

#### **TreatStatus (NOT NULL) - ערך קבוע: 1**
```javascript
TreatStatus = 1  // תמיד 1
```

#### **DisplayCurrency (NOT NULL) - זהה ל-Currency**
```javascript
DisplayCurrency = Currency
```

#### **DisplayMonthlySum (NOT NULL) - זהה ל-MonthlySum**
```javascript
DisplayMonthlySum = MonthlySum
```

#### **LanguageId (NULL) - לפי OrderLanguage**
```javascript
LanguageId = OrderLanguage === 'he' ? 1
           : OrderLanguage === 'en' ? 2
           : OrderLanguage === 'fr' ? 3
           : NULL
```

**התאמה ל-lutlanguage:**
```sql
SELECT * FROM lutlanguage;
-- 1 = Hebrew
-- 2 = English
-- 3 = French
```

#### **שדות נוספים - NULL**
```javascript
ClearingMethodTerminalNum = NULL  // לא ברור מאיפה
StatusReason = NULL               // לא רלוונטי לכל תרומה
DonorIdNumber = NULL              // אין בDB הישן
```

---

### 6️⃣ **ClearingMethodArea - מיפוי מורכב** 🔧
**החלטה:** לכתוב פונקציית מיפוי מפורטת עם כל 22 המקרים

**פונקציה:**
```javascript
function getClearingMethodId(paymentMethod, orderLanguage, chargeCurrency) {
  // Based on mapping lines 1207-1227

  if (paymentMethod === 'CreditCard') {
    if (orderLanguage === 'en' && chargeCurrency === '£') return 1;  // Stripe
    if (orderLanguage === 'en') return 3;                            // Authorize
    if (orderLanguage === 'he') return 2;                            // CardCom
    if (orderLanguage === 'fr') return 4;                            // PayLine
    return 22; // Other
  }

  if (paymentMethod === 'PayPal' || paymentMethod === ' PayPal') return 5;
  if (paymentMethod === 'NedarimPlus') return 6;
  if (paymentMethod === 'AsserBishvil') return 8;
  if (paymentMethod === 'Broom') return 9;
  if (paymentMethod === 'ThreePillars') return 10;
  if (paymentMethod === 'Cash') return 11;
  if (paymentMethod === 'Check') return 12;
  if (paymentMethod === 'BusinessCredit' && orderLanguage === 'he') return 16;
  if (paymentMethod === 'BankTransfer') return 19;
  if (paymentMethod === 'BankStandingOrder') return 20;
  if (paymentMethod === 'Bit') return 21;

  return 22; // Other
}

async function getClearingMethodAreaId(paymentMethod, orderLanguage, chargeCurrency) {
  const clearingMethodId = getClearingMethodId(paymentMethod, orderLanguage, chargeCurrency);

  // Map language to area
  const area = orderLanguage === 'he' ? 1  // Israel
             : orderLanguage === 'en' && chargeCurrency === '£' ? 3  // UK
             : orderLanguage === 'en' ? 2  // USA
             : orderLanguage === 'fr' ? 4  // France
             : 1;  // Default: Israel

  // Lookup ClearingMethodAreaId from table
  const [result] = await mysqlConn.query(
    'SELECT Id FROM clearingmethodarea WHERE ClearingMethodId = ? AND Area = ?',
    [clearingMethodId, area]
  );

  return result.length > 0 ? result[0].Id : NULL;
}
```

**מיפוי מלא:**
```
CreditCard + en + £  → 1 (Stripe)      + Area 3 (UK)
CreditCard + en      → 3 (Authorize)   + Area 2 (USA)
CreditCard + he      → 2 (CardCom)     + Area 1 (Israel)
CreditCard + fr      → 4 (PayLine)     + Area 4 (France)
PayPal               → 5 (PayPal)      + Area by language
NedarimPlus          → 6 (Nedarim)     + Area by language
AsserBishvil         → 8               + Area by language
Broom                → 9               + Area by language
ThreePillars         → 10              + Area by language
Cash                 → 11              + Area by language
Check                → 12              + Area by language
BusinessCredit + he  → 16              + Area 1 (Israel)
BankTransfer         → 19              + Area by language
BankStandingOrder    → 20              + Area by language
Bit                  → 21              + Area by language
Other                → 22              + Area by language
```

---

## 🎯 תכנית ביצוע מלאה

### **Phase 0: הכנות (עכשיו)**
```
✅ בדיקת תלויות - הושלם
✅ קבלת החלטות - הושלם
⏳ כתיבת תכנית מפורטת - בתהליך
```

### **Phase 1: Prayer Migration**
```
📋 משימות:
1. ✍️ כתיבת migrate-prayers.js
   - Prayers → project (ProjectType=3)
   - ProjectItem creation (ItemType=3)
   - ProjectItemLocalization (3 languages)

2. 🧪 Test migration (10 prayers)

3. 🚀 Production migration (294 prayers)
   - Expected: ~294 projects + 294 items

4. 💾 יצירת PrayerProjectItemId.json mapping

5. ✅ Verification
```

**משך זמן משוער:** 3-4 שעות

---

### **Phase 2: CustomerUser Migration**
```
📋 משימות:
1. ✍️ כתיבת migrate-customerusers.js
   - Users → user (with appropriate RoleId)
   - Smart skip logic (check existing)

2. 🧪 Test migration (100 users)

3. 🚀 Production migration (3,839 users)
   - Expected: ~3,839 new users
   - 82 existing → skip

4. 💾 יצירת CustomerUserId.json mapping

5. ✅ Verification
```

**משך זמן משוער:** 2-3 שעות

---

### **Phase 3: Donation Migration - Part 1 (Categories A + C)**
```
📋 משימות:
1. ✍️ כתיבת migrate-donations-main.js
   - Categories A (ProjectId) + C (Orphaned)
   - Address creation inline
   - ClearingMethodArea mapping
   - All field mappings

2. 🧪 Test migration (1,000 orders)
   - 800 Category A
   - 200 Category C

3. ✅ Verify test results
   - Check FKs
   - Check data integrity
   - Check addresses created

4. 🚀 Production Phase 1 (100,000 orders)
   - Checkpoint for verification

5. ✅ Verify Phase 1

6. 🚀 Production Phase 2 (remaining ~927,244 orders)

7. ✅ Final verification
```

**משך זמן משוער:** 2-3 ימים (כולל בדיקות)

**Expected results:**
- Category A: 813,949 donations
- Category C: 213,295 donations (ItemId=1)
- **Total: 1,027,244 donations**

---

### **Phase 4: Donation Migration - Part 2 (Category B - Prayer)**
```
📋 משימות:
1. ✍️ עדכון migrate-donations-prayer.js
   - Category B (PrayerId)
   - שימוש ב-PrayerProjectItemId.json

2. 🧪 Test migration (100 prayer orders)

3. 🚀 Production migration (38,149 orders)

4. ✅ Verification
```

**משך זמן משוער:** 4-6 שעות

**Expected results:**
- Category B: 38,149 donations
- **Grand Total: 1,065,393 donations** ✅

---

## 📝 רשימת קבצים שיווצרו

### Migration Scripts
```
scripts/migration/
├── migrate-prayers.js                    # Phase 1
├── migrate-customerusers.js              # Phase 2
├── migrate-donations-main.js             # Phase 3 (A+C)
└── migrate-donations-prayer.js           # Phase 4 (B)
```

### Helper Scripts
```
scripts/utils/
├── create-address.js                     # Address creation helper
├── get-clearing-method-area.js           # ClearingMethodArea lookup
├── clear-prayers.js                      # Cleanup helper
├── clear-customerusers.js                # Cleanup helper
└── clear-donations.js                    # Cleanup helper
```

### Check Scripts
```
scripts/checks/
├── check-prayers-data.js                 # Verify Prayers
├── check-customerusers-data.js           # Verify CustomerUsers
├── check-donations-data.js               # Verify Donations
└── check-donation-dependencies.js        # ✅ Already created
```

### FK Mappings (Generated)
```
data/fk-mappings/
├── PrayerProjectItemId.json              # Prayer → ProjectItemId
├── CustomerUserId.json                   # oldUserId → newUserId
└── DonationId.json                       # OrdersId → DonationId (optional)
```

### UI Pages
```
public/
├── prayer-migration.html                 # Prayer migration UI
├── customeruser-migration.html           # CustomerUser migration UI
└── donation-migration.html               # Donation migration UI
```

### Documentation
```
docs/
├── DONATION_MIGRATION_PLAN.md            # ✅ This file
└── DONATION_MIGRATION_RESULTS.md         # To be created after migration
```

---

## ⚠️ נקודות חשובות לזכור

### 1. **סדר המיגרציות חובה!**
```
Prayer → CustomerUser → Donation
```
אי אפשר לשנות את הסדר בגלל FK dependencies!

### 2. **Smart Skip Logic**
בכל מיגרציה - לבדוק קיום לפני INSERT:
```javascript
const [existing] = await mysqlConn.query(
  'SELECT Id FROM table WHERE uniqueField = ?',
  [value]
);

if (existing.length > 0) {
  skipped++;
  continue;
}
```

### 3. **Address Deduplication**
לבדוק אם Address כבר קיימת לפני יצירה:
```javascript
const addressKey = `${street}|${city}|${country}|${zip}`;
if (addressCache[addressKey]) {
  return addressCache[addressKey];
}
```

### 4. **Transaction Safety**
לא להשתמש ב-transactions עבור מיגרציות גדולות (1M+ rows).
במקום זה - migration בשלבים עם checkpoints.

### 5. **Server Restart**
אחרי כל שינוי קוד:
```bash
netstat -ano | findstr :3030
powershell -Command "Stop-Process -Id <PID> -Force"
npm start
```

### 6. **Logging**
כל מיגרציה תכתוב ללוג:
```javascript
console.log(`✅ Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);
```

### 7. **UTF8MB4**
תמיד להוסיף charset:
```javascript
const mysqlConn = await mysql.createConnection({
  ...mysqlConfig,
  charset: 'utf8mb4'
});
```

---

## 📊 צפי תוצאות סופיות

| טבלה | רשומות צפויות | הערות |
|------|---------------|-------|
| **project** (Prayer) | +294 | ProjectType=3 |
| **projectitem** (Prayer) | +294 | ItemType=3 |
| **projectitemlocalization** | +882 | 294×3 languages |
| **user** (CustomerUser) | +3,757 | 82 existing skip |
| **address** | ~500,000 | Created inline |
| **donation** | **1,065,393** | **הטבלה העיקרית!** |

**Grand Total:** 1,065,393 תרומות מיוגררות ✅

---

## ✅ נקודות ביקורת

אחרי כל Phase - לבדוק:

### Phase 1 (Prayer)
- [ ] project table: +294 rows (ProjectType=3)
- [ ] projectitem table: +294 rows (ItemType=3)
- [ ] PrayerProjectItemId.json created
- [ ] Sample query: SELECT * FROM project WHERE ProjectType=3 LIMIT 5

### Phase 2 (CustomerUser)
- [ ] user table: +3,757 rows
- [ ] CustomerUserId.json created
- [ ] Sample query: SELECT * FROM user WHERE RoleId NOT IN (1,2) LIMIT 5

### Phase 3 (Donation A+C)
- [ ] donation table: 1,027,244 rows
- [ ] address table: ~400,000 rows
- [ ] Category A: 813,949 donations
- [ ] Category C: 213,295 donations (ItemId=1)
- [ ] No FK errors
- [ ] Sample queries

### Phase 4 (Donation B)
- [ ] donation table: 1,065,393 total rows
- [ ] Category B: 38,149 donations
- [ ] All ItemIds mapped correctly
- [ ] Final verification

---

**סטטוס:** ✅ תכנית מאושרת ומוכנה לביצוע

**הבא:** להתחיל ב-Phase 1 - Prayer Migration

---

*נוצר: 27 נובמבר 2025*
*מעודכן אחרון: 27 נובמבר 2025*
