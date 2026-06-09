#!/usr/bin/env node
/**
 * Generic READ-ONLY verification for preserveSourceId migrations.
 * Performs NO writes. Doubles as a PRE-run safety check (target empty) and a
 * POST-run verification (counts + Id identity hold).
 *
 * Usage: node scripts/validate/verify-preserve-id.js <MappingName>
 *   e.g. node scripts/validate/verify-preserve-id.js SourceMapping
 */
const path = require("path");
const SERVER = path.resolve(__dirname, "../../server/src");
const mssql = require(path.join(SERVER, "db/mssql"));
const targetDb = require(path.join(SERVER, "db/mysql-target"));
const trackerDb = require(path.join(SERVER, "db/mysql-tracker"));

const name = process.argv[2];
if (!name) { console.error("Usage: node verify-preserve-id.js <MappingName>"); process.exit(1); }
const mapping = require(path.resolve(__dirname, "../../server/mappings/" + name + ".json"));

function pass(c) { return c ? "✅" : "❌"; }

async function realTable(n) {
  const [rows] = await targetDb.query(
    "SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME)=LOWER(?) LIMIT 1", [n]
  );
  return rows.length ? rows[0].t : null;
}

// How many mappings write into the same target table (shared target → 'extra' rows are expected).
function countMappingsTargeting(table) {
  const fs = require("fs");
  const dir = path.resolve(__dirname, "../../server/mappings");
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_meta.json") continue;
    try { const mm = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (mm.targetTable === table) n++; } catch (e) {}
  }
  return n;
}

async function main() {
  const m = mapping;
  const sidCol = m.sourceIdColumn || "Id";
  const idCol = m.targetIdColumn || "Id";
  const entityType = (m._meta && m._meta.entityType) || m.filename || m.targetTable;
  console.log("=== preserveSourceId verification: " + name + " (READ-ONLY) ===\n");
  console.log("preserveSourceId=" + (m.preserveSourceId === true) +
    " | source=" + m.sourceTable + "(" + sidCol + ") → target=" + m.targetTable + "(" + idCol + ")" +
    " | entityType=" + entityType + "\n");

  // 1. Source Id set (respect sourceQuery + whereClause + scopeFilter, exactly like the engine)
  let effWhere = m.whereClause || null;
  let scopeNote = "";
  if (m.scopeFilter) {
    const fs = require("fs");
    const fp = path.resolve(__dirname, "../../server/data", m.scopeFilter.file);
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    const ids = (Array.isArray(raw) ? raw : (raw.productIds || raw.ids || [])).map(Number).filter((n) => !isNaN(n));
    const scopeCond = ids.length ? (m.scopeFilter.column + " IN (" + ids.join(",") + ")") : "1=0";
    effWhere = effWhere ? "(" + effWhere + ") AND (" + scopeCond + ")" : scopeCond;
    scopeNote = " | scopeFilter " + m.scopeFilter.file + " (" + ids.length + " ids)";
  }
  const where = effWhere ? " WHERE (" + effWhere + ")" : "";
  const srcSql = m.sourceQuery
    ? "WITH src AS (" + m.sourceQuery + ") SELECT " + sidCol + " id FROM src" + where
    : "SELECT " + sidCol + " id FROM " + m.sourceTable + " WITH (NOLOCK)" + where;
  const src = await mssql.query(srcSql);
  const srcIds = new Set(src.recordset.map((r) => String(r.id)));
  const bad = src.recordset.filter((r) => r.id === null || Number(r.id) <= 0).length;
  console.log("1. Source rows: " + srcIds.size + " | Id<=0/NULL: " + bad + scopeNote + (bad ? "  ⚠️ won't preserve" : ""));

  // 2. Target
  const tbl = await realTable(m.targetTable);
  if (!tbl) { console.log("2. Target table '" + m.targetTable + "' not found."); return; }
  const [tg] = await targetDb.query("SELECT `" + idCol + "` id FROM `" + tbl + "`");
  const tgIds = new Set(tg.map((r) => String(r.id)));
  const [agg] = await targetDb.query("SELECT COUNT(*) cnt, MIN(`" + idCol + "`) mn, MAX(`" + idCol + "`) mx FROM `" + tbl + "`");
  const cnt = Number(agg[0].cnt);
  const nShare = countMappingsTargeting(m.targetTable);
  const shared = nShare > 1;
  console.log("2. Target " + tbl + " rows: " + cnt + " | Id range: " + agg[0].mn + "-" + agg[0].mx +
    (shared ? " | ⚠️ shared target (" + nShare + " mappings write here)" : ""));

  // Identity cross-check
  const overlap = [...srcIds].filter((id) => tgIds.has(id)).length;
  const missing = [...srcIds].filter((id) => !tgIds.has(id));
  const extra = [...tgIds].filter((id) => !srcIds.has(id));
  if (cnt === 0) {
    console.log("   (target empty — PRE-run state) " + pass(true) + " no collisions possible");
  } else {
    console.log("   this mapping's source rows present in target: " + overlap + "/" + srcIds.size +
      " | " + pass(missing.length === 0) + " missing: " + missing.length +
      (missing.length ? " [" + missing.slice(0, 10).join(",") + "]" : ""));
    if (shared) {
      console.log("   ℹ️ extra target Ids (from other mappings / reserved rows): " + extra.length + " — informational, not a failure");
    } else {
      console.log("   " + pass(extra.length === 0) + " extra/ghost target Ids: " + extra.length +
        (extra.length ? " [" + extra.slice(0, 10).join(",") + "]" : ""));
    }
  }

  // 3. AUTO_INCREMENT
  const [ai] = await targetDb.query(
    "SELECT AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", [tbl]
  );
  if (cnt === 0) {
    console.log("3. AUTO_INCREMENT=" + ai[0].ai);
  } else {
    const exp = Number(agg[0].mx) + 1;
    console.log("3. AUTO_INCREMENT=" + ai[0].ai + " " + pass(Number(ai[0].ai) >= exp) + " (expected >= " + exp + ")");
  }

  // 4. Tracker latest run
  const [runs] = await trackerDb.query(
    "SELECT id,status,processed_rows,inserted_rows,error_rows FROM migration_runs WHERE mapping_name=? ORDER BY id DESC LIMIT 1", [name]
  );
  if (runs.length) {
    const r = runs[0];
    console.log("4. Tracker run #" + r.id + " status=" + r.status + " processed=" + r.processed_rows +
      " inserted=" + r.inserted_rows + " errors=" + r.error_rows + " " + pass(Number(r.error_rows) === 0));
  } else console.log("4. Tracker: no run yet for " + name);

  // 5. Bridge (this table's own id_mappings)
  const [mp] = await trackerDb.query(
    "SELECT COUNT(*) cnt, SUM(CASE WHEN source_id=target_id THEN 1 ELSE 0 END) same FROM id_mappings WHERE entity_type=?", [entityType]
  );
  const bc = Number(mp[0].cnt), bs = Number(mp[0].same || 0);
  console.log("5. id_mappings bridge (entity_type='" + entityType + "'): rows=" + bc + " source==target=" + bs +
    " " + (bc > 0 ? pass(bs === bc) : "(none yet)"));

  // 6. FK dependencies resolvable via bridge
  if (m.fkMappings && Object.keys(m.fkMappings).length) {
    console.log("6. FK dependencies (resolved via id_mappings bridge):");
    for (const col of Object.keys(m.fkMappings)) {
      const dep = m.fkMappings[col];
      if (typeof dep === "string") {
        const et = dep.replace(".json", "");
        const [d] = await trackerDb.query("SELECT COUNT(*) c FROM id_mappings WHERE entity_type=?", [et]);
        console.log("   " + col + " → entity_type '" + et + "': " + d[0].c + " bridge rows " + pass(Number(d[0].c) > 0));
      }
    }
  }

  console.log("\n=== complete (no writes performed) ===");
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
