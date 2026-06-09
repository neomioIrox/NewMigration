# Step 1: מיגרציית קרנות (Funds)

## סקירה כללית

מערכת המיגרציה מעבירה נתונים מ-**MSSQL** (קופת העיר - מערכת ישנה) ל-**MySQL** (מערכת חדשה).

### ארכיטקטורה
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MSSQL Source   │────▶│  Migration       │────▶│  MySQL Target   │
│  (Kupat1 DB)    │     │  Engine          │     │  (KupatHair DB) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                        ┌──────┴──────┐
                        │  Mapping    │
                        │  JSON Files │
                        └─────────────┘
```

### רכיבי המערכת
- **Server** (Node.js + Express) - פורט 3001
- **Client** (React + Vite) - פורט 5173
- **WebSocket** - עדכוני התקדמות בזמן אמת
- **Tracker DB** (MySQL) - מעקב אחר הרצות ומיפויי ID

---

## מיפוי קרנות (Funds)

**קובץ:** `server/mappings/ProjectMapping_Funds_Fixed.json`

```
Source: products (MSSQL)  →  Target: project (MySQL)
סה"כ שורות: 1,271
```

### תנאי סינון (whereClause) - גרסה חדשה
```sql
TerminalId = 4
```

**משמעות:** סוג הפרויקט נקבע לפי עמודת `TerminalId` בטבלת `products`:
- `TerminalId = 4` → קרן (ProjectType = 1)
- `TerminalId = 1` → מגבית (ProjectType = 2)

**מקור הנתונים:** קובץ `legacy/data/TerminalProducts.xlsx` (553 שורות)
- סקריפט `scripts/fixes/update-terminal-from-excel.js` מעדכן את עמודת `TerminalId` ב-MSSQL

**תנאי סינון ישן (הוחלף):**
```sql
-- היה: פרוצדורה מורכבת עם Certificate, ProductGroup, רשימות ID
-- הפך ל: פשוט TerminalId = 4 (קרנות) או TerminalId = 1 (מגביות)
```

---

## מיפוי העמודות

### טבלה ראשית: project

| עמודת מקור (products) | עמודת יעד (project) | סוג המרה | הערות |
|----------------------|---------------------|----------|-------|
| Name | Name | expression | חיתוך ל-150 תווים |
| productsid | KupatFundNo | direct | מזהה מקורי |
| - | ProjectType | const = 1 | 1 = Fund |
| - | RecordStatus | const = 2 | פעיל |
| productsid | CreatedAt | FK mapping | תאריך לפי מיפוי חיצוני |
| productsid | StatusChangedAt | FK mapping | תאריך לפי מיפוי חיצוני |
| TerminalId | TerminalId | FK mapping | מיפוי טרמינלים |
| - | DisplayAsSelfView | const = 0 | |
| - | StatusChangedBy | const = -1 | מערכת |
| - | CreatedBy | const = -1 | מערכת |
| - | UpdatedBy | const = -1 | מערכת |

### מיפוי תאריכים מיוחד
```json
{
  "CreatedAt": {
    "convertType": "direct",
    "oldColumn": "productsid",
    "useFkMapping": true,
    "mappingFile": "ProductCreatedDate.json",
    "defaultValue": "GETDATE()",
    "comment": "כל ProductId ממופה לתאריך ייחודי"
  }
}
```

---

## טבלאות נלוות

### 1. projectlocalization (תרגומים)

לכל project נוצרות **3 שורות** - עברית, אנגלית, צרפתית:

| שדה יעד | מקור עברית | מקור אנגלית | מקור צרפתית |
|---------|------------|-------------|-------------|
| Title | Name | Name_en | Name_fr |
| Description | ShortDescription | ShortDescription_en | ShortDescription_fr |
| RecruitmentTarget | DefaultDonationsSum | DefaultDonationsSum_en | DefaultDonationsSum_fr |
| DisplayInSite | !Hide && ShowMainPage | !Hide_en && ShowMainPage | !Hide_fr && ShowMainPage |
| LanguageId | 1 | 2 | 3 |

### 2. projectitem (פריטים)

לכל fund נוצר projectitem:

| שדה | ערך | הסבר |
|-----|-----|------|
| ItemType | 1 | סוג fund |
| ItemName | מ-Name | שם הפריט |
| PriceType | 2 | מחיר משתנה |
| HasEngravingName | 1 | מאפשר שם חריטה |
| ProjectId | FK | קשר לפרויקט שנוצר |

### 3. projectitemlocalization

לכל projectitem נוצרות 3 שורות תרגום:

| שדה | ערך |
|-----|-----|
| Title | שם הפריט בשפה |
| PaymentSum | סכום ברירת מחדל |
| DisplayInSite | 1 |
| ProjectItemId | FK לפריט |
| LanguageId | 1/2/3 |

### 4. linksetting (כפתורי קישור)

לכל project נוצרים **3 סוגי LinkSetting** לכל שפה (עד 9 רשומות):

| סוג כפתור | LinkType | LinkTargetType | ItemId | שימוש |
|-----------|----------|----------------|--------|-------|
| mainButton | 1 (Button) | 3 (ToExecutionPage) | מוגדר (FK לפריט) | כפתור תרומה ראשי |
| footerButton | 1 (Button) | 3 (ToExecutionPage) | מוגדר (FK לפריט) | כפתור תרומה בתחתית |
| listViewButton | 3 (ListItem) | 1 (ToProjectPage) | NULL | כפתור בתצוגת רשימה |

**חיבורים חזרה (POST-INSERT UPDATEs):**

| טבלת יעד | עמודה | מקור |
|----------|-------|------|
| projectlocalization | MainLinkButtonSettingId | mainButton LinkSetting ID |
| projectlocalization | LinkSettingIdInListView | listViewButton LinkSetting ID |
| projectitemlocalization | MainButtonLinkSettingId | mainButton LinkSetting ID |
| projectitemlocalization | ProjectFooterLinkSettingId | footerButton LinkSetting ID |

**LinkText דינמי:**
- mainButton/footerButton: טקסט קבוע מתוך ה-JSON (למשל "לתרומה", "Donate")
- listViewButton: **שם הפרויקט המתורגם** מתוך עמודת המקור (`Name`, `Name_en`, `Name_fr`)
  - נתמך ע"י `LinkTextColumn` במיפוי (במקום `LinkText` סטטי)

---

## בעיות ופתרונות

### בעיה 1: מילה שמורה `Order` ב-MySQL

**שגיאה:**
```
Error: You have an error in your SQL syntax near 'Order'
```

**סיבה:** העמודה `Order` היא מילה שמורה ב-MySQL

**פתרון:** עטיפת כל שמות העמודות ב-backticks

**קובץ:** `server/src/engine/batch-runner.js`
```javascript
// לפני (שגוי)
var sql = "INSERT INTO " + tableName + " (" + cols.join(",") + ")..."

// אחרי (תקין)
var sql = "INSERT INTO `" + tableName + "` (" +
  cols.map(function(c){ return "`" + c + "`" }).join(",") +
  ") VALUES (" + placeholders + ")";
```

---

### בעיה 2: BIT(1) מקבל string במקום number

**שגיאה:**
```
Error: Incorrect integer value: '1' for column 'DisplayInSite'
```

**סיבה:** ב-JSON הערך `"1"` הוא string, אבל MySQL BIT(1) צריך number

**פתרון:** המרה אוטומטית של string מספרי ל-number

**קובץ:** `server/src/engine/row-processor.js`
```javascript
if(convertType === "const") {
  value = colDef.value;
  if(value === "GETDATE()") {
    value = processGetDate();
  }
  // תיקון: המרת string מספרי ל-number
  else if(typeof value === "string" && value.trim() !== "" && !isNaN(value)) {
    value = Number(value);
  }
  return value;
}
```

---

### בעיה 3: `undefined` ב-SQL parameters

**שגיאה:**
```
Error: Column 'X' cannot be null (received undefined)
```

**סיבה:** ערכים חסרים מוחזרים כ-`undefined` במקום `null`

**פתרון:** המרת `undefined` ל-`null` לפני שליחה ל-DB

**קובץ:** `server/src/engine/batch-runner.js`
```javascript
var vals = cols.map(function(c) {
  var v = data[c];
  return v === undefined ? null : v;  // תיקון
});
```

---

### בעיה 4: Infinite Loop בפגינציה (קריטי!)

**תסמין:**
```
processed_rows: 10,285 (כאשר יש רק 1,271 שורות מקור!)
```

**סיבה:** ה-whereClause מכיל `OR` והפגינציה מוסיפה `AND`:

```sql
-- השאילתה שנבנתה (שגויה):
SELECT TOP 500 * FROM products
WHERE a=1 OR b=1 OR c IN (...) AND productsid > 500

-- MySQL מפרש כ (AND קודם ל-OR):
WHERE a=1 OR b=1 OR (c IN (...) AND productsid > 500)

-- התוצאה: a=1 OR b=1 תמיד מחזיר את אותן שורות = לולאה אינסופית!
```

**פתרון:** עטיפת whereClause בסוגריים

**קובץ:** `server/src/engine/migration-engine.js` (שורה 66)
```javascript
// לפני (שגוי)
var whereClause = m.whereClause ? " WHERE " + m.whereClause : "";

// אחרי (תקין)
var whereClause = m.whereClause ? " WHERE (" + m.whereClause + ")" : "";

// עכשיו השאילתה:
// WHERE (a=1 OR b=1 OR c IN (...)) AND productsid > 500
```

---

### בעיה 5: Data too long for ItemDefinition

**שגיאה:**
```
Error: Data too long for column 'ItemDefinition' at row 1
sourceId: 1104
```

**סטטוס:** שגיאה בודדת - לא חסמה את המיגרציה

**פתרון אפשרי:** הוספת חיתוך לעמודה או הגדלת העמודה ב-DB

---

### בעיה 6: listViewButton LinkSetting - LinkType שגוי וטקסט גנרי

**תסמין:** השוואה מול פרויקט ייחוס (ID 4) חשפה שני באגים ב-LinkSetting

**אבחון:** סקריפט `scripts/checks/dump-linksetting-reference.js` השווה בין:
- **פרויקט 4** (ייחוס, נוצר ידנית) - 11 LinkSettings
- **פרויקט 26** (מיגרציה) - 6 LinkSettings

**באג 1: LinkType שגוי**
```
ייחוס: LinkSettingIdInListView → LinkType=3 (ListItem), TargetType=1
מיגרציה: LinkSettingIdInListView → LinkType=1 (Button), TargetType=1  ← שגוי!
```

**באג 2: LinkText גנרי במקום שם הפרויקט**
```
ייחוס: LinkText = "קרן משפחת כהן" (שם הפרויקט)
מיגרציה: LinkText = "לתרומה" (טקסט קבוע גנרי)  ← שגוי!
```

**פתרון:**

1. שינוי LinkType ב-3 קבצי מיפוי (Funds, Collections, Type2):
```json
// לפני (שגוי)
"listViewButton": { "LinkType": 1, "LinkText": "לתרומה" }

// אחרי (תקין)
"listViewButton": { "LinkType": 3, "LinkTextColumn": "Name" }
```

2. תמיכה ב-`LinkTextColumn` במנוע המיגרציה:

**קובץ:** `server/src/engine/migration-engine.js` (שורה 337)
```javascript
// לפני: טקסט סטטי בלבד
LinkText: langDef.LinkText

// אחרי: תמיכה בטקסט דינמי מעמודת המקור
var linkText = langDef.LinkTextColumn ? row[langDef.LinkTextColumn] : langDef.LinkText;
if(linkText && linkText.length > 200) linkText = linkText.substring(0, 200);
```

**ממצאים נוספים מהאבחון (לא תוקנו, לא קריטי):**
- `LinkSettingIdInButtonListView` - NULL גם בייחוס וגם במיגרציה (תקין)
- ProjectItemLocalization: בייחוס כל ה-FK-ים NULL, במיגרציה מוגדרים (הבדל מקובל)
- עמודות אופציונליות (`Description`, `MediaId`, `DonationPagePaymentType`) - מוגדרות בייחוס, NULL במיגרציה

---

### בעיה 7: Recruiter - Duplicate entry for unique key

**שגיאה:**
```
Error: Duplicate entry 'XXX-שם מגייס' for key 'recruiter.UK_Recruiter_Name_ProjectId'
```

**סיבה:** אילוץ ייחודי על שילוב (Name + ProjectId) בטבלת היעד, אבל בנתוני המקור יש כפילויות

**27 שגיאות - דוגמאות:**
| sourceId | שם המגייס | ProjectId |
|----------|-----------|-----------|
| 2, 7, 8, 9 | ללא שם | 2015, 2006 |
| 389 | יהודית כהנא | 530 |
| 1006, 1349 | שמות שונים | 640 |

**סטטוס:** 6,110 מתוך 6,137 הועברו (99.6%) - השגיאות הן כפילויות לגיטימיות בנתוני המקור

**פתרונות אפשריים:**
1. הסרת האילוץ (אם כפילויות לגיטימיות)
2. מיזוג רשומות במקור
3. הוספת מזהה ייחודי לאילוץ
4. דילוג על כפילויות (המצב הנוכחי)

---

## תוצאות ההרצה

### הרצה ראשונה (2026-02-04)
```
Step 1: LutFundCategoryMapping
Status: completed
Results: 5/5 inserted, 0 errors

Step 2: ProjectMapping_Funds_Fixed
Status: completed
Results: 1,271/1,271 inserted, 1 error (sourceId 1104 - ItemDefinition too long)

Step 3: ProjectMapping_Collections_Fixed
Status: completed
Results: 683/683 inserted, 0 errors

Step 4: ProjectMapping_Collections_Type2
Status: completed
Results: 26/26 inserted, 0 errors

Step 5: PrayerMapping
Status: completed
Results: 294/294 inserted, 0 errors
```
**סה"כ:** 2,280 שורות הועברו בהצלחה, שגיאה אחת בלבד

### הרצה שנייה (2026-02-08)
```
Step 6: RecruitersGroupMapping
Status: completed
Results: 235/235 inserted, 0 errors

Step 7: RecruiterMapping
Status: completed with errors
Results: 6,110/6,137 inserted, 27 errors (duplicate key violations)
```
**סה"כ:** 6,345 שורות, 27 שגיאות כפילות

---

## קבצים רלוונטיים

| קובץ | תיאור |
|------|-------|
| `server/mappings/AffiliateMapping.json` | מיפוי מקורות אב (ParentSources → Affiliate + User) - כולל יצירת User אוטומטית ב-`afterInsertMappings` (targetTable="User" PascalCase חובה ב-RDS) |
| `server/mappings/SourceMapping.json` | מיפוי מקורות (UserSources → Source) - Description עם fallback ל-Name + `postMigrationRunners: ["set-default-source-id"]` שממלא את Affiliate.DefaultSourceId אוטומטית בסוף הריצה |
| `server/src/engine/post-runners/set-default-source-id.js` | מודול post-migration — Code↔SourceCode + fallback ל-lowest Source.Id |
| `scripts/rerun-affiliate-source/` | סקריפטי ניקוי/תיקון (01-precheck, 02-cleanup, 03-set-default-source-id, 04-inplace-fix) + README |
| `server/mappings/ProjectMapping_Funds_Fixed.json` | מיפוי קרנות (TerminalId=4) |
| `server/mappings/ProjectMapping_Collections_Fixed.json` | מיפוי מגביות (TerminalId=1) |
| `server/mappings/ProjectMapping_Collections_Type2.json` | deprecated - מוזג ל-Collections_Fixed |
| `legacy/data/TerminalProducts.xlsx` | מיפוי productsid → Terminal (מקור להחלטת סוג פרויקט) |
| `scripts/fixes/update-terminal-from-excel.js` | סקריפט עדכון TerminalId ב-MSSQL מה-Excel |
| `server/mappings/RecruitersGroupMapping.json` | מיפוי קבוצות מגייסים |
| `server/mappings/RecruiterMapping.json` | מיפוי מגייסים |
| `server/src/engine/migration-engine.js` | מנוע המיגרציה (כולל LinkSetting) |
| `server/src/engine/row-processor.js` | עיבוד שורות |
| `server/src/engine/batch-runner.js` | הכנסה ל-DB |
| `server/src/services/tracker.js` | מעקב התקדמות |
| `server/data/fk-mappings/ProductCreatedDate.json` | מיפוי תאריכים |
| `server/data/fk-mappings/TerminalId.json` | מיפוי טרמינלים |
| `scripts/checks/dump-linksetting-reference.js` | אבחון LinkSetting - השוואה מול פרויקט ייחוס |
| `scripts/checks/check-linksetting-for-projects.js` | בדיקת LinkSetting כוללת |

---

## סדר הרצה כולל (מעודכן 2026-03-08) - מההתחלה

```
Step 1:   LutFundCategoryMapping           ← lookup tables (5 שורות)                      [ ]
Step 2:   AffiliateMapping                 ← מקורות אב (ParentSources → affiliate+user)  [ ] *דורש Role Id=3 (שותף)
Step 3:   SourceMapping                    ← מקורות (UserSources → source)                [ ] תלוי ב-2
Step 4:   ProjectMapping_Funds_Fixed       ← קרנות (TerminalId=4)                         [ ]
Step 5:   ProjectMapping_Collections_Fixed ← מגביות (TerminalId=1)                        [ ]
Step 6:   ProjectMapping_Collections_Type2 ← פרויקטים נוספים                              [ ]
Step 7:   PrayerMapping                    ← תפילות                                      [ ]
Step 8:   RecruitersGroupMapping           ← קבוצות מגייסים                               [ ]
Step 9:   RecruiterMapping                 ← מגייסים                                      [ ] תלוי ב-8
Step 10:  GalleryMapping_Images            ← גלריות תמונות (Galeries → gallery)           [ ]
Step 11:  GalleryMediaMapping_Images       ← מדיה לגלריות (GaleryPics → media)            [ ] תלוי ב-10
Step 12:  migrate-video-gallery-media.js   ← גלריית וידאו (Videos → VideoGalleryMedia)    [x] ✅ 327 שורות
Step 13:  FundCategoryMapping              ← קטגוריות קרנות                               [ ] תלוי ב-4
Step 14:  CustomerUserMapping              ← משתמשים (Users → customeruser)                [ ]
Step 15:  DonationMapping                  ← תרומות (Orders → donation+address+currency)   [ ] תלוי ב-4-7,9,14
Step 16:  PrayNameMapping                 ← שמות לתפילה (PrayerNames → PrayName)          [ ] תלוי ב-15
```

### הערות
- RecruiterLocalizationMapping ו-ProjectItemLocalizationMapping מושבתים (לא בהרצה)
- LutFundCategory ראשון כי הוא lookup table שאחרים תלויים בו
- Donation אחרון כי הוא תלוי כמעט בכל השאר
- **Step 2 (Affiliate):** יוצר אוטומטית User לכל affiliate מ-ParentSources.UserName/Password (afterInsertMappings + updateParentColumn). חובה להריץ `create-affiliate-role.js` לפני כדי שיהיה Role Id=3. **שם הטבלה targetTable="User" PascalCase** (AWS RDS case-sensitive).
- **Step 3 (Source):** שדה Description עושה fallback ל-Name כש-Title ריק/NULL. בסוף הריצה המנוע מריץ אוטומטית את `post-runners/set-default-source-id.js` שממלא את `Affiliate.DefaultSourceId` (Code↔SourceCode + fallback ל-lowest Source.Id). אין צורך להריץ ידנית.

### תלויות בין שלבים
- Step 2: Affiliate דורש Role Id=3 (שותף) - הריצו `create-affiliate-role.js` לפני
- Step 3: Source תלוי ב-Affiliate (FK: AffiliateId). ה-`postMigrationRunners` בסוף Step 3 דורש שכל ה-Source כבר נכנסו.
- Steps 4-7: Projects לפני Recruiters, Gallery, FundCategory (FK: ProjectId)
- Step 11: אחרי Step 10 (FK: GalleryId)
- Step 15: אחרי Steps 4-7 + 9 + 14 (FK: RecruiterId, UserId, ProjectItem)
- Step 16: אחרי Step 15 (FK: OrderId → Donation id_mappings)

---

# Step 11: מיגרציית תרומות (Donations)

## סקירה כללית

```
Source: Orders (MSSQL)  →  Target: donation + donationcurrencyvalue + address (MySQL)
סה"כ שורות: ~180,000+
תנאי סינון: ChargeStatus = 'OrderFinished' OR DateCreated > DATEADD(month, -1, GETDATE())
```

**מנוע ייעודי:** `server/src/engine/donation-engine.js` (לא JSON mapping - לוגיקה מורכבת מדי)

### למה מנוע ייעודי ולא JSON mapping?
1. **Address inline** - יצירת רשומות Address תוך כדי עיבוד שורה
2. **ClearingMethodAreaId** - DB lookup מורכב (PaymentMethod + Language + Currency)
3. **DonationCurrencyValue** - 1-3 שורות child לכל תרומה
4. **ItemId priority** - Prayer > Product > ItemType priority (5→4→1→2→3)
5. **MoreProviderDetails** - JSON aggregation מ-10 שדות כרטיס

## מיפוי העמודות: Orders → donation

| עמודת מקור (Orders) | עמודת יעד (donation) | סוג המרה | הערות |
|---------------------|---------------------|----------|-------|
| - | ItemId | FK priority | Prayer > Product > default=1 |
| ChargeStatus | Status | expression | OrderFinished→2, Redirected→1, Manual→4 |
| ChargeCurrency | Currency | expression | ₪→1, $→2, €→3, £→4 |
| OrderLaguage | LanguageId | expression | he→1, en→2, fr→3 |
| Total / Payments | MonthlySum | expression | Total / Payments |
| DonationType | PaymentType | expression | FixedDonation→1, else→2 |
| PaymentMethod+Lang+Currency | ClearingMethodAreaId | DB lookup | clearingmethodarea |
| Card*/Voucher* | MoreProviderDetails | JSON | 10 שדות → JSON |
| UserId | UserId | FK | CustomerUser cache |
| RecruiterId | RecruiterId | FK | RecruiterMapping cache |
| Billing* | ReceiptAddress | Address inline | יצירת Address |
| Certificate* | ShippingAddress | Address inline | יצירת Address |
| DateCreated | CreatedAt | direct | |
| - | RecordStatus | const = 2 | פעיל |
| - | TreatStatus | const = 1 | NotRequired |

## טבלת child: donationcurrencyvalue

לכל תרומה נוצרות 1-3 שורות:

| Currency | RateInILS | TotalSum | תנאי |
|----------|-----------|----------|-------|
| 1 (ILS) | 1 | TotalInILS | TotalInILS > 0 |
| 2 (USD) | USDRate | TotalInUSD | TotalInUSD > 0 && USDRate |
| 3 (EUR) | EURRate | TotalInEUR | TotalInEUR > 0 && EURRate |

## באג שתוקן: ClearingMethodAreaId
בסקריפט legacy ערכי UK(2) ו-USA(3) היו מוחלפים - תוקן במנוע החדש

## הפעלה

```
POST /api/migrations/start-donations
Body: { "batchSize": 1000, "dryRun": false }
```

## קבצים

| קובץ | תיאור |
|------|-------|
| `server/src/engine/donation-engine.js` | מנוע מיגרציית תרומות |
| `server/src/services/migration-manager.js` | אינטגרציה |
| `server/src/routes/migrations.js` | route: POST /start-donations |
| `legacy/scripts/migration/migrate-donations.js` | סקריפט מקורי (reference) |

---

# Step 16: מיגרציית שמות לתפילה (PrayerNames → PrayName)

## דוח ניתוח מיגרציה: PrayName

### סיכום

| פרט | ערך |
|------|------|
| טבלת מקור (MSSQL) | PrayerNames (kupat_09_03) |
| טבלת יעד (MySQL) | PrayName (kupathairnew) |
| שורות במקור | 966,600 (מסוננות OrderFinished: 760,606) |
| שורות קיימות ביעד | 0 |
| עמודות במקור | 10 (PrayerNamesId, FirstName, LastName, Comment, OrderId, DateCreated, Gender, PrayerId, OrderLaguage, ProjectId) |
| עמודות ביעד | 11 (Id, BelongToEntityType, BelongToEntityId, Name, Gender, ParentName, PrayDescription, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) |
| סוג המרה | 1x auto, 3x const, 4x expression, 1x FK, 1x direct |
| לוקליזציה | לא |
| תלויות FK | Donation (entity_type='Donation' — 1,392,279 רשומות ב-id_mappings) |

### סקירה כללית

```
Source: PrayerNames (MSSQL)  →  Target: PrayName (MySQL)
סה"כ שורות: 966,600 (OrderFinished: 760,606)
תנאי סינון: JOIN Orders ON PrayerNames.OrderId = Orders.OrdersId WHERE Orders.ChargeStatus = 'OrderFinished'
```

**מנוע ייעודי:** `server/src/engine/prayname-engine.js` (bulk insert — ~760K שורות, FK resolution מ-Donation)

### למה מנוע ייעודי ולא JSON mapping?
1. **נפח גבוה** — ~760K שורות דורש bulk insert (כמו donation-engine)
2. **FK resolution** — OrderId צריך lookup ב-Donation id_mappings
3. **Gender mapping** — המרת ערכים: 0→1(Male), 1→2(Female), ערכי זבל→NULL
4. **WHERE clause מורכב** — JOIN עם טבלת Orders לסינון לפי ChargeStatus

## מיפוי העמודות: PrayerNames → PrayName

| עמודת מקור (PrayerNames) | עמודת יעד (PrayName) | סוג המרה | הערות |
|--------------------------|---------------------|----------|-------|
| - | Id | auto | AUTO_INCREMENT |
| - | BelongToEntityType | const = 4 | Donation (LutEntityType.Id=4) |
| OrderId | BelongToEntityId | FK | Donation id_mappings lookup (source_id=OrderId → target_id) |
| FirstName | Name | expression | truncate to 100, NULL → "" (NOT NULL) |
| Gender | Gender | expression | 0→1(Male), 1→2(Female), other→NULL |
| LastName | ParentName | expression | truncate to 100 |
| Comment | PrayDescription | expression | NULL/empty → "" (NOT NULL, text type) |
| DateCreated | CreatedAt | direct | NULL → GETDATE() |
| - | CreatedBy | const = -1 | System (User.Id=-1) |
| - | UpdatedAt | const = GETDATE() | |
| - | UpdatedBy | const = -1 | System (User.Id=-1) |

### עמודות מקור שלא ממופות (dropped)
- `PrayerNamesId` — PK מקורי, לא נדרש (target הוא AUTO_INCREMENT)
- `PrayerId` — מזהה תפילה, לא רלוונטי לטבלת PrayName
- `OrderLaguage` — שפת ההזמנה, לא נדרש
- `ProjectId` — פרויקט, לא נדרש

## מטריצת תאימות עמודות

| עמודה ביעד | סוג | NOT NULL | מיפוי | מקור | תאימות |
|------------|------|----------|--------|------|---------|
| Id | int | YES | auto | - | ✅ |
| BelongToEntityType | int | YES | const=4 | - | ✅ FK→LutEntityType(4=Donation) |
| BelongToEntityId | int | YES | FK | OrderId | ⚠️ צריך Donation id_mappings |
| Name | varchar(100) | YES | expression | FirstName nvarchar(200) | ⚠️ truncate to 100 + NULL handling |
| Gender | int | NO (nullable) | expression | Gender int | ⚠️ ערכי זבל (19944477, 19958276) |
| ParentName | varchar(100) | NO (nullable) | expression | LastName nvarchar(200) | ⚠️ truncate to 100 |
| PrayDescription | text | YES | expression | Comment nvarchar(max) | ⚠️ NULL → "" |
| CreatedAt | datetime | YES | direct | DateCreated | ⚠️ NULL → GETDATE() |
| CreatedBy | int | YES | const=-1 | - | ✅ FK→User(-1=System) |
| UpdatedAt | datetime | YES | const=GETDATE() | - | ✅ |
| UpdatedBy | int | YES | const=-1 | - | ✅ FK→User(-1=System) |

## בעיות שנמצאו

### 🟡 אזהרה (מומלץ לתקן)
- **Length overflow**: FirstName/LastName הם nvarchar(200) במקור, Name/ParentName הם varchar(100) ביעד → צריך truncate ל-100
- **Gender junk values**: שני ערכים לא תקינים (19944477, 19958276) → ימופו ל-NULL
- **FirstName nullable**: FirstName הוא nullable במקור אבל Name הוא NOT NULL ביעד → צריך default ""
- **Comment nullable**: Comment הוא nullable במקור אבל PrayDescription הוא NOT NULL ביעד → צריך default ""
- **DateCreated nullable**: DateCreated nullable במקור אבל CreatedAt NOT NULL ביעד → צריך default GETDATE()

### 🔵 מידע
- 966,600 שורות סה"כ, 760,606 מסוננות (OrderFinished) — ~79% מהנתונים
- ~205,994 שורות לא יועברו (הזמנות שלא הושלמו)
- Donation id_mappings: 1,392,279 רשומות — מספיק לכיסוי
- עמודות מקור PrayerId, OrderLaguage, ProjectId לא ממופות (בכוונה)
- FK constraints ביעד: BelongToEntityType→LutEntityType, Gender→LutGender, CreatedBy/UpdatedBy→User

### ✅ בדיקות שעברו
- LutEntityType(4) = "Donation" — קיים ✅
- LutGender: 1=Male, 2=Female — קיימים ✅
- User(-1) = "System" — קיים ✅
- Donation id_mappings: 1,392,279 > 0 — קיים ✅
- PrayName target table: 0 rows — נקי ✅

### המלצה
✅ **מוכן להרצה** — כל התלויות קיימות, אין בעיות קריטיות. האזהרות מטופלות בלוגיקת ה-expression.

## הפעלה

מה-UI: כפתור ייעודי "התחל מיגרציית שמות לתפילה" (כמו תרומות)

```
POST /api/migrations/start-praynames
Body: { "batchSize": 2000, "dryRun": false }
```

תומך ב: pause/resume, dry run, progress bar עם ETA

## קבצים

| קובץ | תיאור |
|------|-------|
| `server/src/engine/prayname-engine.js` | מנוע מיגרציית שמות לתפילה (bulk insert) |
| `server/src/services/migration-manager.js` | startPrayNameMigration + resume support |
| `server/src/routes/migrations.js` | route: POST /start-praynames |
| `client/src/api/client.js` | startPrayNameMigration API method |
| `client/src/components/MigrationRunner.jsx` | PrayNameRunner UI component |
| `server/src/engine/donation-engine.js` | reference pattern (bulk insert) |

---

# Step 12: מיגרציית גלריית וידאו (Videos → VideoGalleryMedia)

## סיכום
| פרט | ערך |
|------|------|
| טבלת מקור (MSSQL) | `Videos` (kupat_09_03) |
| טבלאות יעד (MySQL) | `LinkSetting` + `Media` + `VideoGalleryMedia` |
| שורות מקור | 128 סה"כ, 127 עם `Link IS NOT NULL AND Link != ''` |
| שורות ביעד | 127 LinkSetting + 256 Media + **327** VideoGalleryMedia (127 he + 106 en + 94 fr) |

**סקריפט ייעודי:** [scripts/migration/migrate-video-gallery-media.js](scripts/migration/migrate-video-gallery-media.js) (לא JSON mapping — לוגיקה מורכבת של dedup מדיה + 3 שפות + fallback לעברית)

### מדוע סקריפט ייעודי ולא JSON?
1. **יעד מרובה-טבלאות** — כל וידאו יוצר LinkSetting (1) + Media (עד 3, עם dedup לפי URL) + VideoGalleryMedia (עד 3 שפות)
2. **Media dedup חוצה שפות** — כשכל השפות חולקות אותו URL, נוצר Media אחד ו-3 VGM מצביעים אליו
3. **Title/Description fallback** — כש-`Name_X` ריק אבל `Hide_X=0`, הכותרת והתיאור נופלים לעברית (כמו באתר הישן)
4. **URL fallback** — `Link_X` פגום/ריק → שימוש ב-`Link` העברי

### אסטרטגיית היעד
המסד החדש **אינו תומך** ב-URL שונה לוידאו-לשפה דרך `Gallery`/`GalleryMedia` (אין שם עמודת `Language`). האפליקציה קוראת וידאו **אך ורק** מ-`VideoGalleryMedia` דרך `GET /api/gallery/getVideoGalleryQuickView/{langId}` — זו היא הטבלה היחידה שבה לכל שפה יש שורה עצמאית עם MediaId נפרד.

### כלל ההכללה (match את https://www.kupat.org.il/videos)
```
For each source video, for each language (he/en/fr):
  Skip only if: Name_X is empty AND Hide_X = 1  (אין שם ואין להציג)
  Otherwise: include the row
    Title       = Name_X ? Name_X : Name (Hebrew fallback)
    Description = Description_X ? Description_X : Description (Hebrew fallback)
    URL         = isValidUrl(Link_X) ? Link_X : Link (Hebrew fallback)
    DisplayInGallery  = (Hide_X == 0 ? 1 : 0)
    DisplayInMainPage = ShowHomePage
```

### LinkSetting דמי
ל-`LinkSetting.ProjectId` הוא `NOT NULL` ולכן כל וידאו דורש פרויקט. כל הווידאו הם "מידע כללי" ללא פרויקט ספציפי, ולכן **כולם מצביעים ל-`Project.Id=1`** ("מגבית קופת העיר כללית"). `LinkType=3` (ListItem), `LinkTargetType=1` (ToProjectPage).

## מיפוי העמודות: Videos → VideoGalleryMedia

| עמודת מקור (Videos) | עמודת יעד (VideoGalleryMedia) | סוג המרה | הערות |
|---------------------|-------------------------------|----------|-------|
| - | LanguageId | const | 1/2/3 (אחד מ-he/en/fr) |
| Link / Link_en / Link_fr | → Media.RelativePath → MediaId | expression + FK | dedup לפי URL, fallback ל-Link העברי |
| - | LinkSettingId | FK | LinkSetting חדש אחד לכל וידאו |
| Name / Name_en / Name_fr | Title | expression | fallback ל-Name העברי אם ריק |
| Description / Description_en / Description_fr | Description | expression | fallback ל-Description העברי |
| Hide / Hide_en / Hide_fr | DisplayInGallery | expression | 1 אם Hide=0, אחרת 0 |
| ShowHomePage | DisplayInMainPage | direct | דגל אחד לכל 3 השפות |

### עמודות מקור שלא ממופות (dropped)
- `Pic` (thumbnail) — ב-`VideoGalleryMedia` אין עמודת thumbnail → מידע אבד בכוונה
- `WistiaId`, `WistiaId_en`, `WistiaId_fr` — לא רלוונטי למסד החדש
- `Sort` — סדר הצגה נקבע ע"י `CreatedAt` + logic ב-FE

## התאמה מול האתר הישן

| שפה | אתר ישן | מיגרציה (visible) | התאמה |
|-----|---------|-------------------|--------|
| עברית (he) | 122 | 122 | ✅ |
| אנגלית (en) | 89 | 89 | ✅ |
| צרפתית (fr) | 89 | 89 | ✅ |

## הרצה

```bash
# ניקוי מיגרציה ישנה (אם קיימת ב-Gallery/GalleryMedia)
node scripts/migration/cleanup-wrong-gallery-videos.js --execute

# מיגרציה
node scripts/migration/migrate-video-gallery-media.js

# אימות + API חי
node scripts/checks/verify-video-gallery-media.js --api
```

## קבצים

| קובץ | תיאור |
|------|-------|
| `scripts/migration/migrate-video-gallery-media.js` | סקריפט המיגרציה הראשי |
| `scripts/migration/cleanup-wrong-gallery-videos.js` | ניקוי נסיון ישן שהלך ל-`Gallery` (לא בשימוש) |
| `scripts/migration/patch-video-gallery-media-fallback.js` | חד-פעמי — הוספת 12 שורות Hebrew-fallback לאחר הרצה ישנה |
| `scripts/checks/verify-video-gallery-media.js` | אימות ספירות + Spot check + קריאה ל-API החי |
| `server/mappings/GalleryMapping_Videos.json` | ⚠️ **ישן/לא בשימוש** — היה מכוון ל-`Gallery` שלא נגיש ל-FE |

## בעיות שנפתרו

- **יעד שגוי בתחילה** — נכתב מיפוי ל-`Gallery`+`GalleryMedia` אך ה-FE קורא מ-`VideoGalleryMedia` (הטבלה הנכונה לגלריות וידאו). תוקן ע"י מעבר לסקריפט ייעודי.
- **חסרים 12 וידאו באנגלית/צרפתית** בהרצה ראשונה (Name_X ריק) — תוקן ב-patch script עם Hebrew-fallback, ההיגיון הוטמע בסקריפט הראשי ליציאות עתידיות נקיות.
