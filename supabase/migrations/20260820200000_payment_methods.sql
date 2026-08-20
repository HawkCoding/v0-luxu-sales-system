-- Multiple payment methods (bank/company details). Replaces the single global
-- Banking Details settings card with a named, switchable list — mirrors
-- signature_brands: admin/manager-owned, every authenticated user can read
-- and pick from the enabled list, capped at 10.

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  enabled              boolean NOT NULL DEFAULT true,
  is_default           boolean NOT NULL DEFAULT false,
  sort_order           integer NOT NULL DEFAULT 0,
  bank_name            text,
  bank_account_name    text,
  bank_account_number  text,
  bank_branch_code     text,
  bank_swift_code      text,
  company_address      text,
  company_reg_number   text,
  company_vat_number   text,
  company_tel          text,
  company_cell         text,
  company_fax          text,
  company_email        text,
  company_website      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_methods_sort_order_idx ON public.payment_methods (sort_order);

-- At most one default at a time.
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_single_default_idx
  ON public.payment_methods (is_default)
  WHERE is_default;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_methods_admin_manager_all" ON public.payment_methods;
CREATE POLICY "payment_methods_admin_manager_all"
  ON public.payment_methods
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

-- Every authenticated user can read the list: the invoice-generation and
-- send-dialog pickers need the names regardless of role.
DROP POLICY IF EXISTS "payment_methods_select_all" ON public.payment_methods;
CREATE POLICY "payment_methods_select_all"
  ON public.payment_methods
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.payment_methods_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.payment_methods) >= 10 THEN
    RAISE EXCEPTION 'Maximum of 10 payment methods allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_methods_enforce_cap_trigger ON public.payment_methods;
CREATE TRIGGER payment_methods_enforce_cap_trigger
  BEFORE INSERT ON public.payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.payment_methods_enforce_cap();

CREATE OR REPLACE FUNCTION public.payment_methods_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_methods_set_updated_at ON public.payment_methods;
CREATE TRIGGER payment_methods_set_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.payment_methods_set_updated_at();

-- Seed one "Primary" method from the existing flat app_settings banking keys
-- so an existing installation keeps rendering byte-identically after this
-- migration, then retire those keys — except company_email, which is also
-- owned by the separate Company settings card (app/api/settings/company).
INSERT INTO public.payment_methods (
  name, is_default, sort_order,
  bank_name, bank_account_name, bank_account_number, bank_branch_code, bank_swift_code,
  company_address, company_reg_number, company_vat_number,
  company_tel, company_cell, company_fax, company_email, company_website
)
SELECT
  'Primary', true, 0,
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'bank_name'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'bank_account_name'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'bank_account_number'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'bank_branch_code'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'bank_swift_code'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_address'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_reg_number'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_vat_number'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_tel'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_cell'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_fax'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_email'), ''),
  NULLIF((SELECT value FROM public.app_settings WHERE key = 'company_website'), '')
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods);

DELETE FROM public.app_settings
WHERE key IN (
  'bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch_code', 'bank_swift_code',
  'company_address', 'company_reg_number', 'company_vat_number',
  'company_tel', 'company_cell', 'company_fax', 'company_website'
);

-- Invoices remember which payment method they were generated with, so the
-- PDF keeps showing the method chosen at generation even if the default
-- later changes; the email picker uses this as its initial selection.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;
