CREATE TABLE IF NOT EXISTS public.job_number_counters (
  product_prefix text NOT NULL,
  number_year integer NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_number_counters_pkey PRIMARY KEY (product_prefix, number_year),
  CONSTRAINT job_number_counters_product_prefix_check CHECK (product_prefix IN ('BT', 'RR', 'REV')),
  CONSTRAINT job_number_counters_number_year_check CHECK (number_year BETWEEN 2000 AND 2100),
  CONSTRAINT job_number_counters_next_number_check CHECK (next_number > 0)
);

ALTER TABLE public.job_number_counters OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.allocate_job_number(
  p_product_prefix text,
  p_number_year integer DEFAULT EXTRACT(year FROM now())::integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allocated_number integer;
BEGIN
  IF p_product_prefix NOT IN ('BT', 'RR', 'REV') THEN
    RAISE EXCEPTION 'Unsupported job number prefix: %', p_product_prefix
      USING ERRCODE = '22023';
  END IF;

  IF p_number_year < 2000 OR p_number_year > 2100 THEN
    RAISE EXCEPTION 'Unsupported job number year: %', p_number_year
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.job_number_counters (
    product_prefix,
    number_year,
    next_number
  )
  VALUES (
    p_product_prefix,
    p_number_year,
    2
  )
  ON CONFLICT (product_prefix, number_year)
  DO UPDATE SET
    next_number = public.job_number_counters.next_number + 1,
    updated_at = now()
  RETURNING next_number - 1 INTO allocated_number;

  RETURN p_product_prefix || '-' || p_number_year::text || '-' || lpad(allocated_number::text, 4, '0');
END;
$$;

REVOKE ALL ON TABLE public.job_number_counters FROM anon, authenticated;
GRANT ALL ON TABLE public.job_number_counters TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_job_number(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_job_number(text, integer) TO service_role;

ALTER TABLE public.bookings ALTER COLUMN booking_number DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.booking_number_seq;

CREATE TEMP TABLE tmp_job_number_backfill (
  booking_id uuid PRIMARY KEY,
  old_booking_number text NOT NULL,
  new_booking_number text NOT NULL,
  product_prefix text NOT NULL,
  number_year integer NOT NULL,
  sequence_number integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_job_number_backfill (
  booking_id,
  old_booking_number,
  new_booking_number,
  product_prefix,
  number_year,
  sequence_number
)
WITH inferred AS (
  SELECT
    b.id AS booking_id,
    b.booking_number AS old_booking_number,
    EXTRACT(year FROM b.created_at)::integer AS number_year,
    b.created_at,
    CASE
      WHEN matches.has_blue_train AND NOT matches.has_rovos_rail THEN 'BT'
      WHEN matches.has_rovos_rail AND NOT matches.has_blue_train THEN 'RR'
      ELSE 'REV'
    END AS product_prefix
  FROM public.bookings b
  LEFT JOIN public.routes r ON r.id = b.route_id
  LEFT JOIN public.suppliers route_supplier ON route_supplier.id = r.supplier_id
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT supplier.name, ' ') AS names
    FROM public.package_legs leg
    JOIN public.suppliers supplier ON supplier.id = leg.supplier_id
    WHERE leg.package_id = b.package_id
      AND supplier.kind = 'train_operator'
  ) package_suppliers ON true
  CROSS JOIN LATERAL (
    SELECT lower(
      concat_ws(
        ' ',
        route_supplier.name,
        package_suppliers.names,
        b.raw_text,
        b.extracted_json::text
      )
    ) AS haystack
  ) source_text
  CROSS JOIN LATERAL (
    SELECT
      source_text.haystack ~ '\mblue[[:space:]]+train\M' AS has_blue_train,
      source_text.haystack ~ '\mrovos([[:space:]]+rail)?\M' AS has_rovos_rail
  ) matches
  WHERE b.booking_number LIKE 'LUX-%'
),
numbered AS (
  SELECT
    inferred.*,
    row_number() OVER (
      PARTITION BY inferred.product_prefix, inferred.number_year
      ORDER BY inferred.created_at, inferred.booking_id
    ) AS sequence_number
  FROM inferred
)
SELECT
  booking_id,
  old_booking_number,
  product_prefix || '-' || number_year::text || '-' || lpad(sequence_number::text, 4, '0') AS new_booking_number,
  product_prefix,
  number_year,
  sequence_number
FROM numbered;

UPDATE public.quotes q
SET quote_number = replace(q.quote_number, map.old_booking_number, map.new_booking_number)
FROM tmp_job_number_backfill map
WHERE q.booking_id = map.booking_id
  AND q.quote_number IS NOT NULL
  AND q.quote_number LIKE '%' || map.old_booking_number || '%';

UPDATE public.invoices i
SET invoice_number = replace(i.invoice_number, map.old_booking_number, map.new_booking_number)
FROM tmp_job_number_backfill map
WHERE i.booking_id = map.booking_id
  AND i.invoice_number LIKE '%' || map.old_booking_number || '%';

UPDATE public.documents d
SET storage_path = replace(d.storage_path, map.old_booking_number, map.new_booking_number)
FROM tmp_job_number_backfill map
WHERE d.booking_id = map.booking_id
  AND d.storage_path IS NOT NULL
  AND d.storage_path LIKE '%' || map.old_booking_number || '%';

UPDATE public.correspondences c
SET
  subject = replace(c.subject, map.old_booking_number, map.new_booking_number),
  body_html = CASE
    WHEN c.body_html IS NULL THEN NULL
    ELSE replace(c.body_html, map.old_booking_number, map.new_booking_number)
  END
FROM tmp_job_number_backfill map
WHERE c.booking_id = map.booking_id
  AND (
    c.subject LIKE '%' || map.old_booking_number || '%'
    OR c.body_html LIKE '%' || map.old_booking_number || '%'
  );

UPDATE public.bookings b
SET extracted_json = replace(b.extracted_json::text, map.old_booking_number, map.new_booking_number)::jsonb
FROM tmp_job_number_backfill map
WHERE b.id = map.booking_id
  AND b.extracted_json IS NOT NULL
  AND b.extracted_json::text LIKE '%' || map.old_booking_number || '%';

UPDATE public.audit_logs a
SET meta_json = replace(a.meta_json::text, map.old_booking_number, map.new_booking_number)::jsonb
FROM tmp_job_number_backfill map
WHERE a.meta_json IS NOT NULL
  AND a.meta_json::text LIKE '%' || map.old_booking_number || '%';

UPDATE public.bookings b
SET booking_number = map.new_booking_number
FROM tmp_job_number_backfill map
WHERE b.id = map.booking_id;

INSERT INTO public.job_number_counters (
  product_prefix,
  number_year,
  next_number
)
SELECT
  parsed.product_prefix,
  parsed.number_year,
  max(parsed.sequence_number) + 1
FROM (
  SELECT
    substring(booking_number FROM '^([A-Z]+)-') AS product_prefix,
    substring(booking_number FROM '^[A-Z]+-([0-9]{4})-')::integer AS number_year,
    substring(booking_number FROM '^[A-Z]+-[0-9]{4}-([0-9]+)$')::integer AS sequence_number
  FROM public.bookings
  WHERE booking_number ~ '^(BT|RR|REV)-[0-9]{4}-[0-9]{4}$'
) parsed
GROUP BY parsed.product_prefix, parsed.number_year
ON CONFLICT (product_prefix, number_year)
DO UPDATE SET
  next_number = GREATEST(public.job_number_counters.next_number, EXCLUDED.next_number),
  updated_at = now();
