CREATE TABLE IF NOT EXISTS voucher_template (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url         text,
  banner_url       text,
  header_text      text        NOT NULL DEFAULT 'A division of Luxus Travel & Tours',
  product_line     text        NOT NULL DEFAULT 'THE BLUE TRAIN • ROVOS RAIL • KRUGER SHALATI',
  accent_colour    text        NOT NULL DEFAULT '#0B2A3A',
  section_bg       text        NOT NULL DEFAULT '#1a3a4a',
  font_family      text        NOT NULL DEFAULT 'Georgia, serif',
  section_order    text[]      NOT NULL DEFAULT ARRAY['guest_info','service_provider','footer'],
  hidden_sections  text[]      NOT NULL DEFAULT ARRAY[]::text[],
  footer_company   text        NOT NULL DEFAULT 'Luxus Travel & Tours',
  footer_phone     text        NOT NULL DEFAULT '',
  footer_email     text        NOT NULL DEFAULT '',
  guidance_text    text        NOT NULL DEFAULT 'Please hand to your service provider. Pre-payment was made by Luxus Travel & Tours for all services mentioned below. Guests must settle extras direct with the service providers.',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Singleton row: only one voucher template config exists.
-- Preserve the most recently updated row if a partially-managed database has duplicates.
WITH ranked_templates AS (
  SELECT
    id,
    row_number() OVER (ORDER BY updated_at DESC, id) AS row_number
  FROM voucher_template
)
DELETE FROM voucher_template
WHERE id IN (
  SELECT id
  FROM ranked_templates
  WHERE row_number > 1
);

INSERT INTO voucher_template (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM voucher_template);

CREATE UNIQUE INDEX IF NOT EXISTS voucher_template_singleton_idx
  ON voucher_template ((true));

-- RLS
ALTER TABLE voucher_template ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the template
DROP POLICY IF EXISTS "voucher_template_read" ON voucher_template;
CREATE POLICY "voucher_template_read" ON voucher_template
  FOR SELECT TO authenticated USING (true);

-- Only admins can update
DROP POLICY IF EXISTS "voucher_template_write" ON voucher_template;
CREATE POLICY "voucher_template_write" ON voucher_template
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_role(ARRAY['admin'::public.user_role])
  );
