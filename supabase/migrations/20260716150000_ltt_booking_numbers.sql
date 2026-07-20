-- Booking numbers become pure identity: LTT-YYYY-NNNN, always.
--
-- The previous scheme derived a product prefix (BT/RR, or REV when unknown)
-- from a fuzzy text match at enquiry-creation time. The train is only actually
-- chosen later, when quote lines are built, and nothing re-stamped the number —
-- so a Blue Train booking could carry an RR- number for its whole life, and the
-- revenue-per-product report (which inferred product from the prefix) inherited
-- the same lie. Product now comes from the booked supplier instead.
--
-- All existing bookings are dummy data, so the old per-product counters are
-- dropped outright rather than migrated.

ALTER TABLE public.booking_number_sequences
  DROP CONSTRAINT IF EXISTS booking_number_sequences_product_code_check;

DELETE FROM public.booking_number_sequences WHERE product_code <> 'LTT';

ALTER TABLE public.booking_number_sequences
  ADD CONSTRAINT booking_number_sequences_product_code_check CHECK (product_code IN ('LTT'));

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
  IF p_product_code <> 'LTT' THEN
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

-- Re-derive the high-water mark from any LTT rows already present so a fresh
-- allocation can never collide with a seeded number.
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
  WHERE booking_number ~ '^LTT-[0-9]{4}-[0-9]{4}$'
) parsed
GROUP BY parsed.product_code, parsed.year
ON CONFLICT (product_code, year)
DO UPDATE SET
  last_number = greatest(public.booking_number_sequences.last_number, excluded.last_number);
