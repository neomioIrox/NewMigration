const assert=require("assert");
const PrayNameEngine=require("../../src/engine/prayname-engine");

// DB-free: _getSourceQuery is pure once orderScope is injected. Guards the 2026-07-15
// alignment with the donation engine's OR-scope (project all-time OR prayer all-time
// OR recent) — a bare-cutoff filter here silently drops pre-cutoff prayer names whose
// donations DID migrate.

var e=new PrayNameEngine({});

// 1. without a built scope the query must throw, not fall back to a cutoff-only filter
assert.throws(function(){e._getSourceQuery();},/order scope not built/);

// 2. with an injected scope, the predicate is embedded verbatim after the charge filter
e.orderScope="(o.ProjectId IN (5,7) OR o.PrayerId IN (9) OR o.DateCreated >= '2025-06-01')";
var sql=e._getSourceQuery();
assert.ok(/INNER JOIN Orders o WITH \(NOLOCK\) ON pn\.OrderId = o\.OrdersId/.test(sql),sql);
assert.ok(/WHERE o\.ChargeStatus = 'OrderFinished'/.test(sql),sql);
assert.ok(sql.indexOf(" AND "+e.orderScope)!==-1,"OR-scope must be ANDed to the charge filter: "+sql);
assert.ok(!/AND o\.DateCreated >= '/.test(sql.replace(e.orderScope,"")),"no leftover bare-cutoff filter outside the OR-scope");

// 3. the batch loop wraps it as a CTE and keysets by PrayerNamesId — shape must stay CTE-safe
var cte="WITH src AS ("+sql+") SELECT TOP 5 * FROM src WHERE PrayerNamesId>100 ORDER BY PrayerNamesId ASC";
assert.ok(cte.indexOf("(SELECT pn.PrayerNamesId")!==-1);

console.log("test-prayname-scope: ALL PASS");
