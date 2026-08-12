# Hosted auth config for portable recovery links — dev + production

Follow-up to QA 02 F02-7, fixed in code by commit `79a76e4`. The code change is
complete; two pieces of **hosted Supabase configuration** are not, because they
live in Supabase's own database rather than in this repo.

## What has to change, and why

| # | Setting | Why | If skipped |
|---|---------|-----|------------|
| 1 | Redirect allow-list must include `/auth/confirm` | `resetPasswordForEmail` now asks Supabase to return the user to `<origin>/auth/confirm`. Supabase silently ignores any return URL not on the allow-list and substitutes `site_url`. | Reset link lands on the app root, never on "choose a new password". **Worse than before** — this is a regression on dev/prod until fixed. |
| 2 | Reset-password email template must send a `token_hash` link | The default template sends a PKCE `code`, whose verifier is a cookie in the requesting browser, so the link dies on any other device. | No regression — `/auth/confirm` still accepts `code` links — but F02-7 stays unfixed on dev/prod. |

Item 1 is the urgent one. Item 2 is the actual fix.

Both must be applied **twice**: once for the dev project, once for production
(`SUPABASE_DEV_PROJECT_REF` / `SUPABASE_PROD_PROJECT_REF` in `.env.sync.local`).

## Approach — recommended: a surgical Management API script

Add `scripts/sync-auth-recovery-config.mjs`, run as
`node scripts/sync-auth-recovery-config.mjs --target dev [--apply]`.

Behaviour:

1. Resolve the project ref from `SUPABASE_DEV_PROJECT_REF` / `SUPABASE_PROD_PROJECT_REF`, and the token from `SUPABASE_ACCESS_TOKEN` (already present in `.env.local`). Never print either.
2. `GET https://api.supabase.com/v1/projects/{ref}/config/auth` and write the full response to the scratchpad as a **rollback snapshot**, not into the repo (it contains provider secrets).
3. Print a diff of only the fields this script owns:
   - `uri_allow_list` — append `<site_url>/auth/confirm` if absent, preserving every existing entry verbatim.
   - `mailer_subjects_recovery` — `Reset your Luxus Sales password`.
   - `mailer_templates_recovery_content` — the body of `supabase/templates/recovery.html`.
   Also **read and report** `site_url`, since the template's link is built from `{{ .SiteURL }}` — if it is wrong or empty, stop and say so rather than patching.
4. Without `--apply`: exit after the diff (dry run is the default).
5. With `--apply`: `PATCH` **only those three fields**. Production additionally requires `ALLOW_PRODUCTION_AUTH_CONFIG_PUSH=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION`, mirroring the existing guard in `scripts/sync-remote-databases.ps1:79-84`.
6. Idempotent: re-running after a successful apply produces an empty diff.

### Why not `supabase config push`

It would be the tidier "config in git" answer, but it pushes the **whole `[auth]`
block**, not just the keys we care about. Our `config.toml` is tuned for the local
Docker stack, so a push would carry local values into a hosted project — including
`[auth.rate_limit] email_sent = 2` (per hour), which would throttle real password
resets in production, plus `site_url = "http://localhost:3000"`, `jwt_expiry`,
`enable_confirmations = false` and the Azure external-provider block whose secrets
come from local env vars. Getting that safe means mirroring every one of those keys
into `[remotes.dev]` / `[remotes.prod]` overrides and being confident nothing was
missed. Too much blast radius for two settings.

### Why not just the dashboard

Perfectly safe, ~5 minutes, and it stays the documented fallback
([NOTES.md](../../NOTES.md) §3b). Rejected as the primary route because it leaves
no record of what was set, has to be redone by hand on any new environment, and
the template body will drift from `supabase/templates/recovery.html` the moment
someone edits one and not the other. The script keeps the repo as the source of
truth.

## Sequence

1. Build the script; dry-run against **dev**. Confirm the diff touches exactly the three fields and that dev's `site_url` is the real dev URL.
2. Apply to dev.
3. Verify on dev, end to end — this is the acceptance test:
   - Request a password reset for a real dev account.
   - Open the email **on a phone, or in a different browser profile** from the one that requested it.
   - Expect: lands on `/auth/set-new-password`, a ≥10-character password is accepted, the old password then fails and the new one works.
   - Also confirm a **second** click on the same link now shows the "invalid or already used" message rather than dumping the user on the dashboard (F02-4 handling).
4. Dry-run against **production**, review, then apply with the explicit env-var opt-in.
5. Repeat the cross-device verification on production with a throwaway account, then delete it.
6. Update [NOTES.md](../../NOTES.md) §3b to name the script as the primary path, keeping the dashboard steps as the fallback.

## Risks and guards

- **Clobbering the allow-list.** Always append to the list returned by the `GET`; never send a hand-written list. `/auth/callback` must survive — the Azure OAuth flow still uses it.
- **Wrong `site_url`.** The email link is built from it. Read it, report it, refuse to patch if it is empty or still points at localhost.
- **Secrets.** `SUPABASE_ACCESS_TOKEN` and the snapshot both stay out of the repo and out of logs. Snapshot goes to the session scratchpad only.
- **Production blast radius.** Dry-run default, explicit env opt-in, and the rollback snapshot taken before the `PATCH` — restoring is a single `PATCH` of the three fields from the snapshot.
- **Rate limits.** Do not touch `[auth.rate_limit]` on hosted projects. Note that the local stack does not enforce `email_sent = 2` (QA 02 observed three recovery emails delivered), so email-frequency behaviour on dev/prod will differ from local and is worth watching during step 3.

## Definition of done

- `/auth/confirm` on the allow-list for both projects, with existing entries intact.
- Recovery template on both projects points at
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-new-password`.
- A cross-device reset completes on dev and on production.
- Re-running the script reports no changes.
- `NOTES.md` §3b reflects the script.
