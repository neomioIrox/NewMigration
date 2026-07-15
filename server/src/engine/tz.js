/**
 * Timezone handling for all migration writes.
 *
 * Conventions:
 * - Source MSSQL stores Israel WALL-CLOCK time. The msnodesqlv8 driver returns those
 *   values as JS Dates whose UTC components equal the wall clock (i.e. "02:00" comes
 *   back as Date 02:00Z).
 * - Target MySQL (RDS, time_zone=UTC) stores TRUE UTC; the new FE converts for display.
 * - mysql2 (timezone 'local') re-shifts any JS Date on write, which is what created the
 *   original +offset corruption. Therefore NO JS Date may reach mysql2: every datetime
 *   is converted here to a pre-formatted "YYYY-MM-DD HH:MM:SS" UTC string, which the
 *   driver writes verbatim.
 *
 * IMPORTANT: toDbValue() assumes any Date instance in a target row came from the MSSQL
 * driver (wall-clock semantics). Do not pass `new Date()` (a true instant) into insert
 * data — use utcNowString() for "now" timestamps instead.
 */

let ilDtf = null;

function jerusalemOffsetMs(t) {
  if (!ilDtf) {
    ilDtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
  }
  const p = {};
  for (const part of ilDtf.formatToParts(new Date(t))) p[part.type] = part.value;
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return wall - t;
}

function fmtUtc(d) {
  const pad = (x) => String(x).padStart(2, "0");
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate())
    + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
}

// d: Date whose UTC components hold Israel wall-clock time (mssql driver output).
// Returns "YYYY-MM-DD HH:MM:SS" in true UTC, DST-aware.
function ilWallToUtcString(d) {
  if (d === null || d === undefined) return null;
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return null;
  const wall = d.getTime();
  let utc = wall - jerusalemOffsetMs(wall);
  utc = wall - jerusalemOffsetMs(utc); // second pass fixes instants near DST switches
  return fmtUtc(new Date(utc));
}

// Current moment as a UTC string (for CreatedAt/UpdatedAt "now" stamps).
function utcNowString(offsetYears) {
  const n = new Date();
  if (offsetYears) n.setUTCFullYear(n.getUTCFullYear() - offsetYears);
  return fmtUtc(n);
}

// Normalize a value on its way into a target-DB INSERT/UPDATE:
// Date instances (source wall-clock dates) become UTC strings; everything else passes.
function toDbValue(v) {
  return v instanceof Date ? ilWallToUtcString(v) : v;
}

module.exports = { jerusalemOffsetMs, ilWallToUtcString, utcNowString, toDbValue, fmtUtc };
