# QA 02 remediation plan — Authentication, Users & Sessions

Source report: [2026-08-11-02-auth-users-sessions.md](../reports/system-qa/2026-08-11-02-auth-users-sessions.md) · Verdict **YELLOW** (19 PASS / 1 PARTIAL / 1 FAIL)
Written 2026-08-12 · Branch to cut from: `dev`

## Goal

Flip QA 02 to **GREEN** by fixing the two checks that are not PASS (15 → F02-1, 17 → F02-2), then clear the Sev-3/Sev-4 messaging and contract findings in the same pass.

Decisions taken where input was open (recommendation applied):
- **F02-2** → both parts: a clean `409` pre-check in the route **and** an `ON DELETE SET NULL` migration as the safety net.
- **F02-6** → accept and document now; the server-side login proxy gets its own branch and its own QA pass (wave 4).
- **F02-7** → migrate recovery to the `token_hash` / `verifyOtp` flow (device-independent), with the manual hosted-template step called out.

---

## Wave 1 — gating fixes (flips YELLOW → GREEN)

### T1 · F02-1 — deactivated session must land on `/login`, not a redirect loop · Sev-2

**Cause.** [proxy.ts:56](../../proxy.ts#L56) redirects `/login → /app` whenever `getUser()` returns a user; a banned user's unexpired access token still satisfies that. [app/app/layout.tsx:31-33](../../app/app/layout.tsx#L31-L33) then redirects back to `/login` on `is_active === false`. Neither side clears the `sb-*` cookies. The layout is a Server Component, so it cannot call `signOut()` itself — cookie writes are not allowed there. Hence the loop.

**Changes.**

1. New route handler `app/auth/signed-out/route.ts` (GET). Mirror the cookie plumbing already in [app/api/logout/route.ts](../../app/api/logout/route.ts):
   - build a `createServerClient` with the `cookies()` store,
   - `await supabase.auth.signOut()`,
   - defensively delete every remaining `sb-*` cookie on the response,
   - `NextResponse.redirect(new URL('/login?error=' + reason, request.url))` where `reason` comes from a whitelist (`account-inactive`, `unauthorized`) and defaults to `auth-failed`.
2. [app/app/layout.tsx](../../app/app/layout.tsx): replace both bail-outs.
   - line 31 branch (`!profile || profile.is_active === false`) → `redirect("/auth/signed-out?reason=account-inactive")`, splitting the two conditions so a missing profile redirects with `reason=unauthorized`.
   - line 47 branch (JWT-less path) → same treatment.
   - Leave the `!user` redirect at line 14-16 pointing straight at `/login` — no cookies to clear there.
3. [proxy.ts](../../proxy.ts): loop-breaker. Skip the `/login → /app` bounce when `request.nextUrl.searchParams.has("error")`. Cheap, and guarantees the login screen is reachable even if some future guard reintroduces a bounce.
4. [app/login/page.tsx:160-168](../../app/login/page.tsx#L160-L168): extend the `?error=` map (shared with T5) — `account-inactive` → "Your account has been deactivated. Contact your administrator."

**Tests.** Unit test for the whitelist mapping in the new route (invalid reason falls back to `auth-failed`). Vitest cannot exercise the redirect chain end to end — that is the QA re-run's job.

**Verify.** Log in as a consultant, deactivate from another admin session, navigate in the consultant tab: expect one `307` to `/auth/signed-out`, one `307` to `/login?error=account-inactive`, no `sb-*` cookies left, message rendered. Re-run report check 15.

---

### T2 · F02-2 — deleting a user who has a booking assigned returns 500 · Sev-2

**Cause.** `bookings.assigned_salesperson_id` ([20260507150500_enquiry_auto_draft_quote.sql:2](../../supabase/migrations/20260507150500_enquiry_auto_draft_quote.sql#L2)) and `bookings.owner_user_id` ([20260308095136_remote_schema.sql:1024](../../supabase/migrations/20260308095136_remote_schema.sql#L1024)) reference `auth.users(id)` with no `ON DELETE` action, so `auth.admin.deleteUser` is blocked by the FK and the raw driver message reaches the toast.

**Changes.**

1. [app/api/users/[userId]/route.ts](../../app/api/users/%5BuserId%5D/route.ts) `DELETE`, before deleting: count referencing bookings with the service client
   ```
   select id, reference, assigned_salesperson_id, owner_user_id
     from bookings
    where assigned_salesperson_id = :userId or owner_user_id = :userId
   ```
   (head/count query — no rows needed beyond the count and a couple of references for the message). On `count > 0` return
   `409 { error: "This user is assigned to N booking(s). Reassign or unassign them before deleting.", details: { bookingCount, references } }`.
2. New migration `supabase/migrations/<ts>_booking_user_fk_on_delete_set_null.sql` — idempotent drop-and-recreate of both constraints with `ON DELETE SET NULL`, matching the pattern already used by `booking_notes.author_id`, `payments.captured_by`, `documents.uploaded_by`:
   ```sql
   ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_assigned_salesperson_id_fkey;
   ALTER TABLE public.bookings
     ADD CONSTRAINT bookings_assigned_salesperson_id_fkey
     FOREIGN KEY (assigned_salesperson_id) REFERENCES auth.users(id) ON DELETE SET NULL;
   -- same for bookings_owner_user_id_fkey
   ```
   This is the safety net only. The `409` above still fires first, so a delete never silently orphans a booking through the UI.
3. Generic 500s stay possible for other FK paths — keep the existing `deleteError` branch but stop echoing the raw driver message: return a fixed `"Failed to delete user"` and `console.error` the detail (CLAUDE.md: never leak infrastructure detail).

**Tests.** Extend `app/api/users/[userId]/route.test.ts`: delete with assigned bookings → `409` and `deleteUser` never called; delete with none → `200`.

**Verify.** `pnpm db:reset`, assign a booking, delete → `409` with a readable toast; unassign, delete → `200`. Re-run report check 17.

---

### T3 · F02-3 — audit log records `user_deleted` before the delete happens · Sev-3

Move the `audit_logs` insert at [route.ts:263-279](../../app/api/users/%5BuserId%5D/route.ts#L263-L279) below the `service.auth.admin.deleteUser(userId)` call, so it only runs on success. Keep the `try/catch` non-fatal wrapper. Same file as T2 — single edit pass. Covered by the T2 tests (assert no audit insert on the `409` path).

---

## Wave 2 — messaging and contract polish (same branch, same PR)

### T4 · F02-8 — `POST /api/users/{id}/password` returns 403 to anonymous callers · Sev-4

Extract the discriminated `requireAdmin()` from [app/api/users/[userId]/route.ts:39-60](../../app/api/users/%5BuserId%5D/route.ts#L39-L60) into `lib/api/require-admin.ts` returning `{ ok: true; value: AdminContext } | { ok: false; status: 401 | 403 }`. Use it in both that route and [app/api/users/[userId]/password/route.ts:18-46](../../app/api/users/%5BuserId%5D/password/route.ts#L18-L46), replacing the boolean version. Check `app/api/users/route.ts` for a third copy while in there. Unit test both statuses.

### T5 · F02-5 + F02-10 — login page error map · Sev-3

One change block in [app/login/page.tsx:160-168](../../app/login/page.tsx#L160-L168): replace the single-case `if` with a `Record<string, string>` map, default "Sign in failed. Please try again."

| `?error=` | message |
|---|---|
| `account-link-mismatch` | (existing text) |
| `account-inactive` | Your account has been deactivated. Contact your administrator. |
| `unauthorized` | Your account is not set up for this app. Contact your administrator. |
| `session-expired` | You were signed out after a period of inactivity. Sign in again to continue. |

Then [components/session-timeout-guard.tsx:78](../../components/session-timeout-guard.tsx#L78): `window.location.replace("/login?error=session-expired")`. Unit-test the map.

### T6 · F02-9 — password minimum says 6, enforces 10 · Sev-4

Three sites, `placeholder="Min 6 characters"` + `minLength={6}` → `"Minimum 10 characters"` + `minLength={10}`:
[app/auth/set-new-password/page.tsx:87-88](../../app/auth/set-new-password/page.tsx#L87-L88), [app/app/settings/page.tsx:574-575](../../app/app/settings/page.tsx#L574-L575), [:630-631](../../app/app/settings/page.tsx#L630-L631). Grep for other copies before finishing.

### T7 · F02-4 — consumed recovery link surfaces nothing · Sev-3

Supabase puts the failure in the URL **fragment**, which never reaches the server, so `/app` renders as normal. Add a small client effect in [app/app/client-layout.tsx](../../app/app/client-layout.tsx): on mount, parse `window.location.hash`; if it carries `error` / `error_code`, show a toast with a mapped message (`otp_expired` → "That password reset link has already been used or has expired. Request a new one."), then `history.replaceState` the hash away so a refresh does not re-fire it. Never render the raw `error_description`.

---

## Wave 3 — remove the `readonly` role (separate PR)

Rationale: the lowest clearance level is always `consultant`; `readonly` is dead surface that every future QA prompt has to keep covering.

**Postgres constraint.** `clearance_level` is the enum `public.user_role` ([20260308095136_remote_schema.sql:460](../../supabase/migrations/20260308095136_remote_schema.sql#L460)) and Postgres cannot drop an enum value. Plan is app-level removal plus a data migration; the orphaned `'readonly'` label stays in the type, unreachable and harmless. Full type recreation (drop default → alter column → rebuild type → restore default → revisit every RLS function referencing it) is high-risk with no user-visible payoff — explicitly out of scope.

**Steps.**

1. Migration `<ts>_retire_readonly_clearance.sql`: `UPDATE public.profiles SET clearance_level = 'consultant' WHERE clearance_level = 'readonly';` — idempotent, safe to re-run. Add a comment recording that the enum label is retained deliberately.
2. Types and guards: [lib/types.ts:1](../../lib/types.ts#L1) `Role` union; [lib/role-utils.ts:4](../../lib/role-utils.ts#L4) `VALID_ROLES`.
3. Permissions: drop `"readonly"` from all 13 arrays in [lib/role-context.tsx:14-57](../../lib/role-context.tsx#L14-L57); update [lib/role-context.test.ts](../../lib/role-context.test.ts).
4. API boundaries: `roleSchema` in [app/api/users/[userId]/route.ts:14](../../app/api/users/%5BuserId%5D/route.ts#L14) and the matching enum in `app/api/users/route.ts`. Grep for other `z.enum([... "readonly"])` occurrences.
5. UI: `ROLE_OPTIONS` at [app/app/settings/page.tsx:96](../../app/app/settings/page.tsx#L96), plus any role badge/label map that special-cases readonly.
6. Seed: [supabase/seed.sql:54](../../supabase/seed.sql#L54) — `douwlien@luxustravel.co.za` becomes a **consultant**, account kept (every fixture referencing `…0000a5` keeps working). Update the header comment at line 9 and [supabase/seed.test.ts](../../supabase/seed.test.ts).
7. QA fixtures: `tests/qa/readonly.{spec,fixtures,config,setup}.ts` — delete the readonly project, or repoint it at a consultant. Check `tests/qa/*.fixtures.ts` for cross-references.
8. QA prompts (28 mentions across 11 files): `_preamble.md`, `COVERAGE.md`, `03-role-permissions.md` (15 mentions — the role matrix needs a real rewrite), plus `05`, `08`, `10`, `11`, `13`, `14`, `15`, `19`.

**Consequence to accept up front:** QA 03 has already run ([2026-08-11-03-role-permissions.md](../reports/system-qa/2026-08-11-03-role-permissions.md), 39 readonly mentions). Removing the role invalidates its readonly matrix. Annotate that report with a superseded note rather than editing its findings, and re-run QA 03 after this wave.

---

## Wave 4 — deferred, own branch and own QA pass

- **F02-6 (Sev-2) — deactivated accounts enumerable.** GoTrue returns `user_banned` before checking the password, and login runs browser-side ([lib/auth-context.tsx:362](../../lib/auth-context.tsx#L362)), so the raw response is exposed. Real fix is a server-side `POST /api/auth/login` that maps `user_banned` onto the generic failure. Dropping the auth ban and relying on `is_active` alone is **rejected**: `requireUser()` ([lib/api/auth.ts:46](../../lib/api/auth.ts#L46)) covers the 51 routes that use it, but a still-valid JWT would keep passing RLS on direct PostgREST calls from the browser. Until then this is accepted and documented — it distinguishes *deactivated* accounts only; active accounts stay indistinguishable, and the UI text is already generic.
- **F02-7 (Sev-3) — recovery link is browser-bound.** Move from the PKCE `code` exchange ([app/auth/callback/route.ts:19](../../app/auth/callback/route.ts#L19)) to `token_hash` + `verifyOtp({ type: "recovery" })`, which carries no cookie dependency. Requires the recovery email template to emit `{{ .TokenHash }}` in `supabase/config.toml` **and** a manual template edit in the hosted dev and production dashboards — that manual step is why it does not ride along with waves 1-2.

---

## Execution notes

- Branch off `dev`; waves 1+2 are one PR, wave 3 is a second PR (it rewrites QA prompts and touches the seed).
- Bump `APP_VERSION` once per PR via `pnpm app:version:bump` ([lib/version.ts](../../lib/version.ts)).
- Gates before each PR: `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, and `pnpm db:status` for the two migration-bearing waves.
- Migrations apply locally with `pnpm db:reset`; regenerate types with `pnpm run db:types`. Do not push to hosted dev/prod by hand — `dev` is a manual `pnpm db:remote:push:dev` after merge, `main` is the CI `migrate-prod` job.
- The QA 02 report flags an external `db:reset` that landed mid-run at 18:05 UTC. Confirm no other session is driving this repo before the re-run, or the counts will drift again.

## Definition of done

1. Report checks 15 and 17 re-run and PASS → QA 02 verdict **GREEN**.
2. F02-3, F02-4, F02-5, F02-8, F02-9, F02-10 closed with tests where a unit test is meaningful.
3. F02-6 and F02-7 carried forward as tracked wave-4 items, with F02-6's acceptance rationale recorded in the report.
4. `readonly` gone from the app surface; QA 03 re-run scheduled.
