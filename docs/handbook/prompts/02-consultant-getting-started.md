# Step 2 — Consultant Handbook, Chapter 1: Getting started

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/consultant/01-getting-started.md`
**Screenshot slugs:** `01-*` · describe block `ch01 getting started` (already scaffolded)

## Scope

Everything a consultant needs before they touch a booking: signing in, finding their way
around, and reading the dashboard.

## Source of truth — read these

- `app/login/page.tsx` — sign-in, **Forgot password** mode, the reset-email form
- `app/auth/set-new-password/page.tsx`
- `app/app/layout.tsx` and `app/app/client-layout.tsx` — the shell, sidebar nav definition
  (`client-layout.tsx:33-49`), global customer search, theme toggle, user chip, logout
- `app/app/page.tsx` — the dashboard: stat tiles, Jobs by Stage, Recent Jobs, Upcoming
  Follow-ups with **Send** and **Dismiss**
- `lib/role-context.tsx` — which nav items a consultant sees
- `lib/session-timeout.ts` — the idle timeout behaviour

## Must cover

1. **Signing in** — the login form, what happens on a wrong password.
2. **Forgotten password** — requesting the reset email, following the link, setting a new
   password. Note that the link expires.
3. **Being signed out automatically** — the idle session timeout, and that unsaved work in
   an open dialog is lost.
4. **The shell** — sidebar items in order and what each is for, the global customer search
   box in the header, the light/dark toggle, the name and role chip, **Logout**.
5. **What a consultant can see** — and what they will not: Templates, Reporting, Audit Log
   and Settings are manager and admin only. Say this plainly so nobody reports it as a bug.
6. **The dashboard, tile by tile** — Open Jobs, Quotes Sent, Deposits Paid, Full Payment.
   Jobs by Stage. Recent Jobs.
7. **Upcoming Follow-ups** — what puts a row there, what **Send** does (opens the editable
   preview, does not send silently), and what **Dismiss** does.
8. **A one-page orientation to the booking lifecycle** — the nine stages by name, in order,
   one line each, and a forward pointer to Chapter 8 for the gates. Do not go deep here.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `01-login` | The sign-in screen (already scaffolded) |
| `01-forgot-password` | The reset-email form |
| `01-dashboard` | Full dashboard as a consultant (already scaffolded) |
| `01-sidebar` | Sidebar with the consultant's nav items |
| `01-follow-ups` | The Upcoming Follow-ups card with at least one row |

Capture the dashboard as the **consultant** user, not the manager — the tile set differs.

## Done when

- `pnpm docs:build --only consultant-handbook --allow-missing-shots` succeeds.
- `pnpm docs:shots` captures all five slugs with no error page in any image.
- The nine stage names in your chapter match `lib/types.ts` exactly.
