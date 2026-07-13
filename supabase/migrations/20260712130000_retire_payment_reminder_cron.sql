-- Email automation Phase 4: payment reminders are sent by button (editable
-- preview) instead of the retired auto-scheduling cron. The payment_reminders
-- table is kept as send history; the cron's settings are removed.

delete from public.app_settings
where key in ('payment_reminder_enabled', 'payment_reminder_cadence');
