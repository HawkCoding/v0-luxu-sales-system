-- Bulk customer import allocated one booking number per row, each a separate
-- round trip to next_booking_number(). At 1000 rows (the API's cap) that is
-- 1000 sequential RPCs — fine locally, tens of seconds against hosted Supabase,
-- which runs the import past the serverless function timeout.
--
-- next_booking_number_block() reserves a contiguous range in one statement and
-- returns its last number; the caller derives [last - count + 1 .. last]. The
-- increment is the same single atomic UPSERT as the per-row allocator, so two
-- concurrent callers can never overlap. Numbers in a reserved block are
-- consumed by the caller or lost — the sequence never reuses them, exactly as
-- with the per-row function.
--
-- next_booking_number() is unchanged and stays the path for single bookings.

CREATE OR REPLACE FUNCTION public.next_booking_number_block(
  p_product_code text,
  p_count integer,
  p_year integer DEFAULT EXTRACT(year FROM now())::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_number integer;
BEGIN
  IF p_product_code <> 'LTT' THEN
    RAISE EXCEPTION 'Unsupported booking number product code: %', p_product_code
      USING ERRCODE = '22023';
  END IF;

  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Unsupported booking number year: %', p_year
      USING ERRCODE = '22023';
  END IF;

  -- Upper bound matches the import payload cap in app/api/customers/import/schemas.ts.
  IF p_count < 1 OR p_count > 1000 THEN
    RAISE EXCEPTION 'Unsupported booking number block size: %', p_count
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
    p_count
  )
  ON CONFLICT (product_code, year)
  DO UPDATE SET
    last_number = public.booking_number_sequences.last_number + p_count
  RETURNING last_number INTO v_last_number;

  RETURN v_last_number;
END;
$$;
