-- Per-leg rate type on saved booking selections: the builder dialogs let each
-- leg pick its own rate type, persisted here so reopening restores the choice.
alter table booking_package_selections
  add column if not exists rate_type_id uuid references rate_types(id) on delete set null;
