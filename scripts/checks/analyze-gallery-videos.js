/**
 * Compare old-site display logic vs. our migration
 * - Old Hebrew:  122
 * - Old English: 89
 * - Old French:  89
 */
const mssqlDb = require("../../server/src/db/mssql");

(async () => {
  const pool = await mssqlDb.getPool();
  const q = await pool.request().query(`
    SELECT
      -- Hebrew
      SUM(CASE WHEN Hide = 0 THEN 1 ELSE 0 END) AS he_Hide0,
      SUM(CASE WHEN Hide = 0 AND Name IS NOT NULL AND Name != '' THEN 1 ELSE 0 END) AS he_Hide0_Name,

      -- English
      SUM(CASE WHEN Hide_en = 0 THEN 1 ELSE 0 END) AS en_Hide0,
      SUM(CASE WHEN Hide_en = 0 AND Name_en IS NOT NULL AND Name_en != '' THEN 1 ELSE 0 END) AS en_Hide0_Name,
      SUM(CASE WHEN Hide_en = 0 AND (Name_en IS NOT NULL AND Name_en != '' OR Link_en IS NOT NULL AND Link_en != '') THEN 1 ELSE 0 END) AS en_Hide0_NameOrLink,
      SUM(CASE WHEN Name_en IS NOT NULL AND Name_en != '' THEN 1 ELSE 0 END) AS en_hasName_total,

      -- French
      SUM(CASE WHEN Hide_fr = 0 THEN 1 ELSE 0 END) AS fr_Hide0,
      SUM(CASE WHEN Hide_fr = 0 AND Name_fr IS NOT NULL AND Name_fr != '' THEN 1 ELSE 0 END) AS fr_Hide0_Name,
      SUM(CASE WHEN Hide_fr = 0 AND (Name_fr IS NOT NULL AND Name_fr != '' OR Link_fr IS NOT NULL AND Link_fr != '') THEN 1 ELSE 0 END) AS fr_Hide0_NameOrLink,
      SUM(CASE WHEN Name_fr IS NOT NULL AND Name_fr != '' THEN 1 ELSE 0 END) AS fr_hasName_total,

      COUNT(*) AS total
    FROM Videos WHERE Link IS NOT NULL AND Link != ''
  `);
  console.log("Distribution (source = 127 videos with Link):");
  console.log(q.recordset[0]);

  // Likely answer: old site shows Hide_X=0 regardless of Name_X (89 EN / 89 FR)
  // Our migration: Name_X must be non-empty (82 EN / 84 FR)

  // Show rows we'd ADD if we include Hide_X=0 without Name_X
  const extraEn = await pool.request().query(`
    SELECT TOP 20 VideosId, Name, Name_en, Hide_en, Link, Link_en
    FROM Videos
    WHERE Link IS NOT NULL AND Link != ''
      AND Hide_en = 0
      AND (Name_en IS NULL OR Name_en = '')
    ORDER BY VideosId
  `);
  console.log("\nEN videos WITHOUT Name_en but Hide_en=0 (would add these):");
  console.table(extraEn.recordset);

  const extraFr = await pool.request().query(`
    SELECT TOP 20 VideosId, Name, Name_fr, Hide_fr, Link, Link_fr
    FROM Videos
    WHERE Link IS NOT NULL AND Link != ''
      AND Hide_fr = 0
      AND (Name_fr IS NULL OR Name_fr = '')
    ORDER BY VideosId
  `);
  console.log("\nFR videos WITHOUT Name_fr but Hide_fr=0 (would add these):");
  console.table(extraFr.recordset);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
