alter table public.booking_transport_requests
  add column if not exists package_leg_id uuid references public.package_legs(id) on delete set null;

create index if not exists idx_booking_transport_requests_package_leg_id
  on public.booking_transport_requests (package_leg_id);
