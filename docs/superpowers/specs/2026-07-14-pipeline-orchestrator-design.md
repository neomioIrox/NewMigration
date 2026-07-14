# Pipeline Orchestrator — הרצה מלאה בכפתור אחד

**תאריך:** 2026-07-14
**סטטוס:** מאושר על-ידי המשתמשת (עיצוב); ממתין לתוכנית מימוש

## רקע ומטרה

היום כל מיגרציה מורצת ידנית מה-UI: dropdown למיפויים גנריים + כרטיסים ייעודיים ל-Donation, PrayName, AsakimDonation ושרשרת הגלריה. אין דרך להריץ את התהליך המלא מקצה לקצה.

**המטרה:** כפתור אחד בדף חדש שמריץ את כל המיגרציות ברצף, מסודרות לפי התלויות ביניהן, עם מעקב מצב שמאפשר להמשיך מהנקודה האחרונה שנעצרה.

## החלטות מרכזיות (מסבב ההבהרות)

1. **היקף:** התהליך המלא — כל המיפויים הגנריים + כל המנועים הייעודיים (Donation, PrayName, AsakimDonation, גלריות, Recruiters).
2. **מנגנון חדש ונפרד:** אפס שינוי בלוגיקה הקיימת (מנועים, migration-manager, מסך `/migrate`, endpoints קיימים). שינויים מותרים: הוספת קבצים חדשים + שורות wiring אדיטיביות (mount של router ב-index.js, route ב-App.jsx, אירועים ב-useWebSocket, שני CREATE TABLE IF NOT EXISTS ב-init-tracker.js).
3. **הנחת עבודה נוכחית:** טבלאות היעד ריקות ומוכנות למיגרציה. checkbox "התחל מאפס" **לא מנקה** את היעד — סמנטיקת ניקוי תוגדר במשימה נפרדת.
4. **מדיניות כשל:** עצירה מיידית של כל התהליך בכשל של שלב. המשך לאחר תיקון — מאותה נקודה.
5. **הרצה סדרתית:** שלב אחד בכל רגע, בסדר טופולוגי. אין מקביליות.
6. **UI:** דף חדש ייעודי; המסך הקיים נשאר ללא שינוי.

## ארכיטקטורה

```
client: PipelineRunner.jsx (דף /pipeline חדש)
   │  POST /api/pipeline/start {mode}
   ▼
server: routes/pipeline.js (חדש)
   ▼
services/pipeline-orchestrator.js (חדש)
   │  טוען config/pipeline.json, מיון טופולוגי,
   │  לולאה סדרתית על השלבים
   ▼
migration-manager.js (קיים, ללא שינוי)
   startMigration / startDonationMigration /
   startPrayNameMigration / startAsakimDonationMigration
   │  מחזירות engine (EventEmitter) באופן סינכרוני
   ▼
Orchestrator ממתין ל-completed/error/paused של כל מנוע
ומעדכן pipeline_runs / pipeline_run_steps (טבלאות חדשות)
```

## 1. הגדרת ה-Pipeline — `server/config/pipeline.json`

קובץ חדש, מקור אמת יחיד. מבנה שלב:

```json
{
  "name": "SourceMapping",
  "kind": "standard",
  "dependsOn": ["AffiliateMapping"],
  "batchSize": 500
}
```

- `kind` קובע את **פונקציית ההזנקה** בלבד: `standard` → `startMigration` (שמנתב פנימית גם למנועים הייעודיים VideoGallery/Recruiter/RecruitersGroup), `donation` → `startDonationMigration`, `prayname` → `startPrayNameMigration`, `asakim` → `startAsakimDonationMigration`. בחירת המנוע הייעודי נשארת בקוד הקיים.
- ה-Orchestrator מבצע מיון טופולוגי ומזהה מעגלים/תלויות חסרות בעת טעינה (שגיאה ברורה לפני יצירת ריצה).
- `_meta.json` הקיים נשאר כפי שהוא (לא בשימוש runtime); `pipeline.json` הוא המקור החדש.

### סדר השלבים (20 שלבים)

| # | שלב | מנוע | kind | dependsOn |
|---|------|------|------|-----------|
| 1 | AffiliateMapping | גנרי | standard | — |
| 2 | SourceMapping | גנרי | standard | Affiliate |
| 3 | CustomerUserMapping | גנרי | standard | — |
| 4 | LutFundCategoryMapping | גנרי | standard | — |
| 5 | ProjectMapping_Funds_Fixed | גנרי | standard | — |
| 6 | ProjectMapping_Collections_Fixed | גנרי | standard | — |
| 7 | ProjectMapping_Collections_Type2 | גנרי | standard | — |
| 8 | ProjectMapping_Type3_Parents | גנרי | standard | — |
| 9 | ProjectMapping_Type3_Subs | גנרי | standard | Type3_Parents |
| 10 | PrayerMapping | גנרי | standard | — |
| 11 | FundCategoryMapping | גנרי | standard | כל הפרויקטים (5–9) + LutFundCategory |
| 12 | ProjectItemLocalizationMapping | גנרי | standard | כל הפרויקטים (5–9) |
| 13 | RecruitersGroupMapping | ייעודי — RecruitersGroupEngine | standard (ניתוב פנימי) | כל הפרויקטים (5–9) |
| 14 | RecruiterMapping | ייעודי — RecruiterEngine | standard (ניתוב פנימי) | פרויקטים + RecruitersGroup |
| 15 | GalleryMapping_Images | גנרי | standard | — |
| 16 | GalleryMediaMapping_Images | גנרי | standard | GalleryMapping_Images |
| 17 | VideoGalleryMediaMapping | ייעודי — VideoGalleryEngine | standard (ניתוב פנימי) | — |
| 18 | Donation | ייעודי — DonationEngine | donation | פרויקטים, Prayer, CustomerUser, Source, Recruiter |
| 19 | PrayName | ייעודי — PrayNameEngine | prayname | Donation |
| 20 | AsakimDonation | ייעודי — AsakimDonationEngine | asakim | Donation |

הערות:
- שרשרת הגלריה הקיימת (`startGalleryMigrationChain`) **לא** בשימוש ב-pipeline — שלושת שלביה מופיעים כשלבים 15–17 רגילים, כי אי אפשר להמתין לסיום השרשרת מבחוץ. הכרטיס הקיים ב-UI ממשיך לעבוד כרגיל.
- `ProjectMapping.json` (הישן) ו-`RecruiterLocalizationMapping.json.disabled` אינם נכללים.
- רשימות ה-`dependsOn` המדויקות יאומתו בזמן המימוש מול ה-FK resolvers של כל מיפוי; הסדר הסדרתי 1–20 מכבד את כל התלויות הידועות ממילא, כך שאימות זה משפיע רק על דיוק המטא-דאטה, לא על סדר ההרצה.
- שלבי Donation/PrayName/AsakimDonation מקבלים את אותן ברירות מחדל (batchSize וכו') שהכרטיסים הייעודיים משתמשים בהן היום.

## 2. מעקב מצב — טבלאות חדשות ב-migration_tracker

הטבלאות הקיימות (`migration_runs`, `id_mappings`, `row_status`, `migration_errors`) אינן משתנות.

**`pipeline_runs`** — רשומה לכל הפעלת pipeline:

| עמודה | סוג | הערות |
|--------|-----|-------|
| id | INT AUTO_INCREMENT PK | |
| mode | ENUM('fresh','continue') | |
| status | ENUM('running','completed','failed','stopped') | |
| current_step | VARCHAR(100) NULL | שם השלב הרץ |
| error_message | TEXT NULL | |
| started_at / completed_at / created_at / updated_at | DATETIME | |

**`pipeline_run_steps`** — שורה לכל שלב בריצה:

| עמודה | סוג | הערות |
|--------|-----|-------|
| id | INT AUTO_INCREMENT PK | |
| pipeline_run_id | INT FK→pipeline_runs | |
| step_name | VARCHAR(100) | |
| order_index | INT | |
| status | ENUM('pending','running','completed','failed') | |
| migration_run_id | INT NULL | קישור ל-migration_runs הקיימת (מונים, drill-down) |
| error_message | TEXT NULL | |
| started_at / completed_at | DATETIME NULL | |

יצירת הטבלאות: הרחבה אדיטיבית של `server/src/db/init-tracker.js` — הוספת שני CREATE TABLE IF NOT EXISTS; אין שינוי בטבלאות קיימות.

## 3. לוגיקת ה-Orchestrator — `server/src/services/pipeline-orchestrator.js`

1. **נעילה:** pipeline אחד פעיל בלבד. `POST /start` נדחה (409) אם קיימת ריצה בסטטוס `running`. בנוסף — דגל in-memory כהגנה כפולה בתוך אותו process.
2. **בחירת ריצה לפי mode:**
   - `continue` (ברירת מחדל): אם הריצה האחרונה בסטטוס `failed`/`stopped` — ממשיכים אותה: שלבים `completed` נשארים כפי שהם, שלב `failed` וכל ה-`pending` מורצים לפי הסדר. אם אין ריצה כזו — נוצרת ריצה חדשה עם כל השלבים `pending`.
   - `fresh`: תמיד ריצה חדשה, כל 20 השלבים מורצים מההתחלה. ללא ניקוי יעד (מחוץ להיקף).
   - ריצה בסטטוס `running` שנמצאה בעליית שרת (קריסה קודמת) מסומנת `failed` עם הערה — ואז ניתנת להמשך.
3. **ביצוע שלב:** עדכון השלב ל-`running` + `current_step` → הזנקה דרך פונקציית ההזנקה לפי `kind` → קליטת `runId` מאירוע `started` של המנוע ושמירתו ב-`migration_run_id` → המתנה (Promise חד-פעמי בסגנון `_awaitEngine` הקיים) לאחד מ: `completed` → השלב `completed` וממשיכים; `error` → השלב `failed`, ה-pipeline `failed`, עצירה; `paused` → השלב חוזר ל-`pending` (יורץ שוב מתחילתו בהמשך), ה-pipeline `stopped`, עצירה.
4. **עצירה ידנית:** `POST /stop` קורא `requestPause()` על המנוע הרץ; המשך הטיפול זהה למסלול `paused`.
5. **הערה על שלב שנקטע באמצע:** בהמשך ריצה, שלב שהיה `running`/`failed` מורץ שוב מתחילתו דרך אותה פונקציית הזנקה; דילוג על שורות שכבר הוכנסו הוא באחריות המנגנון הקיים של המנועים (skip-existing) ואינו חלק מהעבודה הזו.
6. **אירועי Socket חדשים** (broadcast, לצד `migration:*` הקיימים): `pipeline:started`, `pipeline:step-started`, `pipeline:step-completed`, `pipeline:completed`, `pipeline:error`, `pipeline:stopped`. כל אירוע נושא את `pipelineRunId`, שם השלב ו-`order_index` הרלוונטיים.

## 4. API — `server/src/routes/pipeline.js` (router חדש)

| Method | Path | תיאור |
|--------|------|-------|
| POST | /api/pipeline/start | גוף: `{ "mode": "fresh" \| "continue" }`; מחזיר את רשומת הריצה + השלבים; 409 אם כבר רץ |
| POST | /api/pipeline/stop | עצירה מסודרת של הריצה הפעילה |
| GET | /api/pipeline/current | הריצה הפעילה או האחרונה + כל שלביה (JOIN עם migration_runs למונים) |
| GET | /api/pipeline/runs | היסטוריית ריצות pipeline |

Wiring: שורת `app.use("/api/pipeline", ...)` אחת ב-`server/src/index.js`.

## 5. UI — דף חדש `/pipeline` ("הרצה מלאה")

קומפוננטה חדשה `client/src/components/PipelineRunner.jsx`; route + קישור ניווט ב-`App.jsx` (אדיטיבי). עברית RTL כמו שאר האפליקציה.

מבנה:

- **checkbox "התחל מאפס"** — לא מסומן כברירת מחדל (=המשך מהנקודה האחרונה). כשמסומן — דיאלוג אישור לפני ההזנקה שמבהיר שכל השלבים ירוצו מההתחלה.
- **כפתור ראשי** — "הרץ את כל התהליך"; כשיש ריצה שנעצרה/נכשלה והמצב continue — הטקסט משתנה ל"המשך מהנקודה שנעצרה". מושבת בזמן ריצה.
- **כפתור עצירה** — פעיל רק בזמן ריצה.
- **התקדמות כללית** — "שלב X מתוך 20" + פס התקדמות.
- **רשימת 20 השלבים** — לכל שלב: אייקון סטטוס (✓ הושלם / ⟳ רץ / ○ ממתין / ✗ נכשל), מוני שורות (processed/inserted/skipped/errors) מהרשומה המקושרת ב-`migration_runs`, פס התקדמות חי + אחוזים לשלב הרץ, והודעת שגיאה מלאה בשלב שנכשל.

מקורות נתונים:

- טעינה ראשונית + פולינג: `GET /api/pipeline/current` עם react-query (`refetchInterval` כמו בדפים הקיימים) — כך רענון דפדפן באמצע ריצה מציג מצב נכון מה-DB.
- עדכונים חיים: אירועי `pipeline:*` + `migration:progress` (לפס של השלב הרץ) דרך `useWebSocket` הקיים — הרחבת רשימת האירועים בלבד, בלי לשנות התנהגות קיימת.

## 6. טיפול בשגיאות

- **כשל טעינת pipeline.json / מעגל תלויות / שם מיפוי לא קיים:** `POST /start` נכשל מיד עם הודעה ברורה; לא נוצרת ריצה.
- **כשל מנוע באמצע שלב:** כמתואר בסעיף 3.3 — עצירה מיידית, הכל נרשם ב-DB, ה-UI מציג את השלב האדום ואת ההודעה.
- **קריסת שרת באמצע ריצה:** בעלייה הבאה הריצה התקועה מסומנת `failed`; המשתמשת ממשיכה בלחיצה (mode=continue).
- **לחיצה כפולה / שני דפדפנים:** הנעילה ב-DB מחזירה 409 והדף מציג שהריצה כבר פעילה.

## 7. בדיקות ואימות

1. **בדיקת יחידה** למיון הטופולוגי ולזיהוי מעגלים/תלויות חסרות (סקריפט node בסגנון `scripts/validate/` הקיים, רץ בלי DB).
2. **בדיקת אינטגרציה של ה-Orchestrator** עם מנועים מזויפים (EventEmitter stubs) — תרחישים: הצלחה מלאה, כשל באמצע → continue, עצירה ידנית → continue, fresh אחרי כשל.
3. **אימות E2E מול ה-DB האמיתי** עם `totalLimit` קטן — **רק לאחר אישור מפורש להרצה חיה**, בהתאם לנוהג הפרויקט.

## מחוץ להיקף (Out of scope)

- ניקוי/איפוס טבלאות היעד ("מאפס" אמיתי) — משימה נפרדת שתוגדר בהמשך.
- כל שינוי במנועים הקיימים, ב-migration-manager, במסך `/migrate` או ב-endpoints הקיימים.
- הרצה מקבילה של שלבים בלתי-תלויים.
- השלמת/תיקון `_meta.json` (נשאר כתיעוד; pipeline.json הוא המקור החדש).
- Pause/Resume ברמת שורות בתוך שלב (קיים במנגנון הישן וממשיך לעבוד שם).
