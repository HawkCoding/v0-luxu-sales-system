ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS suppliers_location_id_idx ON suppliers(location_id);
