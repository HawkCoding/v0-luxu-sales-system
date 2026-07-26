-- Multi-brand email signatures. Divisions (SA Rail, Luxus Travel & Tours,
-- Arnelia House) share the same registration/trading-hours/confidentiality
-- copy — the differentiator is the banner image, plus optional small wording
-- tweaks. So this is a single global brand list (admin-owned, capped at 10),
-- combined at send time with the existing per-person `email_signatures` row,
-- which is untouched by this migration. Any consultant may pick any brand
-- for any send; there is no per-user assignment.

CREATE TABLE IF NOT EXISTS public.signature_brands (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  banner_url         text,
  banner_width       integer,
  banner_height      integer,
  badges             jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled            boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  -- Six optional per-brand overrides. NULL/blank means inherit the
  -- corresponding signature_* value from app_settings.
  company_line       text,
  registration_line  text,
  trading_hours      text,
  divisions_line     text,
  confidentiality    text,
  office_address     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_brands_badges_is_array CHECK (jsonb_typeof(badges) = 'array')
);

CREATE INDEX IF NOT EXISTS signature_brands_sort_order_idx ON public.signature_brands (sort_order);

ALTER TABLE public.signature_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signature_brands_admin_manager_all" ON public.signature_brands;
CREATE POLICY "signature_brands_admin_manager_all"
  ON public.signature_brands
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

-- Every authenticated user can read the brand list: the send dialog and its
-- preview need the names and rendered copy regardless of role.
DROP POLICY IF EXISTS "signature_brands_select_all" ON public.signature_brands;
CREATE POLICY "signature_brands_select_all"
  ON public.signature_brands
  FOR SELECT
  TO authenticated
  USING (true);

-- A row-count cap can't be expressed as a CHECK constraint, so enforce the
-- max-10 limit with a trigger. Mirrors the admin-side guard in the API route
-- (defense in depth).
CREATE OR REPLACE FUNCTION public.signature_brands_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.signature_brands) >= 10 THEN
    RAISE EXCEPTION 'Maximum of 10 signature brands allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signature_brands_enforce_cap_trigger ON public.signature_brands;
CREATE TRIGGER signature_brands_enforce_cap_trigger
  BEFORE INSERT ON public.signature_brands
  FOR EACH ROW
  EXECUTE FUNCTION public.signature_brands_enforce_cap();

DROP TRIGGER IF EXISTS signature_brands_set_updated_at ON public.signature_brands;
CREATE OR REPLACE FUNCTION public.signature_brands_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER signature_brands_set_updated_at
  BEFORE UPDATE ON public.signature_brands
  FOR EACH ROW
  EXECUTE FUNCTION public.signature_brands_set_updated_at();

-- Seed the three known divisions. SA Rail inherits the banner already stored
-- in app_settings, so an existing installation renders byte-identically
-- after this migration; the other two start bannerless for the admin to
-- upload separately. All six text overrides start NULL (inherit globals).
INSERT INTO public.signature_brands (slug, name, banner_url, sort_order)
SELECT 'sa-rail', 'SA Rail', NULLIF((SELECT value FROM public.app_settings WHERE key = 'signature_banner_url'), ''), 0
WHERE NOT EXISTS (SELECT 1 FROM public.signature_brands WHERE slug = 'sa-rail');

INSERT INTO public.signature_brands (slug, name, sort_order)
SELECT 'luxus-travel', 'Luxus Travel & Tours', 1
WHERE NOT EXISTS (SELECT 1 FROM public.signature_brands WHERE slug = 'luxus-travel');

INSERT INTO public.signature_brands (slug, name, sort_order)
SELECT 'arnelia-house', 'Arnelia House', 2
WHERE NOT EXISTS (SELECT 1 FROM public.signature_brands WHERE slug = 'arnelia-house');

-- New global default: office address line under the signature banner.
-- Blank by default (renders no address row) until an admin fills it in.
INSERT INTO public.app_settings (key, value)
VALUES ('signature_office_address', '')
ON CONFLICT (key) DO NOTHING;

-- Banners are per-brand now; the SA Rail row above already carries the value
-- this key held, so the key itself is retired.
DELETE FROM public.app_settings WHERE key = 'signature_banner_url';
