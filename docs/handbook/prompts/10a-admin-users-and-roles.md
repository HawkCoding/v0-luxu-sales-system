# Step 10a — Administrator Guide, Chapter 1: Users and roles

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** medium
**Output:** `docs/handbook/content/admin/01-users-and-roles.md`
**Screenshot slugs:** `a01-*` · new describe block `admin users`

## Scope

Adding a person to the system, giving them the right access, and taking it away again.

## Source of truth — read these

- `app/app/settings/page.tsx` — the Users card
- `app/api/users/route.ts`, `app/api/users/[userId]/route.ts`,
  `app/api/users/password/route.ts`, `app/api/users/assignable/route.ts`
- `lib/role-context.tsx`, `lib/role-utils.ts`, `lib/settings-access.ts`, `lib/api/auth.ts`
- `supabase/migrations/` — the `custom_access_token_hook` and `auth_has_role` functions
- `lib/session-timeout.ts`

## Must cover

1. **The roles.** Every `clearance_level` value that exists, in order of access, and what
   each one can and cannot reach. Build this as a matrix: rows are the main screens and
   actions, columns are the roles. Verify each cell against the code — do not assume.
2. **Creating a user.** Walk the real flow end to end, exactly as it works today: where the
   form is, every field, what the new person receives, and how they set their first
   password. If any part of it happens outside the app, say so explicitly and describe
   those steps too.
3. **Assigning a clearance level** — and what changes for that person immediately.
4. **Deactivating a user** — what happens to their bookings and whether they are reassigned.
5. **Resetting someone's password** — the administrator route and the self-service route.
6. **Who can be assigned a booking** — the assignable-consultant list and what governs it.
7. **Session timeout** — where it is configured and the effect of changing it.

> [!WARNING]
> Do not put any real password in this document, including the seeded demo ones.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `a01-users-card` | The Users card in Settings |
| `a01-add-user` | The add-user form |
| `a01-clearance` | Choosing a clearance level |

## Done when

- The role matrix is complete and each cell has been checked against the code, not guessed.
- A new administrator can add a working user account using only this chapter.
