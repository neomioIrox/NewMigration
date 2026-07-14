# LegacyMapping Table — Design Spec

**Date:** 2026-07-14
**Status:** Approved by user (name, schema, and behavior confirmed)

## Purpose

The new application needs a runtime lookup from legacy identifiers to the new
Project/ProjectItem pair — e.g. to resolve old product URLs (`productsid`) to the
new project/item pages. Today this mapping exists only in the local
`migration_tracker.id_mappings` database, which does not travel with the target
RDS. This feature persists the mapping **inside the target DB itself**, populated
by the migration engine as each project-producing mapping runs.

Primary consumer: the new application at runtime. Secondary: audit/QA.

## Scope

Rows are written for **both key spaces**:

| SourceType | Meaning | Source key | Produced by |
|---|---|---|---|
| 1 | Product | `products.productsid` | ProjectMapping_Collections_Fixed, ProjectMapping_Funds_Fixed, ProjectMapping_Type3_Parents, ProjectMapping_Type3_Subs |
| 2 | Prayer | `PrayerNames` id | PrayerMapping (collapse mode under Project 1) |

Out of scope: backfill of the currently-migrated (dirty) data — the table fills
on the next clean run (engine-only, consistent with the standing "engine-only,
no backfills" directive). No changes to the donation/prayname/other engines —
they continue to resolve via the local tracker.

## Table (target RDS — PascalCase per convention)

```sql
CREATE TABLE IF NOT EXISTS LegacyMapping (
  Id          INT AUTO_INCREMENT PRIMARY KEY,
  SourceType  TINYINT NOT NULL,          -- 1=Product, 2=Prayer
  SourceId    INT NOT NULL,              -- legacy id (productsid / PrayerNames id)
  ProjectId   INT NOT NULL,              -- new Project.Id
  ItemId      INT NOT NULL,              -- new ProjectItem.Id
  MappingName VARCHAR(100) NOT NULL,     -- mapping entityType that produced the row
  CreatedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY UK_Source (SourceType, SourceId),
  INDEX IX_Project (ProjectId),
  INDEX IX_Item (ItemId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Notes:
- `UNIQUE (SourceType, SourceId)` — one row per legacy entity. All current
  mappings create exactly one ProjectItem per source row (single
  `projectItemMappings` key since the 2026-07-14 removal of the hidden
  catch-all donation item). Writes are UPSERTs, so a re-run updates in place.
- `CreatedAt` uses target-server time (RDS convention is UTC).

## Component: `server/src/services/legacy-mapping.js`

Shared module over the **target** DB pool (`db/mysql-target`), three functions:

- `ensureTable()` — runs the `CREATE TABLE IF NOT EXISTS` above. Idempotent.
- `deleteForMapping(mappingName)` — `DELETE FROM LegacyMapping WHERE MappingName = ?`.
- `record(sourceType, sourceId, projectId, itemId, mappingName)` —
  `INSERT ... ON DUPLICATE KEY UPDATE ProjectId=VALUES(ProjectId),
  ItemId=VALUES(ItemId), MappingName=VALUES(MappingName)`.

## Engine integration (opt-in per mapping)

A mapping opts in via a new JSON key:

```json
"legacyMapping": { "sourceType": 1 }
```

(`1` in the four product mappings, `2` in PrayerMapping.) Mappings without the
key are untouched — fully backward compatible.

Hook points in `migration-engine.js`:

1. **Run start** (alongside `preMigrationRunners`): if `m.legacyMapping`, call
   `ensureTable()`. This satisfies "create the table if it doesn't exist".
2. **Restart cleanup**: wherever the run's tracker cleanup happens
   (`cleanupForRestart`), also call `deleteForMapping(entityType)`. This is the
   chosen cleanup semantic — **delete-per-mapping, no global TRUNCATE** — so a
   full fresh migration cycle naturally rebuilds the whole table, and a solo
   re-run of one mapping never wipes the other mappings' rows.
   **Correctness constraint:** the delete fires ONLY together with
   `cleanupForRestart` (which also wipes `row_status`). It must NOT run at
   ordinary run start — ordinary re-runs are gap-fills (skip-existing) that
   would never re-insert the deleted rows, silently losing mappings.
3. **Item insert** (immediately after the existing
   `recordMapping("ProjectItem_"+itemKey, sourceId, itemId, runId)` call): if
   `m.legacyMapping`, call
   `record(m.legacyMapping.sourceType, sourceId, newId, itemId, entityType)`.
   `newId` is the ProjectId in both normal and collapse modes (in collapse mode
   it is the resolved parent ProjectId — constant, per-row column, or map file).

### Error handling

A failed `LegacyMapping` write is treated like any other child-insert failure:
the row errors, is logged to `migration_errors`, and is retryable via the
normal gap-fill re-run. It is NOT swallowed — the table is app-critical.

Resume (skip-existing) runs skip already-processed rows, so no duplicate writes;
the UPSERT covers any edge case where a row is reprocessed.

## QA check script

`server/scripts/checks/check-legacy-mapping.js` (read-only): compares
`LegacyMapping` row counts per `MappingName`/`SourceType` against the local
tracker's `id_mappings` (`entity_type LIKE 'ProjectItem_%'` per mapping run),
lists missing/extra SourceIds. No data mutation.

## Testing / rollout

- Build-only until live-run authorization (standing project rule). The module
  and engine hooks ship with the next clean re-run; the QA script validates
  after that run.
- The five mapping JSONs get the `legacyMapping` key as part of this change.

## Explicitly not in scope

- No backfill script from the current tracker.
- No global TRUNCATE path (cleanup is always per-MappingName).
- No changes to donation-engine/prayname-engine resolution (still tracker-based).
- No FE/BE application code — this delivers the table and its population only.
