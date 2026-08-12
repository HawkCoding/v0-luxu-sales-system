# Project notes

---

## Completed TODO: session timeout and inactive user enforcement

**Date:** 2026-05-11

- Completed: Configurable session timeout in Settings.
- Completed: Confirm inactive users are blocked when active user enforcement exists.
- Verification: `pnpm test:ci` and `pnpm build` passed.

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
  - `http://localhost:3000/auth/confirm` (password recovery — see below)
  - Production callback and confirm URLs if the app domain differs from local

### 3b) Password recovery email template (hosted projects)

Recovery links must carry a token hash, not a PKCE `code`: the PKCE verifier is a
cookie in the browser that requested the reset, so a `code` link dies when it is
opened on a phone (QA 02, F02-7). The local stack is configured in
`supabase/config.toml` (`[auth.email.template.recovery]` →
`supabase/templates/recovery.html`); **the hosted dev and production projects
need the same body pasted in by hand**:

- Dashboard -> Authentication -> Email Templates -> Reset Password
- Link target:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-new-password`

Until that is done those projects keep sending `code` links; `/auth/confirm`
still accepts them as a fallback, but they remain same-browser only.

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

## Customer linked accounts runbook

**Date:** 2026-04-13

This section documents the customer linked-account flow across customer detail UI and linked-account API routes.

### Intent and architecture

- Linked accounts let consultants/admins connect related people (for example spouse, partner, or travel agent contact) to a customer profile.
- If a linked account references an existing customer (`linkedCustomerId`), the system stores a mirrored reverse link so both customer profiles stay in sync.
- Data path:
  - UI: `components/customer-detail-view.tsx` and `components/linked-account-form.tsx`
  - Read model: `GET /api/customers/:id` in `app/api/customers/[id]/route.ts`
  - Mutations: `POST /api/customers/:id/linked-accounts`, `PATCH/DELETE /api/customers/:id/linked-accounts/:accountId`
  - Match detection: `GET /api/customers/detect-match`
- Database table and constraints are in `supabase/migrations/20260327160000_add_customer_linked_accounts.sql`.

### Public interfaces and behavior

- `GET /api/customers/:id`
  - Requires authenticated user.
  - Returns `customer`, `bookings`, and `linkedAccounts[]` in one payload.
  - Enriches linked rows with `linkedCustomerName` when `linkedCustomerId` is set.
- `POST /api/customers/:id/linked-accounts`
  - Requires authenticated `admin` or `manager`.
  - Validates payload with Zod and normalizes optional strings.
  - Requires at least one non-empty field (`relationship`, name, email, phone, or `linkedCustomerId`).
  - Rejects self-links (`linkedCustomerId === customerId`) with `400`.
  - Returns `409` when the customer pair already exists.
  - Creates a mirrored reverse row when `linkedCustomerId` is provided.
- `PATCH /api/customers/:id/linked-accounts/:accountId`
  - Requires authenticated `admin` or `manager`.
  - Supports partial updates.
  - If linked customer changes, removes old mirror and upserts a new reverse mirror.
  - Returns `404` when linked account or referenced customer is missing.
  - Returns `409` for duplicate customer-pair conflicts.
- `DELETE /api/customers/:id/linked-accounts/:accountId`
  - Requires authenticated `admin` or `manager`.
  - Deletes reverse mirror first (if present), then deletes the selected row.
  - Returns `204` on success.
- `GET /api/customers/detect-match?email=&phone=&excludeId=`
  - Requires authenticated user.
  - Returns `{ match: null }` if no candidate exists.
  - Matching order: email first (case-insensitive), then phone (exact) if email did not match.
  - `excludeId` prevents matching the current customer.

### Data model and constraints

- `customer_linked_accounts` fields:
  - `customer_id`, optional `linked_customer_id`, optional relationship and contact fields
  - `is_mirror` marks system-generated reverse rows
- Constraint highlights:
  - `customer_id <> linked_customer_id` (no self-link rows).
  - Unique index on `(customer_id, linked_customer_id)` when `linked_customer_id` is not null.
  - Foreign keys:
    - `customer_id` -> `customers(id)` with `ON DELETE CASCADE`
    - `linked_customer_id` -> `customers(id)` with `ON DELETE SET NULL`
- RLS policies allow read for authenticated users and restrict insert/update/delete to `admin` and `manager`.

### UI workflow notes

- Linked accounts are shown in the customer detail accordion.
- Add/edit flow uses `LinkedAccountForm`:
  - Relationship defaults to `Partner`.
  - Email/phone blur triggers match detection for existing customers.
  - On confirmed match, form sets `linkedCustomerId`, pre-fills matched fields, and locks name/contact fields.
- Successful create/update/delete actions revalidate:
  - `useCustomerDetail(customerId)` data
  - global `/api/data` SWR cache
- Read-only roles can view linked accounts but cannot add/edit/delete.

### Troubleshooting and common pitfalls

- `400 Please provide at least one linked account field`
  - Cause: payload is effectively empty after normalization.
  - Fix: include at least one non-empty value.
- `400 Cannot link a customer to themselves`
  - Cause: current customer ID passed as `linkedCustomerId`.
  - Fix: clear `linkedCustomerId` or choose a different customer.
- `404 Linked customer not found`
  - Cause: stale/invalid `linkedCustomerId`.
  - Fix: re-run detect flow or resolve customer ID before save.
- `409 These customers are already linked on this account`
  - Cause: duplicate `(customer_id, linked_customer_id)` pair.
  - Fix: edit/delete existing link rather than creating another row.
- Linked row appears one-sided after manual DB edits
  - Cause: mirror maintenance logic only runs via API routes.
  - Fix: use API/UI for edits, or repair both directions in SQL.

### Example payloads

Create a standalone linked account (no existing customer reference):

```json
{
  "relationship": "Travel Agent",
  "firstName": "Nina",
  "lastName": "Parker",
  "email": "nina.agent@example.com",
  "phone": "+27 82 000 0000",
  "linkedCustomerId": null
}
```

Create a linked account that references an existing customer:

```json
{
  "relationship": "Spouse",
  "firstName": "Alex",
  "lastName": "Doe",
  "email": "alex@example.com",
  "phone": "+27 82 111 1111",
  "linkedCustomerId": "790b9670-420c-4777-8334-3a5f380ecf98"
}
```

Patch an existing link to connect to a different customer:

```json
{
  "linkedCustomerId": "890b9670-420c-4777-8334-3a5f380ecf99"
}
```

---

## Supplier subsystem runbook (kinds, drafts, labels, rate cards)

**Date:** 2026-03-30

This section documents the current supplier workflows used across supplier list/detail pages, quote flows, and supplier API routes.

### Intent and architecture

- Supplier UI data is loaded through SWR hooks in `lib/use-data.ts`:
  - `useSuppliers()` -> `GET /api/suppliers?includeDrafts=true`
  - `useActiveSuppliers()` -> `GET /api/suppliers`
  - `useSupplierDetail(slug)` -> `GET /api/suppliers/:slug`
  - `useSupplierEmailLabels()` -> `GET /api/supplier-email-labels`
- Core routes:
  - `app/api/suppliers/route.ts` (`GET`, `POST`)
  - `app/api/suppliers/[slug]/route.ts` (`GET`, `PATCH`, `DELETE`)
  - `app/api/supplier-email-labels/route.ts` (`GET`, `POST`, `DELETE`)
- Mapping and frontend response shapes are centralized in `lib/suppliers.ts`.
- Primary editor UI is `components/supplier-detail-view.tsx`; creation starts in `components/add-supplier-dialog.tsx`.

### Supplier kinds and vocabulary constraints

- Supported kinds in API/schema/types:
  - `train_operator`
  - `hotel_property`
  - `transfers`
  - `tour_operator`
  - `airline`
- Label mapping (`SUPPLIER_KIND_LABELS`):
  - `tour_operator` -> `Tours`
  - `airline` -> `Airlines`
- Vocabulary behavior (`SUPPLIER_VOCABULARY`):
  - `hotel_property` uses hotel-oriented terms (`Room Type`, `Season`, `Meal Plan`) and does not require route locations.
  - `train_operator`, `transfers`, `tour_operator`, and `airline` share journey-oriented terms (`Suite Type`, `Package`, `Route`) and route locations.
- Database enum support for new kinds is in migration `supabase/migrations/20260327_add_supplier_kind_tours_airline.sql`.

### Public interfaces and behavior

- `GET /api/suppliers`
  - Returns active suppliers by default.
  - `?includeDrafts=true` includes draft and inactive suppliers.
- `POST /api/suppliers`
  - Requires authenticated `admin` or `manager`.
  - Creates supplier in draft state (`active: false`).
  - Generates a unique slug from name (`name`, then `name-2`, `name-3`, ...).
  - Accepts `emails[]`; email rows are deduplicated case-insensitively before insert.
- `GET /api/suppliers/:slug`
  - Loads by slug first.
  - If slug is missing and path segment is a UUID, falls back to supplier `id` lookup for backward compatibility.
- `PATCH /api/suppliers/:slug`
  - Requires authenticated `admin` or `manager`.
  - Full save: `PATCH /api/suppliers/:slug`.
  - Draft save: `PATCH /api/suppliers/:slug?draft=true`.
  - Enforces optimistic concurrency via `expectedUpdatedAt`; stale saves return `409`.
  - Validates duplicate business keys and overlapping periods in rate cards, returning `409` with conflict details.
  - Uses chunked ID validation when querying reference IDs to avoid oversized URL/query strings on large `IN (...)` checks.
  - Includes `Server-Timing` headers (`auth`, `parse`, `loadExisting`, `normalize`, `idValidation`, `dbWrites`, `loadUpdated`, `total`).
- `DELETE /api/suppliers/:slug`
  - Requires authenticated `admin`.
  - Returns `409` when supplier/package/route data is still referenced by active bookings or related dependency checks.
- `GET /api/supplier-email-labels`
  - Any authenticated user can read labels.
- `POST` and `DELETE /api/supplier-email-labels`
  - Requires `admin` or `manager`.
  - Duplicate names return `409`.

### Workflow notes

- Create supplier:
  - Use Add Supplier dialog, which posts to `/api/suppliers`.
  - User is redirected to `/app/suppliers/:slug`.
- Draft suppliers:
  - Draft supplier details open directly in edit mode.
  - Autosave debounces at 3s and sends `PATCH ...?draft=true`.
  - Autosave status badges/messages cycle through `saving`, `saved`, `error`.
  - Debug flags to disable autosave:
    - Query string: `?disableDraftAutosave=true`
    - Runtime flag: `window.__DISABLE_DRAFT_AUTOSAVE = true`
- Published/non-draft suppliers:
  - Unsaved edits are stored in `localStorage` under `supplier-draft-<slug>`.
  - UI exposes `Restore draft` and `Discard` actions on next open.
- Hydration/editing behavior:
  - Server revalidation only rehydrates form state when supplier identity (`id + updatedAt`) changes, reducing in-flight edit clobbering.
  - Autosave updates `expectedUpdatedAt` from server responses so subsequent draft/full saves stay in sync.
- Rate card matrix:
  - Prevents duplicate key combinations (`packageId + suiteTypeId + routeId + validFrom`).
  - Prevents overlapping date ranges for same (`packageId + suiteTypeId + routeId`) group.
  - Supports route-specific cells and `routeId: null` (`No route`) cells.

### Troubleshooting and common pitfalls

- `409 This supplier was modified by another user...`
  - Cause: stale `expectedUpdatedAt`.
  - Fix: refresh supplier detail, reapply edits, save again.
- `409 Duplicate rate cards...` or overlap conflict responses:
  - Cause: duplicate business-key start dates or overlapping date windows in same grouping.
  - Fix: adjust period boundaries (`validFrom` / `validTo`) so each grouping is unique and non-overlapping.
- `409 Cannot remove items that are still referenced...`
  - Cause: trying to delete package/route/suite type rows still used by active bookings or hotel offers.
  - Fix: reassign/close dependencies first, then retry save/delete.
- Draft save appears to ignore incomplete rows:
  - Cause: draft save filters incomplete route/rate card entries (for example missing UUID refs or invalid dates) before persistence.
  - Fix: complete required IDs/date fields, then allow autosave/full save to persist.
- Label changes appear to revert:
  - Cause: label UI uses optimistic SWR updates and rolls back on failed API calls.
  - Fix: inspect failing label route response in Network tab and retry.

### Example payloads

Create supplier:

```json
{
  "kind": "airline",
  "name": "Skyway Air",
  "email": "",
  "emails": [
    { "email": "ops@skyway.example", "label": "Operations" },
    { "email": "accounts@skyway.example", "label": "Accounts" }
  ],
  "phone": "+27 21 555 0000",
  "website": "skyway.example",
  "location": "Cape Town",
  "notes": "Preferred short-haul partner."
}
```

Draft save:

```json
{
  "name": "Skyway Air",
  "kind": "airline",
  "email": "",
  "emails": [{ "id": "uuid", "email": "ops@skyway.example", "label": "Operations" }],
  "phone": "",
  "website": "",
  "location": "",
  "notes": "",
  "active": false,
  "suiteTypes": [],
  "packages": [],
  "expectedUpdatedAt": "2026-03-30T12:00:00.000Z"
}
```

---
