# סיכום מיגרציית מגביות (Collections Migration Summary)

עדכון אחרון: 2026-07-14

---

## החלטות 2026-07-14 (סגורות)

1. **בוטל פריט "תרומה כללית" הנסתר** (ItemType=4, DisplayInSite=0) שנוצר כשורה ראשונה בכל מגבית/קמפיין — הוסר מ-`ProjectMapping_Collections_Fixed` ומ-`ProjectMapping_Type3_Parents`. ניתוב תרומות לפי productsid עובר דרך `ProjectItem_certificate` (הפריט היחיד של המוצר).
2. **תת-מוצר בכמה קמפיינים → פריט אחד בלבד**, תחת הורה שנבחר דטרמיניסטית (ההורה הפעיל עם ה-id הנמוך). המיפוי נשמר ב-`server/data/type3-sub-parent.json`.
3. **מוצר שהוא גם הורה-קמפיין וגם תת-מוצר** (22 מוצרים) — הוחרג מרשימת ה-subs; נשאר רק עם ה-Project של עצמו, כך שהתרומות שלו (4,845) מנותבות לפריט שלו עצמו ולא נדרסות ב-id_mappings.
4. **מגבית עצמאית בלי שטר → ItemType=5** (FundDonation, PriceType=2 חופשי) במקום 2; שטר אמיתי (Certificate=1) נשאר ItemType=2. אותה קונבנציה כמו Type3 (`Certificate==1 ? 2 : 5`).
5. **Project Id=1 נזרע אוטומטית** — hook חדש במנוע (`preMigrationRunners`) מריץ את `server/src/engine/pre-runners/seed-project1.js` לפני הלולאה הראשית של כל מיפוי שמייצר Project/ProjectItem (Funds_Fixed, Collections_Fixed, Type3_Parents, Type3_Subs, PrayerMapping). אידמפוטנטי — המיפוי הראשון שרץ זורע, השאר מדלגים. אין שלב ידני. (`scripts/migration/seed-project1.js` נשאר כ-wrapper אופציונלי לבדיקת סטטוס.)
6. **תיקון Media#1 הוחל** במנוע (`_hebrewMediaValues` + `_postInsertUpdates`): אין יותר fallback ל-Media.Id=1 — תמונה חסרה נשארת NULL.

---

## 4 מסלולי המיגרציה

### מסלול 1 — Collections_Fixed (מגביות רגילות)

**מיפוי:** `ProjectMapping_Collections_Fixed.json`
**מקור:** `products WHERE Terminal=1` ולא חבר ב-ProductGroup, בתוך scope-products.json (133 מוצרים)
**יעד:** `Project` (ProjectType=2), `preserveSourceId` (target.Id == source.productsid)

**מה נוצר בכל שורה:**
- שורה ב-`Project` (type=2)
- לוקליזציה עברית ב-`ProjectLocalization` (EN/FR בתנאי)
- **פריט אחד** ב-`ProjectItem`: `certificate` — ItemType/PriceType/HasEngravingName/DeliveryMethod נגזרים מ-`Certificate` (1→שטר סגור, אחרת→5 תרומה חופשית)
- `LinkSetting` לפריט, `Media`, `EntityContent`

### מסלול 2 — Type3_Parents (מגביות קמפיין — שורת האב)

**מיפוי:** `ProjectMapping_Type3_Parents.json`
**scopeFilter:** `type3-parents.json` (201 הורים; הורה "פעיל" אם הוא או אחד מהבנים שלו ב-scope)
**יעד:** `Project` (ProjectType=2) עם preserveSourceId

**מה נוצר בכל שורה:** Project + לוקליזציה + **פריט אחד** (`certificate` של ההורה עצמו, מותנה-Certificate) + Media/LinkSetting/EntityContent.

### מסלול 3 — Type3_Subs (מגביות קמפיין — שורות הבת / collapse mode)

**מיפוי:** `ProjectMapping_Type3_Subs.json`
**scopeFilter:** `type3-subs.json` (231 תתי-מוצרים)
**הורה:** `parentProjectIdMapFile: type3-sub-parent.json` — מפה קפואה sub→parent (אין יותר JOIN בזמן ריצה, אין שורות כפולות, אין הורים לא-פעילים)
**יעד:** ProjectItem בלבד תחת ה-Project של ההורה — ללא Project חדש

**תלות קריטית:** רץ **אחרי** Type3_Parents (_meta.json: order 6 אחרי 5).

### מסלול 4 — Collections_Type2 (DEAD)

`whereClause: "1=0"` — קיים לתיעוד בלבד.

### תפילות — PrayerMapping

294 שורות `Prayers` → ProjectItem (ItemType=3 PrayerName) תחת **Project Id=1** (collapse, `fixedParentProjectId: 1`).
**תנאי מקדים:** Project Id=1 חייב להתקיים (שלב 0 — seed-project1.js).

---

## קבצי Scope (server/data)

| קובץ | תוכן | נוצר ע"י |
|---|---|---|
| scope-products.json | 1179 מוצרים עם תרומה שהושלמה מאז 2025-06-01 | extract-scope-products.js |
| type3-parents.json | 201 הורי קמפיין פעילים | extract-scope-type3.js |
| type3-subs.json | 231 תתי-מוצרים (אחרי החרגות) | extract-scope-type3.js |
| type3-sub-parent.json | מפה sub→parent דטרמיניסטית | extract-scope-type3.js |

**החרגות ב-type3-subs (מובנות בסקריפט):**
- 22 מוצרים שהם גם הורה וגם בן: 904,905,1284,1285,1286,1332,1333,1363,1364,1653,1721,1722,1723,1725,1727,1728,1729,2050,2097,2288,2291,2292
- 2098 — תת-מוצר Terminal=4 שבהיקף (עולה כקרן עצמאית ב-Funds_Fixed)

---

## כיסוי מאומת (ביקורת 2026-07-14, מול DB חי)

471 מוצרי Terminal=1 בהיקף מתחלקים בדיוק: 133 עצמאיים + 193 הורים (מתוך 201 הפעילים) + 145 subs (מתוך 231) — **0 יתומים**. אין סחף מול הקבצים הקפואים.

צפי ריצה נקייה: Project = 705 קרנות + 133 + 201 + 1 (seed) = **1040**; ProjectItem = 705 (funds) + 133 + 201 + 231 + 294 (תפילות) + 1 (seed) = **1565**.

---

## מקרים ידועים (by design)

- **מוצר מקור 1 = "משפחת פרץ"** (Terminal=NULL, בהיקף) — נופל בשער ה-Terminal; תרומותיו (ProjectId=1) נופלות לדלי הכללי ItemId=1. **אסור** להגדיר לו Terminal=1 בקובץ הבקרה — יתנגש עם ה-seed של Project 1.
- **2 מוצרים מחוקים עם הזמנות:** 22488 (10 הזמנות, ₪1,824), 12034 (12 הזמנות, ₪142) → דלי כללי.
- לוקליזציית EN/FR של ה-seed מכילה placeholder ("aaaaaaaa") — מוסתרת (DisplayInSite=0); אפשר לשפר טקסט בהמשך.

---

## סדר ריצה נקייה

```
1. נקה: Project, ProjectLocalization, ProjectItem, ProjectItemLocalization, LinkSetting,
        Media (של פרויקטים), EntityContent, ו-id_mappings של
        entity_type 'Project', 'ProjectItem_%', 'Media_%' (של פרויקטים)
2. הרץ: ProjectMapping_Funds_Fixed        (זורע אוטומטית את Project 1 לפני הכל)
3. הרץ: ProjectMapping_Collections_Fixed
4. הרץ: ProjectMapping_Type3_Parents
5. הרץ: ProjectMapping_Type3_Subs   (חייב אחרי שלב 4)
6. הרץ: PrayerMapping
7. המשך: FundCategory, Donation, PrayName, AsakimDonation
```

- **אין שלבי הכנה ידניים.** זריעת Project 1 רצה אוטומטית (preMigrationRunners) בכל אחד ממיפויי הפרויקטים — גם אם מריצים אותם בסדר אחר, הראשון שרץ זורע.
- **רענון migrated-projects.json כבר לא נדרש** — Recruiter/RecruitersGroup רצים במנועים ייעודיים שקוראים Project IDs חיים מהיעד; הקובץ נשאר רק לסקריפטי בדיקה ישנים.
- קבצי ה-scope (scope-products, type3-*) קפואים ושמורים ב-repo — הריצה משתמשת בהם כמו שהם. רק אם מחליטים לשנות את ההיקף (cutoff חדש) מריצים מחדש את extract-scope-products.js ואז extract-scope-type3.js.

---

## היסטוריה

- **2026-06-10:** זוהה dirty state (Funds הורץ פעמיים — 705 במקום ~685; 362 שגיאות dup-PK), זוהם Media#1 (162 פרויקטים), migrated-projects.json התיישן. ה-DB הנוכחי עדיין מכיל גם 294 פרויקטי תפילה ישנים (עיצוב פר-תפילה שהוחלף ב-collapse). כל אלה נפתרים בריצה הנקייה.
- **2026-07-14:** ביקורת כיסוי מלאה + יישום ההחלטות למעלה (מנוע + מיפויים + extract + seed). תיקון Media#1 הוחל בקוד.
