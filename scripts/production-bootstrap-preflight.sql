-- =============================================================================
-- PRODUCTION BOOTSTRAP PREFLIGHT
-- =============================================================================
-- Read-only checks to decide whether production only needs data reseeding or a
-- full migration replay first.
-- Run in Supabase Studio SQL Editor before production-bootstrap-restore.sql.
-- =============================================================================

WITH required_tables(schema_name, table_name) AS (
  VALUES
    ('public', 'countries'),
    ('public', 'country_aliases'),
    ('public', 'locations'),
    ('public', 'profiles'),
    ('public', 'app_settings')
),
table_state AS (
  SELECT
    required_tables.schema_name,
    required_tables.table_name,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = required_tables.schema_name
        AND table_name = required_tables.table_name
    ) AS exists
  FROM required_tables
)
SELECT
  table_state.schema_name,
  table_state.table_name,
  table_state.exists,
  CASE table_state.table_name
    WHEN 'countries' THEN CASE WHEN table_state.exists THEN (SELECT count(*) FROM public.countries) END
    WHEN 'country_aliases' THEN CASE WHEN table_state.exists THEN (SELECT count(*) FROM public.country_aliases) END
    WHEN 'locations' THEN CASE WHEN table_state.exists THEN (SELECT count(*) FROM public.locations) END
    WHEN 'app_settings' THEN CASE WHEN table_state.exists THEN (SELECT count(*) FROM public.app_settings) END
    WHEN 'profiles' THEN CASE WHEN table_state.exists THEN (
      SELECT count(*)
      FROM public.profiles
      WHERE clearance_level = 'admin'
        AND is_active = true
    ) END
  END AS current_count
FROM table_state
ORDER BY schema_name, table_name;
