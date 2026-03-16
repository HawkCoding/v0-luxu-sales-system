drop extension if exists "pg_net";

drop trigger if exists "trg_updated_at_bookings" on "public"."bookings";

drop trigger if exists "trg_updated_at_customers" on "public"."customers";

drop trigger if exists "trg_updated_at_hotel_offers" on "public"."hotel_offers";

drop trigger if exists "trg_updated_at_itineraries" on "public"."itineraries";

drop trigger if exists "trg_updated_at_locations" on "public"."locations";

drop trigger if exists "trg_updated_at_packages" on "public"."packages";

drop trigger if exists "trg_updated_at_profiles" on "public"."profiles";

drop trigger if exists "trg_updated_at_quotes" on "public"."quotes";

drop trigger if exists "trg_updated_at_routes" on "public"."routes";

drop trigger if exists "trg_updated_at_suite_types" on "public"."suite_types";

drop trigger if exists "trg_updated_at_suppliers" on "public"."suppliers";

drop trigger if exists "trg_updated_at_templates" on "public"."templates";

drop policy "ref_delete" on "public"."hotel_offers";

drop policy "ref_insert" on "public"."hotel_offers";

drop policy "ref_update" on "public"."hotel_offers";

drop policy "ref_delete" on "public"."locations";

drop policy "ref_insert" on "public"."locations";

drop policy "ref_update" on "public"."locations";

drop policy "ref_delete" on "public"."packages";

drop policy "ref_insert" on "public"."packages";

drop policy "ref_update" on "public"."packages";

drop policy "profiles_select_own" on "public"."profiles";

drop policy "profiles_update_own" on "public"."profiles";

drop policy "ref_delete" on "public"."rate_cards";

drop policy "ref_insert" on "public"."rate_cards";

drop policy "ref_update" on "public"."rate_cards";

drop policy "rs_insert" on "public"."report_snapshots";

drop policy "rs_update" on "public"."report_snapshots";

drop policy "ref_delete" on "public"."routes";

drop policy "ref_insert" on "public"."routes";

drop policy "ref_update" on "public"."routes";

drop policy "ref_delete" on "public"."suite_types";

drop policy "ref_insert" on "public"."suite_types";

drop policy "ref_update" on "public"."suite_types";

drop policy "ref_delete" on "public"."supplier_pricing_options";

drop policy "ref_insert" on "public"."supplier_pricing_options";

drop policy "ref_update" on "public"."supplier_pricing_options";

drop policy "ref_delete" on "public"."supplier_seasonal_periods";

drop policy "ref_insert" on "public"."supplier_seasonal_periods";

drop policy "ref_update" on "public"."supplier_seasonal_periods";

drop policy "ref_delete" on "public"."supplier_seasonal_prices";

drop policy "ref_insert" on "public"."supplier_seasonal_prices";

drop policy "ref_update" on "public"."supplier_seasonal_prices";

drop policy "ref_delete" on "public"."suppliers";

drop policy "ref_insert" on "public"."suppliers";

drop policy "ref_update" on "public"."suppliers";

drop policy "ref_delete" on "public"."templates";

drop policy "ref_insert" on "public"."templates";

drop policy "ref_update" on "public"."templates";

alter table "public"."booking_suites" drop constraint "booking_suites_booking_id_fkey";

alter table "public"."booking_suites" drop constraint "booking_suites_suite_type_id_fkey";

alter table "public"."bookings" drop constraint "bookings_customer_id_fkey";

alter table "public"."bookings" drop constraint "bookings_hotel_supplier_id_fkey";

alter table "public"."bookings" drop constraint "bookings_package_id_fkey";

alter table "public"."bookings" drop constraint "bookings_route_id_fkey";

alter table "public"."correspondences" drop constraint "correspondences_booking_id_fkey";

alter table "public"."documents" drop constraint "documents_booking_id_fkey";

alter table "public"."hotel_offers" drop constraint "hotel_offers_hotel_supplier_id_fkey";

alter table "public"."hotel_offers" drop constraint "hotel_offers_location_id_fkey";

alter table "public"."hotel_offers" drop constraint "hotel_offers_package_id_fkey";

alter table "public"."itineraries" drop constraint "itineraries_booking_id_fkey";

alter table "public"."packages" drop constraint "packages_supplier_id_fkey";

alter table "public"."payments" drop constraint "payments_booking_id_fkey";

alter table "public"."pipeline_history" drop constraint "pipeline_history_booking_id_fkey";

alter table "public"."quote_line_items" drop constraint "quote_line_items_quote_id_fkey";

alter table "public"."quotes" drop constraint "quotes_booking_id_fkey";

alter table "public"."quotes" drop constraint "quotes_itinerary_id_fkey";

alter table "public"."rate_cards" drop constraint "rate_cards_package_id_fkey";

alter table "public"."rate_cards" drop constraint "rate_cards_route_id_fkey";

alter table "public"."rate_cards" drop constraint "rate_cards_suite_type_id_fkey";

alter table "public"."routes" drop constraint "routes_destination_location_id_fkey";

alter table "public"."routes" drop constraint "routes_origin_location_id_fkey";

alter table "public"."routes" drop constraint "routes_package_id_fkey";

alter table "public"."suite_types" drop constraint "suite_types_package_id_fkey";

alter table "public"."supplier_pricing_options" drop constraint "supplier_pricing_options_supplier_id_fkey";

alter table "public"."supplier_seasonal_periods" drop constraint "supplier_seasonal_periods_supplier_id_fkey";

alter table "public"."supplier_seasonal_prices" drop constraint "supplier_seasonal_prices_option_id_fkey";

alter table "public"."supplier_seasonal_prices" drop constraint "supplier_seasonal_prices_period_id_fkey";

alter table "public"."travellers" drop constraint "travellers_booking_id_fkey";

drop function if exists "public"."auth_has_role"(required_roles user_role[]);

alter table "public"."bookings" alter column "booking_number" set default ((('LUX-'::text || (EXTRACT(year FROM now()))::text) || '-'::text) || lpad((nextval('public.booking_number_seq'::regclass))::text, 6, '0'::text));

alter table "public"."bookings" alter column "hotel_phase" set default 'none'::public.hotel_phase;

alter table "public"."bookings" alter column "hotel_phase" set data type public.hotel_phase using "hotel_phase"::text::public.hotel_phase;

alter table "public"."bookings" alter column "purpose" set data type public.booking_purpose using "purpose"::text::public.booking_purpose;

alter table "public"."bookings" alter column "source" set default 'web_form'::public.source_kind;

alter table "public"."bookings" alter column "source" set data type public.source_kind using "source"::text::public.source_kind;

alter table "public"."bookings" alter column "stage" set default 'enquiry'::public.pipeline_stage;

alter table "public"."bookings" alter column "stage" set data type public.pipeline_stage using "stage"::text::public.pipeline_stage;

alter table "public"."correspondences" alter column "status" set default 'scheduled'::public.correspondence_status;

alter table "public"."correspondences" alter column "status" set data type public.correspondence_status using "status"::text::public.correspondence_status;

alter table "public"."documents" alter column "kind" set data type public.document_kind using "kind"::text::public.document_kind;

alter table "public"."documents" alter column "status" set default 'required'::public.document_status;

alter table "public"."documents" alter column "status" set data type public.document_status using "status"::text::public.document_status;

alter table "public"."hotel_offers" alter column "phase" set data type public.hotel_phase using "phase"::text::public.hotel_phase;

alter table "public"."pipeline_history" alter column "from_stage" set data type public.pipeline_stage using "from_stage"::text::public.pipeline_stage;

alter table "public"."pipeline_history" alter column "to_stage" set data type public.pipeline_stage using "to_stage"::text::public.pipeline_stage;

alter table "public"."profiles" alter column "clearance_level" set default 'consultant'::public.user_role;

alter table "public"."profiles" alter column "clearance_level" set data type public.user_role using "clearance_level"::text::public.user_role;

alter table "public"."quotes" alter column "status" set default 'draft'::public.quote_status;

alter table "public"."quotes" alter column "status" set data type public.quote_status using "status"::text::public.quote_status;

alter table "public"."suppliers" alter column "kind" set data type public.supplier_kind using "kind"::text::public.supplier_kind;

alter table "public"."booking_suites" add constraint "booking_suites_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."booking_suites" validate constraint "booking_suites_booking_id_fkey";

alter table "public"."booking_suites" add constraint "booking_suites_suite_type_id_fkey" FOREIGN KEY (suite_type_id) REFERENCES public.suite_types(id) not valid;

alter table "public"."booking_suites" validate constraint "booking_suites_suite_type_id_fkey";

alter table "public"."bookings" add constraint "bookings_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."bookings" validate constraint "bookings_customer_id_fkey";

alter table "public"."bookings" add constraint "bookings_hotel_supplier_id_fkey" FOREIGN KEY (hotel_supplier_id) REFERENCES public.suppliers(id) not valid;

alter table "public"."bookings" validate constraint "bookings_hotel_supplier_id_fkey";

alter table "public"."bookings" add constraint "bookings_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) not valid;

alter table "public"."bookings" validate constraint "bookings_package_id_fkey";

alter table "public"."bookings" add constraint "bookings_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.routes(id) not valid;

alter table "public"."bookings" validate constraint "bookings_route_id_fkey";

alter table "public"."correspondences" add constraint "correspondences_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."correspondences" validate constraint "correspondences_booking_id_fkey";

alter table "public"."documents" add constraint "documents_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."documents" validate constraint "documents_booking_id_fkey";

alter table "public"."hotel_offers" add constraint "hotel_offers_hotel_supplier_id_fkey" FOREIGN KEY (hotel_supplier_id) REFERENCES public.suppliers(id) not valid;

alter table "public"."hotel_offers" validate constraint "hotel_offers_hotel_supplier_id_fkey";

alter table "public"."hotel_offers" add constraint "hotel_offers_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) not valid;

alter table "public"."hotel_offers" validate constraint "hotel_offers_location_id_fkey";

alter table "public"."hotel_offers" add constraint "hotel_offers_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) not valid;

alter table "public"."hotel_offers" validate constraint "hotel_offers_package_id_fkey";

alter table "public"."itineraries" add constraint "itineraries_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."itineraries" validate constraint "itineraries_booking_id_fkey";

alter table "public"."packages" add constraint "packages_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) not valid;

alter table "public"."packages" validate constraint "packages_supplier_id_fkey";

alter table "public"."payments" add constraint "payments_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."payments" validate constraint "payments_booking_id_fkey";

alter table "public"."pipeline_history" add constraint "pipeline_history_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."pipeline_history" validate constraint "pipeline_history_booking_id_fkey";

alter table "public"."quote_line_items" add constraint "quote_line_items_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE not valid;

alter table "public"."quote_line_items" validate constraint "quote_line_items_quote_id_fkey";

alter table "public"."quotes" add constraint "quotes_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."quotes" validate constraint "quotes_booking_id_fkey";

alter table "public"."quotes" add constraint "quotes_itinerary_id_fkey" FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) not valid;

alter table "public"."quotes" validate constraint "quotes_itinerary_id_fkey";

alter table "public"."rate_cards" add constraint "rate_cards_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) not valid;

alter table "public"."rate_cards" validate constraint "rate_cards_package_id_fkey";

alter table "public"."rate_cards" add constraint "rate_cards_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.routes(id) not valid;

alter table "public"."rate_cards" validate constraint "rate_cards_route_id_fkey";

alter table "public"."rate_cards" add constraint "rate_cards_suite_type_id_fkey" FOREIGN KEY (suite_type_id) REFERENCES public.suite_types(id) not valid;

alter table "public"."rate_cards" validate constraint "rate_cards_suite_type_id_fkey";

alter table "public"."routes" add constraint "routes_destination_location_id_fkey" FOREIGN KEY (destination_location_id) REFERENCES public.locations(id) not valid;

alter table "public"."routes" validate constraint "routes_destination_location_id_fkey";

alter table "public"."routes" add constraint "routes_origin_location_id_fkey" FOREIGN KEY (origin_location_id) REFERENCES public.locations(id) not valid;

alter table "public"."routes" validate constraint "routes_origin_location_id_fkey";

alter table "public"."routes" add constraint "routes_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) not valid;

alter table "public"."routes" validate constraint "routes_package_id_fkey";

alter table "public"."suite_types" add constraint "suite_types_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) not valid;

alter table "public"."suite_types" validate constraint "suite_types_package_id_fkey";

alter table "public"."supplier_pricing_options" add constraint "supplier_pricing_options_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE not valid;

alter table "public"."supplier_pricing_options" validate constraint "supplier_pricing_options_supplier_id_fkey";

alter table "public"."supplier_seasonal_periods" add constraint "supplier_seasonal_periods_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE not valid;

alter table "public"."supplier_seasonal_periods" validate constraint "supplier_seasonal_periods_supplier_id_fkey";

alter table "public"."supplier_seasonal_prices" add constraint "supplier_seasonal_prices_option_id_fkey" FOREIGN KEY (option_id) REFERENCES public.supplier_pricing_options(id) ON DELETE CASCADE not valid;

alter table "public"."supplier_seasonal_prices" validate constraint "supplier_seasonal_prices_option_id_fkey";

alter table "public"."supplier_seasonal_prices" add constraint "supplier_seasonal_prices_period_id_fkey" FOREIGN KEY (period_id) REFERENCES public.supplier_seasonal_periods(id) ON DELETE CASCADE not valid;

alter table "public"."supplier_seasonal_prices" validate constraint "supplier_seasonal_prices_period_id_fkey";

alter table "public"."travellers" add constraint "travellers_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE not valid;

alter table "public"."travellers" validate constraint "travellers_booking_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.auth_has_role(required_roles public.user_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND clearance_level = ANY(required_roles)
  );
$function$
;


  create policy "ref_delete"
  on "public"."hotel_offers"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."hotel_offers"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."hotel_offers"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."locations"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."locations"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."locations"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."packages"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."packages"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."packages"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "profiles_select_own"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (((user_id = auth.uid()) OR public.auth_has_role(ARRAY['admin'::public.user_role])))
with check (((user_id = auth.uid()) OR public.auth_has_role(ARRAY['admin'::public.user_role])));



  create policy "ref_delete"
  on "public"."rate_cards"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."rate_cards"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."rate_cards"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "rs_insert"
  on "public"."report_snapshots"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "rs_update"
  on "public"."report_snapshots"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."routes"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."routes"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."routes"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."suite_types"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."suite_types"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."suite_types"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."supplier_pricing_options"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."supplier_pricing_options"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."supplier_pricing_options"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."supplier_seasonal_periods"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."supplier_seasonal_periods"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."supplier_seasonal_periods"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."supplier_seasonal_prices"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."supplier_seasonal_prices"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."supplier_seasonal_prices"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."suppliers"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."suppliers"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."suppliers"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_delete"
  on "public"."templates"
  as permissive
  for delete
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role]));



  create policy "ref_insert"
  on "public"."templates"
  as permissive
  for insert
  to authenticated
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));



  create policy "ref_update"
  on "public"."templates"
  as permissive
  for update
  to authenticated
using (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
with check (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));


CREATE TRIGGER trg_updated_at_bookings BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_hotel_offers BEFORE UPDATE ON public.hotel_offers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_itineraries BEFORE UPDATE ON public.itineraries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_locations BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_packages BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_quotes BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_routes BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_suite_types BEFORE UPDATE ON public.suite_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_suppliers BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_updated_at_templates BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


