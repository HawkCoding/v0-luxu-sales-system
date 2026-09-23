-- Per-unit rate type beyond tours.
--
-- booking_service_units.rate_type_id (20260826130000) was tour-only. Salespeople now also price
-- individual train suites, hotel rooms and cruise cabins at their own rate level (two suites of
-- the same type, one at Rack and one at STO), so the column is read for those kinds too. No schema
-- change: the column, its FK and its index already exist. Null still inherits the leg's
-- booking_services.rate_type_id, then the supplier default -- so every existing row prices exactly
-- as it did before.
COMMENT ON COLUMN public.booking_service_units.rate_type_id IS
  'Train, hotel, cruise and tour units: this unit''s own rate type, overriding the leg-level booking_services.rate_type_id. Null falls back to the leg, then the supplier default.';

NOTIFY pgrst, 'reload schema';
