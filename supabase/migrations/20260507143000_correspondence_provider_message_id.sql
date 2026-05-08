ALTER TABLE public.correspondences
  ADD COLUMN IF NOT EXISTS provider_message_id text;
