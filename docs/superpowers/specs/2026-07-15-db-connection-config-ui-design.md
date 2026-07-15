# DB Connection Configuration UI — Design

**Date:** 2026-07-15
**Status:** Approved (brainstorming session)

## Problem

All database connection settings (MSSQL source, MySQL target on RDS, MySQL tracker) live only in the root `.env`, loaded once at server startup by `server/src/config/database.js`. The Connections screen (`client/src/components/ConnectionStatus.jsx`) is read-only: it shows live test status via `GET /api/connections/test` and nothing else. Changing any credential requires hand-editing `.env` and restarting the server.

Goal: edit the three connections conveniently from the UI, with changes taking effect immediately and safely.

## Decisions (locked during brainstorming)

1. **Single environment editing** — one form per connection, no saved profiles.
2. **Persistence: write back to `.env`** — keeps a single source of truth for the server *and* the many standalone scripts (`scripts/`, `server/scripts/`) that require `server/src/config/database.js`. `.env` is already git-ignored.
3. **Live apply, no restart** — implemented by mutating the exported `config` object in place (all consumers hold the same reference) and resetting connection pools. No consumer refactor.
4. **Passwords masked** — the server never returns a password to the client. Empty password field on submit = keep the stored password.
5. **Test-gated apply** — a successful connection test with the candidate values is mandatory before apply, enforced server-side (not only in the UI), because a bad live apply would disconnect the system until fixed.

## Server design

### New module: `server/src/services/connection-config.js`

Three responsibilities:

- **`getRedactedConfig()`** — returns the three config blocks for display. MySQL passwords are omitted and replaced by a `hasPassword` boolean. In the MSSQL connection string, any `Pwd=`/`Password=` token value is replaced with `******` (currently Trusted_Connection, so normally absent).
- **`testCandidate(connection, values)`** — merges submitted values with stored secrets (empty password → stored one), then opens an **isolated** connection that does not touch the live pools:
  - MySQL (target/tracker): `mysql2` `createConnection()` + `ping()` + `end()`.
  - MSSQL: a dedicated `new sql.ConnectionPool(candidate).connect()` (not the global `sql.connect`), then `close()`.
  - Returns `{ success, message }` with the raw driver error message on failure.
- **`applyConfig(connection, values)`** — the ordered apply sequence:
  1. Reject with 409 if a migration run is active (see Guards).
  2. Reject if another apply is in flight (in-memory single-flight lock).
  3. `testCandidate` must succeed — otherwise 400 with the driver message.
  4. Write the managed keys to `.env` (see writer below) and update `process.env`.
  5. Mutate the corresponding block of the exported `config` object **in place** (`Object.assign`), so every module that required it sees the new values.
  6. Reset the affected pool: new `resetPool()` in `server/src/db/mysql-target.js` and `server/src/db/mysql-tracker.js` (best-effort `pool.end()`, then null); `server/src/db/mssql.js` reuses its existing null-and-reconnect mechanism.
  7. Run the module's `testConnection()` and return the fresh status.

If step 4 fails, nothing has been applied (file write precedes mutation) → 500, config unchanged. Errors closing an old pool are swallowed (best-effort).

### `.env` writer

A small pure utility (separate function, unit-testable): given the current file text and a key→value map, it replaces values of **managed keys only**, preserves every other line and comment verbatim, and appends missing managed keys at the end. Managed keys (11):

```
MSSQL_CONNECTION_STRING, MSSQL_DATABASE, MSSQL_REQUEST_TIMEOUT,
MYSQL_TARGET_HOST, MYSQL_TARGET_USER, MYSQL_TARGET_PASSWORD, MYSQL_TARGET_DATABASE,
MYSQL_TRACKER_HOST, MYSQL_TRACKER_USER, MYSQL_TRACKER_PASSWORD, MYSQL_TRACKER_DATABASE
```

If a submitted MSSQL connection string contains the literal mask `******`, the request is rejected with a message asking to re-enter the full credential (no attempt to splice stored secrets into a string).

### API (extend `server/src/routes/connections.js`)

| Method & path | Purpose |
|---|---|
| `GET /api/connections/config` | Current settings, redacted |
| `POST /api/connections/test-config` | Test form values without saving (`{ connection, values }`) |
| `PUT /api/connections/config` | Test + persist + live-apply one connection (`{ connection, values }`); returns fresh status |
| `GET /api/connections/test` | Unchanged (existing status check) |

`connection` ∈ `mssql` \| `mysqlTarget` \| `mysqlTracker`. Basic server-side validation: required fields present, `requestTimeout` numeric.

### Guards

- **Active or paused migration:** `PUT` returns 409 while any migration run is executing or paused (in-memory engine state + pipeline flag + a tracker query on `migration_runs` for status `running`/`paused`, so the guard survives server restarts). Approved amendment 2026-07-15: paused runs block too — a run paused mid-table must not be resumed against a different DB.
- **Concurrent applies:** single-flight in-memory lock; a second concurrent apply gets 409.

## Client design

Extend the Connections page (`ConnectionStatus.jsx`, splitting into subcomponents as needed):

- Each of the three status cards gains an **Edit** button that expands an inline form:
  - **MSSQL:** connection string (textarea), database, request timeout.
  - **MySQL target / tracker:** host, user, password (masked input, placeholder indicates "leave empty to keep current"), database.
- Form buttons:
  - **Test** — calls `POST /test-config` with the form values; shows success/error inline.
  - **Save & Apply** — enabled only after a successful Test of the *current* form values; any subsequent edit disables it again until re-tested.
- After a successful apply, invalidate the react-query `connections` query so statuses refresh.
- UI text in English, matching the existing screen's style.

New `client/src/api/client.js` methods: `getConnectionsConfig()`, `testConnectionConfig(connection, values)`, `saveConnectionConfig(connection, values)`.

## Error handling summary

| Failure | Behavior |
|---|---|
| Candidate test fails | 400 with driver message; nothing saved |
| Migration running / apply in flight | 409; nothing saved |
| `.env` write fails | 500; nothing applied (write precedes mutation) |
| Post-apply verification fails | Config stays applied as saved; error surfaced so the user can correct and re-apply |
| Old pool close fails | Ignored (best-effort) |

## Testing

- **Unit:** the `.env` writer utility (pure text-in/text-out — comment preservation, key replacement, key append, no touching unmanaged keys).
- **Manual E2E:** through the UI against the three real connections — edit, test with wrong values (expect inline driver error, Save disabled), test with correct values, apply, confirm status cards refresh green and a migration dry-run still works; confirm `.env` on disk reflects the change and a standalone script picks it up.

## Out of scope

- Multiple environment profiles / connection presets.
- Authentication/authorization for the tool itself.
- Editing pool tuning options (`connectionLimit`, `charset`, etc.) — these stay hardcoded in `database.js`.
- Automatic server restart flows.
