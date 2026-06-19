# Admin Role — End-to-End QA Findings (Phase 33 UAT + Phase 35 Backup/Restore)

- **Run date:** 2026-06-02T08:51:31.628Z
- **Branch:** wip/pre-demo-local-v2
- **Commit SHA:** 22e36e4
- **Browser:** Chromium (Playwright `Desktop Chrome`)
- **Acting role:** Admin — carmen@luxustravel.co.za (clearance_level=admin)
- **Base URL:** http://localhost:3000 (local dev + local Supabase)

**Result:** 6 PASS · 0 FAIL · 0 BLOCKED (of 6 criteria)

## Per-criterion results

| # | Title | Result | Evidence |
|---|-------|--------|----------|
| 1 | Create users (add/login/deactivate/cannot login) | PASS | Created consultant qa-consultant+1780390187751@example.invalid via UI (is_active=true, clearance_level=consultant); New consultant signs in and reaches /app; Deactivated via UI (is_active=false); After deactivation the consultant is bounced from /app to /login; Admin created a consultant via UI; new user logged in; after deactivation login is blocked; `screenshots/a1-users-list.png` |
| 2 | Configure company details (persistence + audit) | PASS | Business name ''→'Luxus Travel QA 1780390265892' persisted (GET confirms); audit settings_changed written (after={"business_name":"Luxus Travel QA 1780390265892"}); Company business name updated via UI; persistence + audit verified; `screenshots/a2-company.png` |
| 3 | Configure email accounts (stub mailbox, validation) | PASS | Validation: POST with invalid email → HTTP 400 (Zod boundary rejects bad input); Stub mailbox 'qa-stub+1780390269306@example.invalid' (host stub.invalid) added via UI and persisted; enabled=true; lastSyncedAt=null (no sync run); Stub IMAP mailbox added via UI with fake creds; validates + persists; no sync triggered; `screenshots/a3-inbound-email.png` |
| 4 | Configure backup/restore (create + download) | PASS | "Backup now" → HTTP 201, snapshot 2026/06/02/backup-1780390280202.json (666089 bytes), record 96d918c8-919f-49e4-826c-f6aac1caef58; Download control visible in the Backup & Restore card; Download signed URL → HTTP 200, content-type 'application/json', body parses as JSON (60 tables incl. customers/bookings); Backup created from the Settings → Backup & Restore UI; download returns a 200 JSON signed URL; `screenshots/a4-backup-card.png` |
| 5 | Restore from backup (sandbox round-trip) | PASS | Pre-check OK (Supabase=http://127.0.0.1:54321, QA_ALLOW_RESTORE=1); created pre-mutation backup 692d6dc2-a326-4498-9ad1-5c71d166ff36; renamed James Mitchell→Mitchell-QA-1780390290058; before-restore.json written; restore → HTTP 200; last_name reverted to 'Mitchell'; audit 'backup_restored' written; Sandboxed restore round-trip: mutated row reverted to pre-backup state; backup_restored audit written; ran local-only with confirmation token |
| 6 | Manage global settings (quote_validity_days) | PASS | Changed Quote Validity to 7 days via Settings UI (was 14); new quote bcd5fb66-a1d8-4518-ae54-d82f374597e7 validity_until=2026-06-09 (expected 2026-06-09); reverted afterwards; Quote validity changed via the Settings UI; new quote reflects the new window; reverted; `screenshots/a6-quote-validity.png` |

## Findings

_No findings recorded._
## Improvement recommendations (prioritised)

1. RESOLVED this round: the restore RPC no longer needs superuser (FKs are now DEFERRABLE and restore uses SET CONSTRAINTS ALL DEFERRED); the Backup & Restore card and a Quote Validity card are wired into Settings; and the inbound-mailbox route now returns a handled error when EMAIL_CREDENTIAL_ENCRYPTION_KEY is unset. Re-confirm in staging after deploy.
2. Add a DB-level integration test for restore_backup_snapshot (the existing route test mocks the RPC, which is why the superuser failure went undetected). The A5 sweep here is the current guard — consider promoting it to CI against a disposable local Supabase.
3. Keep the new-FK convention: declare future foreign keys DEFERRABLE INITIALLY IMMEDIATE so backup restore continues to work. Document EMAIL_CREDENTIAL_ENCRYPTION_KEY in the production deploy checklist (added to .env.local.example).

## Coverage map — todo.md Phase 33 Admin UAT + Phase 35 backup/restore

| todo.md bullet | Criterion | Demonstrably passing? |
|----------------|-----------|------------------------|
| Create users (add / login / deactivate / cannot login) | 1 | ✅ Yes |
| Configure company details (persistence + audit) | 2 | ✅ Yes |
| Configure email accounts (stub mailbox, validation) | 3 | ✅ Yes |
| Configure backup/restore (create + download) | 4 | ✅ Yes |
| Restore from backup (sandbox round-trip) | 5 | ✅ Yes |
| Manage global settings (quote_validity_days) | 6 | ✅ Yes |

## Environment note

The restore test (criterion 5) ran against **local Supabase only** (http://127.0.0.1:54321), after `pnpm db:reset`, gated behind `QA_ALLOW_RESTORE=1`. The typed-confirmation token (confirmBackupId === backupId) was supplied, and `test-results/before-restore.json` captured the mutated row immediately prior to the restore.

