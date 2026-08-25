-- 20260824100000_template_supplier_variants.sql intended to replace the old
-- single-column UNIQUE(key) constraint with the composite (key, supplier_id)
-- one, but dropped the wrong index name (public.templates_key_unique, which
-- never existed) instead of the actual auto-generated constraint name
-- (templates_key_key). That left the old single-column constraint active,
-- so it fired on every variant insert before ux_templates_key_supplier was
-- ever consulted -- every "Add train variant" attempt failed with a 23505,
-- for any template and any train, even with zero existing variants.
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_key_key;
