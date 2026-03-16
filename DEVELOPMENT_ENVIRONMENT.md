# Development Setup and Operations Runbook

This document covers verified setup and operations behavior for:

- Supabase auth/session handling
- Customer import (scan/CSV)
- Supplier pricing sync (SA-Rail)
- Common troubleshooting for local and Vercel environments

## 1. Local Setup

This project uses `pnpm` only.

```bash
npm install -g corepack@latest
corepack enable
pnpm install
pnpm dev
```

Use these commands for dependency management:

```bash
pnpm add <package>
pnpm install
pnpm install --lockfile-only
pnpm import
```

`package.json` enforces `pnpm` via `preinstall` (`npx only-allow pnpm`).

## 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill values.

Required in all environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for server-side privileged actions:

- `SUPABASE_SERVICE_ROLE_KEY`

Optional features:

- `SUPPLIER_SYNC_TOKEN`: enables token-based server-to-server calls to `POST /api/suppliers/sync-pricing`
- `RESEND_API_KEY`: enables notification email when admin resets another user's password
- `RESEND_FROM_EMAIL`: sender address for admin password reset notifications
- `NEXT_PUBLIC_DEV_AUTH=true`: enables developer name/password form on `/login`

## 3. Supabase Client Model

Codepaths:

- `lib/supabase/client.ts`: browser singleton with anon key (RLS applies)
- `lib/supabase/server.ts#createSessionClient()`: server client bound to request cookies (RLS applies, user session aware)
- `lib/supabase/server.ts#createServiceClient()`: service-role client (bypasses RLS; server only)

Guardrails implemented in code:

- Missing public env vars throw runtime errors in both browser and server clients.
- Missing or malformed `SUPABASE_SERVICE_ROLE_KEY` throws runtime errors in server service client creation.

## 4. Auth and User Management

### Entry points

- Login page: `/login` (`app/login/page.tsx`)
- OAuth callback: `/auth/callback` (`app/auth/callback/route.ts`)
- Password set page: `/auth/set-new-password` (`app/auth/set-new-password/page.tsx`)

### Email/password login

- Uses `supabase.auth.signInWithPassword`.
- Email is normalized to lowercase before authentication.

### Microsoft login (Azure provider)

- Starts from `/login` via `signInWithOAuth({ provider: "azure" })`.
- Callback route exchanges OAuth code for session.
- Callback enforces authorization by matching `profiles.email` (case-insensitive).
- If `profiles.user_id` is empty, callback links it to authenticated Supabase Auth user id.
- If `profiles.user_id` is already set to another user id, login is rejected with `error=account-link-mismatch`.

### Forgot password flow

- `/login` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: "/auth/callback?next=/auth/set-new-password" })`.
- User lands on `/auth/set-new-password` and submits a new password (`min 6` chars).

### Admin user management APIs

Codepaths:

- `GET /api/users`: admin-only profile list for Settings
- `POST /api/users/[userId]/password`: admin-only password reset for another user

Behavior:

- Password reset requires `newPassword` length >= 6.
- Writes audit log entry (`action: "password_reset"`, `entity_type: "user"`).
- If `RESEND_API_KEY` exists, sends notification email to target user.

## 5. Customer Import Runbook

Codepaths:

- UI: `components/customer-import-dialog.tsx`
- OCR parsing: `lib/import/parseScannedCustomer.ts`
- API: `POST /api/customers/import`

### Supported import modes

- `scan`: JPG/PNG/WEBP/PDF processed in browser using OCR (`tesseract.js` + `pdfjs-dist`)
- `csv`: parsed in browser, reviewed in editable grid before submit

Files are processed client-side for extraction/review. Only selected rows are sent to API when user clicks Import.

### CSV requirements

CSV must include headers:

- `first_name`
- `last_name`
- `email`

Optional headers:

- `title`
- `phone`
- `country`

### API constraints

- Auth required via Supabase session.
- Allowed roles: `admin`, `manager`, `consultant`.
- Request body: `customers` array (1 to 1000 rows), optional `mode` (`scan` or `csv`).
- Deduplicates by `email` against existing `customers` table and duplicates within payload.
- Returns insert count and duplicate list.
- Writes audit entry with action `bulk_imported`.

Example payload:

```json
{
  "mode": "csv",
  "customers": [
    {
      "title": "Ms",
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jane@example.com",
      "phone": "+27 12 000 0000",
      "country": "South Africa"
    }
  ]
}
```

## 6. Supplier Pricing Sync Runbook

Codepaths:

- Manual trigger UI: Settings page `app/app/settings/page.tsx` (`SupplierSyncCard`)
- API: `POST /api/suppliers/sync-pricing`
- Scraper: `lib/suppliers/sa-rail-scraper.ts`

### Authorization

One of the following is required:

- Authenticated session with `profiles.clearance_level` in `admin` or `manager`
- Request header `x-sync-token` matching `SUPPLIER_SYNC_TOKEN`

### What sync updates

The sync scrapes SA-Rail pages for Rovos Rail and Blue Train, then upserts in this order:

- `locations`
- `suppliers`
- `packages`
- `routes`
- `suite_types`
- `rate_cards`

Upserts use stable natural keys (idempotent behavior on repeated runs).

### Automation call example

```bash
curl -X POST "https://<your-host>/api/suppliers/sync-pricing" \
  -H "x-sync-token: <SUPPLIER_SYNC_TOKEN>"
```

Successful response shape:

```json
{
  "ok": true,
  "startedAt": "2026-03-16T16:00:00.000Z",
  "completedAt": "2026-03-16T16:00:10.000Z",
  "counts": {
    "locations": 6,
    "suppliers": 2,
    "packages": 2,
    "routes": 4,
    "suiteTypes": 5,
    "rateCards": 24
  },
  "warnings": []
}
```

`warnings` is used when source pages cannot be parsed cleanly (for example, upstream markup changes).

## 7. Troubleshooting

### "Supabase public env vars are missing"

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### "SUPABASE_SERVICE_ROLE_KEY is not set" or appears invalid

- Set full service-role JWT from Supabase Dashboard.
- Do not use anon key in this variable.

### Login redirects with `error=unauthorized`

- Confirm user email exists in `profiles.email`.
- Ensure casing/spacing in profile email is valid (code normalizes to lowercase/trimmed before match).

### Login redirects with `error=account-link-mismatch`

- `profiles.user_id` is linked to a different Supabase Auth user id.
- Resolve by correcting `profiles.user_id` mapping for that email.

### Customer import returns duplicates unexpectedly

- API deduplicates on lowercase email.
- Existing rows in `customers` and duplicate emails inside same payload are both skipped.

### Supplier sync unauthorized

- Verify manager/admin session, or send correct `x-sync-token`.
- Ensure `SUPPLIER_SYNC_TOKEN` is configured server-side when using token auth.
