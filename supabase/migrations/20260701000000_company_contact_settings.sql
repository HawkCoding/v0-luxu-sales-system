-- Company contact info shown/edited in Settings > Company Information
INSERT INTO public.app_settings (key, value) VALUES
  ('company_email', 'info@luxustravel.co.za'),
  ('company_phone', '+27 12 345 6789'),
  ('vat_rate', '15')
ON CONFLICT (key) DO NOTHING;
