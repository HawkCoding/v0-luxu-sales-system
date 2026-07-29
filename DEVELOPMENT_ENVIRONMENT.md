# Development Environment Consolidation

## One-time local machine setup

This project uses **pnpm** exclusively. Before working locally, run once:

```bash
npm install -g corepack@latest
corepack enable
```

This makes `pnpm` available in your terminal. After this, always use:

```bash
pnpm add <package>        # install a new dependency
pnpm install              # restore all dependencies
pnpm install --lockfile-only  # regenerate pnpm-lock.yaml without touching node_modules
pnpm import               # regenerate pnpm-lock.yaml from package-lock.json (recovery only)
```

> **Never use `npm install` or `yarn` in this project.** The `preinstall` script in `package.json` will block these automatically. If you see an "Use the right package manager" error, it means you ran `npm install` — switch to `pnpm install` instead.

## Daily local startup

For the normal local development flow, start everything with:

```bash
pnpm local:start
```

This command:

- starts the local Supabase stack with Docker
- reads the local Supabase URL and keys from `supabase status -o env`
- launches the shared `pnpm dev` wrapper with those runtime values
- keeps any optional secrets from `.env.local`, such as `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- automatically clears a stale `.next/dev/lock` before Next.js boots again

When using `pnpm local:start`, do not rely on hosted `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` values in `.env.local`. The command provides local versions automatically for that session.

Prerequisites:

- Docker Desktop must be running before you start the local Supabase stack
- run `pnpm install` once after pulling dependencies

If the local Supabase stack is already running and you only need to restart the app server, use:

```bash
pnpm dev
```

This restarts only Next.js and uses the same lockfile cleanup path as `pnpm local:start`.

Stopping the local database stack:

```bash
pnpm db:stop
```

## Restart Troubleshooting

If `pnpm dev` or `pnpm local:start` reports `.next/dev/lock`, the shared launcher now handles the common stale-lock case automatically. If you still see that message, it usually means another local dev session is genuinely still running and should be stopped first.

The local Next.js app is pinned to `http://localhost:3000`. Do not start a second copy of the app on fallback ports such as `3001`. If port `3000` is already in use, use the existing app running there instead of launching another instance.

Common restart problems:

- Docker Desktop is not running, so `supabase start` cannot bring up the local stack
- one of the local Supabase ports is already in use: `54321`, `54322`, `54323`, or `54324`
- local auth redirects assume the app is running at `http://localhost:3000`
- `pnpm db:stop` only stops the local Supabase stack; use `Ctrl+C` to stop the app server without touching the database

## Environment Migration (Desktop Backup)

To move your full local dev setup to another Windows machine, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-dev-environment.ps1 -IncludeVolumeSnapshots
```

Optional heavy image export:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-dev-environment.ps1 -IncludeVolumeSnapshots -IncludeDockerImages
```

What this export includes:

- full workspace copy
- Cursor user settings from `%APPDATA%\Cursor\User`
- PowerShell profiles and Windows Terminal settings (if present)
- local caches (unless `-SkipCaches` is passed)
- Docker/Supabase runtime metadata
- Supabase local SQL dumps (`schema.sql` + `data.sql`) when available, with container fallback dump (unless `-SkipDbDump` is passed)
- optional Docker volume snapshots and image tar exports

Restore on the new machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-dev-environment.ps1 -BackupRoot "<path-to-Cursor-Migration-folder>" -RestoreWebsiteState -StartSupabase -RestoreDb
```

Notes:

- If DB container discovery differs on the new machine, pass `-DbContainerName`.
- If `postgres` defaults are wrong, pass `-DbUser` and `-DbName`.
- If you need caches restored, include `-RestoreCaches`.
- If local paths changed, review `_restored-website-state/runtime-bind-mappings.json` and remap bind mounts.

## Supabase Migration Metadata Repair

If `npx supabase migration list --linked` shows the same migration as both local-only and remote-only, but schema apply already succeeded, this is usually migration-history metadata drift.

Recommended repair workflow (metadata only):

1. Capture baseline:
   - `npx supabase migration list --linked`
2. If a migration ID is not in full timestamp format (`YYYYMMDDHHMMSS`), normalize the local filename first.
3. Repair linked history:
   - `npx supabase migration repair <old_version> --status reverted --linked --yes`
   - `npx supabase migration repair <canonical_version> --status applied --linked --yes`
4. Verify:
   - `npx supabase migration list --linked`

Use this only for history bookkeeping mismatches, not for fixing failed schema migrations.

## Local to Hosted Database Sync

Use the guarded remote sync helper when local Supabase needs to be compared with hosted development and production:

```powershell
pnpm db:remote:compare
```

The helper expects direct Postgres connection strings, not API URLs. Set them in your shell or in a gitignored `.env.sync.local` file:

```env
SUPABASE_DEV_DB_URL=postgresql://postgres.<dev-ref>:<password>@aws-0-...pooler.supabase.com:6543/postgres
SUPABASE_PROD_DB_URL=postgresql://postgres.<prod-ref>:<password>@aws-0-...pooler.supabase.com:6543/postgres
```

What compare mode does:

- lists local and remote migration history
- dumps local and remote `public` schema
- writes a remote-to-local schema diff
- runs a Supabase migration push dry-run
- stores reports under `tmp-db-sync/`

To apply local migrations to hosted development:

```powershell
pnpm db:remote:push:dev
```

To apply to production, use the explicit production opt-in:

```powershell
$env:ALLOW_PRODUCTION_DB_PUSH="I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION"
pnpm db:remote:push:prod
```

Add `-IncludeSeed` only when you intentionally want Supabase CLI to apply `supabase/seed.sql` as part of the push. Do not use this helper to overwrite production business data; it is for schema migrations and intentional seed data only.

## CI Drift Detection & Automated Production Push

`.github/workflows/db-migrations.yml` closes the gap that manual pushing leaves open — dev/prod repeatedly drifted because pushing migrations after a merge relied on someone remembering to run the commands above.

- **Any PR into `dev` or `main`**: a `pr-drift-check` job runs `scripts/check-migration-drift.ps1` against the base branch's current hosted DB (dev or prod respectively) and fails the PR if that branch is already behind. It checks out the PR's base commit, not the PR branch, so it never flags the PR's own not-yet-pushed migrations — only pre-existing drift.
- **Push to `main`**: a `migrate-prod` job runs `pnpm db:remote:push:prod` automatically (non-interactively) — this only fires from a merged `dev → main` promotion PR, since the pre-push git hook blocks direct pushes to `main`.
- **Push to `dev` or `main`**: a `push-drift-check` job re-runs the check post-merge (after `migrate-prod` for `main`) as the authoritative confirmation the branch and its hosted DB match.
- Dev is still pushed manually (`pnpm db:remote:push:dev`) — only prod is automated. Run `pnpm db:check-drift:dev` / `pnpm db:check-drift:prod` locally to reproduce what CI checks.
- Requires `SUPABASE_DEV_DB_URL` and `SUPABASE_PROD_DB_URL` (or the `_PROJECT_REF`/`_DB_PASSWORD` pair) set as GitHub Actions repo secrets, mirroring `.env.sync.local`.

**Known limitation:** Vercel's production deploy triggers independently off the same `push to main` event, so there's no guarantee the DB push finishes before the new code deploys.

---

This project uses a development-first workflow:

- `develop` branch = integration branch for day-to-day work
- `main` branch = production releases only
- Vercel Preview = should use Supabase development branch credentials
- Vercel Production = should use Supabase production credentials

## Vercel Environment Variables

Set these in Vercel for the **Preview** environment:

- `NEXT_PUBLIC_SUPABASE_URL` = Supabase development branch URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase development branch anon key
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase development branch service role key

Set these in Vercel for the **Production** environment:

- `NEXT_PUBLIC_SUPABASE_URL` = Supabase production URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase production anon key
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase production service role key

## Supabase Branch Creation Note

The current Cursor MCP Supabase connection in this workspace requires `confirm_cost_id` for `create_branch`, but the `confirm_cost` helper tool is not exposed in the available tool descriptors. If this blocks automation, create the development branch once in Supabase Dashboard:

1. Open Supabase project
2. Go to Branching
3. Create branch `develop`
4. Copy that branch URL + keys into `.env.local` and Vercel Preview variables

After branch creation, local and preview should no longer point to production.
