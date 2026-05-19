DROP FUNCTION IF EXISTS public.allocate_job_number(text, integer);
DROP TABLE IF EXISTS public.job_number_counters;

CREATE TABLE IF NOT EXISTS public.booking_number_sequences (
  product_code text NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  CONSTRAINT booking_number_sequences_pkey PRIMARY KEY (product_code, year),
  CONSTRAINT booking_number_sequences_product_code_check CHECK (product_code IN ('BT', 'RR', 'REV')),
  CONSTRAINT booking_number_sequences_year_check CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT booking_number_sequences_last_number_check CHECK (last_number >= 0)
);

ALTER TABLE public.booking_number_sequences OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.next_booking_number(
  p_product_code text,
  p_year integer DEFAULT EXTRACT(year FROM now())::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number integer;
BEGIN
  IF p_product_code NOT IN ('BT', 'RR', 'REV') THEN
    RAISE EXCEPTION 'Unsupported booking number product code: %', p_product_code
      USING ERRCODE = '22023';
  END IF;

  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Unsupported booking number year: %', p_year
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.booking_number_sequences (
    product_code,
    year,
    last_number
  )
  VALUES (
    p_product_code,
    p_year,
    1
  )
  ON CONFLICT (product_code, year)
  DO UPDATE SET
    last_number = public.booking_number_sequences.last_number + 1
  RETURNING last_number INTO v_next_number;

  RETURN v_next_number;
END;
$$;

REVOKE ALL ON TABLE public.booking_number_sequences FROM anon, authenticated;
GRANT ALL ON TABLE public.booking_number_sequences TO service_role;
GRANT EXECUTE ON FUNCTION public.next_booking_number(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_booking_number(text, integer) TO service_role;

ALTER TABLE public.bookings ALTER COLUMN booking_number DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.booking_number_seq;

INSERT INTO public.booking_number_sequences (
  product_code,
  year,
  last_number
)
SELECT
  parsed.product_code,
  parsed.year,
  max(parsed.sequence_number)
FROM (
  SELECT
    substring(booking_number FROM '^([A-Z]+)-') AS product_code,
    substring(booking_number FROM '^[A-Z]+-([0-9]{4})-')::integer AS year,
    substring(booking_number FROM '^[A-Z]+-[0-9]{4}-([0-9]+)$')::integer AS sequence_number
  FROM public.bookings
  WHERE booking_number ~ '^(BT|RR|REV)-[0-9]{4}-[0-9]{4}$'
) parsed
GROUP BY parsed.product_code, parsed.year
ON CONFLICT (product_code, year)
DO UPDATE SET
  last_number = greatest(public.booking_number_sequences.last_number, excluded.last_number);
