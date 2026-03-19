-- Align supplier-related foreign keys for safe supplier deletion.
-- Supplier-owned configuration records should cascade.
-- Booking history should be retained and references nulled.

begin;

alter table public.packages
  drop constraint if exists packages_supplier_id_fkey;
alter table public.packages
  add constraint packages_supplier_id_fkey
  foreign key (supplier_id)
  references public.suppliers(id)
  on delete cascade;

alter table public.suite_types
  drop constraint if exists suite_types_supplier_id_fkey;
alter table public.suite_types
  add constraint suite_types_supplier_id_fkey
  foreign key (supplier_id)
  references public.suppliers(id)
  on delete cascade;

alter table public.routes
  drop constraint if exists routes_package_id_fkey;
alter table public.routes
  add constraint routes_package_id_fkey
  foreign key (package_id)
  references public.packages(id)
  on delete cascade;

alter table public.rate_cards
  drop constraint if exists rate_cards_package_id_fkey;
alter table public.rate_cards
  add constraint rate_cards_package_id_fkey
  foreign key (package_id)
  references public.packages(id)
  on delete cascade;

alter table public.rate_cards
  drop constraint if exists rate_cards_route_id_fkey;
alter table public.rate_cards
  add constraint rate_cards_route_id_fkey
  foreign key (route_id)
  references public.routes(id)
  on delete cascade;

alter table public.rate_cards
  drop constraint if exists rate_cards_suite_type_id_fkey;
alter table public.rate_cards
  add constraint rate_cards_suite_type_id_fkey
  foreign key (suite_type_id)
  references public.suite_types(id)
  on delete cascade;

alter table public.hotel_offers
  drop constraint if exists hotel_offers_package_id_fkey;
alter table public.hotel_offers
  add constraint hotel_offers_package_id_fkey
  foreign key (package_id)
  references public.packages(id)
  on delete cascade;

alter table public.hotel_offers
  drop constraint if exists hotel_offers_hotel_supplier_id_fkey;
alter table public.hotel_offers
  add constraint hotel_offers_hotel_supplier_id_fkey
  foreign key (hotel_supplier_id)
  references public.suppliers(id)
  on delete cascade;

alter table public.bookings
  drop constraint if exists bookings_hotel_supplier_id_fkey;
alter table public.bookings
  add constraint bookings_hotel_supplier_id_fkey
  foreign key (hotel_supplier_id)
  references public.suppliers(id)
  on delete set null;

alter table public.bookings
  drop constraint if exists bookings_package_id_fkey;
alter table public.bookings
  add constraint bookings_package_id_fkey
  foreign key (package_id)
  references public.packages(id)
  on delete set null;

alter table public.bookings
  drop constraint if exists bookings_route_id_fkey;
alter table public.bookings
  add constraint bookings_route_id_fkey
  foreign key (route_id)
  references public.routes(id)
  on delete set null;

alter table public.booking_suites
  drop constraint if exists booking_suites_suite_type_id_fkey;
alter table public.booking_suites
  add constraint booking_suites_suite_type_id_fkey
  foreign key (suite_type_id)
  references public.suite_types(id)
  on delete set null;

commit;

notify pgrst, 'reload schema';
