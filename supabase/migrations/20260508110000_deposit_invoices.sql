CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('deposit', 'final')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  invoice_number text NOT NULL UNIQUE,
  deposit_percentage numeric(5,2),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  due_date date,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_booking_id_idx ON public.invoices(booking_id);
CREATE INDEX IF NOT EXISTS invoices_quote_id_idx ON public.invoices(quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_deposit_per_booking_idx
  ON public.invoices(booking_id)
  WHERE kind = 'deposit' AND status IN ('draft', 'sent');

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;

DROP POLICY IF EXISTS invoices_authenticated_select ON public.invoices;
DROP POLICY IF EXISTS invoices_authenticated_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_authenticated_update ON public.invoices;

CREATE POLICY invoices_authenticated_select
  ON public.invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY invoices_authenticated_insert
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY invoices_authenticated_update
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
