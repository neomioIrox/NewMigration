# Migration Checkpoint — המשך מהנקודה האחרונה פר-mapping

**תאריך:** 2026-07-15
**סטטוס:** מאושר על-ידי המשתמשת (עיצוב); ממתין לתוכנית מימוש

## רקע ומטרה

היום המנועים עובדים ב-keyset pagination (`WHERE sourceId > lastId ORDER BY sourceId ASC`) ושומרים `last_processed_source_id` — אבל רק פר-ריצה (`migration_runs` ב-migration_tracker), קשור ל-`run_id` ספציפי ומכובד רק לריצות `paused`. אין "משבצת קבועה" פר-mapping ששורדת בין ריצות, ואין "המשך מהנקודה שבה הריצה המלאה האחרונה נעצרה".

**המטרה:** טבלה ב-DB המטרה (RDS) שממפה לכל mapping את ה-ID האחרון שעובד, תאריך/שעה וסטטוס — ומצב `continue` שמזריע את לולאת המנוע מהנקודה הזו. הפיצ'ר משתלב ב-checkbox "התחל מאפס" של חלון ההרצה המלאה (Pipeline Orchestrator, ספק 2026-07-14) ונותן למצבי `fresh`/`continue` שלו משמעות אמיתית פר-שלב.

## החלטות מרכזיות (מסבב ההבהרות)

1. **סמנטיקת continue:** היברידית — `continue` ממשיך מה-checkpoint (מהיר); בנוסף קיים מצב `gapfill` נפרד שסורק מ-0 ומדלג על שורות שכבר קיימות ביעד, להשלמת חורים (שורות שנכשלו מתחת לסמן) בלי מחיקה.
2. **מיקום הטבלה:** ב-RDS המטרה (לא ב-migration_tracker) — שורדת איפוס tracker ונראית לכל מי שמתחבר ליעד. סגנון LegacyMapping: `CREATE TABLE IF NOT EXISTS` עצל ב-service.
3. **מפתח:** `MappingName` = שם קובץ ה-mapping (filename, לא entityType — entityType מתנגש ב-"Project").
4. **`LastSourceId` הוא סמן הלולאה** — ה-ID האחרון שעובד, כולל שורות שנכשלו/דולגו. חורים מתחתיו מושלמים רק ב-gapfill. עקבי עם `last_processed_source_id` הקיים.
5. **עצמאות מה-orchestrator:** ה-service, האינטגרציה במנועים וה-endpoints עומדים בפני עצמם ומשרתים כבר את מסך ההרצה הבודדת; ה-orchestrator (שטרם נבנה) רק יצרוך אותם.
6. **gapfill לא ייחשף בחלון ההרצה המלאה** — רק במסך ההרצה הבודדת. ה-checkbox בחלון המלא נשאר בינארי (`fresh`/`continue`).
7. **בנייה בלבד:** שום ריצה מול ה-RDS החי בלי אישור נפרד.

## 1. טבלת `MigrationCheckpoint` (ב-RDS המטרה)

```sql
CREATE TABLE IF NOT EXISTS MigrationCheckpoint (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  MappingName VARCHAR(100) NOT NULL,
  LastSourceId VARCHAR(64) NULL,
  Status VARCHAR(20) NOT NULL DEFAULT 'in_progress',  -- in_progress | completed
  LastRunAt DATETIME NOT NULL,
  CompletedAt DATETIME NULL,
  RowsMigrated INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_mapping (MappingName)
)
```

- שורה אחת פר mapping — זו "המפה" המוצגת ב-UI.
- כל התאריכים נכתבים עם `UTC_TIMESTAMP()` בצד SQL — קונבנציית ה-UTC של היעד, ועוקף את בעיית ה-double-shift של mysql2 עם JS Dates.
- `RowsMigrated` — מונה מצטבר של שורות שהוכנסו (inserted) לאורך כל הריצות מאז ה-reset האחרון.

## 2. Service — `server/src/services/migration-checkpoint.js`

לפי התבנית של `legacy-mapping.js`:

| פונקציה | תפקיד |
|---|---|
| `ensureTable()` | יצירה עצלה לפני שימוש ראשון |
| `get(mappingName)` | קריאת נקודת ההמשך בתחילת ריצת continue |
| `upsert(mappingName, lastSourceId, insertedDelta)` | `INSERT ... ON DUPLICATE KEY UPDATE`; נקרא בכל batch; מציב `Status='in_progress'`, מעדכן `LastRunAt`, מוסיף ל-`RowsMigrated` |
| `markCompleted(mappingName)` | `Status='completed'`, `CompletedAt=UTC_TIMESTAMP()`; upsert — יוצר את השורה אם אינה קיימת (ריצה שהסתיימה בלי אף batch) |
| `resetForMapping(mappingName)` | מחיקת השורה (מצב fresh) |
| `list()` | כל המפה, לתצוגה ב-UI |

## 3. אינטגרציה במנועים

### המנוע הגנרי (`migration-engine.js`)

פרמטר חדש `startMode` עם שלושה ערכים:

- **`continue` (ברירת מחדל):** בתחילת `run()` — `checkpoint.get(mappingName)` מזריע את `lastId` ההתחלתי מ-`LastSourceId`. לולאת ה-keyset הקיימת לא משתנה — פשוט מתחילה מהסמן במקום מ-null.
- **`fresh`:** `lastId` מתחיל null; שורת ה-checkpoint נמחקת במסלול ה-restart הקיים (`migration-manager.js` restartMigration — לצד `cleanupForRestart` ומחיקת LegacyMapping, נוסיף `checkpoint.resetForMapping()`).
- **`gapfill`:** `lastId` מתחיל null, אבל המנוע טוען מראש קבוצת ID-ים קיימים ומדלג עליהם (הכללה של תבנית ה-Set ב-donation-engine):
  - מיפויי `preserveSourceId` → `SELECT Id FROM <targetTable>`
  - מיפויים בלי preserveSourceId (Type3 וכו') → `SELECT source_id FROM id_mappings WHERE entity_type=?`

**נקודות כתיבה:** `checkpoint.upsert(...)` באותו מקום שבו נקרא `updateRunCounters` בכל batch; `markCompleted` בסיום מוצלח. ריצת continue יוצרת run חדש רגיל ב-`migration_runs` — ה-tracker הפר-ריצתי לא משתנה; רק מקור ה-`lastId` ההתחלתי שונה.

### מנועים ייעודיים

- **Donation / PrayName / Asakim / VideoGallery** — אותה לולאת keyset, אותם שלושה תפרים: הזרעת `lastId` מה-checkpoint, upsert פר-batch, markCompleted בסיום. הדילוג-מול-יעד המובנה של Donation נשאר פעיל גם ב-continue (רשת ביטחון זולה).
- **Recruiter / RecruitersGroup (מנועי bulk)** — אין סמן ID; ה-checkpoint שלהם הוא סמן השלמה בלבד (`LastSourceId=NULL`, רק `Status`+`CompletedAt`). ב-continue של ההרצה המלאה, שלב bulk עם `Status='completed'` מדולג; רענון שלהם — דרך fresh או הרצה ידנית.

## 4. חיבור לחלון ההרצה המלאה ול-API

### זרימת ה-checkbox

ה-checkbox של דף ה-pipeline כבר ממופה בתוכנית ה-orchestrator ל-`mode: "fresh" | "continue"` ב-`POST /api/pipeline/start`. הפיצ'ר הזה מגדיר את המשמעות פר-שלב:

- **continue** — כל שלב מופעל עם `startMode:'continue'`; שלב bulk שהושלם מדולג; שאר השלבים מסיימים מהר אם אין שורות חדשות מעל הסמן.
- **fresh** — ה-orchestrator מאפס כל שלב לפני הרצתו: מסלול ה-restart הקיים + `resetForMapping`.

### Endpoints חדשים

- `GET /api/checkpoints` — כל המפה (ל-UI)
- `DELETE /api/checkpoints/:mappingName` — איפוס ידני של mapping בודד

### UI

- **חלון ההרצה המלאה:** טבלת מפה קריאה-בלבד — mapping, ID אחרון, סטטוס, תאריך/שעה, מונה שורות. משמשת גם אינדיקציה חיה (מתעדכנת כל batch; ה-WebSocket הקיים כבר משדר התקדמות).
- **מסך ההרצה הבודדת (`MigrationRunner.jsx`):** בורר מצב `continue / fresh / gapfill` פר-mapping.

## 5. שגיאות, עמידות ומקרי קצה

- **סדר כתיבה:** ה-checkpoint נכתב אחרי עיבוד ה-batch — קריסה בין לבין גורמת לעיבוד חוזר של ה-batch האחרון בלבד, שהוא בטוח (duplicate key נתפס ב-preserveSourceId; `dedupColumns` מטופל). זהה לסמנטיקת ה-resume הקיימת.
- **כשל בכתיבת ה-upsert עצמו:** הריצה ממשיכה; הסמן מפגר מעט — תמיד לכיוון הבטוח (עיבוד חוזר, לא דילוג).
- **paused / failed:** נשאר `Status='in_progress'`; ה-continue הבא ממשיך מהסמן. אין מצב מיוחד.
- **איפוס tracker (`clearAllHistory`):** לא נוגע בטבלה ביעד — ההמשכיות שורדת.
- **כמה mappings לאותה טבלת יעד** (Funds/Collections→Project, Type3_Parents/Subs→ProjectItem): אין התנגשות — המפתח `MappingName`, הסמן על ID-ים של המקור בשאילתת אותו mapping.
- **שינוי היקף בין ריצות** (למשל עדכון Terminal שמכניס לסקופ מוצרים ישנים): שורות עם ID מתחת לסמן לא ייתפסו ב-continue — זה התרחיש של gapfill. מתועד למפעילה.
- **`LastSourceId` VARCHAR, השוואה נומרית** בשאילתת ה-keyset — התנהגות קיימת, לא משתנה.
- **סדר תלות בין שלבים** (Type3_Subs לפני השלמת דונציות וכו') — נאכף ב-`pipeline.json`, לא באחריות הפיצ'ר.

## 6. בדיקות

לפי קונבנציית `server/scripts/tests/`:

1. **Service** — upsert יוצר/מעדכן שורה יחידה; get מחזיר; reset מוחק; תאריכים ב-UTC.
2. **מנוע** — ריצה על mapping קטן, עצירה באמצע, continue — מתחילה מהסמן ולא מעבדת שוב שורות.
3. **gapfill** — מחיקה ידנית של שורה מאמצע הטווח ביעד, ריצת gapfill, רק היא מושלמת.
4. **fresh** — שורת ה-checkpoint נמחקת במסלול ה-restart.
