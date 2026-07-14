-- Hotel stay date anchor: every hotel in a package sits either the night(s) before the train
-- departs (pre) or from the day the train arrives (post). Storing the anchor on the package leg
-- lets the apply dialog derive check-in dates instead of asking for them; the booking selection
-- keeps the salesperson's per-quote override ('custom' = the manually picked service_date).

alter table public.package_legs
  add column if not exists date_anchor text;

alter table public.package_legs
  drop constraint if exists package_legs_date_anchor_check;
alter table public.package_legs
  add constraint package_legs_date_anchor_check
  check (date_anchor is null or date_anchor in ('pre', 'post'));

alter table public.booking_package_selections
  add column if not exists date_anchor text;

alter table public.booking_package_selections
  drop constraint if exists booking_package_selections_date_anchor_check;
alter table public.booking_package_selections
  add constraint booking_package_selections_date_anchor_check
  check (date_anchor is null or date_anchor in ('pre', 'post', 'custom'));

notify pgrst, 'reload schema';
