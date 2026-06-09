# Affiliate / Source Repair & Re-run

Scripts for the Affiliate (`ParentSources → Affiliate`) and Source (`UserSources → Source`) migration area. Supports two paths:

- **In-place repair** — fix the existing broken data without deleting anything. Safe when Donation already references Source and cannot be dropped.
- **Full cleanup + re-run** — delete everything and re-migrate. Requires first handling `Donation.SourceId` FK (1.39M rows).

All scripts are read-only unless invoked with `--execute`. Connections come from the root `.env` via `scripts/validate/lib/db.js`.

## Scripts

| Script | Purpose |
|---|---|
| `01-precheck.js` | Read-only status report across all 3 DBs. Writes JSON to `reports/`. |
| `02-cleanup.js` | Full-reset cleanup. Dry-run by default. **Blocked by `FK_Donation_SI_Source` unless Donation.SourceId is pre-nulled.** |
| `03-set-default-source-id.js` | Populates `Affiliate.DefaultSourceId` from ParentSources.Code ↔ Source.SourceCode. |
| `04-inplace-fix.js` | In-place repair: fills `Source.Description` NULLs, creates User per `Affiliate` with `UserId=NULL`, reports ghost rows. |
| `../validate/checks/15-affiliate-source-rerun.js` | Validation check module (auto-discovered). |

## Path A — In-place repair (recommended for current state)

Use when existing rows must be preserved because `Donation.SourceId` (and other downstream FKs) reference them.

```bash
# 1. Pre-check
node scripts/rerun-affiliate-source/01-precheck.js

# 2. Fix Description + create Users (dry-run first)
node scripts/rerun-affiliate-source/04-inplace-fix.js
node scripts/rerun-affiliate-source/04-inplace-fix.js --execute

# 3. Populate DefaultSourceId
node scripts/rerun-affiliate-source/03-set-default-source-id.js
node scripts/rerun-affiliate-source/03-set-default-source-id.js --execute

# 4. Final validation
node scripts/validate/validate.js --checks 15 --verbose
```

**What 04 does**:
- Processes only rows registered in tracker (99 `AffiliateMapping` + 2,240 `SourceMapping`).
- **Phase A**: For each `Source` with `Description IS NULL`, re-fetches `UserSources` from MSSQL and applies the fallback `Title.trim() || Name.trim() || null`, capped at 100 chars.
- **Phase B**: For each `Affiliate` with `UserId IS NULL`, fetches `ParentSources`, computes user fields via the same logic as `AffiliateMapping.afterInsertMappings`, creates or reuses a `User` by `UserName`, links it, and records `(ParentSources.Id, User.Id)` in tracker as `AffiliateUser`.
- **Ghost report**: Lists `Affiliate`/`Source` rows that are NOT in tracker (inserted outside the engine). Does not modify them.

## Path B — Full cleanup + re-run (future use)

Only needed if a full re-migration is desired (e.g. after schema changes to Source/Affiliate). Current blocker:

```
FK_Donation_SI_Source: Donation.SourceId → Source.Id (1.39M rows)
```

To unblock, `Donation.SourceId` must be nulled before `Source` is deleted, and re-linked after re-migration. This is out of scope for the current fix scripts — it requires a Donation-side mapping strategy (likely via `UserSources.UserSourcesId → new Source.Id` through tracker).

If/when you need it:
1. Extend `02-cleanup.js` with an `--also-null-donation-sourceid` flag that runs `UPDATE Donation SET SourceId = NULL` first
2. Save a snapshot of `Donation.Id → old Source.Id` before nulling
3. After re-migration, re-link via `UserSources.Id → new Source.Id` lookup

## Code updates applied to make next run work

These touch the canonical mapping files and engine, and are relevant for any future clean re-run from the UI:

1. **[server/mappings/AffiliateMapping.json](../../server/mappings/AffiliateMapping.json#L56)** — `afterInsertMappings[0].targetTable` changed from `"user"` to `"User"`. AWS RDS is case-sensitive; the lowercase form silently failed in the previous run, which is why tracker `AffiliateUser` count was 0.
2. **Removed dead `postMigrationScript`** and the `originalSourceId` reference from `AffiliateMapping.json`. The engine never executed it and the referenced column does not exist.
3. **New `postMigrationRunners` engine hook** — [server/src/engine/migration-engine.js](../../server/src/engine/migration-engine.js) now invokes modules listed under `postMigrationRunners` in a mapping JSON, right after the main migration loop completes. Post-runner failures are logged but do not fail the migration (best-effort enrichment).
4. **New post-runner**: [server/src/engine/post-runners/set-default-source-id.js](../../server/src/engine/post-runners/set-default-source-id.js) — idempotent, populates `Affiliate.DefaultSourceId` for tracked Affiliates (Code↔SourceCode match, then lowest Source.Id fallback).
5. **[server/mappings/SourceMapping.json](../../server/mappings/SourceMapping.json)** — added `"postMigrationRunners": ["set-default-source-id"]` so the step runs automatically when SourceMapping migration finishes.

**Result**: a clean UI-driven re-run (AffiliateMapping then SourceMapping) now produces fully-populated data end-to-end, with no manual post-steps needed for `DefaultSourceId`.

## Expected state after repair

- `Affiliate`: 99 tracked rows with `UserId` populated, `DefaultSourceId` populated. 6 ghost rows remain (report printed by `04`).
- `Source`: 2,240 tracked rows. `Description IS NULL` count drops to 0 (ParentSources/UserSources have 0 rows with both Title and Name empty). 7 ghost rows remain.
- `User`: 99 new rows with `RoleId=3` (fewer if any `UserName` already existed).
- `id_mappings`: 99 `AffiliateMapping`, 99 `AffiliateUser`, 2,240 `SourceMapping`.

Run check `15` after the fix to verify all success criteria.
