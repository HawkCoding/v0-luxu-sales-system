CREATE OR REPLACE FUNCTION public.replace_quote_line_items(
  p_quote_id uuid,
  p_line_items jsonb,
  p_subtotal numeric,
  p_vat numeric,
  p_total numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = p_quote_id) THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  DELETE FROM public.quote_line_items
  WHERE quote_id = p_quote_id;

  INSERT INTO public.quote_line_items (
    quote_id,
    description,
    qty,
    unit_price,
    total,
    sort_order
  )
  SELECT
    p_quote_id,
    item.description,
    item.qty,
    item.unit_price,
    item.total,
    item.sort_order
  FROM jsonb_to_recordset(p_line_items) AS item(
    description text,
    qty integer,
    unit_price numeric,
    total numeric,
    sort_order integer
  );

  UPDATE public.quotes
  SET subtotal = p_subtotal,
      vat = p_vat,
      total = p_total
  WHERE id = p_quote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_quote_line_items(uuid, jsonb, numeric, numeric, numeric) TO authenticated;
