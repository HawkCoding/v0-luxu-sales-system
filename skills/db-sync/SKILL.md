---
name: db-sync
description: Check whether the local Supabase database matches the hosted dev and production databases, explain any drift, and recommend the fix. Use when the user asks about database drift, "is dev/prod in sync", schema differences between local and hosted, before pushing migrations, or invokes /db-sync.
---

# Database Sync Check

Compares local migrations and local schema against the hosted **dev** and **production**
Supabase projects. Runs entirely locally — never in CI, never on `pull_request`.

## Commands

| Command | What it checks | Speed |
|---|---|---|
| `pnpm db:status` | Migration history only (both targets) | seconds |
| `pnpm db:status:deep` | Migration history **and** real schema diff | ~1–2 min, needs local Supabase up |
| `pnpm db:remote:compare` | Full report: schema dumps, diff, push dry-run | slowest |

Script: `scripts/db-status.ps1`. Exit `0` = in sync, `1` = drift.

Scope flags: `-Target development` / `-Target production` (default both), `-KeepReport`
to keep `tmp-db-sync/` when clean.

## How to run it

1. Run `pnpm db:status` first. If the user asked about schema drift or dashboard edits,
   or migrations look in sync but something is still wrong, run `pnpm db:status:deep`.
2. `-Deep` needs the local stack running. If it reports `SKIPPED`, run `pnpm db:start`
   and retry — don't report a skipped check as clean.
3. On drift, read the generated `tmp-db-sync/status-*/<target>/remote-to-local.sql`
   and summarise the actual objects that differ. Never just relay the line count.

## Reading the result

Three distinct failures, three different fixes:

- **BEHIND** — local migration files not applied to that remote.
  Fix: `pnpm db:remote:push:dev`, or `pnpm db:remote:push:prod` for production.
- **AHEAD** — the remote has a migration version with no local file. Someone pushed
  from another machine or branch. Fix: pull that migration into the repo before
  adding more; do not stack new migrations on top.
- **Schema DRIFT** — migrations agree but the schema does not. Almost always a manual
  edit made in the Supabase dashboard. Fix: `pnpm db:pull`, review the generated
  migration, commit it. Then the dashboard edit becomes tracked history.

The diff direction is `--from <remote> --to local`, so the SQL shown is *what would
have to run against the remote to make it match local*. A `CREATE OR REPLACE FUNCTION`
in the output means the remote's version of that function differs from local's.

Two lines are filtered out as known noise and are never drift:
`SET check_function_bodies = false;` (diff preamble) and `DROP EVENT TRIGGER ensure_rls;`
(a platform-managed trigger that exists on hosted Supabase but never locally).

## Rules

- Read-only. This skill never pushes, never pulls, never writes to a remote database.
  Report the drift and the recommended command; let the user run it.
- Production pushes additionally require `-ConfirmProduction` plus
  `ALLOW_PRODUCTION_DB_PUSH=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION`. Never set that
  variable on the user's behalf.
- Credentials come from `.env.sync.local` (gitignored via `.env*.local`). If a target
  errors with missing connection details, report which variable is missing —
  never print the connection string or password.
- Check drift *before* opening a PR that adds migrations, and don't stack new
  migrations on a branch that is already drifted.
