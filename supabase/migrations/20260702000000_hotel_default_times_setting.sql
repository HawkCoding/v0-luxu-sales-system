-- Seeds configurable default hotel check-in/check-out times into the key/value settings table.
-- The app_settings table, grants, and policies already exist (20260507150000). Idempotent.

INSERT INTO public.app_settings (key, value)
VALUES
  ('hotel_default_check_in_time', '14:00'),
  ('hotel_default_check_out_time', '11:00')
ON CONFLICT (key) DO NOTHING;
