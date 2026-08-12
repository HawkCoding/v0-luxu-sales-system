# QA 03 — Role & Permission Matrix

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Establish that clearance level actually restricts what a user can see and do —
in the sidebar, on direct URL entry, and at the API. Client-side gating alone is
not a control; the point of this pass is to find every place where the UI hides
something the API will still hand over.

## Prerequisites

QA 01 GREEN, QA 02 complete (roles confirmed to log in). Do not reset.

## Surfaces under test

- Permission matrix: [lib/role-context.tsx](../../../lib/role-context.tsx) (lines ~14–53), [lib/role-utils.ts](../../../lib/role-utils.ts)
- Server gates: [app/app/layout.tsx](../../../app/app/layout.tsx), [app/app/audit/layout.tsx](../../../app/app/audit/layout.tsx)
- API gates: [lib/api/auth.ts](../../../lib/api/auth.ts) (`requireUser`, `requireRole`), [lib/settings-access.ts](../../../lib/settings-access.ts) (`requireAdminSettingsAccess`, `requireManagerSettingsAccess`)
- Sidebar: `navItems` in [app/app/client-layout.tsx](../../../app/app/client-layout.tsx)

**There is no `middleware.ts`.** All gating is server layout + client `useRole()`
+ per-route API checks. That is the structural risk this prompt is testing.

## Checks

Run every check as **all three roles**: admin (carmen), manager (dirk),
consultant (leonie). `douwlien` is now a second consultant — the `readonly`
clearance level was retired (consultant is the lowest role), so any surface that
still offers or honours it is a finding.

1. **Read the matrix first.** Extract the permission table from
   `lib/role-context.tsx` into the report. Everything below is measured against
   it — if observed behaviour and the table disagree, one of them is the bug and
   you say which.

2. **Sidebar contents per role.** Screenshot each. Consultant should show
   Dashboard, Enquiries, Pipeline, Bookings, Customers, Suppliers, Documents,
   Emails Sent and Settings (`view:settings` includes consultant) — but no
   Templates, Reporting or Audit Log.

3. **Hard-gated routes (server redirect).** `/app/audit` and `/app/audit/archive`
   must redirect anyone who is not admin or manager to `/app`. Test by direct URL
   as consultant.

4. **Nav-gated routes (no page guard).** `/app/templates`, `/app/reporting`,
   `/app/settings` are hidden from the sidebar for roles that lack the
   permission, but the page components themselves have no guard. Enter each by
   **direct URL** as every role and record precisely what happens:
   - Does the page render its shell?
   - Does it fetch and display data, or do the underlying API calls 403?
   - Is any data visible that the role should not see?

   A page that renders and shows real data to an unpermitted role is Sev-1.
   A page that renders an empty shell with 403s underneath is Sev-3 (ugly, not a
   breach) — grade each one separately, do not lump them.

5. **`view:full_audit` asymmetry.** `lib/role-context.tsx:50` grants
   `view:full_audit` to **manager but not admin**. Confirm the runtime behaviour
   matches, then state whether it is intentional. Either the matrix is wrong or
   the docs are — flag it as a finding regardless, at Sev-3, because an admin
   seeing less than a manager will be reported as a bug by users.

6. **Settings card visibility.** As manager and consultant, open `/app/settings`
   and record which cards render. Expected admin-only: Users, Company logo,
   Train Pricing Defaults, Passenger Age Bands, Rate Types link, inbound email,
   Templates → Branding tab. Expected admin+manager: Banking, Invoice Statuses,
   Quote/Invoice Defaults, Default Commission, Hotel Defaults, Quote Validity,
   Quote Follow-Up, Error Log, Backups, outbound email credentials.

7. **Write-blocked but visible.** For each card a role can *see* but not *edit*,
   confirm the controls are actually disabled and that submitting anyway (via
   the API) is rejected server-side.

8. **Booking-level actions.** On a booking detail page as consultant and
   manager, check the presence/absence of: stage advance, stage back, cancel
   booking (`cancel:booking`), edit fields (`edit:jobs`), send correspondence
   (`send:correspondence`), the `role === "admin"` branch at
   `app/app/jobs/[id]/page.tsx` (~line 341).

9. **Supplier and product permissions.** `delete:suppliers` admin-only;
   `edit:suppliers` admin+manager; `edit:products` admin-only. Confirm at the UI
   and at the API.

10. **Document and note permissions.** `delete:documents` and `manage:notes`
    are admin+manager. Try deleting a document as consultant, via UI and via
    `DELETE /api/documents/{id}`.

11. **`readonly` is genuinely retired.** The role no longer exists in the app:
    - Settings → Users → Change role must offer exactly Admin, Manager,
      Consultant.
    - `POST /api/users` and `PATCH /api/users/{id}` with
      `clearanceLevel: "readonly"` must return `400` (Zod rejects it).
    - No `profiles` row may still carry `clearance_level = 'readonly'`; the
      retirement migration converts them to `consultant`.
    - If you can manufacture such a row with the service client, that session
      must be able to do **nothing**: `canRolePerform` returns false for every
      action, and `POST /api/jobs/{id}/cancel` returns 403. Any capability
      granted to a retired clearance level is Sev-1. Restore the row afterwards.

## Probes — API directly, bypassing the UI

For each role, using the authenticated `page.request` context, call the routes
below and record the status. The expected column is derived from
`lib/api/auth.ts` and `lib/settings-access.ts`; a mismatch is the finding.

| Route | Method | Expected non-permitted result |
|---|---|---|
| `/api/users` | POST | 403 for manager/consultant |
| `/api/settings/company` | PATCH | 403 for non-admin |
| `/api/settings/banking` | PATCH | 403 for consultant |
| `/api/settings/age-bands` | PATCH | 403 for non-admin |
| `/api/rate-types` | POST | non-admin blocked (route uses session client — verify what actually happens) |
| `/api/templates` | POST | 403 for consultant |
| `/api/audit/export` | GET | 403 for consultant |
| `/api/reports/{report}` | GET | 403 for consultant |
| `/api/documents/{id}` | DELETE | 403 for consultant |
| `/api/jobs/{id}` | PATCH | 403 for an unrecognised clearance level |
| `/api/payments` | POST | 403 for an unrecognised clearance level |
| `/api/suppliers/{slug}` | DELETE | 403 for non-admin |

Several supplier, package, rate-type and location routes are `[sess]` — session
client + RLS only, with no explicit `requireRole`. **These are the highest-risk
routes in the app.** For each, determine whether RLS actually blocks the
unpermitted role or whether the write succeeds. Any write that succeeds where
the UI hides the button is Sev-1 and must be listed individually.

- Unauthenticated: call five representative routes with no cookies. All 401.

## Report

`qa/reports/system-qa/{date}-03-role-permissions.md`

Extra sections:

- **Permission matrix as documented** (extracted from `lib/role-context.tsx`).
- **Observed matrix**: role × capability grid, with any cell that disagrees with
  the documented matrix highlighted.
- **API status table**: route · method · admin · manager · consultant ·
  unauthenticated. This table is the deliverable — it is the evidence that the
  server, not the sidebar, is enforcing access.
- **RLS-only routes**: explicit list of every `[sess]` route tested and whether
  RLS held.

## Acceptance

- Three sidebar screenshots.
- Every row of the API status table filled in for all four actor columns.
- Check 11 (readonly retirement) conclusive.
- Every Sev-1 listed separately with a curl-or-equivalent repro.
