-- Default commission applied to every new job's auto-created draft quote, and pre-filled into
-- the Build Booking dialog so the salesperson isn't blocked by an empty required field.
-- Stored as a (type, value) pair of rows in the existing key/value app_settings table.
-- Idempotent so it can be applied to local databases in any state.

INSERT INTO public.app_settings (key, value)
VALUES
  ('default_commission_type', 'percent'),
  ('default_commission_value', '0')
ON CONFLICT (key) DO NOTHING;
