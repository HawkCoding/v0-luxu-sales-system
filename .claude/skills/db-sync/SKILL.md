---
name: db-sync
description: Check whether the local Supabase database matches the hosted dev and production databases, explain any drift, and recommend the fix. Use when the user asks about database drift, "is dev/prod in sync", schema differences between local and hosted, before pushing migrations, or invokes /db-sync.
---

Follow the shared project skill at `skills/db-sync/SKILL.md`.

If this file is loaded directly, use these core rules:

- `pnpm db:status` = migration history, both targets, seconds. `pnpm db:status:deep` = also a real schema diff, needs `pnpm db:start` first. Exit 0 in sync, 1 drift.
- BEHIND → `pnpm db:remote:push:dev` / `:prod`. AHEAD or schema DRIFT → `pnpm db:pull`, review, commit.
- Schema drift almost always means a manual edit in the Supabase dashboard.
- Read the generated `tmp-db-sync/status-*/<target>/remote-to-local.sql` and name the objects that differ — never just relay the line count.
- Read-only skill: report and recommend, never push or pull to a remote yourself. Never set `ALLOW_PRODUCTION_DB_PUSH`.
- A `SKIPPED` schema check is not a clean one — start local Supabase and retry.
- Never print connection strings or passwords from `.env.sync.local`.
