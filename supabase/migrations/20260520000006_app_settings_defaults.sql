-- Phase 1: default age bands in app_settings
INSERT INTO public.app_settings (key, value) VALUES
  ('default_infant_max_age', '2'),
  ('default_child_max_age',  '12')
ON CONFLICT (key) DO NOTHING;
