// Read-only pre-migration analysis for CustomerUser (Users -> CustomerUser)
const mssql = require("../../server/src/db/mssql");
const mysql = require("../../server/src/db/mysql-target");
const tracker = require("../../server/src/db/mysql-tracker");

async function main() {
  const out = {};

  // 1. Source: Users columns
  const srcCols = await mssql.query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' ORDER BY ORDINAL_POSITION`);
  out.sourceColumns = srcCols.recordset;

  // 2. Source row count + key data-quality stats
  const srcCount = await mssql.query(`SELECT COUNT(*) AS total FROM Users`);
  out.sourceTotal = srcCount.recordset[0].total;

  const stats = await mssql.query(`
    SELECT
      SUM(CASE WHEN UserName IS NULL OR LTRIM(RTRIM(UserName))='' THEN 1 ELSE 0 END) AS null_username,
      SUM(CASE WHEN Email IS NULL OR LTRIM(RTRIM(Email))='' THEN 1 ELSE 0 END) AS null_email,
      SUM(CASE WHEN PasswordHash IS NULL OR LTRIM(RTRIM(PasswordHash))='' THEN 1 ELSE 0 END) AS null_pwd,
      SUM(CASE WHEN FirstName IS NULL OR LTRIM(RTRIM(FirstName))='' THEN 1 ELSE 0 END) AS null_first
    FROM Users`);
  out.sourceStats = stats.recordset[0];

  // UserName duplicate analysis (the unique-constraint risk)
  const dupUser = await mssql.query(`
    SELECT COUNT(*) AS dup_groups, SUM(c) AS dup_rows FROM (
      SELECT LOWER(LTRIM(RTRIM(UserName))) AS u, COUNT(*) AS c
      FROM Users WHERE UserName IS NOT NULL AND LTRIM(RTRIM(UserName)) <> ''
      GROUP BY LOWER(LTRIM(RTRIM(UserName))) HAVING COUNT(*) > 1) t`);
  out.dupUserName = dupUser.recordset[0];

  // truncated UserName collision risk (first 35 chars)
  const dupTrunc = await mssql.query(`
    SELECT COUNT(*) AS dup_groups FROM (
      SELECT LOWER(LEFT(LTRIM(RTRIM(UserName)),35)) AS u, COUNT(*) AS c
      FROM Users WHERE UserName IS NOT NULL AND LTRIM(RTRIM(UserName)) <> ''
      GROUP BY LOWER(LEFT(LTRIM(RTRIM(UserName)),35)) HAVING COUNT(*) > 1) t`);
  out.dupUserNameTrunc35 = dupTrunc.recordset[0].dup_groups;

  // 3. Target: CustomerUser columns
  const tgtCols = await mysql.query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='kupathairnew' AND TABLE_NAME='CustomerUser' ORDER BY ORDINAL_POSITION`);
  out.targetColumns = tgtCols[0];

  // 3b. Target constraints (unique/PK/FK)
  const tgtCons = await mysql.query(`
    SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      ON tc.CONSTRAINT_NAME=kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA=kcu.TABLE_SCHEMA AND tc.TABLE_NAME=kcu.TABLE_NAME
    WHERE tc.TABLE_SCHEMA='kupathairnew' AND tc.TABLE_NAME='CustomerUser'`);
  out.targetConstraints = tgtCons[0];

  // 3c. Target indexes (catch UNIQUE on UserName/Email)
  const tgtIdx = await mysql.query(`SHOW INDEX FROM \`CustomerUser\` FROM kupathairnew`);
  out.targetIndexes = tgtIdx[0].map(i => ({ key: i.Key_name, col: i.Column_name, unique: i.Non_unique === 0 }));

  // 3d. Existing target rows
  const tgtCount = await mysql.query(`SELECT COUNT(*) AS existing FROM \`CustomerUser\``);
  out.targetExisting = tgtCount[0][0].existing;

  // 4. Tracker: existing CustomerUser id_mappings
  try {
    const trk = await tracker.query(`SELECT COUNT(*) AS c FROM id_mappings WHERE entity_type='CustomerUser'`);
    out.trackerCustomerUser = trk[0][0].c;
  } catch (e) { out.trackerCustomerUser = "ERR: " + e.message; }

  require("fs").writeFileSync(require("path").resolve(__dirname, "customeruser-analysis.json"), JSON.stringify(out, null, 2));
  console.log("WROTE customeruser-analysis.json");
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
