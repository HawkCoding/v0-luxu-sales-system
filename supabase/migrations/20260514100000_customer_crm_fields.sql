ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS vip_status BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferences TEXT,
  ADD COLUMN IF NOT EXISTS communication_preferences TEXT,
  ADD COLUMN IF NOT EXISTS first_travel_date DATE,
  ADD COLUMN IF NOT EXISTS last_travel_date DATE,
  ADD COLUMN IF NOT EXISTS is_repeat_client BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN customers.date_of_birth IS 'Used for birthday recognition in luxury service context. Access controlled by clearance_level.';
COMMENT ON COLUMN customers.first_travel_date IS 'Earliest departure_date among voucher-sent/closed bookings. Updated by pipeline on voucher_sent crossing.';
COMMENT ON COLUMN customers.last_travel_date IS 'Latest departure_date among voucher-sent/closed bookings. Updated by pipeline on voucher_sent crossing.';
COMMENT ON COLUMN customers.is_repeat_client IS 'True when customer returns with a new booking after at least one voucher_sent or closed booking.';
