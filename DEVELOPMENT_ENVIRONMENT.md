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
- `SUPPLIER_SYNC_TOKEN` = shared supplier sync secret
- `NEXT_PUBLIC_SUPPLIER_SYNC_TOKEN` = same value as `SUPPLIER_SYNC_TOKEN`

Set these in Vercel for the **Production** environment:

- `NEXT_PUBLIC_SUPABASE_URL` = Supabase production URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase production anon key
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase production service role key
- `SUPPLIER_SYNC_TOKEN` = production sync secret
- `NEXT_PUBLIC_SUPPLIER_SYNC_TOKEN` = same value as `SUPPLIER_SYNC_TOKEN`

## Supabase Branch Creation Note

The current Cursor MCP Supabase connection in this workspace requires `confirm_cost_id` for `create_branch`, but the `confirm_cost` helper tool is not exposed in the available tool descriptors. If this blocks automation, create the development branch once in Supabase Dashboard:

1. Open Supabase project
2. Go to Branching
3. Create branch `develop`
4. Copy that branch URL + keys into `.env.local` and Vercel Preview variables

After branch creation, local and preview should no longer point to production.
