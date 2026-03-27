# Project notes

---

## Deferred TODO: dependency freshness follow-up

**Date:** 2026-03-11

- Keep this deferred for now (stability-first decision): no immediate upgrades required.
- Current core stack is already latest: `next@16.1.6`, `react@19.2.4`, `react-dom@19.2.4`.
- Low-priority later updates: `@supabase/supabase-js` (`2.98.0` -> `2.99.1`), `@supabase/ssr` (`0.8.0` -> `0.9.0`), `swr` (`2.4.0` -> `2.4.1`), Tailwind/PostCSS patch/minor bumps.
- Medium-priority later tooling pass: `typescript` (`5.7.3` -> `5.9.3`) and `@types/node` (`24` -> `25`), with type-fix follow-up as needed.
- Schedule separately when ready (potential migration work): `zod@4`, `recharts@3`, `sonner@2`, `react-resizable-panels@4`, `@hookform/resolvers@5`, `@vercel/analytics@2`.

---

## Future: Replace Supabase Auth with in-app user management

**Date:** 2026-02-26  

**Context:** The current auth setup requires users to be created manually in the Supabase Dashboard (Authentication → Users). This is not viable for production.

**Requirement:** The system must work without any admin who has Supabase/database access. It is set up once and then "left to run." Non-IT users must be able to create new users from inside the application. Those new users must be able to read from and write to Supabase, without relying on Supabase Auth for user validation.

**Current constraint:** Supabase RLS (Row Level Security) depends on Supabase Auth users and JWTs. If we abandon Supabase Auth, RLS policies tied to `auth.uid()` will not apply.

**Possible directions to explore:**
- **Custom users table + app-level auth:** Store users (e.g. `name`, `email`, hashed `password`, `role`) in a `users` or `profiles` table. The app validates credentials and uses the **service role** client for all Supabase reads/writes. RLS would not protect rows by user; the app enforces access control.
- **Invite/onboarding flow:** An existing user (e.g. manager) can invite new users from the UI; the app creates the record and sends a link to set a password.
- **API key or app-level token:** Users authenticate against the app; the app holds the service role key and proxies all DB access.

**Outcome:** Replace the Supabase Auth + manual user creation flow with an in-app user lifecycle so non-technical staff can onboard new users without touching Supabase.

---

## Microsoft OAuth setup (Azure + Supabase)

**Date:** 2026-02-27

Use this setup to enable "Sign in with Microsoft" while authorizing access from the `profiles` table by email.

### 1) Register app in Microsoft Entra ID

- Go to Azure Portal -> Microsoft Entra ID -> App registrations -> New registration
- Name: `Luxus Sales System`
- Choose account type:
  - Single-tenant if only one organization should sign in
  - Multi-tenant (`common`) if multiple organizations should sign in
- Add redirect URI:
  - `https://isxpuhttwzyvjclrnhbg.supabase.co/auth/v1/callback`
- Save and copy:
  - Application (client) ID
  - Directory (tenant) ID
- Go to Certificates & secrets -> New client secret, then copy the generated secret value
- API permissions:
  - Ensure `User.Read` is granted
  - Ensure email claims are available for your tenant/account type

### 2) Enable Azure provider in Supabase

- Open Supabase Dashboard -> Authentication -> Providers -> Azure
- Enable provider and fill:
  - Client ID: Azure application/client ID
  - Client Secret: Azure secret value
  - Azure URL:
    - `https://login.microsoftonline.com/<tenant-id>` for single tenant
    - `https://login.microsoftonline.com/common` for multi-tenant

### 3) Add allowed redirect URLs in Supabase Auth

- Supabase Dashboard -> Authentication -> URL Configuration
- Ensure these are present:
  - `http://localhost:3000/auth/callback`
  - Production callback URL if app domain differs from local

### 4) User authorization model

- OAuth login only proves Microsoft identity.
- App access is granted only if OAuth email exists in `profiles.email`.
- `clearance_level` from `profiles` determines in-app permissions.
- First successful OAuth login links `profiles.user_id` to the Supabase Auth user ID when `user_id` is empty.

---

## Password sign-in and initial user setup

**Date:** 2026-02-27

Users can sign in with **email + password** or **Microsoft**. Admins can set or reset any user's password from Settings → Users; the user receives an email notification. Self-service "Forgot password?" sends a Supabase recovery email; the user sets a new password at `/auth/set-new-password`.

### Initial password for setup

- Use **`14789`** as the initial password for all users when creating Auth users (via Supabase Dashboard or MCP).
- This is for development and staging only. **Reset all user passwords before launch** (e.g. via Settings → Users → Set password, or Supabase Dashboard).

### Creating Auth users (Dashboard or MCP)

1. **Supabase Dashboard:** Authentication → Users → Add user. Email = profile email, Password = `14789`. For existing users, open user → set password to `14789` or send recovery.
2. **Supabase MCP:** Use MCP tools that map to Auth Admin (create user / update user) to create Auth users for each `profiles.email` with password `14789`.

Ensure every `profiles.email` has a matching Supabase Auth user; use initial password `14789` for setup and reset before launch.

### Admin "Set password" email (Resend)

- Set `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL` in `.env.local` (and production) so the app can send "Your password was reset by [Admin Name]" emails when an admin sets a user's password.

---

## Supplier subsystem runbook (slugs, drafts, labels, rate cards)

**Date:** 2026-03-23

This section documents the supplier flows that were recently expanded and are now used by multiple pages and API routes.

### Intent and architecture

- Supplier pages are driven by SWR hooks in `lib/use-data.ts`: `useSuppliers`, `useActiveSuppliers`, `useSupplierDetail`, and `useSupplierEmailLabels`.
- Core supplier routes live in:
  - `app/api/suppliers/route.ts` (`GET`, `POST`)
  - `app/api/suppliers/[slug]/route.ts` (`GET`, `PATCH`, `DELETE`)
  - `app/api/supplier-email-labels/route.ts` (`GET`, `POST`, `DELETE`)
- Supplier mapping and response shapes are centralized in `lib/suppliers.ts`.
- Supplier editing UI is primarily `components/supplier-detail-view.tsx` and creation starts in `components/add-supplier-dialog.tsx`.

### Public interfaces and behavior

- `GET /api/suppliers`
  - Returns only active suppliers by default.
  - `?includeDrafts=true` includes draft and inactive rows.
- `POST /api/suppliers`
  - Requires authenticated `admin` or `manager`.
  - Creates supplier as draft (`active: false`) and auto-generates a unique slug from name.
  - Accepts `emails[]` and deduplicates case-insensitively before writing `supplier_emails`.
- `GET /api/suppliers/:slug`
  - Reads by slug.
  - Backward compatibility: if slug lookup misses and path segment is a UUID, route falls back to supplier `id`.
- `PATCH /api/suppliers/:slug`
  - Requires authenticated `admin` or `manager`.
  - Full save: `PATCH /api/suppliers/:slug`.
  - Draft save (partial-tolerant): `PATCH /api/suppliers/:slug?draft=true`.
  - Supports optimistic concurrency via `expectedUpdatedAt` and returns `409` if stale.
  - Returns `Server-Timing` headers for auth/parse/normalize/write phases.
- `DELETE /api/suppliers/:slug`
  - Requires `admin`.
  - Blocks delete (`409`) if supplier/package/route data is still referenced by active bookings.
- `GET /api/supplier-email-labels`
  - Any authenticated user can read labels.
- `POST` and `DELETE /api/supplier-email-labels`
  - Requires `admin` or `manager`.
  - Duplicate label names return `409`.

### Workflow notes

- Create supplier:
  - Use Add Supplier dialog (`components/add-supplier-dialog.tsx`), which posts to `/api/suppliers`.
  - User is redirected to `/app/suppliers/:slug` after create.
- Draft vs published behavior:
  - Draft suppliers open directly in edit mode.
  - Draft autosave debounces ~3s and writes to `PATCH ...?draft=true`.
  - For non-draft suppliers, unsaved edits are stored in `localStorage` and can be restored/discarded on next open.
- Rate card matrix behavior:
  - Prevents duplicate business key combinations (`suiteTypeId + routeId + validFrom`).
  - Prevents overlapping date ranges for same package/suite type/route combination.
  - Supports route-specific and "no route" (`routeId: null`) cells; null-route cells are shown as `No route` in matrix UI.

### Troubleshooting and common pitfalls

- `409 This supplier was modified by another user...`
  - Cause: stale `expectedUpdatedAt`.
  - Fix: refresh supplier detail and reapply changes.
- `409 Duplicate rate card...` or overlap errors on save:
  - Cause: conflicting period rows in same package/suite type/route grouping.
  - Fix: adjust `validFrom` / `validTo` so each grouping has unique start dates and non-overlapping periods.
- `409 Cannot remove items that are still referenced...`:
  - Cause: attempting to remove package/route/suite type used by active bookings or hotel offers.
  - Fix: move/close dependent records first, then retry edit/delete.
- Label create/delete appears to revert in UI:
  - Label UI uses optimistic SWR updates.
  - If API call fails, client intentionally rolls back to previous label list.
- Draft autosave diagnostics:
  - The browser console logs `[supplier-draft-autosave]` and `[supplier-save]` entries, including response status and `server-timing`.

### Example payloads

Create supplier:

```json
{
  "kind": "train_operator",
  "name": "Blue Rail",
  "email": "",
  "emails": [
    { "email": "ops@bluerail.example", "label": "Operations" },
    { "email": "accounts@bluerail.example", "label": "Accounts" }
  ],
  "phone": "+27 21 555 0000",
  "website": "bluerail.example",
  "location": "Cape Town",
  "notes": "Preferred partner for peak season."
}
```

Draft save:

```json
{
  "name": "Blue Rail",
  "kind": "train_operator",
  "email": "",
  "emails": [{ "id": "uuid", "email": "ops@bluerail.example", "label": "Operations" }],
  "phone": "",
  "website": "",
  "location": "",
  "notes": "",
  "active": false,
  "suiteTypes": [],
  "packages": [],
  "expectedUpdatedAt": "2026-03-23T12:00:00.000Z"
}
```

---
