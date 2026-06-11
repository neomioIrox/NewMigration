# סיכום מיגרציית מגביות (Collections Migration Summary)

עדכון אחרון: 2026-06-10

---

## 4 מסלולי המיגרציה

### מסלול 1 — Collections_Fixed (מגביות רגילות)

**מיפוי:** `ProjectMapping_Collections_Fixed.json`  
**מקור:** `products WHERE Terminal=1 AND productsid IN (scope-products.json)`  
**יעד:** טבלת `Project` (ProjectType=2)

**מה נוצר בכל שורה:**
- שורה ב-`Project` (type=2) עם `preserveSourceId` (target.Id == source.productsid)
- שורה לוקליזציה עברית ב-`ProjectLocalization`
- **2 שורות** ב-`ProjectItem`:
  1. תרומה כללית (ItemType=4, DisplayInSite=0, hidden)
  2. אפשרות נוספת לפי שדה `Certificate` במקור (ItemType לפי ערך Certificate)
- `LinkSetting` לכל ProjectItem
- `Media` rows (MainMedia + ImageForListsView) — עברית גם על הטבלה הראשית וגם על הלוקליזציה
- `EntityContent` לאחר הכנסה

**scopeFilter:** `{"column":"productsid","file":"scope-products.json"}`

---

### מסלול 2 — Type3_Parents (מגביות קמפיין — שורת האב)

**מיפוי:** `ProjectMapping_Type3_Parents.json`  
**מקור:** `products WHERE Terminal=1 AND Type3_Group IS NOT NULL` (scope-limited)  
**scopeFilter:** קובץ `type3-parents.json`  
**יעד:** טבלת `Project` (ProjectType=2)

**מה נוצר בכל שורה:**
- שורת `Project` עצמאית לפרויקט האב של הקמפיין
- לוקליזציה עברית
- **2 שורות ProjectItem:**
  1. `donation` (ItemType=4, hidden, `_localizationOverrides: {DisplayInSite:0}`)
  2. `certificate` (ItemType לפי שדה Certificate)
- Media, LinkSetting, EntityContent

**הערה:** האב נוצר עם preserveSourceId — הבנות מתחברות אליו לפי id_mappings.

---

### מסלול 3 — Type3_Subs (מגביות קמפיין — שורות הבת / collapse mode)

**מיפוי:** `ProjectMapping_Type3_Subs.json`  
**מקור:** JOIN של `ProductGroup` ל-`products` כדי לקבל `_ParentProductId`  
**scopeFilter:** קובץ `type3-subs.json`  
**יעד:** ProjectItem בלבד — **ללא יצירת Project חדש**

**איך זה עובד (collapse mode):**
- `"parentProjectIdColumn": "_ParentProductId"` — המנוע מגלה שיש הורה קיים
- `fixedParent=true` → המנוע **דולג** על כל כתיבה לטבלת Project (INSERT, לוקליזציה, media על ה-Project)
- **רק** ProjectItem חדש נוצר ומחובר ל-Project האב שכבר הוכנס במסלול 2
- כל בת מקבלת: ProjectItem (ItemType=certificate), לוקליזציה, media משלה

**תלות קריטית:** חייב לרוץ **אחרי** Type3_Parents (מופיע ב-`_meta.json` כ-order 6 תלוי order 5).

---

### מסלול 4 — Collections_Type2 (DEAD)

**מיפוי:** `ProjectMapping_Collections_Type2.json`  
**`whereClause`: `"1=0"`** — לא מריץ כלום, לא מייצר שורות.  
מיפוי זה קיים רק לצרכי תיעוד / תאימות עם _meta.json.

---

## מצב ה-DB נכון ל-2026-06-10

```
Project type1 (funds):       705  (צפוי: ~685)   ← dirty state, הורץ פעמיים
Project type2 (collections): 629
Project סה"כ:                1334
ProjectItem:                 1922
id_mappings 'Project':       1243  (לא תואם 980 ב-migrated-projects.json)
scope-products.json:         1179 IDs
migrated-projects.json:      980 IDs  (snapshot ישן)
type3-parents.json:          201 IDs
type3-subs.json:             254 IDs
```

---

## בעיות ידועות

### 1. Dirty DB State
המיגרציה של הקרנות (Funds_Fixed) הורצה פעמיים ללא ניקוי בין ריצות. התוצאה:
- 705 קרנות במקום ~685 הצפויים
- 362 שגיאות duplicate PK בלוגים (סימן שהייתה ריצה כפולה)
- id_mappings עם ערכים כפולים

### 2. Media#1 Contamination
`_hebrewMediaValues()` מחזיר `|| 1` כ-fallback כשאין תמונה עברית.  
`Media.Id=1` בטבלת היעד הוא `לכידה(2).PNG` — צילום מסך ישן, לא placeholder ניטרלי.  
- **162 פרויקטים** מושפעים (135 קרנות, ~27 מגביות)  
- **התיקון הנדרש:** החלף `|| 1` ב-`|| null` ב-`_hebrewMediaValues()`

### 3. migrated-projects.json מיושן
הקובץ מכיל 980 IDs אבל המצב בפועל שונה. טבלאות downstream (FundCategory, Donation, PrayName) מסתמכות עליו לסינון FK.

---

## סדר ריצה נכון לאחר ניקוי

```
1. נקה: Project, ProjectLocalization, ProjectItem, LinkSetting, Media (type=project),
         EntityContent, id_mappings WHERE entity_type IN ('Project','ProjectItem')
2. הרץ: ProjectMapping_Funds_Fixed
3. הרץ: ProjectMapping_Collections_Fixed
4. הרץ: ProjectMapping_Type3_Parents
5. הרץ: ProjectMapping_Type3_Subs  (חייב אחרי שלב 4)
6. הרץ: PrayerMapping
7. רענן: migrated-projects.json (SELECT DISTINCT Id FROM Project WHERE...)
8. המשך: FundCategory, Donation, PrayName, AsakimDonation
```

---

## תיקון נדרש לפני הריצה הנקייה

**[server/src/engine/migration-engine.js](server/src/engine/migration-engine.js)** — בפונקציה `_hebrewMediaValues`:

```js
// לפני התיקון (גורם לזיהום Media#1):
return {
  mainMedia: image || video || 1,
  imageForLists: image || video || 1,
  banner: image || video || 1,
};

// אחרי התיקון:
return {
  mainMedia: image || video || null,
  imageForLists: image || video || null,
  banner: image || video || null,
};
```
