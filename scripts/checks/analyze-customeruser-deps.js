// Read-only: verify FK sentinels, LUT values, and source row-count gap for CustomerUser
const mssql = require("../../server/src/db/mssql");
const mysql = require("../../server/src/db/mysql-target");

async function main() {
  const out = {};

  // Target: does User.Id = -1 (sentinel) exist? CreatedBy/UpdatedBy/StatusChangedBy const -1 FK -> User.Id
  const u = await mysql.query("SELECT Id FROM `User` WHERE Id = -1");
  out.userMinus1Exists = u[0].length > 0;
  const uAny = await mysql.query("SELECT COUNT(*) AS c FROM `User`");
  out.userTableCount = uAny[0][0].c;

  // Target: LutRecordStatus ids (need Id=2 for const RecordStatus)
  const rs = await mysql.query("SELECT Id FROM `LutRecordStatus` ORDER BY Id");
  out.lutRecordStatusIds = rs[0].map(r => r.Id);

  // Target: LutGender ids (Gender FK, mapping=null so just informational)
  try { const g = await mysql.query("SELECT Id FROM `LutGender` ORDER BY Id"); out.lutGenderIds = g[0].map(r => r.Id); }
  catch (e) { out.lutGenderIds = "ERR: " + e.message; }

  // Source: Discriminator distribution (explain 4305 vs ~3839 expected)
  const disc = await mssql.query("SELECT Discriminator, COUNT(*) AS c FROM Users GROUP BY Discriminator ORDER BY COUNT(*) DESC");
  out.discriminator = disc.recordset;

  // Source: which UserName values are duplicated (exact, case-insens, trimmed)
  const dups = await mssql.query(`
    SELECT LOWER(LTRIM(RTRIM(UserName))) AS u, COUNT(*) AS c
    FROM Users WHERE UserName IS NOT NULL AND LTRIM(RTRIM(UserName)) <> ''
    GROUP BY LOWER(LTRIM(RTRIM(UserName))) HAVING COUNT(*) > 1`);
  out.dupUserNameValues = dups.recordset;

  // Source: any UserName already literally matching the generated 'user'+Id fallback pattern?
  const clashFallback = await mssql.query(`
    SELECT COUNT(*) AS c FROM Users
    WHERE UserName IS NOT NULL AND LTRIM(RTRIM(UserName)) <> ''
      AND LOWER(LTRIM(RTRIM(UserName))) LIKE 'user[0-9]%'`);
  out.usernamesLikeUserNNN = clashFallback.recordset[0].c;

  // Source: longest UserName / Email / FirstName / LastName to assess truncation loss
  const lens = await mssql.query(`
    SELECT MAX(LEN(UserName)) AS maxUser, MAX(LEN(Email)) AS maxEmail,
           MAX(LEN(FirstName)) AS maxFirst, MAX(LEN(LastName)) AS maxLast,
           MAX(LEN(PasswordHash)) AS maxPwd
    FROM Users`);
  out.maxLengths = lens.recordset[0];

  // Source: how many UserName > 35 (would be truncated)?
  const over = await mssql.query("SELECT COUNT(*) AS c FROM Users WHERE LEN(UserName) > 35");
  out.userNameOver35 = over.recordset[0].c;
  const emailOver = await mssql.query("SELECT COUNT(*) AS c FROM Users WHERE LEN(Email) > 100");
  out.emailOver100 = emailOver.recordset[0].c;

  require("fs").writeFileSync(require("path").resolve(__dirname, "customeruser-deps.json"), JSON.stringify(out, null, 2));
  console.log("WROTE customeruser-deps.json");
  process.exit(0);
}
main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
