# Project notes

---

## Customer linked accounts runbook (matching, mirrors, and edit flows)

**Date:** 2026-04-06

This section documents the linked customer account workflows now used on customer detail pages and related customer API routes.

### Intent and architecture

- Linked account data is loaded from `GET /api/customers/:id` and returned in a `linkedAccounts` array alongside the customer and booking payload.
- Primary UI surfaces:
  - `components/customer-detail-view.tsx` (`Linked Accounts` accordion, add/edit/delete actions)
  - `components/linked-account-form.tsx` (relationship/contact form + match detection)
- Supporting routes:
  - `app/api/customers/[id]/route.ts` (`GET`, `PATCH`) for customer detail payload and notes/email/phone edits
  - `app/api/customers/detect-match/route.ts` (`GET`) for duplicate customer detection by email/phone
  - `app/api/customers/[id]/linked-accounts/route.ts` (`POST`) for creating linked account rows
  - `app/api/customers/[id]/linked-accounts/[accountId]/route.ts` (`PATCH`, `DELETE`) for edits/removal
- Database shape is defined in `supabase/migrations/20260327160000_add_customer_linked_accounts.sql`.
  - Table: `customer_linked_accounts`
  - Key constraints:
    - `customer_id <> linked_customer_id` check
    - unique `(customer_id, linked_customer_id)` when `linked_customer_id IS NOT NULL`
  - RLS: authenticated users can `SELECT`; only `admin`/`manager` can `INSERT`/`UPDATE`/`DELETE`.

### Public interfaces and behavior

- `GET /api/customers/:id`
  - Requires authentication.
  - Returns `linkedAccounts[]` with `linkedCustomerName` hydrated from referenced `customers` rows.
- `GET /api/customers/detect-match`
  - Requires authentication.
  - Query params: `email?`, `phone?`, `excludeId?`.
  - Matching order: email first (case-insensitive), then phone.
  - Returns `{ match: null }` when no match or no usable query input.
- `POST /api/customers/:id/linked-accounts`
  - Requires authenticated `admin` or `manager`.
  - Validates payload with Zod and normalizes optional strings.
  - Requires at least one non-empty linked account field.
  - Prevents self-linking (`linkedCustomerId === customerId`).
  - If `linkedCustomerId` is set, creates a mirrored reverse row (`is_mirror: true`) for the linked customer.
  - Duplicate links return `409` with `These customers are already linked on this account`.
- `PATCH /api/customers/:id/linked-accounts/:accountId`
  - Requires authenticated `admin` or `manager`.
  - Validates payload with Zod and rejects empty patch payloads (`400`).
  - If linked target changes, deletes old counterpart row using opposite `is_mirror` and upserts a new counterpart for the new target.
  - Duplicate links return `409`.
- `DELETE /api/customers/:id/linked-accounts/:accountId`
  - Requires authenticated `admin` or `manager`.
  - Deletes counterpart row first (if present), then deletes the requested row.
  - Returns `204` on success.

### Workflow notes

- Add flow (`CustomerDetailView` -> `LinkedAccountForm`):
  - User clicks `Add` in `Linked Accounts`.
  - Form supports relationship + optional name/email/phone + optional `linkedCustomerId`.
  - Saving calls `POST /api/customers/:id/linked-accounts`, then revalidates `useCustomerDetail()` and `/api/data`.
- Existing-customer detection:
  - Email and phone blur handlers call `GET /api/customers/detect-match?...&excludeId=<currentCustomerId>`.
  - On match, UI offers:
    - `Go to account`
    - `Open in new tab`
    - `Yes, link this account`
  - Confirming the link sets `linkedCustomerId` and locks contact fields to avoid divergence from the linked customer record.
- Edit flow:
  - `PATCH` updates primary row and mirror counterpart handling runs server-side.
- Delete flow:
  - `DELETE` removes both sides (primary + counterpart) when counterpart exists.

### Constraints and normalization details

- Relationship options currently exposed in UI:
  - `Spouse`, `Partner`, `Family Member`, `Travel Agent`, `Other`
- Normalization:
  - `email` is trimmed and lowercased.
  - `phone` and name fields are trimmed; empty strings become `null`.
- Validation constraints:
  - `relationship`, `firstName`, `lastName` max length `100`
  - `phone` max length `50`
  - `email` max length `255` and valid format
  - `linkedCustomerId` must be UUID when provided

### Troubleshooting and common pitfalls

- `403 Forbidden` on create/edit/delete:
  - Cause: user is authenticated but not `admin`/`manager`.
  - Fix: verify `profiles.clearance_level`.
- `400 Please provide at least one linked account field`:
  - Cause: all optional fields normalize to empty.
  - Fix: provide at least one field (relationship, name, email, phone, or linked customer).
- `400 Cannot link a customer to themselves`:
  - Cause: `linkedCustomerId` equals current customer.
  - Fix: select a different customer.
- `404 Linked customer not found`:
  - Cause: stale/deleted customer reference.
  - Fix: re-run match detection and relink.
- `409 These customers are already linked on this account`:
  - Cause: unique `(customer_id, linked_customer_id)` conflict.
  - Fix: edit existing link instead of creating a duplicate.
- Match detection appears inconsistent:
  - Cause: route prioritizes email match before phone, and excludes current customer via `excludeId`.
  - Fix: verify normalized values and query parameters in Network tab.

### Example requests

Detect existing customer by email:

```http
GET /api/customers/detect-match?email=alex@example.com&excludeId=690b9670-420c-4777-8334-3a5f380ecf97
```

Create linked account as contact-only entry:

```json
{
  "relationship": "Travel Agent",
  "firstName": "Alex",
  "lastName": "Meyer",
  "email": "alex@example.com",
  "phone": "+27 82 555 0101",
  "linkedCustomerId": null
}
```

Create linked account tied to an existing customer:

```json
{
  "relationship": "Partner",
  "firstName": null,
  "lastName": null,
  "email": null,
  "phone": null,
  "linkedCustomerId": "790b9670-420c-4777-8334-3a5f380ecf98"
}
```

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
