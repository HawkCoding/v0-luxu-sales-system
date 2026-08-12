-- suppliers.street_address has existed since 20260805110000 and is printed on the voucher contact
-- line, but nothing in the app ever wrote it: the supplier save schema had no such field, so the
-- value was silently dropped. The editor now exposes it (as "Street address", replacing the
-- free-text "Suburb / Area" for every kind except train operators, which use per-city
-- supplier_station_addresses instead).
--
-- Seed it from the closest thing captured so far, location_detail, so existing suppliers do not
-- start blank and immediately trip the voucher's "No street address for..." readiness warning.
-- location_detail is deliberately left in place: the suppliers list still searches it.
UPDATE public.suppliers
SET street_address = location_detail
WHERE street_address IS NULL
  AND location_detail IS NOT NULL
  AND btrim(location_detail) <> ''
  AND kind <> 'train_operator';
