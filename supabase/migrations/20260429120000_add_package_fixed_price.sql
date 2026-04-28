ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS fixed_price_per_person numeric(12,2) DEFAULT NULL;
