# QA 02 — Authentication, Users & Sessions

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Verify every way a person gets into and out of the system: signing in, recovering
a password, being created or deactivated by an admin, and being timed out. There
is no self-signup — accounts exist only because an admin made them, so the Users
card is the real front door.

## Prerequisites

QA 01 GREEN. Do not reset the database.

## Surfaces under test

- [app/login/page.tsx](../../../app/login/page.tsx) — password sign-in, remembered email, forgot-password sub-mode
- [app/auth/callback/route.ts](../../../app/auth/callback/route.ts) — code exchange, profile linking by email
- [app/auth/set-new-password/page.tsx](../../../app/auth/set-new-password/page.tsx)
- `UserManagementCard` in [app/app/settings/page.tsx](../../../app/app/settings/page.tsx) (~line 111)
- [app/api/users/route.ts](../../../app/api/users/route.ts), [app/api/users/[userId]/route.ts](../../../app/api/users/[userId]/route.ts), [app/api/users/[userId]/password/route.ts](../../../app/api/users/[userId]/password/route.ts), [app/api/users/assignable/route.ts](../../../app/api/users/assignable/route.ts)
- [components/session-timeout-guard.tsx](../../../components/session-timeout-guard.tsx), [lib/session-timeout.ts](../../../lib/session-timeout.ts)
- [lib/role-utils.ts](../../../lib/role-utils.ts), [app/app/layout.tsx](../../../app/app/layout.tsx) (inactive-profile redirect)

## Checks

### Sign-in

1. Valid credentials → `/app`. Screenshot.
2. Correct email, wrong password → error shown, no redirect, **no hint about
   whether the email exists**. An enumeration-friendly message is Sev-2.
3. Unknown email → same generic failure as check 2.
4. Empty submit → client validation, no request fired.
5. Remembered email: log out, return to `/login`, confirm `lastLoginEmail`
   prefills the email field and nothing prefills the password field.
6. Dev quick-login block: confirm it is present locally and confirm from the
   source that it is stripped/guarded in a production build. A quick-login button
   reachable in production would be Sev-1 — verify the guard, don't assume it.

### Password recovery

7. Forgot-password mode: submit a known address → success state, no leak of
   whether the address exists.
8. Complete the recovery flow to `/auth/set-new-password`. Password shorter than
   10 chars is rejected; mismatched confirm is rejected; a valid new password is
   accepted and the old one then fails at `/login`.
9. Re-use the same recovery link a second time — it must not still work.

### Auth callback

10. Hit `/auth/callback` with (a) no code, (b) a garbage code, (c) a code for an
    email with no matching `profiles` row. Confirm each lands on
    `/login?error=…` with `auth-failed`, `unauthorized` or `account-link-mismatch`
    as appropriate and shows a human message, not a raw code.

### User management (as admin, carmen)

11. Create a user: each of the four clearance levels. New user appears in the
    list with the right role badge.
12. Log in as the newly created consultant → lands on `/app`, sidebar matches
    the consultant sidebar screenshotted in QA 01.
13. Edit a user's name and role. Reload. Change persisted. Confirm the role
    change takes effect on the user's next login (JWT `app_metadata.clearance_level`
    vs the `profiles.clearance_level` fallback — say which one actually drove it).
14. Set password for an existing user → that user can log in with the new
    password and not the old one.
15. Deactivate a user (`is_active = false`). That user's existing session must be
    ejected to `/login` on the next navigation, and a fresh login must fail.
    A deactivated user retaining access is Sev-1.
16. Reactivate → access restored.
17. Permanently delete a test user. Confirm the auth user and the profile are
    both gone, and that bookings previously assigned to them still render
    (no crash on a dangling consultant reference). A 500 on a booking list after
    deleting its consultant is Sev-1.
18. `GET /api/users/assignable` returns the expected list for admin and manager,
    403 for consultant.

### Session lifetime

19. Set a short session timeout in Settings, idle past it, confirm the guard
    fires and the user is returned to `/login` with an explanation.
20. Confirm activity resets the idle timer (interact just under the limit twice
    in a row and stay signed in).
21. Logout from the header clears the session in all open tabs.

## Probes

- `POST /api/users` as manager and as consultant → must be 403 (`manage:users`
  is admin-only). As unauthenticated → 401.
- `POST /api/users/{id}/password` as manager → 403.
- Attempt to demote or delete your own admin account. Whatever the system does,
  record it — an admin locking every admin out is Sev-1.
- Create a user with an email that already exists → clean 4xx, not a 500.

## Report

`qa/reports/system-qa/{date}-02-auth-users-sessions.md`

Extra sections:

- **Auth error matrix:** scenario · HTTP status · redirect · message shown to the
  user · leaks existence of account? (yes/no)
- **Users created during this run** with their emails, so later prompts and
  cleanup know what exists.

## Acceptance

- All 21 checks have a result.
- The deactivation check (15) and the admin-only probes are conclusive — these
  are the security-relevant ones.
- Any test users you created are listed in the report; leave them in place
  (later prompts may use the consultant) unless they break QA 03's role matrix.
