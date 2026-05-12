DO $$
DECLARE
  missing_tables text[];
  missing_auth_emails text[];
BEGIN
  SELECT array_agg(schema_name || '.' || table_name ORDER BY schema_name, table_name)
  INTO missing_tables
  FROM (
    VALUES
      ('public', 'countries'),
      ('public', 'country_aliases'),
      ('public', 'locations'),
      ('public', 'profiles'),
      ('public', 'app_settings')
  ) AS required(schema_name, table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = required.schema_name
      AND table_name = required.table_name
  );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required tables: %. Reapply migrations before running this restore.', missing_tables;
  END IF;

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
  SELECT country.id, lower(trim(alias_values.alias))
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
  ) AS alias_values(country_name, alias)
  JOIN public.countries AS country
    ON country.name = alias_values.country_name
  ON CONFLICT DO NOTHING;

  INSERT INTO public.locations (id, name, country, region_code, created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000001001', 'Pretoria', 'South Africa', 'ZA-GP', '2025-08-10T08:00:00Z', now()),
    ('00000000-0000-0000-0000-000000001002', 'Cape Town', 'South Africa', 'ZA-WC', '2025-08-10T08:00:00Z', now()),
    ('00000000-0000-0000-0000-000000001003', 'Durban', 'South Africa', 'ZA-KZN', '2025-08-10T08:00:00Z', now()),
    ('00000000-0000-0000-0000-000000001004', 'Victoria Falls', 'Zimbabwe', 'ZW-MW', '2025-08-10T08:00:00Z', now()),
    ('00000000-0000-0000-0000-000000001005', 'Swakopmund', 'Namibia', 'NA-ER', '2025-08-10T08:00:00Z', now()),
    ('00000000-0000-0000-0000-000000001006', 'Dar es Salaam', 'Tanzania', 'TZ-02', '2025-08-10T08:00:00Z', now())
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    country = EXCLUDED.country,
    region_code = EXCLUDED.region_code,
    updated_at = now();

  INSERT INTO public.app_settings (key, value)
  VALUES
    ('business_name', 'Luxus Travel and Tours'),
    ('default_deposit_percentage', '25'),
    ('session_timeout_minutes', '30')
  ON CONFLICT (key) DO UPDATE
  SET
    value = EXCLUDED.value,
    updated_at = now();

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES
    ('voucher-assets', 'voucher-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']),
    ('vouchers', 'vouchers', false, 10485760, ARRAY['application/pdf'])
  ON CONFLICT (id) DO UPDATE
  SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  EXECUTE 'DROP POLICY IF EXISTS "voucher_assets_read" ON storage.objects';
  EXECUTE 'CREATE POLICY "voucher_assets_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''voucher-assets'')';
  EXECUTE 'DROP POLICY IF EXISTS "voucher_assets_insert" ON storage.objects';
  EXECUTE 'CREATE POLICY "voucher_assets_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''voucher-assets'' AND public.auth_has_role(ARRAY[''admin''::public.user_role]))';
  EXECUTE 'DROP POLICY IF EXISTS "voucher_assets_update" ON storage.objects';
  EXECUTE 'CREATE POLICY "voucher_assets_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''voucher-assets'' AND public.auth_has_role(ARRAY[''admin''::public.user_role]))';
  EXECUTE 'DROP POLICY IF EXISTS "voucher_assets_delete" ON storage.objects';
  EXECUTE 'CREATE POLICY "voucher_assets_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''voucher-assets'' AND public.auth_has_role(ARRAY[''admin''::public.user_role]))';
  EXECUTE 'DROP POLICY IF EXISTS "vouchers_read" ON storage.objects';
  EXECUTE 'CREATE POLICY "vouchers_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''vouchers'')';
  EXECUTE 'DROP POLICY IF EXISTS "vouchers_insert" ON storage.objects';
  EXECUTE 'CREATE POLICY "vouchers_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''vouchers'' AND public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))';
  EXECUTE 'DROP POLICY IF EXISTS "vouchers_update" ON storage.objects';
  EXECUTE 'CREATE POLICY "vouchers_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''vouchers'' AND public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role])) WITH CHECK (bucket_id = ''vouchers'' AND public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))';

  WITH desired_profiles(email, name, surname, clearance_level) AS (
    VALUES
      ('carmen@luxustravel.co.za', 'Carmen', 'de Jager', 'admin'::public.user_role),
      ('dirk@luxustravel.co.za', 'Dirk', 'Rossouw', 'manager'::public.user_role),
      ('leonie@luxustravel.co.za', 'Leonie', 'Botha', 'consultant'::public.user_role),
      ('monade@luxustravel.co.za', 'Monade', 'van Eeden', 'consultant'::public.user_role),
      ('douwlien@luxustravel.co.za', 'Douwlien', 'Louw', 'readonly'::public.user_role)
  ),
  matching_auth_users AS (
    SELECT
      auth_user.id AS user_id,
      lower(auth_user.email) AS email,
      desired_profiles.name,
      desired_profiles.surname,
      desired_profiles.clearance_level
    FROM desired_profiles
    JOIN auth.users AS auth_user
      ON lower(auth_user.email) = desired_profiles.email
  )
  INSERT INTO public.profiles (user_id, email, name, surname, clearance_level, is_active)
  SELECT user_id, email, name, surname, clearance_level, true
  FROM matching_auth_users
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    surname = EXCLUDED.surname,
    clearance_level = EXCLUDED.clearance_level,
    is_active = true,
    updated_at = now();

  WITH desired_profiles(email) AS (
    VALUES
      ('carmen@luxustravel.co.za'),
      ('dirk@luxustravel.co.za'),
      ('leonie@luxustravel.co.za'),
      ('monade@luxustravel.co.za'),
      ('douwlien@luxustravel.co.za')
  )
  SELECT array_agg(desired_profiles.email ORDER BY desired_profiles.email)
  INTO missing_auth_emails
  FROM desired_profiles
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE lower(auth_user.email) = desired_profiles.email
  );

  IF missing_auth_emails IS NOT NULL THEN
    RAISE WARNING 'Profiles not created for missing Auth users: %. Create these Auth users and rerun this script.', missing_auth_emails;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
