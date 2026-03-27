CREATE TABLE IF NOT EXISTS public.countries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  iso_alpha2 text,
  iso_alpha3 text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT countries_pkey PRIMARY KEY (id),
  CONSTRAINT countries_name_unique UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS countries_name_lower_unique_idx
  ON public.countries USING btree (lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS countries_iso_alpha2_unique_idx
  ON public.countries USING btree (iso_alpha2)
  WHERE iso_alpha2 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS countries_iso_alpha3_unique_idx
  ON public.countries USING btree (iso_alpha3)
  WHERE iso_alpha3 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.country_aliases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  country_id uuid NOT NULL,
  alias text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT country_aliases_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'country_aliases_country_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.country_aliases
      ADD CONSTRAINT country_aliases_country_id_fkey
      FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS country_aliases_alias_lower_unique_idx
  ON public.country_aliases USING btree (lower(alias));

CREATE INDEX IF NOT EXISTS country_aliases_country_id_idx
  ON public.country_aliases USING btree (country_id);

INSERT INTO public.countries (name, iso_alpha2, iso_alpha3)
VALUES
  ('South Africa', 'ZA', 'ZAF'),
  ('United Kingdom', 'GB', 'GBR'),
  ('United States', 'US', 'USA'),
  ('Germany', 'DE', 'DEU'),
  ('France', 'FR', 'FRA'),
  ('Italy', 'IT', 'ITA'),
  ('Australia', 'AU', 'AUS'),
  ('Canada', 'CA', 'CAN'),
  ('Netherlands', 'NL', 'NLD'),
  ('Sweden', 'SE', 'SWE'),
  ('Switzerland', 'CH', 'CHE'),
  ('UAE', 'AE', 'ARE'),
  ('India', 'IN', 'IND'),
  ('Japan', 'JP', 'JPN'),
  ('Brazil', 'BR', 'BRA'),
  ('New Zealand', 'NZ', 'NZL'),
  ('Spain', 'ES', 'ESP'),
  ('Portugal', 'PT', 'PRT'),
  ('Austria', 'AT', 'AUT'),
  ('Belgium', 'BE', 'BEL'),
  ('Denmark', 'DK', 'DNK'),
  ('Norway', 'NO', 'NOR'),
  ('Singapore', 'SG', 'SGP'),
  ('China', 'CN', 'CHN'),
  ('Other', NULL, NULL)
ON CONFLICT (name) DO UPDATE
SET
  iso_alpha2 = EXCLUDED.iso_alpha2,
  iso_alpha3 = EXCLUDED.iso_alpha3;

INSERT INTO public.country_aliases (country_id, alias)
SELECT c.id, lower(trim(v.alias))
FROM (
  VALUES
    ('South Africa', 'South Africa'),
    ('South Africa', 'RSA'),
    ('South Africa', 'SA'),
    ('South Africa', 'ZA'),
    ('South Africa', 'ZAF'),
    ('South Africa', 'Republic of South Africa'),
    ('South Africa', 'S Africa'),
    ('South Africa', 'Southafrica'),

    ('United Kingdom', 'United Kingdom'),
    ('United Kingdom', 'UK'),
    ('United Kingdom', 'GB'),
    ('United Kingdom', 'GBR'),
    ('United Kingdom', 'Great Britain'),
    ('United Kingdom', 'Britain'),
    ('United Kingdom', 'England'),

    ('United States', 'United States'),
    ('United States', 'USA'),
    ('United States', 'US'),
    ('United States', 'United States of America'),
    ('United States', 'America'),
    ('United States', 'U S A'),

    ('Germany', 'Germany'),
    ('Germany', 'Deutschland'),
    ('Germany', 'DE'),
    ('Germany', 'DEU'),

    ('France', 'France'),
    ('France', 'FR'),
    ('France', 'FRA'),

    ('Italy', 'Italy'),
    ('Italy', 'IT'),
    ('Italy', 'ITA'),

    ('Australia', 'Australia'),
    ('Australia', 'AU'),
    ('Australia', 'AUS'),

    ('Canada', 'Canada'),
    ('Canada', 'CA'),
    ('Canada', 'CAN'),

    ('Netherlands', 'Netherlands'),
    ('Netherlands', 'Holland'),
    ('Netherlands', 'NL'),
    ('Netherlands', 'NLD'),

    ('Sweden', 'Sweden'),
    ('Sweden', 'SE'),
    ('Sweden', 'SWE'),

    ('Switzerland', 'Switzerland'),
    ('Switzerland', 'CH'),
    ('Switzerland', 'CHE'),

    ('UAE', 'UAE'),
    ('UAE', 'United Arab Emirates'),
    ('UAE', 'AE'),
    ('UAE', 'ARE'),
    ('UAE', 'Abu Dhabi'),
    ('UAE', 'Dubai'),

    ('India', 'India'),
    ('India', 'IN'),
    ('India', 'IND'),

    ('Japan', 'Japan'),
    ('Japan', 'JP'),
    ('Japan', 'JPN'),

    ('Brazil', 'Brazil'),
    ('Brazil', 'BR'),
    ('Brazil', 'BRA'),

    ('New Zealand', 'New Zealand'),
    ('New Zealand', 'NZ'),
    ('New Zealand', 'NZL'),

    ('Spain', 'Spain'),
    ('Spain', 'ES'),
    ('Spain', 'ESP'),

    ('Portugal', 'Portugal'),
    ('Portugal', 'PT'),
    ('Portugal', 'PRT'),

    ('Austria', 'Austria'),
    ('Austria', 'AT'),
    ('Austria', 'AUT'),

    ('Belgium', 'Belgium'),
    ('Belgium', 'BE'),
    ('Belgium', 'BEL'),

    ('Denmark', 'Denmark'),
    ('Denmark', 'DK'),
    ('Denmark', 'DNK'),

    ('Norway', 'Norway'),
    ('Norway', 'NO'),
    ('Norway', 'NOR'),

    ('Singapore', 'Singapore'),
    ('Singapore', 'SG'),
    ('Singapore', 'SGP'),

    ('China', 'China'),
    ('China', 'CN'),
    ('China', 'CHN'),
    ('China', 'PRC'),
    ('China', 'People''s Republic of China'),

    ('Other', 'Other'),
    ('Other', 'Unknown'),
    ('Other', 'N/A'),
    ('Other', 'NA'),
    ('Other', 'None'),
    ('Other', 'Unspecified')
) AS v(country_name, alias)
JOIN public.countries c
  ON c.name = v.country_name
ON CONFLICT DO NOTHING;

UPDATE public.customers AS customer
SET country = canonical.name
FROM public.country_aliases alias
JOIN public.countries canonical
  ON canonical.id = alias.country_id
WHERE customer.country IS NOT NULL
  AND btrim(customer.country) <> ''
  AND lower(btrim(customer.country)) = alias.alias;

UPDATE public.customers
SET country = NULL
WHERE country IS NOT NULL
  AND btrim(country) = '';

GRANT ALL ON TABLE public.countries TO anon;
GRANT ALL ON TABLE public.countries TO authenticated;
GRANT ALL ON TABLE public.countries TO service_role;

GRANT ALL ON TABLE public.country_aliases TO anon;
GRANT ALL ON TABLE public.country_aliases TO authenticated;
GRANT ALL ON TABLE public.country_aliases TO service_role;

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'countries'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.countries
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'countries'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.countries
      FOR INSERT TO authenticated
      WITH CHECK (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'countries'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.countries
      FOR UPDATE TO authenticated
      USING (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      )
      WITH CHECK (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'countries'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.countries
      FOR DELETE TO authenticated
      USING (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'country_aliases'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.country_aliases
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'country_aliases'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.country_aliases
      FOR INSERT TO authenticated
      WITH CHECK (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'country_aliases'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.country_aliases
      FOR UPDATE TO authenticated
      USING (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      )
      WITH CHECK (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'country_aliases'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.country_aliases
      FOR DELETE TO authenticated
      USING (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
