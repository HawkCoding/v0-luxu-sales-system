# Project notes

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
