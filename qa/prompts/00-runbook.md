# QA Runbook

Run the full browser QA suite:

```bash
pnpm qa
```

Run one phase:

```bash
pnpm qa:phase 'smoke'
pnpm qa:phase '01-supplier'
```

Reports are written to `qa/reports/`. Screenshots are written to `qa/screenshots/`.

The suite uses Playwright Chromium, resets the local Supabase database in global setup, logs in as `carmen@luxustravel.co.za`, and stores auth state in `qa/.auth/admin.json`.
