-- ============================================================
-- Luxus Sales System — Local Dev Seed
-- Resets to a fully-populated showcase dataset on every db:reset.
-- Login: password123 for all users.
--   carmen@luxustravel.co.za  admin    (CDJ)
--   leonie@luxustravel.co.za  consultant (LB)
--   dirk@luxustravel.co.za    manager  (DR)
--   monade@luxustravel.co.za  consultant (MVE)
--   douwlien@luxustravel.co.za readonly (DL)
-- 37 bookings across all stages. Total seeded revenue ≈ R 1.43M.
-- ============================================================

begin;

-- ============================================================
-- SECTION 1: AUTH USERS, IDENTITIES, PROFILES
-- ============================================================

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change,email_change_token_new,
  email_change_token_current,phone_change,phone_change_token,
  reauthentication_token,last_sign_in_at,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a1','authenticated','authenticated','carmen@luxustravel.co.za',extensions.crypt('password123',extensions.gen_salt('bf')),'2025-08-01T08:00:00Z','','','','','','','','','2025-08-01T08:00:00Z','{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Carmen","surname":"de Jager","email_verified":true}'::jsonb,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a2','authenticated','authenticated','leonie@luxustravel.co.za',extensions.crypt('password123',extensions.gen_salt('bf')),'2025-08-01T08:00:00Z','','','','','','','','','2025-08-01T08:00:00Z','{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Leonie","surname":"Botha","email_verified":true}'::jsonb,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a3','authenticated','authenticated','dirk@luxustravel.co.za',extensions.crypt('password123',extensions.gen_salt('bf')),'2025-08-01T08:00:00Z','','','','','','','','','2025-08-01T08:00:00Z','{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Dirk","surname":"Rossouw","email_verified":true}'::jsonb,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a4','authenticated','authenticated','monade@luxustravel.co.za',extensions.crypt('password123',extensions.gen_salt('bf')),'2025-08-01T08:00:00Z','','','','','','','','','2025-08-01T08:00:00Z','{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Monade","surname":"van Eeden","email_verified":true}'::jsonb,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a5','authenticated','authenticated','douwlien@luxustravel.co.za',extensions.crypt('password123',extensions.gen_salt('bf')),'2025-08-01T08:00:00Z','','','','','','','','','2025-08-01T08:00:00Z','{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Douwlien","surname":"Louw","email_verified":true}'::jsonb,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z')
on conflict (id) do update set
  email=excluded.email,encrypted_password=excluded.encrypted_password,
  email_confirmed_at=excluded.email_confirmed_at,
  raw_app_meta_data=excluded.raw_app_meta_data,
  raw_user_meta_data=excluded.raw_user_meta_data,updated_at=excluded.updated_at;

insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','{"sub":"00000000-0000-0000-0000-0000000000a1","email":"carmen@luxustravel.co.za","email_verified":true}'::jsonb,'email','00000000-0000-0000-0000-0000000000a1','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2','{"sub":"00000000-0000-0000-0000-0000000000a2","email":"leonie@luxustravel.co.za","email_verified":true}'::jsonb,'email','00000000-0000-0000-0000-0000000000a2','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a3','{"sub":"00000000-0000-0000-0000-0000000000a3","email":"dirk@luxustravel.co.za","email_verified":true}'::jsonb,'email','00000000-0000-0000-0000-0000000000a3','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000a4','{"sub":"00000000-0000-0000-0000-0000000000a4","email":"monade@luxustravel.co.za","email_verified":true}'::jsonb,'email','00000000-0000-0000-0000-0000000000a4','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b5','00000000-0000-0000-0000-0000000000a5','{"sub":"00000000-0000-0000-0000-0000000000a5","email":"douwlien@luxustravel.co.za","email_verified":true}'::jsonb,'email','00000000-0000-0000-0000-0000000000a5','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z','2025-08-01T08:00:00Z')
on conflict (id) do update set user_id=excluded.user_id,identity_data=excluded.identity_data,
  provider=excluded.provider,provider_id=excluded.provider_id,updated_at=excluded.updated_at;

insert into public.profiles (user_id,email,name,surname,clearance_level,is_active,created_at,updated_at) values
  ('00000000-0000-0000-0000-0000000000a1','carmen@luxustravel.co.za','Carmen','de Jager','admin',true,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a2','leonie@luxustravel.co.za','Leonie','Botha','consultant',true,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a3','dirk@luxustravel.co.za','Dirk','Rossouw','manager',true,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a4','monade@luxustravel.co.za','Monade','van Eeden','consultant',true,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a5','douwlien@luxustravel.co.za','Douwlien','Louw','readonly',true,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z')
on conflict (user_id) do update set email=excluded.email,name=excluded.name,surname=excluded.surname,
  clearance_level = excluded.clearance_level,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

-- ============================================================
-- SECTION 2: LOCATIONS
-- ============================================================

insert into public.locations (id,name,country,region_code,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000001001','Pretoria','South Africa','ZA-GP','2025-08-10T08:00:00Z','2025-08-10T08:00:00Z'),
  ('00000000-0000-0000-0000-000000001002','Cape Town','South Africa','ZA-WC','2025-08-10T08:00:00Z','2025-08-10T08:00:00Z'),
  ('00000000-0000-0000-0000-000000001003','Durban','South Africa','ZA-KZN','2025-08-10T08:00:00Z','2025-08-10T08:00:00Z'),
  ('00000000-0000-0000-0000-000000001004','Victoria Falls','Zimbabwe','ZW-MW','2025-08-10T08:00:00Z','2025-08-10T08:00:00Z'),
  ('00000000-0000-0000-0000-000000001005','Swakopmund','Namibia','NA-ER','2025-08-10T08:00:00Z','2025-08-10T08:00:00Z'),
  ('00000000-0000-0000-0000-000000001006','Dar es Salaam','Tanzania','TZ-02','2025-08-10T08:00:00Z','2025-08-10T08:00:00Z')
on conflict (id) do update set name=excluded.name,country=excluded.country,
  region_code=excluded.region_code,updated_at=excluded.updated_at;

-- ============================================================
-- SECTION 3: CUSTOMERS (18)
-- ============================================================

insert into public.customers (
  id,title,first_name,last_name,email,phone,country,
  notes,vip_status,preferences,communication_preferences,
  is_repeat_client,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000008001','Mr','James','Mitchell','james.mitchell@gmail.com','+27821234567','South Africa',
   'Long-standing VIP client. Anniversary traveller — books annually. Prefers champagne on arrival.',
   true,'Royal Double Suite. Champagne welcome, quiet cabin. Allergic to shellfish.','Email only — responds within 24 hours.',
   true,'2025-08-20T08:00:00Z','2025-08-20T08:00:00Z'),
  ('00000000-0000-0000-0000-000000008002','Ms','Sarah','Van Der Berg','sarah.vdb@outlook.com','+27839876543','South Africa',
   'Repeat client, travels with a colleague. Price-conscious but values quality.',
   false,'Deluxe or Pullman Twin. Window seating preferred.','WhatsApp preferred. Very responsive.',
   true,'2025-09-05T10:30:00Z','2025-09-05T10:30:00Z'),
  ('00000000-0000-0000-0000-000000008003','Mr','Thomas','Worthington','t.worthington@btinternet.com','+447700900123','United Kingdom',
   'UK-based retired engineer. Meticulous about itinerary details. Travels with wife.',
   false,'Deluxe Double Suite. Interested in extended Namibia route.','Email only. Prefers detailed written confirmations.',
   true,'2025-09-10T14:00:00Z','2025-09-10T14:00:00Z'),
  ('00000000-0000-0000-0000-000000008004','Mrs','Anna','Muller','anna.muller@web.de','+491771234567','Germany',
   'German client, travels frequently. Often books with a friend. Vegetarian.',
   false,'Pullman or Deluxe Double Suite. Vegetarian meals required.','Email in English. Responds quickly.',
   true,'2025-09-15T09:00:00Z','2025-09-15T09:00:00Z'),
  ('00000000-0000-0000-0000-000000008005','Mr','Robert','Chen','rchen@yahoo.com','+16505551234','United States',
   'High-value US client. Books premium cabins and extended routes.',
   false,'Royal or Deluxe suites only. Interested in East Africa route.','Email. 24hr response due to time zone.',
   true,'2025-09-20T16:00:00Z','2025-09-20T16:00:00Z'),
  ('00000000-0000-0000-0000-000000008006','Ms','Priya','Naidoo','priya.naidoo@gmail.com','+27841112233','South Africa',
   'Local repeat client. Enthusiastic referrer — has recommended 3 new clients.',
   false,'Deluxe Double Suite. Prefers Pretoria to Cape Town direction.','WhatsApp or email. Very enthusiastic.',
   true,'2025-10-01T07:00:00Z','2025-10-01T07:00:00Z'),
  ('00000000-0000-0000-0000-000000008007','Mr','Marco','Rossi','m.rossi@libero.it','+393391234567','Italy',
   'Italian client from Milan. Travels with wife. Has done multiple Rovos journeys.',
   false,'Pullman or Deluxe Double. Prefers shorter routes.','Email in English or Italian.',
   true,'2025-10-05T11:00:00Z','2025-10-05T11:00:00Z'),
  ('00000000-0000-0000-0000-000000008008','Mrs','Elizabeth','Taylor','liz.taylor@aol.com','+61412345678','Australia',
   'Australian family traveller from Sydney. Often books with children.',
   false,'Royal Double Suite. Child-friendly activities preferred.','Email. Australian time zone.',
   true,'2025-10-10T06:00:00Z','2025-10-10T06:00:00Z'),
  ('00000000-0000-0000-0000-000000008009','Mr','David','Kruger','david.kruger@telkomsa.net','+27823456789','South Africa',
   'Local client, works in finance. Enjoys shorter domestic routes.',
   false,'Pullman or Deluxe Double. Prefers Cape Town routes.','Email preferred during office hours.',
   true,'2025-10-15T13:00:00Z','2025-10-15T13:00:00Z'),
  ('00000000-0000-0000-0000-000000008010','Mrs','Marie','Dupont','marie.dupont@orange.fr','+33612345678','France',
   'French travel writer from Paris. Potential media exposure opportunity.',
   false,'Deluxe or Royal suite. Interested in Namibia for article.','Email English or French. Active social media.',
   true,'2025-10-20T08:30:00Z','2025-10-20T08:30:00Z'),
  ('00000000-0000-0000-0000-000000008011','Mr','Henrik','Johansson','henrik.j@gmail.com','+46701234567','Sweden',
   'Swedish photographer. Travels solo. Scenic routes for photography.',
   false,'Pullman Twin Suite solo. Good natural light and scenic views.','Email only. Very independent.',
   true,'2025-11-01T10:00:00Z','2025-11-01T10:00:00Z'),
  ('00000000-0000-0000-0000-000000008012','Ms','Fatima','Al-Rashid','fatima.ar@outlook.com','+971501234567','UAE',
   'VIP client in Dubai. High-net-worth, expects white-glove service.',
   true,'Royal Double Suite only. Personal welcome letter. Halal meals required.','WhatsApp and email. Expects same-day responses.',
   true,'2025-11-05T12:00:00Z','2025-11-05T12:00:00Z'),
  ('00000000-0000-0000-0000-000000008013','Dr','Pieter','van Niekerk','pieter.vniekerk@corporatetravel.co.za','+27123456789','South Africa',
   'Corporate travel booker for a Pretoria mining company. Executive team travel.',
   false,'Deluxe or Royal suites for executives. Group bookings possible.','Email. Requires formal correspondence and invoices.',
   false,'2026-01-10T09:00:00Z','2026-01-10T09:00:00Z'),
  ('00000000-0000-0000-0000-000000008014','Mrs','Chloe','Beaumont','chloe.beaumont@gmail.com','+16135550192','Canada',
   'Canadian client from Ottawa. First-time Rovos Rail traveller, referred by a friend.',
   false,'Deluxe Double Suite. Excited about wildlife and scenery.','Email. Allow 24hr for time zone.',
   false,'2025-11-28T09:00:00Z','2025-11-28T09:00:00Z'),
  ('00000000-0000-0000-0000-000000008015','Mr','Kenji','Tanaka','k.tanaka@softbank.co.jp','+81901234567','Japan',
   'VIP client, senior executive at Japanese tech firm. First contact via luxury agent.',
   true,'Royal Double Suite. Private transfers required. Japanese materials appreciated.','Through travel agent. Formal correspondence required.',
   false,'2026-05-14T10:00:00Z','2026-05-14T10:00:00Z'),
  ('00000000-0000-0000-0000-000000008016','Mrs','Sofia','Andersen','sofia.andersen@gmail.com','+31612345678','Netherlands',
   'Dutch client from Amsterdam. Found us via Instagram.',
   false,'Deluxe Double Suite. Budget-conscious but premium experience seeker.','Instagram DM and email. Social-media savvy.',
   false,'2026-02-15T08:00:00Z','2026-02-15T08:00:00Z'),
  ('00000000-0000-0000-0000-000000008017','Mr','Carlos','Mendes','carlos.mendes@uol.com.br','+5511987654321','Brazil',
   'Brazilian client from São Paulo. Enquired via web form. Cape Town package interest.',
   false,'Deluxe Double Suite. English communication fine.','Email. Enthusiastic and engaged.',
   false,'2026-05-10T10:00:00Z','2026-05-10T10:00:00Z'),
  ('00000000-0000-0000-0000-000000008018','Mrs','Rachel','O''Brien','rachel.obrien@eircom.ie','+353871234567','Ireland',
   'Irish client from Dublin. Honeymoon enquiry — romantic experience required.',
   false,'Royal Double Suite preferred. Flowers, champagne, special touches.','Email. Very excited — prompt responses.',
   false,'2026-05-08T09:00:00Z','2026-05-08T09:00:00Z')
on conflict (id) do update set
  title=excluded.title,first_name=excluded.first_name,last_name=excluded.last_name,
  email=excluded.email,phone=excluded.phone,country=excluded.country,
  notes=excluded.notes,vip_status=excluded.vip_status,preferences=excluded.preferences,
  communication_preferences=excluded.communication_preferences,
  is_repeat_client=excluded.is_repeat_client,updated_at=excluded.updated_at;

-- ============================================================
-- SECTION 4: SUPPLIERS (10)
-- INSERT triggers set status='draft'. UPDATE below activates them.
-- ============================================================

insert into public.suppliers (
  id,name,slug,kind,email,phone,website,
  location,location_id,description,notes,
  single_supplement_pct,active,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000002001','Rovos Rail','rovos-rail','train_operator',
   'sales@rovosrail.com','+27123270000','https://www.rovos.com',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'The Pride of Africa — the world''s most luxurious train. All-inclusive journeys through Southern and East Africa.',
   'Primary rail supplier. Sales: Marietjie. Lead time: 6–12 months for peak season.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002010', 'Blue Train', 'blue-train', 'train_operator',
   'reservations@bluetrain.co.za','+27123340000','https://www.bluetrain.co.za',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Luxury rail operator for the Pretoria and Cape Town corridor.',
   'Primary Blue Train luxury rail supplier.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002002','Irene Country Lodge','irene-country-lodge','hotel_property',
   'reservations@irenecountrylodge.co.za','+27126670000','https://www.autograph-hotels.marriott.com',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Elegant country estate 20 minutes from Rovos Rail station. Ideal pre-departure overnight.',
   'Marriott Autograph Collection. Pre-departure packages available.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002003','The Victoria Falls Hotel','the-victoria-falls-hotel','hotel_property',
   'bookings@victoriafallshotel.com','+26313447000','https://www.victoriafallshotel.com',
   'Victoria Falls','00000000-0000-0000-0000-000000001004',
   'Historic colonial-era hotel with direct views of the Falls. Post-journey extension partner.',
   'Preferred post-journey hotel for Victoria Falls route.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002004','Swakopmund Hotel','swakopmund-hotel','hotel_property',
   'reservations@swakopmundhotel.com','+26464410000','https://www.legacyhotels.co.za',
   'Swakopmund','00000000-0000-0000-0000-000000001005',
   'Legacy Hotels property in the heart of Swakopmund. Post-Namibia Desert Journey stopover.',
   'Post-journey partner for Namibia route. Good rates for 2-night stays.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002005','The Capital Pearls','the-capital-pearls','hotel_property',
   'reservations@thecapital.co.za','+27310350000','https://www.thecapital.co.za',
   'Durban','00000000-0000-0000-0000-000000001003',
   'Upscale Umhlanga hotel overlooking the Indian Ocean. Pre-departure for Durban route.',
   'Pre-departure partner for Durban Coastal Escape.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002006','Ivory Manor Boutique Hotel','ivory-manor-boutique-hotel','hotel_property',
   'reservations@ivorymanor.co.za','+27121110000','https://www.ivorymanor.co.za',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Boutique 5-star hotel in Pretoria. Intimate pre-departure experience preferred by VIP clients.',
   'Walking distance to Capital Park station. Highly personal service.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002007','Zambezi Transfers','zambezi-transfers','transfers',
   'ops@zambezitransfers.com','+263777100200','https://www.zambezitransfers.com',
   'Victoria Falls','00000000-0000-0000-0000-000000001004',
   'Specialist ground transfer operator at Victoria Falls Airport and inter-lodge transfers.',
   'Reliable airport transfer partner. Also arranges sunset cruises.',
   0,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002008','Rovos Rail Transfers','rovos-rail-transfers','transfers',
   'transfers@rovosrail.com','+27123270001','https://www.rovos.com',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Rovos Rail''s luxury ground transfer service from OR Tambo or Pretoria hotels to the station.',
   'Preferred for VIP clients. Includes porter service and luggage handling.',
   0,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002009','Winelands Excursions','winelands-excursions','tour_operator',
   'bookings@winelandsexcursions.co.za','+27218760000','https://www.winelandsexcursions.co.za',
   'Cape Town','00000000-0000-0000-0000-000000001002',
   'Award-winning Cape Winelands day tour operator. Full-day and half-day private tours.',
   'Popular add-on for Cape Town Classic arrivals.',
   0,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z')
on conflict (id) do update set
  name=excluded.name,slug=excluded.slug,kind=excluded.kind,
  email=excluded.email,phone=excluded.phone,website=excluded.website,
  location=excluded.location,location_id=excluded.location_id,
  description=excluded.description,notes=excluded.notes,
  single_supplement_pct=excluded.single_supplement_pct,
  active=excluded.active,updated_at=excluded.updated_at;

-- Trigger UPDATE to move status from 'draft' → 'active' for active suppliers
update public.suppliers set active = true where id in (
  '00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000002002',
  '00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000002004',
  '00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000002006',
  '00000000-0000-0000-0000-000000002007','00000000-0000-0000-0000-000000002008',
  '00000000-0000-0000-0000-000000002009'
);

insert into public.supplier_emails (id,supplier_id,email,label,created_at) values
  ('00000000-0000-0000-0000-000000002101','00000000-0000-0000-0000-000000002001','sales@rovosrail.com','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002102','00000000-0000-0000-0000-000000002001','operations@rovosrail.com','Operations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002103','00000000-0000-0000-0000-000000002001','accounts@rovosrail.com','Accounts','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002104','00000000-0000-0000-0000-000000002002','reservations@irenecountrylodge.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002105','00000000-0000-0000-0000-000000002003','bookings@victoriafallshotel.com','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002106','00000000-0000-0000-0000-000000002003','accounts@victoriafallshotel.com','Accounts','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002107','00000000-0000-0000-0000-000000002004','reservations@swakopmundhotel.com','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002108','00000000-0000-0000-0000-000000002005','reservations@thecapital.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002109','00000000-0000-0000-0000-000000002006','reservations@ivorymanor.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002110','00000000-0000-0000-0000-000000002006','concierge@ivorymanor.co.za','General','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002111','00000000-0000-0000-0000-000000002007','ops@zambezitransfers.com','Operations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002112','00000000-0000-0000-0000-000000002008','transfers@rovosrail.com','General','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002113','00000000-0000-0000-0000-000000002009','bookings@winelandsexcursions.co.za','Reservations','2025-08-10T08:10:00Z')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 5: RAIL INFRASTRUCTURE (suite types, routes, rate cards)
-- ============================================================

insert into public.suite_types (id,supplier_id,name,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000002001','Pullman Twin Suite',true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-000000002001','Pullman Double Suite',true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-000000002001','Deluxe Twin Suite',true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005004','00000000-0000-0000-0000-000000002001','Deluxe Double Suite',true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005005','00000000-0000-0000-0000-000000002001','Royal Twin Suite',true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005006','00000000-0000-0000-0000-000000002001','Royal Double Suite',true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z')
on conflict (id) do nothing;

insert into public.routes (id,supplier_id,name,origin_location_id,destination_location_id,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000002001','Pretoria to Cape Town','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001002',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000002001','Cape Town to Pretoria','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001001',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000002001','Pretoria to Durban','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001003',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004004','00000000-0000-0000-0000-000000002001','Durban to Pretoria','00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-000000001001',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000002001','Pretoria to Victoria Falls','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001004',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004006','00000000-0000-0000-0000-000000002001','Victoria Falls to Pretoria','00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000001001',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004007','00000000-0000-0000-0000-000000002001','Pretoria to Swakopmund','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001005',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004008','00000000-0000-0000-0000-000000002001','Swakopmund to Pretoria','00000000-0000-0000-0000-000000001005','00000000-0000-0000-0000-000000001001',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004009','00000000-0000-0000-0000-000000002001','Cape Town to Dar es Salaam','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001006',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004010','00000000-0000-0000-0000-000000002001','Dar es Salaam to Cape Town','00000000-0000-0000-0000-000000001006','00000000-0000-0000-0000-000000001002',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z')
on conflict (id) do nothing;

insert into public.rate_cards (id,route_id,suite_type_id,price_per_person,currency,valid_from,valid_to,created_at) values
  ('00000000-0000-0000-0000-000000007201','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005001',24900,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007202','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005002',24900,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007203','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005003',38500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007204','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005004',38500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007205','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005005',58000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007206','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005006',62000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007207','00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000005001',24900,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007208','00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000005002',24900,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007209','00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000005003',38500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007210','00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000005004',38500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007211','00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000005005',58000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007212','00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000005006',62000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007213','00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000005003',48500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007214','00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000005004',48500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007215','00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000005006',72000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007216','00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000005002',18500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007217','00000000-0000-0000-0000-000000004004','00000000-0000-0000-0000-000000005002',18500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007218','00000000-0000-0000-0000-000000004007','00000000-0000-0000-0000-000000005004',55000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007219','00000000-0000-0000-0000-000000004007','00000000-0000-0000-0000-000000005006',78000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007220','00000000-0000-0000-0000-000000004009','00000000-0000-0000-0000-000000005003',64000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007221','00000000-0000-0000-0000-000000004009','00000000-0000-0000-0000-000000005006',82500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z')
on conflict (id) do nothing;

insert into public.supplier_pricing_options (id,supplier_id,name,single_price,double_price,family_price,currency,is_primary,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000007101','00000000-0000-0000-0000-000000002001','Pullman',24900,24900,42000,'ZAR',true,'2025-08-12T08:05:00Z','2025-08-12T08:05:00Z'),
  ('00000000-0000-0000-0000-000000007102','00000000-0000-0000-0000-000000002001','Deluxe',38500,38500,69000,'ZAR',false,'2025-08-12T08:05:00Z','2025-08-12T08:05:00Z'),
  ('00000000-0000-0000-0000-000000007103','00000000-0000-0000-0000-000000002001','Royal',58000,62000,110000,'ZAR',false,'2025-08-12T08:05:00Z','2025-08-12T08:05:00Z')
on conflict (id) do nothing;

insert into public.supplier_seasonal_periods (id,supplier_id,label,valid_from,valid_to,created_at) values
  ('00000000-0000-0000-0000-000000007111','00000000-0000-0000-0000-000000002001','Shoulder Season 2026','2026-04-01','2026-07-31','2025-08-12T08:10:00Z'),
  ('00000000-0000-0000-0000-000000007112','00000000-0000-0000-0000-000000002001','Peak Season 2026','2026-08-01','2026-10-31','2025-08-12T08:10:00Z')
on conflict (id) do nothing;

insert into public.supplier_seasonal_prices (id,option_id,period_id,single_price,double_price,family_price,created_at) values
  ('00000000-0000-0000-0000-000000007121','00000000-0000-0000-0000-000000007101','00000000-0000-0000-0000-000000007111',25900,25900,43000,'2025-08-12T08:12:00Z'),
  ('00000000-0000-0000-0000-000000007122','00000000-0000-0000-0000-000000007102','00000000-0000-0000-0000-000000007111',39900,39900,70500,'2025-08-12T08:12:00Z'),
  ('00000000-0000-0000-0000-000000007123','00000000-0000-0000-0000-000000007103','00000000-0000-0000-0000-000000007111',59500,63500,112500,'2025-08-12T08:12:00Z'),
  ('00000000-0000-0000-0000-000000007124','00000000-0000-0000-0000-000000007101','00000000-0000-0000-0000-000000007112',26900,26900,44500,'2025-08-12T08:12:00Z'),
  ('00000000-0000-0000-0000-000000007125','00000000-0000-0000-0000-000000007102','00000000-0000-0000-0000-000000007112',41500,41500,72500,'2025-08-12T08:12:00Z'),
  ('00000000-0000-0000-0000-000000007126','00000000-0000-0000-0000-000000007103','00000000-0000-0000-0000-000000007112',61500,65500,115500,'2025-08-12T08:12:00Z')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 6: PACKAGES, LEGS, ROUTES, HOTEL OFFERS
-- ============================================================

insert into public.packages (id,slug,name,description,duration_nights,single_supplement_pct,markup_pct,currency,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000003001','cape-town-classic','Cape Town Classic','Three-night luxury rail journey between Pretoria and Cape Town. All-inclusive dining, fine wines, and world-class service.',3,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003002','victoria-falls-explorer','Victoria Falls Explorer','Four-night rail journey from Pretoria to the majestic Victoria Falls. Optional post-journey hotel stay included.',4,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003003','durban-coastal-escape','Durban Coastal Escape','Two-night rail journey between Pretoria and Durban. Discover the KwaZulu-Natal coastline in classic Rovos Rail style.',2,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003004','namibia-desert-journey','Namibia Desert Journey','Eleven-night luxury journey from Pretoria through the Kalahari to the Namib Desert. A true off-the-beaten-track adventure.',11,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003005','east-africa-expedition','East Africa Expedition','Sixteen-night Cape Town to Dar es Salaam expedition — the longest and most scenic rail journey across the African continent.',16,50,15,'USD',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003006','garden-route-journey','Garden Route Journey','Five-night journey from Pretoria to Cape Town with an extended scenic stopover along the Garden Route.',5,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003007','romantic-rail-escape','Romantic Rail Escape','Three-night Cape Town to Pretoria journey curated for couples. Champagne, roses, and in-cabin dinner included.',3,100,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z')
on conflict (id) do update set slug=excluded.slug,name=excluded.name,description=excluded.description,
  duration_nights=excluded.duration_nights,single_supplement_pct=excluded.single_supplement_pct,
  markup_pct=excluded.markup_pct,currency=excluded.currency,active=excluded.active,updated_at=excluded.updated_at;

insert into public.package_legs (id,package_id,supplier_id,label,sort_order,created_at) values
  ('00000000-0000-0000-0000-000000003101','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003102','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003103','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003104','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003105','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003106','00000000-0000-0000-0000-000000003006','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003107','00000000-0000-0000-0000-000000003007','00000000-0000-0000-0000-000000002001','Main Rail Journey',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003108','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000002006','Pre-departure Hotel (Pretoria)',2,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003109','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002003','Post-journey Hotel (Victoria Falls)',2,'2025-08-10T08:14:00Z')
on conflict (id) do nothing;

insert into public.package_leg_routes (package_leg_id,route_id,created_at) values
  ('00000000-0000-0000-0000-000000003101','00000000-0000-0000-0000-000000004001','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003102','00000000-0000-0000-0000-000000004005','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003103','00000000-0000-0000-0000-000000004003','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003104','00000000-0000-0000-0000-000000004007','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003105','00000000-0000-0000-0000-000000004009','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003106','00000000-0000-0000-0000-000000004001','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003107','00000000-0000-0000-0000-000000004002','2025-08-10T08:15:00Z')
on conflict (package_leg_id,route_id) do nothing;

insert into public.hotel_offers (id,hotel_supplier_id,location_id,package_id,phase,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000006001','00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000003001','pre',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006002','00000000-0000-0000-0000-000000002006','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000003001','pre',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006003','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000003002','post',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006004','00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000001005','00000000-0000-0000-0000-000000003004','post',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006005','00000000-0000-0000-0000-000000002005','00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-000000003003','pre',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 7: EMAIL TEMPLATES
-- ============================================================

insert into public.templates (id,key,subject,body_html,version,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000007001','quote_email','Your Rovos Rail Quote — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Please find attached your personalised quotation for the <strong>{{direction}}</strong> journey departing <strong>{{departureDate}}</strong>.</p><p>This quote is valid until <strong>{{validityDate}}</strong>. Total: <strong>R {{total}}</strong></p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',2,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000007002','follow_up','Following up on your Rovos Rail enquiry — {{jobNumber}}','<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000007003','deposit_request','Deposit Invoice — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. A deposit of <strong>R {{depositAmount}}</strong> (25%) is required to secure your booking. Please find your invoice attached.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000007004','voucher_email','Your Travel Voucher — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Your travel voucher for the <strong>{{direction}}</strong> journey is attached. Please present it to Rovos Rail staff upon boarding. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',1,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z')
on conflict (id) do update set key=excluded.key,subject=excluded.subject,
  body_html=excluded.body_html,version=excluded.version,active=excluded.active,updated_at=excluded.updated_at;

-- ============================================================
-- SECTION 8: APP SETTINGS & VOUCHER TEMPLATE
-- ============================================================

insert into public.app_settings (key,value,updated_at) values
  ('default_deposit_percentage','25','2025-08-01T08:00:00Z'),
  ('quote_validity_days','14','2025-08-01T08:00:00Z'),
  ('deposit_due_rule','after_quote_acceptance','2025-08-01T08:00:00Z'),
  ('deposit_due_days','7','2025-08-01T08:00:00Z'),
  ('final_payment_due_days_before_departure','30','2025-08-01T08:00:00Z'),
  ('outbound_email_provider','tbd_provider_not_selected','2025-08-01T08:00:00Z'),
  ('backup_storage_provider','supabase_storage','2025-08-01T08:00:00Z'),
  ('backup_storage_bucket','backups','2025-08-01T08:00:00Z'),
  ('read_only_exports_allowed','false','2025-08-01T08:00:00Z'),
  ('payment_reference_required','false','2025-08-01T08:00:00Z'),
  ('payment_reminder_enabled','true','2025-08-01T08:00:00Z'),
  ('payment_reminder_cadence','[3,7,14]','2025-08-01T08:00:00Z'),
  ('quote_acceptance_after_expiry','blocked','2025-08-01T08:00:00Z'),
  ('session_timeout_minutes','480','2025-08-01T08:00:00Z'),
  ('business_name','Luxus Travel and Tours','2025-08-01T08:00:00Z')
on conflict (key) do update set value=excluded.value,updated_at=excluded.updated_at;

update public.voucher_template set
  header_text    = 'A Division of Luxus Travel & Tours',
  product_line   = 'THE BLUE TRAIN • ROVOS RAIL • KRUGER SHALATI',
  accent_colour  = '#0B2A3A',
  section_bg     = '#1a3a4a',
  footer_company = 'Luxus Travel & Tours',
  footer_phone   = '+27 12 000 0000',
  footer_email   = 'reservations@luxustravel.co.za',
  guidance_text  = 'Please hand to your service provider. Pre-payment was made by Luxus Travel & Tours for all services listed. Guests must settle extras directly with service providers.',
  updated_at     = now();

commit;

begin;

-- ============================================================
-- SECTION 9: BOOKINGS (37 total)
-- Consultant map: LB=a2, CDJ=a1, DR=a3, MVE=a4, DL=a5
-- ============================================================

insert into public.bookings (
  id,booking_number,customer_id,package_id,route_id,
  purpose,source,stage,consultant,owner_user_id,assigned_salesperson_id,
  departure_date,duration_nights,no_of_adults,no_of_children,no_of_suites,
  hotel_phase,hotel_supplier_id,extend_stay,extra_nights,
  additional_services,additional_services_details,
  terms_accepted,deposit_paid,invoice_balance,
  quote_sent_at,accepted_at,deposit_requested_at,
  deposit_paid_at,final_paid_at,voucher_sent_at,closed_at,
  created_at,updated_at
) values

-- CLOSED (5)
('00000000-0000-0000-0000-000000009031','RR-2025-0001','00000000-0000-0000-0000-000000008008','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004002','reservation','walk_in','closed','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2025-10-15',3,2,2,1,'none',null,false,null,true,'Winelands day tour on arrival',true,true,0,'2025-08-18T09:00:00Z','2025-08-28T14:00:00Z','2025-09-02T09:00:00Z','2025-09-10T11:00:00Z','2025-09-28T15:00:00Z','2025-10-05T09:00:00Z','2025-11-01T10:00:00Z','2025-08-10T08:10:00Z','2025-11-01T10:00:00Z'),
('00000000-0000-0000-0000-000000009032','RR-2025-0002','00000000-0000-0000-0000-000000008005','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000004009','reservation','travel_agent','closed','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2025-10-01',16,2,0,1,'none',null,false,null,false,null,true,true,0,'2025-08-22T10:00:00Z','2025-09-01T09:00:00Z','2025-09-05T09:00:00Z','2025-09-12T14:00:00Z','2025-09-20T15:00:00Z','2025-09-25T09:00:00Z','2025-11-20T10:00:00Z','2025-08-15T09:00:00Z','2025-11-20T10:00:00Z'),
('00000000-0000-0000-0000-000000009033','RR-2025-0003','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','web_form','closed','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2025-11-10',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,0,'2025-08-28T09:00:00Z','2025-09-08T14:00:00Z','2025-09-12T09:00:00Z','2025-09-20T11:00:00Z','2025-10-05T15:00:00Z','2025-10-28T09:00:00Z','2025-12-01T10:00:00Z','2025-08-20T09:00:00Z','2025-12-01T10:00:00Z'),
('00000000-0000-0000-0000-000000009034','RR-2025-0004','00000000-0000-0000-0000-000000008004','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000004003','reservation','email','closed','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2025-12-01',2,2,0,1,'none',null,false,null,false,null,true,true,0,'2025-09-08T10:00:00Z','2025-09-18T14:00:00Z','2025-09-22T09:00:00Z','2025-10-01T11:00:00Z','2025-11-05T15:00:00Z','2025-11-18T09:00:00Z','2025-12-20T10:00:00Z','2025-09-01T09:00:00Z','2025-12-20T10:00:00Z'),
('00000000-0000-0000-0000-000000009035','RR-2025-0005','00000000-0000-0000-0000-000000008006','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','phone_call','closed','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2025-12-15',3,2,0,1,'pre','00000000-0000-0000-0000-000000002002',false,null,false,null,true,true,0,'2025-09-18T10:00:00Z','2025-09-28T14:00:00Z','2025-10-02T09:00:00Z','2025-10-10T11:00:00Z','2025-11-20T15:00:00Z','2025-12-02T09:00:00Z','2026-01-10T10:00:00Z','2025-09-10T09:00:00Z','2026-01-10T10:00:00Z'),

-- VOUCHER SENT (3) — upcoming departures 2026-05-16, 05-25, 06-08
('00000000-0000-0000-0000-000000009028','RR-2025-0006','00000000-0000-0000-0000-000000008007','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000004004','reservation','web_form','voucher_sent','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-05-25',2,2,0,1,'none',null,false,null,false,null,true,true,0,'2025-10-28T09:00:00Z','2025-11-07T14:00:00Z','2025-11-12T09:00:00Z','2025-11-20T11:00:00Z','2026-03-15T15:00:00Z','2026-04-28T09:00:00Z',null,'2025-10-20T09:00:00Z','2026-04-28T09:00:00Z'),
('00000000-0000-0000-0000-000000009029','RR-2025-0007','00000000-0000-0000-0000-000000008011','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','referral','voucher_sent','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-08',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,0,'2025-11-10T09:00:00Z','2025-11-20T14:00:00Z','2025-11-25T09:00:00Z','2025-12-05T11:00:00Z','2026-03-28T15:00:00Z','2026-05-01T09:00:00Z',null,'2025-11-01T09:00:00Z','2026-05-01T09:00:00Z'),
('00000000-0000-0000-0000-000000009030','RR-2025-0008','00000000-0000-0000-0000-000000008009','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','paste_import','voucher_sent','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-05-16',3,2,0,1,'pre','00000000-0000-0000-0000-000000002006',false,null,false,null,true,true,0,'2025-11-22T09:00:00Z','2025-12-02T14:00:00Z','2025-12-08T09:00:00Z','2025-12-18T11:00:00Z','2026-04-01T15:00:00Z','2026-04-30T09:00:00Z',null,'2025-11-15T09:00:00Z','2026-04-30T09:00:00Z'),

-- FINAL PAID (4) — upcoming departures 2026-05-18, 06-11
('00000000-0000-0000-0000-000000009024','RR-2025-0009','00000000-0000-0000-0000-000000008014','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','final_paid','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-11',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,0,'2025-12-05T09:00:00Z','2025-12-15T14:00:00Z','2025-12-20T09:00:00Z','2025-12-28T11:00:00Z','2026-04-10T15:00:00Z',null,null,'2025-11-28T09:00:00Z','2026-04-10T15:00:00Z'),
('00000000-0000-0000-0000-000000009025','RR-2025-0010','00000000-0000-0000-0000-000000008012','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000004009','reservation','travel_agent','final_paid','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-08-20',16,2,0,1,'none',null,false,null,true,'Private transfers from hotel to station and return',true,true,0,'2025-12-18T09:00:00Z','2025-12-28T14:00:00Z','2026-01-05T09:00:00Z','2026-01-15T11:00:00Z','2026-04-20T15:00:00Z',null,null,'2025-12-10T09:00:00Z','2026-04-20T15:00:00Z'),
('00000000-0000-0000-0000-000000009026','RR-2025-0011','00000000-0000-0000-0000-000000008005','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','web_form','final_paid','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-05-18',3,2,0,1,'pre','00000000-0000-0000-0000-000000002002',false,null,false,null,true,true,0,'2026-01-02T09:00:00Z','2026-01-12T14:00:00Z','2026-01-16T09:00:00Z','2026-01-22T11:00:00Z','2026-04-08T15:00:00Z',null,null,'2025-12-20T09:00:00Z','2026-04-08T15:00:00Z'),
('00000000-0000-0000-0000-000000009027','RR-2026-0012','00000000-0000-0000-0000-000000008010','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000004007','reservation','referral','final_paid','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2026-07-10',11,2,0,1,'post','00000000-0000-0000-0000-000000002004',false,null,false,null,true,true,0,'2026-01-10T09:00:00Z','2026-01-18T14:00:00Z','2026-01-22T09:00:00Z','2026-01-28T11:00:00Z','2026-04-25T15:00:00Z',null,null,'2026-01-05T09:00:00Z','2026-04-25T15:00:00Z'),

-- DEPOSIT PAID (4) — upcoming 2026-05-22, 05-28, 06-04
('00000000-0000-0000-0000-000000009020','RR-2026-0014','00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000004007','reservation','phone_call','deposit_paid','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-05-28',11,2,0,1,'none',null,false,null,false,null,true,true,94875.00,'2026-01-25T09:00:00Z','2026-02-02T14:00:00Z','2026-02-06T09:00:00Z','2026-02-12T11:00:00Z',null,null,null,'2026-01-20T09:00:00Z','2026-02-12T11:00:00Z'),
('00000000-0000-0000-0000-000000009021','RR-2026-0015','00000000-0000-0000-0000-000000008002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','travel_agent','deposit_paid','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-06-04',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,83662.50,'2026-01-30T09:00:00Z','2026-02-08T14:00:00Z','2026-02-12T09:00:00Z','2026-02-18T11:00:00Z',null,null,null,'2026-01-25T09:00:00Z','2026-02-18T11:00:00Z'),
('00000000-0000-0000-0000-000000009022','RR-2026-0016','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','web_form','deposit_paid','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-05-22',3,2,0,1,'pre','00000000-0000-0000-0000-000000002006',false,null,false,null,true,true,106950.00,'2026-02-10T09:00:00Z','2026-02-18T14:00:00Z','2026-02-22T09:00:00Z','2026-02-26T11:00:00Z',null,null,null,'2026-02-05T09:00:00Z','2026-02-26T11:00:00Z'),
('00000000-0000-0000-0000-000000009023','RR-2026-0017','00000000-0000-0000-0000-000000008004','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004002','reservation','referral','deposit_paid','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2026-07-25',3,2,0,1,'none',null,false,null,false,null,true,true,42952.50,'2026-02-15T09:00:00Z','2026-02-25T14:00:00Z','2026-03-01T09:00:00Z','2026-03-08T11:00:00Z',null,null,null,'2026-02-10T09:00:00Z','2026-03-08T11:00:00Z'),

-- DEPOSIT REQUESTED (4)
('00000000-0000-0000-0000-000000009016','RR-2026-0019','00000000-0000-0000-0000-000000008013','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000004009','reservation','phone_call','deposit_requested','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2026-10-10',16,2,0,1,'none',null,false,null,false,null,true,false,189750.00,'2026-03-02T09:00:00Z','2026-03-10T14:00:00Z','2026-03-14T09:00:00Z',null,null,null,null,'2026-02-25T09:00:00Z','2026-03-14T09:00:00Z'),
('00000000-0000-0000-0000-000000009017','RR-2026-0020','00000000-0000-0000-0000-000000008007','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','web_form','deposit_requested','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-08-01',3,2,0,1,'pre','00000000-0000-0000-0000-000000002002',false,null,false,null,true,false,88550.00,'2026-03-08T09:00:00Z','2026-03-18T14:00:00Z','2026-03-22T09:00:00Z',null,null,null,null,'2026-03-01T09:00:00Z','2026-03-22T09:00:00Z'),
('00000000-0000-0000-0000-000000009018','RR-2026-0021','00000000-0000-0000-0000-000000008008','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','deposit_requested','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-09-15',4,2,2,1,'post','00000000-0000-0000-0000-000000002003',false,null,true,'Airport transfer from VFA and sunset cruise',true,false,175260.00,'2026-03-12T09:00:00Z','2026-03-20T14:00:00Z','2026-03-25T09:00:00Z',null,null,null,null,'2026-03-05T09:00:00Z','2026-03-25T09:00:00Z'),
('00000000-0000-0000-0000-000000009019','RR-2026-0022','00000000-0000-0000-0000-000000008009','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000004003','quote','paste_import','deposit_requested','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-07-05',2,2,0,1,'none',null,false,null,false,null,true,false,42550.00,'2026-03-18T09:00:00Z','2026-03-26T14:00:00Z','2026-03-30T09:00:00Z',null,null,null,null,'2026-03-10T09:00:00Z','2026-03-30T09:00:00Z'),

-- ACCEPTED (5)
('00000000-0000-0000-0000-000000009011','RR-2026-0023','00000000-0000-0000-0000-000000008004','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000004009','reservation','web_form','accepted','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-08-10',16,2,0,1,'none',null,false,null,false,null,true,false,null,'2026-03-26T09:00:00Z','2026-04-05T14:00:00Z',null,null,null,null,null,'2026-03-20T09:00:00Z','2026-04-05T14:00:00Z'),
('00000000-0000-0000-0000-000000009012','RR-2026-0024','00000000-0000-0000-0000-000000008005','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','travel_agent','accepted','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-07-15',3,2,0,1,'pre','00000000-0000-0000-0000-000000002002',false,null,false,null,true,false,null,'2026-03-28T09:00:00Z','2026-04-08T14:00:00Z',null,null,null,null,null,'2026-03-22T09:00:00Z','2026-04-08T14:00:00Z'),
('00000000-0000-0000-0000-000000009013','RR-2026-0025','00000000-0000-0000-0000-000000008006','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','walk_in','accepted','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-09-01',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,false,null,'2026-04-01T09:00:00Z','2026-04-10T14:00:00Z',null,null,null,null,null,'2026-03-25T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-000000009014','RR-2026-0026','00000000-0000-0000-0000-000000008011','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000004007','reservation','referral','accepted','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2026-07-28',11,2,0,1,'none',null,false,null,false,null,true,false,null,'2026-04-03T09:00:00Z','2026-04-12T14:00:00Z',null,null,null,null,null,'2026-03-28T09:00:00Z','2026-04-12T14:00:00Z'),
('00000000-0000-0000-0000-000000009015','RR-2026-0027','00000000-0000-0000-0000-000000008012','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004002','reservation','email','accepted','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-20',3,2,0,1,'pre','00000000-0000-0000-0000-000000002006',false,null,true,'Private Rovos Rail Transfer from Ivory Manor to station',true,false,null,'2026-04-08T09:00:00Z','2026-04-15T14:00:00Z',null,null,null,null,null,'2026-04-01T09:00:00Z','2026-04-15T14:00:00Z'),

-- QUOTE SENT (5)
('00000000-0000-0000-0000-000000009006','RR-2026-0028','00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000004007','reservation','phone_call','quote_sent','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-08-25',11,2,0,1,'none',null,false,null,false,null,true,false,null,'2026-04-20T09:00:00Z',null,null,null,null,null,null,'2026-04-15T09:00:00Z','2026-04-20T09:00:00Z'),
('00000000-0000-0000-0000-000000009007','RR-2026-0029','00000000-0000-0000-0000-000000008010','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000004003','quote','advertisement','quote_sent','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-07-20',2,2,0,1,'none',null,false,null,false,null,false,false,null,'2026-04-23T09:00:00Z',null,null,null,null,null,null,'2026-04-18T09:00:00Z','2026-04-23T09:00:00Z'),
('00000000-0000-0000-0000-000000009008','RR-2026-0030','00000000-0000-0000-0000-000000008002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','quote_sent','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-09-10',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,false,null,'2026-04-25T09:00:00Z',null,null,null,null,null,null,'2026-04-20T09:00:00Z','2026-04-25T09:00:00Z'),
('00000000-0000-0000-0000-000000009009','RR-2026-0031','00000000-0000-0000-0000-000000008014','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004002','reservation','referral','quote_sent','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-06-28',3,2,0,1,'pre','00000000-0000-0000-0000-000000002006',false,null,false,null,true,false,null,'2026-04-28T09:00:00Z',null,null,null,null,null,null,'2026-04-22T09:00:00Z','2026-04-28T09:00:00Z'),
('00000000-0000-0000-0000-000000009010','RR-2026-0032','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','reservation','web_form','quote_sent','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2026-07-03',3,2,0,1,'pre','00000000-0000-0000-0000-000000002002',false,null,false,null,true,false,null,'2026-05-02T09:00:00Z',null,null,null,null,null,null,'2026-04-25T09:00:00Z','2026-05-02T09:00:00Z'),

-- ENQUIRY (5)
('00000000-0000-0000-0000-000000009002','RR-2026-0033','00000000-0000-0000-0000-000000008018','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','enquiry','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-09-20',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,true,'Honeymoon arrangement — rose petals, champagne, private dinner',false,false,null,null,null,null,null,null,null,null,'2026-05-08T09:00:00Z','2026-05-08T09:00:00Z'),
('00000000-0000-0000-0000-000000009001','RR-2026-0034','00000000-0000-0000-0000-000000008017','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','quote','web_form','enquiry','MVE','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','2026-08-15',3,2,0,1,'none',null,false,null,false,null,false,false,null,null,null,null,null,null,null,null,'2026-05-10T10:00:00Z','2026-05-10T10:00:00Z'),
('00000000-0000-0000-0000-000000009003','RR-2026-0035','00000000-0000-0000-0000-000000008013','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000004007','availability','phone_call','enquiry','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-10-05',11,2,0,1,'none',null,false,null,false,null,false,false,null,null,null,null,null,null,null,null,'2026-05-12T09:00:00Z','2026-05-12T09:00:00Z'),
('00000000-0000-0000-0000-000000009004','RR-2026-0036','00000000-0000-0000-0000-000000008016','00000000-0000-0000-0000-000000003003','00000000-0000-0000-0000-000000004003','quote','social_media','enquiry','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-07-10',2,2,0,1,'none',null,false,null,false,null,false,false,null,null,null,null,null,null,null,null,'2026-05-13T10:00:00Z','2026-05-13T10:00:00Z'),
('00000000-0000-0000-0000-000000009005','RR-2026-0037','00000000-0000-0000-0000-000000008015','00000000-0000-0000-0000-000000003005','00000000-0000-0000-0000-000000004009','reservation','travel_agent','enquiry','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-11-01',16,2,0,1,'none',null,false,null,false,null,false,false,null,null,null,null,null,null,null,null,'2026-05-14T10:00:00Z','2026-05-14T10:00:00Z'),

-- LOST (2)
('00000000-0000-0000-0000-000000009036','RR-2026-0013','00000000-0000-0000-0000-000000008013','00000000-0000-0000-0000-000000003004','00000000-0000-0000-0000-000000004007','availability','referral','lost','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2026-09-15',11,2,0,1,'none',null,false,null,false,null,false,false,null,'2026-01-18T09:00:00Z',null,null,null,null,null,null,'2026-01-10T09:00:00Z','2026-01-30T09:00:00Z'),
('00000000-0000-0000-0000-000000009037','RR-2026-0018','00000000-0000-0000-0000-000000008016','00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000004001','quote','social_media','lost','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-08-05',3,2,0,1,'none',null,false,null,false,null,false,false,null,'2026-02-22T09:00:00Z','2026-03-02T14:00:00Z',null,null,null,null,null,'2026-02-15T09:00:00Z','2026-03-10T09:00:00Z');

commit;




begin;

-- SECTION 10: BOOKING SUITES
insert into public.booking_suites (id,booking_id,suite_number,suite_type_id,suite_type_name,created_at) values
('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-000000009031',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2025-08-10T08:11:00Z'),
('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-000000009032',1,'00000000-0000-0000-0000-000000005003','Deluxe Twin Suite','2025-08-15T09:11:00Z'),
('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-000000009033',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2025-08-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-000000009034',1,'00000000-0000-0000-0000-000000005002','Pullman Double Suite','2025-09-01T09:11:00Z'),
('00000000-0000-0000-0000-00000000a005','00000000-0000-0000-0000-000000009035',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2025-09-10T09:11:00Z'),
('00000000-0000-0000-0000-00000000a006','00000000-0000-0000-0000-000000009028',1,'00000000-0000-0000-0000-000000005002','Pullman Double Suite','2025-10-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a007','00000000-0000-0000-0000-000000009029',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2025-11-01T09:11:00Z'),
('00000000-0000-0000-0000-00000000a008','00000000-0000-0000-0000-000000009030',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2025-11-15T09:11:00Z'),
('00000000-0000-0000-0000-00000000a009','00000000-0000-0000-0000-000000009024',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2025-11-28T09:11:00Z'),
('00000000-0000-0000-0000-00000000a010','00000000-0000-0000-0000-000000009025',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2025-12-10T09:11:00Z'),
('00000000-0000-0000-0000-00000000a011','00000000-0000-0000-0000-000000009026',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2025-12-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a012','00000000-0000-0000-0000-000000009027',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-01-05T09:11:00Z'),
('00000000-0000-0000-0000-00000000a013','00000000-0000-0000-0000-000000009020',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-01-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a014','00000000-0000-0000-0000-000000009021',1,'00000000-0000-0000-0000-000000005003','Deluxe Twin Suite','2026-01-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a015','00000000-0000-0000-0000-000000009022',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2026-02-05T09:11:00Z'),
('00000000-0000-0000-0000-00000000a016','00000000-0000-0000-0000-000000009023',1,'00000000-0000-0000-0000-000000005002','Pullman Double Suite','2026-02-10T09:11:00Z'),
('00000000-0000-0000-0000-00000000a017','00000000-0000-0000-0000-000000009016',1,'00000000-0000-0000-0000-000000005003','Deluxe Twin Suite','2026-02-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a018','00000000-0000-0000-0000-000000009017',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-03-01T09:11:00Z'),
('00000000-0000-0000-0000-00000000a019','00000000-0000-0000-0000-000000009018',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2026-03-05T09:11:00Z'),
('00000000-0000-0000-0000-00000000a020','00000000-0000-0000-0000-000000009019',1,'00000000-0000-0000-0000-000000005002','Pullman Double Suite','2026-03-10T09:11:00Z'),
('00000000-0000-0000-0000-00000000a021','00000000-0000-0000-0000-000000009011',1,'00000000-0000-0000-0000-000000005003','Deluxe Twin Suite','2026-03-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a022','00000000-0000-0000-0000-000000009012',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-03-22T09:11:00Z'),
('00000000-0000-0000-0000-00000000a023','00000000-0000-0000-0000-000000009013',1,'00000000-0000-0000-0000-000000005005','Royal Twin Suite','2026-03-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a024','00000000-0000-0000-0000-000000009014',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-03-28T09:11:00Z'),
('00000000-0000-0000-0000-00000000a025','00000000-0000-0000-0000-000000009015',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2026-04-01T09:11:00Z'),
('00000000-0000-0000-0000-00000000a026','00000000-0000-0000-0000-000000009006',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-04-15T09:11:00Z'),
('00000000-0000-0000-0000-00000000a027','00000000-0000-0000-0000-000000009007',1,'00000000-0000-0000-0000-000000005002','Pullman Double Suite','2026-04-18T09:11:00Z'),
('00000000-0000-0000-0000-00000000a028','00000000-0000-0000-0000-000000009008',1,'00000000-0000-0000-0000-000000005003','Deluxe Twin Suite','2026-04-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a029','00000000-0000-0000-0000-000000009009',1,'00000000-0000-0000-0000-000000005002','Pullman Double Suite','2026-04-22T09:11:00Z'),
('00000000-0000-0000-0000-00000000a030','00000000-0000-0000-0000-000000009010',1,'00000000-0000-0000-0000-000000005006','Royal Double Suite','2026-04-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a031','00000000-0000-0000-0000-000000009036',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-01-10T09:11:00Z'),
('00000000-0000-0000-0000-00000000a032','00000000-0000-0000-0000-000000009037',1,'00000000-0000-0000-0000-000000005004','Deluxe Double Suite','2026-02-15T09:11:00Z');

-- SECTION 11: TRAVELLERS (key bookings)
insert into public.travellers (id,booking_id,prefix,first_name,last_name,id_passport,date_of_birth,is_child,sort_order,created_at) values
('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-000000009031','Mrs','Elizabeth','Taylor','AU12345678','1980-03-12',false,1,'2025-08-10T08:12:00Z'),
('00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-000000009031','Mr','George','Taylor','AU87654321','1978-07-18',false,2,'2025-08-10T08:12:00Z'),
('00000000-0000-0000-0000-00000000b003','00000000-0000-0000-0000-000000009031','Miss','Sophie','Taylor','AU11112222','2021-02-10',true,3,'2025-08-10T08:12:00Z'),
('00000000-0000-0000-0000-00000000b004','00000000-0000-0000-0000-000000009031','Master','Oliver','Taylor','AU33334444','2017-11-05',true,4,'2025-08-10T08:12:00Z'),
('00000000-0000-0000-0000-00000000b005','00000000-0000-0000-0000-000000009032','Mr','Robert','Chen','US12345678','1968-04-10',false,1,'2025-08-15T09:12:00Z'),
('00000000-0000-0000-0000-00000000b006','00000000-0000-0000-0000-000000009032','Mrs','Jennifer','Chen','US87654321','1970-08-25',false,2,'2025-08-15T09:12:00Z'),
('00000000-0000-0000-0000-00000000b007','00000000-0000-0000-0000-000000009033','Mr','James','Mitchell','ZA8501015800081','1985-01-15',false,1,'2025-08-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b008','00000000-0000-0000-0000-000000009033','Mrs','Linda','Mitchell','ZA8703025800082','1987-03-02',false,2,'2025-08-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b009','00000000-0000-0000-0000-000000009034','Mrs','Anna','Muller','DE123456789','1979-03-18',false,1,'2025-09-01T09:12:00Z'),
('00000000-0000-0000-0000-00000000b010','00000000-0000-0000-0000-000000009034','Mr','Klaus','Muller','DE987654321','1977-09-22',false,2,'2025-09-01T09:12:00Z'),
('00000000-0000-0000-0000-00000000b011','00000000-0000-0000-0000-000000009035','Ms','Priya','Naidoo','ZA9001015800081','1990-01-01',false,1,'2025-09-10T09:12:00Z'),
('00000000-0000-0000-0000-00000000b012','00000000-0000-0000-0000-000000009035','Mr','Raj','Naidoo','ZA8812015800082','1988-12-01',false,2,'2025-09-10T09:12:00Z'),
('00000000-0000-0000-0000-00000000b013','00000000-0000-0000-0000-000000009028','Mr','Marco','Rossi','IT12345678','1981-05-18',false,1,'2025-10-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b014','00000000-0000-0000-0000-000000009028','Mrs','Giulia','Rossi','IT22334455','1984-11-30',false,2,'2025-10-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b015','00000000-0000-0000-0000-000000009029','Mr','Henrik','Johansson','SE12345678','1982-04-22',false,1,'2025-11-01T09:12:00Z'),
('00000000-0000-0000-0000-00000000b016','00000000-0000-0000-0000-000000009029','Ms','Astrid','Johansson','SE87654321','1985-08-14',false,2,'2025-11-01T09:12:00Z'),
('00000000-0000-0000-0000-00000000b017','00000000-0000-0000-0000-000000009030','Mr','David','Kruger','ZA75091500082','1975-09-15',false,1,'2025-11-15T09:12:00Z'),
('00000000-0000-0000-0000-00000000b018','00000000-0000-0000-0000-000000009030','Mrs','Anette','Kruger','ZA78042800083','1978-04-28',false,2,'2025-11-15T09:12:00Z'),
('00000000-0000-0000-0000-00000000b019','00000000-0000-0000-0000-000000009024','Mrs','Chloe','Beaumont','CA23456789','1988-06-15',false,1,'2025-11-28T09:12:00Z'),
('00000000-0000-0000-0000-00000000b020','00000000-0000-0000-0000-000000009024','Mr','Louis','Beaumont','CA98765432','1985-11-03',false,2,'2025-11-28T09:12:00Z'),
('00000000-0000-0000-0000-00000000b021','00000000-0000-0000-0000-000000009025','Ms','Fatima','Al-Rashid','AE1234567','1989-09-08',false,1,'2025-12-10T09:12:00Z'),
('00000000-0000-0000-0000-00000000b022','00000000-0000-0000-0000-000000009025','Mr','Khalid','Al-Rashid','AE7654321','1987-02-17',false,2,'2025-12-10T09:12:00Z'),
('00000000-0000-0000-0000-00000000b023','00000000-0000-0000-0000-000000009026','Mr','Robert','Chen','US12345679','1968-04-10',false,1,'2025-12-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b024','00000000-0000-0000-0000-000000009026','Mrs','Jennifer','Chen','US87654322','1970-08-25',false,2,'2025-12-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b025','00000000-0000-0000-0000-000000009022','Mr','James','Mitchell','ZA8501015800081','1985-01-15',false,1,'2026-02-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b026','00000000-0000-0000-0000-000000009022','Mrs','Linda','Mitchell','ZA8703025800082','1987-03-02',false,2,'2026-02-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b027','00000000-0000-0000-0000-000000009018','Mrs','Elizabeth','Taylor','AU12345678','1980-03-12',false,1,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b028','00000000-0000-0000-0000-000000009018','Mr','George','Taylor','AU87654321','1978-07-18',false,2,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b029','00000000-0000-0000-0000-000000009018','Miss','Emma','Taylor','AU55556666','2018-05-12',true,3,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b030','00000000-0000-0000-0000-000000009018','Master','Jack','Taylor','AU77778888','2015-09-20',true,4,'2026-03-05T09:12:00Z');

commit;


begin;

-- SECTION 12: ITINERARIES
insert into public.itineraries (id,booking_id,name,notes,accepted_at,created_at,updated_at) values
('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000009031','Cape Town to Pretoria — Royal Family','Three-night Royal class journey with Winelands tour on arrival.','2025-08-28T14:00:00Z','2025-08-25T09:00:00Z','2025-08-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-000000009032','East Africa Expedition — Chen','Sixteen-night Cape Town to Dar es Salaam expedition.','2025-09-01T09:00:00Z','2025-08-28T09:00:00Z','2025-09-01T09:00:00Z'),
('00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-000000009033','Victoria Falls Explorer — Mitchell VIP','Four-night Pretoria to Victoria Falls. Royal Double Suite with post-stay at Victoria Falls Hotel.','2025-09-08T14:00:00Z','2025-09-05T09:00:00Z','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-000000009034','Durban Coastal Escape — Muller','Two-night Pretoria to Durban coastal journey.','2025-09-18T14:00:00Z','2025-09-15T09:00:00Z','2025-09-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000c005','00000000-0000-0000-0000-000000009035','Cape Town Classic — Naidoo','Three-night Pretoria to Cape Town with Irene Country Lodge pre-stay.','2025-09-28T14:00:00Z','2025-09-25T09:00:00Z','2025-09-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000c006','00000000-0000-0000-0000-000000009028','Durban to Pretoria — Rossi','Two-night Durban to Pretoria. Pullman Double Suite.','2025-11-07T14:00:00Z','2025-11-04T09:00:00Z','2025-11-07T14:00:00Z'),
('00000000-0000-0000-0000-00000000c007','00000000-0000-0000-0000-000000009029','Victoria Falls Explorer — Johansson','Four-night Pretoria to Victoria Falls. Post-stay at Victoria Falls Hotel.','2025-11-20T14:00:00Z','2025-11-17T09:00:00Z','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000c008','00000000-0000-0000-0000-000000009030','Cape Town Classic — Kruger','Three-night Pretoria to Cape Town. Pre-stay Ivory Manor.','2025-12-02T14:00:00Z','2025-11-29T09:00:00Z','2025-12-02T14:00:00Z'),
('00000000-0000-0000-0000-00000000c009','00000000-0000-0000-0000-000000009024','Victoria Falls Explorer — Beaumont','Four-night Pretoria to Victoria Falls. Post-stay Victoria Falls Hotel.','2025-12-15T14:00:00Z','2025-12-12T09:00:00Z','2025-12-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000c010','00000000-0000-0000-0000-000000009025','East Africa Expedition — Al-Rashid VIP','Sixteen-night Cape Town to Dar es Salaam. Royal Double Suite. VIP throughout.','2025-12-28T14:00:00Z','2025-12-25T09:00:00Z','2025-12-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000c011','00000000-0000-0000-0000-000000009026','Cape Town Classic — Chen','Three-night Pretoria to Cape Town. Irene Country Lodge pre-stay.','2026-01-12T14:00:00Z','2026-01-09T09:00:00Z','2026-01-12T14:00:00Z'),
('00000000-0000-0000-0000-00000000c012','00000000-0000-0000-0000-000000009027','Namibia Desert Journey — Dupont','Eleven-night Pretoria to Swakopmund. Research trip for travel article.','2026-01-18T14:00:00Z','2026-01-15T09:00:00Z','2026-01-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000c013','00000000-0000-0000-0000-000000009020','Namibia Desert Journey — Worthington','Eleven-night Pretoria to Swakopmund.','2026-02-02T14:00:00Z','2026-01-30T09:00:00Z','2026-02-02T14:00:00Z'),
('00000000-0000-0000-0000-00000000c014','00000000-0000-0000-0000-000000009021','Victoria Falls Explorer — Van Der Berg','Four-night Pretoria to Victoria Falls. Post-stay Victoria Falls Hotel.','2026-02-08T14:00:00Z','2026-02-05T09:00:00Z','2026-02-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c015','00000000-0000-0000-0000-000000009022','Cape Town Classic — Mitchell (2026)','Three-night Pretoria to Cape Town. Royal Double. Ivory Manor pre-stay.','2026-02-18T14:00:00Z','2026-02-15T09:00:00Z','2026-02-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000c016','00000000-0000-0000-0000-000000009023','Cape Town Classic — Muller (2026)','Three-night Cape Town to Pretoria. Pullman Double.','2026-02-25T14:00:00Z','2026-02-22T09:00:00Z','2026-02-25T14:00:00Z'),
('00000000-0000-0000-0000-00000000c017','00000000-0000-0000-0000-000000009016','East Africa Expedition — van Niekerk','Sixteen-night Cape Town to Dar es Salaam. Corporate executive booking.','2026-03-10T14:00:00Z','2026-03-07T09:00:00Z','2026-03-10T14:00:00Z'),
('00000000-0000-0000-0000-00000000c018','00000000-0000-0000-0000-000000009017','Cape Town Classic — Rossi (2026)','Three-night Pretoria to Cape Town. Irene pre-stay.','2026-03-18T14:00:00Z','2026-03-15T09:00:00Z','2026-03-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000c019','00000000-0000-0000-0000-000000009018','Victoria Falls Explorer — Taylor Family','Four-night with 2 children. Post-stay and sunset cruise.','2026-03-20T14:00:00Z','2026-03-17T09:00:00Z','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000c020','00000000-0000-0000-0000-000000009019','Durban Coastal Escape — Kruger (2026)','Two-night Pretoria to Durban.','2026-03-26T14:00:00Z','2026-03-23T09:00:00Z','2026-03-26T14:00:00Z'),
('00000000-0000-0000-0000-00000000c021','00000000-0000-0000-0000-000000009011','East Africa Expedition — Muller (accepted)','Sixteen-night Cape Town to Dar es Salaam.','2026-04-05T14:00:00Z','2026-04-02T09:00:00Z','2026-04-05T14:00:00Z'),
('00000000-0000-0000-0000-00000000c022','00000000-0000-0000-0000-000000009012','Cape Town Classic — Chen (accepted)','Three-night Pretoria to Cape Town. Irene pre-stay.','2026-04-08T14:00:00Z','2026-04-05T09:00:00Z','2026-04-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c023','00000000-0000-0000-0000-000000009013','Victoria Falls Explorer — Naidoo (accepted)','Four-night Pretoria to Victoria Falls. Post-stay.','2026-04-10T14:00:00Z','2026-04-07T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-00000000c024','00000000-0000-0000-0000-000000009014','Namibia — Johansson (accepted)','Eleven-night. Photography journey.','2026-04-12T14:00:00Z','2026-04-09T09:00:00Z','2026-04-12T14:00:00Z'),
('00000000-0000-0000-0000-00000000c025','00000000-0000-0000-0000-000000009015','Cape Town Classic — Al-Rashid VIP (accepted)','Three-night Cape Town to Pretoria. Royal Double. VIP service.',null,'2026-04-08T09:00:00Z','2026-04-15T14:00:00Z');

commit;


begin;

-- SECTION 13: QUOTES
insert into public.quotes (id,booking_id,itinerary_id,quote_number,status,validity_until,subtotal,vat,total,last_sent_at,created_at,updated_at) values
('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-000000009031','00000000-0000-0000-0000-00000000c001','RR-2025-0001-Q1','accepted','2025-09-18',123826.09,18573.91,142400.00,'2025-08-18T09:30:00Z','2025-08-18T09:00:00Z','2025-08-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-000000009032','00000000-0000-0000-0000-00000000c002','RR-2025-0002-Q1','accepted','2025-09-22',127826.09,19173.91,147000.00,'2025-08-22T10:30:00Z','2025-08-22T10:00:00Z','2025-09-01T09:00:00Z'),
('00000000-0000-0000-0000-00000000d003','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000c003','RR-2025-0003-Q1','accepted','2025-09-28',143478.26,21521.74,165000.00,'2025-08-28T09:30:00Z','2025-08-28T09:00:00Z','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d004','00000000-0000-0000-0000-000000009034','00000000-0000-0000-0000-00000000c004','RR-2025-0004-Q1','accepted','2025-10-08',37000.00,5550.00,42550.00,'2025-09-08T10:30:00Z','2025-09-08T10:00:00Z','2025-09-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000d005','00000000-0000-0000-0000-000000009035','00000000-0000-0000-0000-00000000c005','RR-2025-0005-Q1','accepted','2025-10-18',77000.00,11550.00,88550.00,'2025-09-18T10:30:00Z','2025-09-18T10:00:00Z','2025-09-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000d006','00000000-0000-0000-0000-000000009028','00000000-0000-0000-0000-00000000c006','RR-2025-0006-Q1','accepted','2025-11-27',37000.00,5550.00,42550.00,'2025-10-28T09:30:00Z','2025-10-28T09:00:00Z','2025-11-07T14:00:00Z'),
('00000000-0000-0000-0000-00000000d007','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000c007','RR-2025-0007-Q1','accepted','2025-12-10',97000.00,14550.00,111550.00,'2025-11-10T09:30:00Z','2025-11-10T09:00:00Z','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000d008','00000000-0000-0000-0000-000000009030','00000000-0000-0000-0000-00000000c008','RR-2025-0008-Q1','accepted','2025-12-22',77000.00,11550.00,88550.00,'2025-11-22T09:30:00Z','2025-11-22T09:00:00Z','2025-12-02T14:00:00Z'),
('00000000-0000-0000-0000-00000000d009','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000c009','RR-2025-0009-Q1','accepted','2026-01-05',97000.00,14550.00,111550.00,'2025-12-05T09:30:00Z','2025-12-05T09:00:00Z','2025-12-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000d010','00000000-0000-0000-0000-000000009025','00000000-0000-0000-0000-00000000c010','RR-2025-0010-Q1','accepted','2026-01-18',143478.26,21521.74,165000.00,'2025-12-18T09:30:00Z','2025-12-18T09:00:00Z','2025-12-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000d011','00000000-0000-0000-0000-000000009026','00000000-0000-0000-0000-00000000c011','RR-2025-0011-Q1','accepted','2026-02-02',77000.00,11550.00,88550.00,'2026-01-02T09:30:00Z','2026-01-02T09:00:00Z','2026-01-12T14:00:00Z'),
('00000000-0000-0000-0000-00000000d012','00000000-0000-0000-0000-000000009027','00000000-0000-0000-0000-00000000c012','RR-2026-0012-Q1','accepted','2026-02-10',110000.00,16500.00,126500.00,'2026-01-10T09:30:00Z','2026-01-10T09:00:00Z','2026-01-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000d013','00000000-0000-0000-0000-000000009020','00000000-0000-0000-0000-00000000c013','RR-2026-0014-Q1','accepted','2026-02-25',110000.00,16500.00,126500.00,'2026-01-25T09:30:00Z','2026-01-25T09:00:00Z','2026-02-02T14:00:00Z'),
('00000000-0000-0000-0000-00000000d014','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000c014','RR-2026-0015-Q1','accepted','2026-02-28',97000.00,14550.00,111550.00,'2026-01-30T09:30:00Z','2026-01-30T09:00:00Z','2026-02-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d015','00000000-0000-0000-0000-000000009022','00000000-0000-0000-0000-00000000c015','RR-2026-0016-Q1','accepted','2026-03-10',124000.00,18600.00,142600.00,'2026-02-10T09:30:00Z','2026-02-10T09:00:00Z','2026-02-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000d016','00000000-0000-0000-0000-000000009023','00000000-0000-0000-0000-00000000c016','RR-2026-0017-Q1','accepted','2026-03-15',49800.00,7470.00,57270.00,'2026-02-15T09:30:00Z','2026-02-15T09:00:00Z','2026-02-25T14:00:00Z'),
('00000000-0000-0000-0000-00000000d017','00000000-0000-0000-0000-000000009016','00000000-0000-0000-0000-00000000c017','RR-2026-0019-Q1','accepted','2026-04-02',165000.00,24750.00,189750.00,'2026-03-02T09:30:00Z','2026-03-02T09:00:00Z','2026-03-10T14:00:00Z'),
('00000000-0000-0000-0000-00000000d018','00000000-0000-0000-0000-000000009017','00000000-0000-0000-0000-00000000c018','RR-2026-0020-Q1','accepted','2026-04-08',77000.00,11550.00,88550.00,'2026-03-08T09:30:00Z','2026-03-08T09:00:00Z','2026-03-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000d019','00000000-0000-0000-0000-000000009018','00000000-0000-0000-0000-00000000c019','RR-2026-0021-Q1','accepted','2026-04-12',152400.00,22860.00,175260.00,'2026-03-12T09:30:00Z','2026-03-12T09:00:00Z','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000d020','00000000-0000-0000-0000-000000009019','00000000-0000-0000-0000-00000000c020','RR-2026-0022-Q1','accepted','2026-04-18',37000.00,5550.00,42550.00,'2026-03-18T09:30:00Z','2026-03-18T09:00:00Z','2026-03-26T14:00:00Z'),
('00000000-0000-0000-0000-00000000d021','00000000-0000-0000-0000-000000009011','00000000-0000-0000-0000-00000000c021','RR-2026-0023-Q1','accepted','2026-04-25',165000.00,24750.00,189750.00,'2026-03-26T09:30:00Z','2026-03-26T09:00:00Z','2026-04-05T14:00:00Z'),
('00000000-0000-0000-0000-00000000d022','00000000-0000-0000-0000-000000009012','00000000-0000-0000-0000-00000000c022','RR-2026-0024-Q1','accepted','2026-04-28',77000.00,11550.00,88550.00,'2026-03-28T09:30:00Z','2026-03-28T09:00:00Z','2026-04-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d023','00000000-0000-0000-0000-000000009013','00000000-0000-0000-0000-00000000c023','RR-2026-0025-Q1','accepted','2026-05-01',110400.00,16560.00,126960.00,'2026-04-01T09:30:00Z','2026-04-01T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-00000000d024','00000000-0000-0000-0000-000000009014','00000000-0000-0000-0000-00000000c024','RR-2026-0026-Q1','accepted','2026-05-03',110000.00,16500.00,126500.00,'2026-04-03T09:30:00Z','2026-04-03T09:00:00Z','2026-04-12T14:00:00Z'),
('00000000-0000-0000-0000-00000000d025','00000000-0000-0000-0000-000000009015','00000000-0000-0000-0000-00000000c025','RR-2026-0027-Q1','accepted','2026-05-08',124000.00,18600.00,142600.00,'2026-04-08T09:30:00Z','2026-04-08T09:00:00Z','2026-04-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000d026','00000000-0000-0000-0000-000000009006',null,'RR-2026-0028-Q1','sent','2026-05-04',110000.00,16500.00,126500.00,'2026-04-20T09:30:00Z','2026-04-20T09:00:00Z','2026-04-20T09:30:00Z'),
('00000000-0000-0000-0000-00000000d027','00000000-0000-0000-0000-000000009007',null,'RR-2026-0029-Q1','sent','2026-05-07',37000.00,5550.00,42550.00,'2026-04-23T09:30:00Z','2026-04-23T09:00:00Z','2026-04-23T09:30:00Z'),
('00000000-0000-0000-0000-00000000d028','00000000-0000-0000-0000-000000009008',null,'RR-2026-0030-Q1','sent','2026-05-09',97000.00,14550.00,111550.00,'2026-04-25T09:30:00Z','2026-04-25T09:00:00Z','2026-04-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000d029','00000000-0000-0000-0000-000000009009',null,'RR-2026-0031-Q1','sent','2026-05-12',49800.00,7470.00,57270.00,'2026-04-28T09:30:00Z','2026-04-28T09:00:00Z','2026-04-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000d030','00000000-0000-0000-0000-000000009010',null,'RR-2026-0032-Q1','sent','2026-05-16',124000.00,18600.00,142600.00,'2026-05-02T09:30:00Z','2026-05-02T09:00:00Z','2026-05-02T09:30:00Z'),
('00000000-0000-0000-0000-00000000d031','00000000-0000-0000-0000-000000009036',null,'RR-2026-0013-Q1','expired','2026-02-01',110000.00,16500.00,126500.00,'2026-01-18T09:30:00Z','2026-01-18T09:00:00Z','2026-01-30T09:00:00Z'),
('00000000-0000-0000-0000-00000000d032','00000000-0000-0000-0000-000000009037',null,'RR-2026-0018-Q1','cancelled','2026-03-08',77000.00,11550.00,88550.00,'2026-02-22T09:30:00Z','2026-02-22T09:00:00Z','2026-03-10T09:00:00Z');

-- SECTION 13b: QUOTE LINE ITEMS
insert into public.quote_line_items (id,quote_id,description,qty,unit_price,total,sort_order,created_at) values
('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','Royal Double Suite (2 pax) — Cape Town to Pretoria',1,124000.00,124000.00,1,'2025-08-18T09:05:00Z'),
('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-00000000d001','Cape Winelands Day Tour (per person)',2,900.00,1800.00,2,'2025-08-18T09:05:00Z'),
('00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-00000000d002','Deluxe Twin Suite (2 pax) — East Africa Expedition',1,128000.00,128000.00,1,'2025-08-22T10:05:00Z'),
('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000d003','Royal Double Suite (2 pax) — Victoria Falls Explorer',1,144000.00,144000.00,1,'2025-08-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e005','00000000-0000-0000-0000-00000000d003','Victoria Falls Hotel — 2 nights (2 pax)',1,19000.00,19000.00,2,'2025-08-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e006','00000000-0000-0000-0000-00000000d004','Pullman Double Suite (2 pax) — Pretoria to Durban',1,37000.00,37000.00,1,'2025-09-08T10:05:00Z'),
('00000000-0000-0000-0000-00000000e007','00000000-0000-0000-0000-00000000d005','Deluxe Double Suite (2 pax) — Pretoria to Cape Town',1,77000.00,77000.00,1,'2025-09-18T10:05:00Z'),
('00000000-0000-0000-0000-00000000e008','00000000-0000-0000-0000-00000000d006','Pullman Double Suite (2 pax) — Durban to Pretoria',1,37000.00,37000.00,1,'2025-10-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e009','00000000-0000-0000-0000-00000000d007','Deluxe Double Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2025-11-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e010','00000000-0000-0000-0000-00000000d008','Deluxe Double Suite (2 pax) — Pretoria to Cape Town',1,77000.00,77000.00,1,'2025-11-22T09:05:00Z'),
('00000000-0000-0000-0000-00000000e011','00000000-0000-0000-0000-00000000d009','Deluxe Double Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2025-12-05T09:05:00Z'),
('00000000-0000-0000-0000-00000000e012','00000000-0000-0000-0000-00000000d010','Royal Double Suite (2 pax) — East Africa Expedition',1,144000.00,144000.00,1,'2025-12-18T09:05:00Z'),
('00000000-0000-0000-0000-00000000e013','00000000-0000-0000-0000-00000000d010','Private station transfers (return)',1,4500.00,4500.00,2,'2025-12-18T09:05:00Z'),
('00000000-0000-0000-0000-00000000e014','00000000-0000-0000-0000-00000000d011','Deluxe Double Suite (2 pax) — Pretoria to Cape Town',1,77000.00,77000.00,1,'2026-01-02T09:05:00Z'),
('00000000-0000-0000-0000-00000000e015','00000000-0000-0000-0000-00000000d012','Deluxe Double Suite (2 pax) — Namibia Desert Journey',1,110000.00,110000.00,1,'2026-01-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e016','00000000-0000-0000-0000-00000000d013','Deluxe Double Suite (2 pax) — Namibia Desert Journey',1,110000.00,110000.00,1,'2026-01-25T09:05:00Z'),
('00000000-0000-0000-0000-00000000e017','00000000-0000-0000-0000-00000000d014','Deluxe Twin Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2026-01-30T09:05:00Z'),
('00000000-0000-0000-0000-00000000e018','00000000-0000-0000-0000-00000000d015','Royal Double Suite (2 pax) — Pretoria to Cape Town',1,124000.00,124000.00,1,'2026-02-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e019','00000000-0000-0000-0000-00000000d016','Pullman Double Suite (2 pax) — Cape Town to Pretoria',1,49800.00,49800.00,1,'2026-02-15T09:05:00Z'),
('00000000-0000-0000-0000-00000000e020','00000000-0000-0000-0000-00000000d017','Deluxe Twin Suite (2 pax) — East Africa Expedition',1,165000.00,165000.00,1,'2026-03-02T09:05:00Z'),
('00000000-0000-0000-0000-00000000e021','00000000-0000-0000-0000-00000000d018','Deluxe Double Suite (2 pax) — Pretoria to Cape Town',1,77000.00,77000.00,1,'2026-03-08T09:05:00Z'),
('00000000-0000-0000-0000-00000000e022','00000000-0000-0000-0000-00000000d019','Royal Double Suite (2 adults 2 children) — VF Explorer',1,144000.00,144000.00,1,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e023','00000000-0000-0000-0000-00000000d019','Airport transfer VFA + sunset cruise (family)',1,8400.00,8400.00,2,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e024','00000000-0000-0000-0000-00000000d020','Pullman Double Suite (2 pax) — Pretoria to Durban',1,37000.00,37000.00,1,'2026-03-18T09:05:00Z'),
('00000000-0000-0000-0000-00000000e025','00000000-0000-0000-0000-00000000d021','Deluxe Twin Suite (2 pax) — East Africa Expedition',1,165000.00,165000.00,1,'2026-03-26T09:05:00Z'),
('00000000-0000-0000-0000-00000000e026','00000000-0000-0000-0000-00000000d022','Deluxe Double Suite (2 pax) — Pretoria to Cape Town',1,77000.00,77000.00,1,'2026-03-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e027','00000000-0000-0000-0000-00000000d023','Royal Twin Suite (2 pax) — Victoria Falls Explorer',1,110400.00,110400.00,1,'2026-04-01T09:05:00Z'),
('00000000-0000-0000-0000-00000000e028','00000000-0000-0000-0000-00000000d024','Deluxe Double Suite (2 pax) — Namibia Desert Journey',1,110000.00,110000.00,1,'2026-04-03T09:05:00Z'),
('00000000-0000-0000-0000-00000000e029','00000000-0000-0000-0000-00000000d025','Royal Double Suite (2 pax) — Cape Town to Pretoria',1,124000.00,124000.00,1,'2026-04-08T09:05:00Z'),
('00000000-0000-0000-0000-00000000e030','00000000-0000-0000-0000-00000000d026','Deluxe Double Suite (2 pax) — Namibia Desert Journey',1,110000.00,110000.00,1,'2026-04-20T09:05:00Z'),
('00000000-0000-0000-0000-00000000e031','00000000-0000-0000-0000-00000000d027','Pullman Double Suite (2 pax) — Pretoria to Durban',1,37000.00,37000.00,1,'2026-04-23T09:05:00Z'),
('00000000-0000-0000-0000-00000000e032','00000000-0000-0000-0000-00000000d028','Deluxe Twin Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2026-04-25T09:05:00Z'),
('00000000-0000-0000-0000-00000000e033','00000000-0000-0000-0000-00000000d029','Pullman Double Suite (2 pax) — Cape Town to Pretoria',1,49800.00,49800.00,1,'2026-04-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e034','00000000-0000-0000-0000-00000000d030','Royal Double Suite (2 pax) — Pretoria to Cape Town',1,124000.00,124000.00,1,'2026-05-02T09:05:00Z'),
('00000000-0000-0000-0000-00000000e035','00000000-0000-0000-0000-00000000d031','Deluxe Double Suite (2 pax) — Namibia Desert Journey',1,110000.00,110000.00,1,'2026-01-18T09:05:00Z'),
('00000000-0000-0000-0000-00000000e036','00000000-0000-0000-0000-00000000d032','Deluxe Double Suite (2 pax) — Pretoria to Cape Town',1,77000.00,77000.00,1,'2026-02-22T09:05:00Z');

commit;


begin;

-- SECTION 14: INVOICES
insert into public.invoices (id,booking_id,quote_id,kind,status,invoice_number,deposit_percentage,amount,currency,due_date,sent_at,created_at,updated_at) values
('00000000-0000-0000-0000-0000000e0001','00000000-0000-0000-0000-000000009031','00000000-0000-0000-0000-00000000d001','deposit','paid','DEP-2025-000001',25,35600.00,'ZAR','2025-09-09','2025-09-02T09:30:00Z','2025-09-02T09:00:00Z','2025-09-10T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0002','00000000-0000-0000-0000-000000009031','00000000-0000-0000-0000-00000000d001','final','paid','FIN-2025-000001',null,106800.00,'ZAR','2025-09-25','2025-09-15T09:30:00Z','2025-09-15T09:00:00Z','2025-09-28T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0003','00000000-0000-0000-0000-000000009032','00000000-0000-0000-0000-00000000d002','deposit','paid','DEP-2025-000002',25,36750.00,'ZAR','2025-09-12','2025-09-05T09:30:00Z','2025-09-05T09:00:00Z','2025-09-12T14:30:00Z'),
('00000000-0000-0000-0000-0000000e0004','00000000-0000-0000-0000-000000009032','00000000-0000-0000-0000-00000000d002','final','paid','FIN-2025-000002',null,110250.00,'ZAR','2025-09-17','2025-09-08T09:30:00Z','2025-09-08T09:00:00Z','2025-09-20T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0005','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000d003','deposit','paid','DEP-2025-000003',25,41250.00,'ZAR','2025-09-19','2025-09-12T09:30:00Z','2025-09-12T09:00:00Z','2025-09-20T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0006','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000d003','final','paid','FIN-2025-000003',null,123750.00,'ZAR','2025-10-02','2025-09-22T09:30:00Z','2025-09-22T09:00:00Z','2025-10-05T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0007','00000000-0000-0000-0000-000000009034','00000000-0000-0000-0000-00000000d004','deposit','paid','DEP-2025-000004',25,10637.50,'ZAR','2025-09-29','2025-09-22T09:30:00Z','2025-09-22T09:00:00Z','2025-10-01T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0008','00000000-0000-0000-0000-000000009034','00000000-0000-0000-0000-00000000d004','final','paid','FIN-2025-000004',null,31912.50,'ZAR','2025-10-31','2025-10-08T09:30:00Z','2025-10-08T09:00:00Z','2025-11-05T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0009','00000000-0000-0000-0000-000000009035','00000000-0000-0000-0000-00000000d005','deposit','paid','DEP-2025-000005',25,22137.50,'ZAR','2025-10-09','2025-10-02T09:30:00Z','2025-10-02T09:00:00Z','2025-10-10T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0010','00000000-0000-0000-0000-000000009035','00000000-0000-0000-0000-00000000d005','final','paid','FIN-2025-000005',null,66412.50,'ZAR','2025-11-17','2025-11-05T09:30:00Z','2025-11-05T09:00:00Z','2025-11-20T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0011','00000000-0000-0000-0000-000000009028','00000000-0000-0000-0000-00000000d006','deposit','paid','DEP-2025-000006',25,10637.50,'ZAR','2025-11-19','2025-11-12T09:30:00Z','2025-11-12T09:00:00Z','2025-11-20T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0012','00000000-0000-0000-0000-000000009028','00000000-0000-0000-0000-00000000d006','final','paid','FIN-2025-000006',null,31912.50,'ZAR','2026-03-08','2026-02-20T09:30:00Z','2026-02-20T09:00:00Z','2026-03-15T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0013','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000d007','deposit','paid','DEP-2025-000007',25,27887.50,'ZAR','2025-12-02','2025-11-25T09:30:00Z','2025-11-25T09:00:00Z','2025-12-05T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0014','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000d007','final','paid','FIN-2025-000007',null,83662.50,'ZAR','2026-03-21','2026-03-05T09:30:00Z','2026-03-05T09:00:00Z','2026-03-28T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0015','00000000-0000-0000-0000-000000009030','00000000-0000-0000-0000-00000000d008','deposit','paid','DEP-2025-000008',25,22137.50,'ZAR','2025-12-15','2025-12-08T09:30:00Z','2025-12-08T09:00:00Z','2025-12-18T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0016','00000000-0000-0000-0000-000000009030','00000000-0000-0000-0000-00000000d008','final','paid','FIN-2025-000008',null,66412.50,'ZAR','2026-03-28','2026-03-12T09:30:00Z','2026-03-12T09:00:00Z','2026-04-01T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0017','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000d009','deposit','paid','DEP-2025-000009',25,27887.50,'ZAR','2026-01-04','2025-12-20T09:30:00Z','2025-12-20T09:00:00Z','2025-12-28T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0018','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000d009','final','paid','FIN-2025-000009',null,83662.50,'ZAR','2026-04-03','2026-03-20T09:30:00Z','2026-03-20T09:00:00Z','2026-04-10T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0019','00000000-0000-0000-0000-000000009025','00000000-0000-0000-0000-00000000d010','deposit','paid','DEP-2025-000010',25,41250.00,'ZAR','2026-01-12','2026-01-05T09:30:00Z','2026-01-05T09:00:00Z','2026-01-15T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0020','00000000-0000-0000-0000-000000009025','00000000-0000-0000-0000-00000000d010','final','paid','FIN-2025-000010',null,123750.00,'ZAR','2026-04-13','2026-04-01T09:30:00Z','2026-04-01T09:00:00Z','2026-04-20T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0021','00000000-0000-0000-0000-000000009026','00000000-0000-0000-0000-00000000d011','deposit','paid','DEP-2025-000011',25,22137.50,'ZAR','2026-01-23','2026-01-16T09:30:00Z','2026-01-16T09:00:00Z','2026-01-22T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0022','00000000-0000-0000-0000-000000009026','00000000-0000-0000-0000-00000000d011','final','paid','FIN-2025-000011',null,66412.50,'ZAR','2026-04-01','2026-03-22T09:30:00Z','2026-03-22T09:00:00Z','2026-04-08T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0023','00000000-0000-0000-0000-000000009027','00000000-0000-0000-0000-00000000d012','deposit','paid','DEP-2026-000012',25,31625.00,'ZAR','2026-01-25','2026-01-22T09:30:00Z','2026-01-22T09:00:00Z','2026-01-28T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0024','00000000-0000-0000-0000-000000009027','00000000-0000-0000-0000-00000000d012','final','paid','FIN-2026-000012',null,94875.00,'ZAR','2026-04-22','2026-04-08T09:30:00Z','2026-04-08T09:00:00Z','2026-04-25T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0025','00000000-0000-0000-0000-000000009020','00000000-0000-0000-0000-00000000d013','deposit','paid','DEP-2026-000014',25,31625.00,'ZAR','2026-02-09','2026-02-06T09:30:00Z','2026-02-06T09:00:00Z','2026-02-12T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0026','00000000-0000-0000-0000-000000009020','00000000-0000-0000-0000-00000000d013','final','sent','FIN-2026-000014',null,94875.00,'ZAR','2026-05-21','2026-04-28T09:30:00Z','2026-04-28T09:00:00Z','2026-04-28T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0027','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000d014','deposit','paid','DEP-2026-000015',25,27887.50,'ZAR','2026-02-15','2026-02-12T09:30:00Z','2026-02-12T09:00:00Z','2026-02-18T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0028','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000d014','final','sent','FIN-2026-000015',null,83662.50,'ZAR','2026-05-28','2026-05-05T09:30:00Z','2026-05-05T09:00:00Z','2026-05-05T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0029','00000000-0000-0000-0000-000000009022','00000000-0000-0000-0000-00000000d015','deposit','paid','DEP-2026-000016',25,35650.00,'ZAR','2026-02-23','2026-02-22T09:30:00Z','2026-02-22T09:00:00Z','2026-02-26T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0030','00000000-0000-0000-0000-000000009022','00000000-0000-0000-0000-00000000d015','final','sent','FIN-2026-000016',null,106950.00,'ZAR','2026-05-15','2026-05-01T09:30:00Z','2026-05-01T09:00:00Z','2026-05-01T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0031','00000000-0000-0000-0000-000000009023','00000000-0000-0000-0000-00000000d016','deposit','paid','DEP-2026-000017',25,14317.50,'ZAR','2026-03-05','2026-03-01T09:30:00Z','2026-03-01T09:00:00Z','2026-03-08T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0032','00000000-0000-0000-0000-000000009023','00000000-0000-0000-0000-00000000d016','final','sent','FIN-2026-000017',null,42952.50,'ZAR','2026-07-18','2026-06-01T09:30:00Z','2026-06-01T09:00:00Z','2026-06-01T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0033','00000000-0000-0000-0000-000000009016','00000000-0000-0000-0000-00000000d017','deposit','sent','DEP-2026-000019',25,47437.50,'ZAR','2026-03-21','2026-03-14T09:30:00Z','2026-03-14T09:00:00Z','2026-03-14T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0034','00000000-0000-0000-0000-000000009017','00000000-0000-0000-0000-00000000d018','deposit','sent','DEP-2026-000020',25,22137.50,'ZAR','2026-03-29','2026-03-22T09:30:00Z','2026-03-22T09:00:00Z','2026-03-22T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0035','00000000-0000-0000-0000-000000009018','00000000-0000-0000-0000-00000000d019','deposit','sent','DEP-2026-000021',25,43815.00,'ZAR','2026-04-01','2026-03-25T09:30:00Z','2026-03-25T09:00:00Z','2026-03-25T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0036','00000000-0000-0000-0000-000000009019','00000000-0000-0000-0000-00000000d020','deposit','sent','DEP-2026-000022',25,10637.50,'ZAR','2026-04-06','2026-03-30T09:30:00Z','2026-03-30T09:00:00Z','2026-03-30T09:30:00Z');

commit;


begin;

-- SECTION 15: PAYMENTS
insert into public.payments (id,booking_id,amount,method,reference,notes,received_at,created_at) values
('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-000000009031',35600.00,'EFT','EFT-TAY-DEP-001','Deposit payment 25%','2025-09-10T11:00:00Z','2025-09-10T11:00:00Z'),
('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-000000009031',106800.00,'Credit Card','CC-TAY-FIN-001','Final balance settlement','2025-09-28T15:00:00Z','2025-09-28T15:00:00Z'),
('00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-000000009032',36750.00,'Bank Transfer','BT-CHE-DEP-001','Deposit — East Africa Expedition','2025-09-12T14:00:00Z','2025-09-12T14:00:00Z'),
('00000000-0000-0000-0000-00000000f004','00000000-0000-0000-0000-000000009032',110250.00,'EFT','EFT-CHE-FIN-001','Final balance — East Africa Expedition','2025-09-20T15:00:00Z','2025-09-20T15:00:00Z'),
('00000000-0000-0000-0000-00000000f005','00000000-0000-0000-0000-000000009033',41250.00,'Bank Transfer','BT-MIT-DEP-001','Deposit — Victoria Falls Explorer VIP','2025-09-20T11:00:00Z','2025-09-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000f006','00000000-0000-0000-0000-000000009033',123750.00,'Credit Card','CC-MIT-FIN-001','Final payment — Victoria Falls Explorer','2025-10-05T15:00:00Z','2025-10-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000f007','00000000-0000-0000-0000-000000009034',10637.50,'Cash','CASH-MUL-DEP-001','Cash deposit — Durban Coastal Escape','2025-10-01T11:00:00Z','2025-10-01T11:00:00Z'),
('00000000-0000-0000-0000-00000000f008','00000000-0000-0000-0000-000000009034',31912.50,'EFT','EFT-MUL-FIN-001','Final balance — Durban Coastal Escape','2025-11-05T15:00:00Z','2025-11-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000f009','00000000-0000-0000-0000-000000009035',22137.50,'EFT','EFT-NAI-DEP-001','Deposit — Cape Town Classic','2025-10-10T11:00:00Z','2025-10-10T11:00:00Z'),
('00000000-0000-0000-0000-00000000f010','00000000-0000-0000-0000-000000009035',66412.50,'Credit Card','CC-NAI-FIN-001','Final balance — Cape Town Classic','2025-11-20T15:00:00Z','2025-11-20T15:00:00Z'),
('00000000-0000-0000-0000-00000000f011','00000000-0000-0000-0000-000000009028',10637.50,'EFT','EFT-ROS-DEP-001','Deposit — Durban to Pretoria','2025-11-20T11:00:00Z','2025-11-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000f012','00000000-0000-0000-0000-000000009028',31912.50,'Bank Transfer','BT-ROS-FIN-001','Final balance — Durban to Pretoria','2026-03-15T15:00:00Z','2026-03-15T15:00:00Z'),
('00000000-0000-0000-0000-00000000f013','00000000-0000-0000-0000-000000009029',27887.50,'Credit Card','CC-JOH-DEP-001','Deposit — Victoria Falls Explorer','2025-12-05T11:00:00Z','2025-12-05T11:00:00Z'),
('00000000-0000-0000-0000-00000000f014','00000000-0000-0000-0000-000000009029',83662.50,'EFT','EFT-JOH-FIN-001','Final balance — Victoria Falls Explorer','2026-03-28T15:00:00Z','2026-03-28T15:00:00Z'),
('00000000-0000-0000-0000-00000000f015','00000000-0000-0000-0000-000000009030',22137.50,'Bank Transfer','BT-KRU-DEP-001','Deposit — Cape Town Classic','2025-12-18T11:00:00Z','2025-12-18T11:00:00Z'),
('00000000-0000-0000-0000-00000000f016','00000000-0000-0000-0000-000000009030',66412.50,'Credit Card','CC-KRU-FIN-001','Final balance — Cape Town Classic','2026-04-01T15:00:00Z','2026-04-01T15:00:00Z'),
('00000000-0000-0000-0000-00000000f017','00000000-0000-0000-0000-000000009024',27887.50,'EFT','EFT-BEA-DEP-001','Deposit — Victoria Falls Explorer','2025-12-28T11:00:00Z','2025-12-28T11:00:00Z'),
('00000000-0000-0000-0000-00000000f018','00000000-0000-0000-0000-000000009024',83662.50,'Bank Transfer','BT-BEA-FIN-001','Final balance — Victoria Falls Explorer','2026-04-10T15:00:00Z','2026-04-10T15:00:00Z'),
('00000000-0000-0000-0000-00000000f019','00000000-0000-0000-0000-000000009025',41250.00,'Bank Transfer','BT-ALR-DEP-001','Deposit — East Africa Expedition VIP','2026-01-15T11:00:00Z','2026-01-15T11:00:00Z'),
('00000000-0000-0000-0000-00000000f020','00000000-0000-0000-0000-000000009025',123750.00,'EFT','EFT-ALR-FIN-001','Final balance — East Africa Expedition','2026-04-20T15:00:00Z','2026-04-20T15:00:00Z'),
('00000000-0000-0000-0000-00000000f021','00000000-0000-0000-0000-000000009026',22137.50,'Credit Card','CC-CHE2-DEP-001','Deposit — Cape Town Classic','2026-01-22T11:00:00Z','2026-01-22T11:00:00Z'),
('00000000-0000-0000-0000-00000000f022','00000000-0000-0000-0000-000000009026',66412.50,'EFT','EFT-CHE2-FIN-001','Final balance — Cape Town Classic','2026-04-08T15:00:00Z','2026-04-08T15:00:00Z'),
('00000000-0000-0000-0000-00000000f023','00000000-0000-0000-0000-000000009027',31625.00,'EFT','EFT-DUP-DEP-001','Deposit — Namibia Desert Journey','2026-01-28T11:00:00Z','2026-01-28T11:00:00Z'),
('00000000-0000-0000-0000-00000000f024','00000000-0000-0000-0000-000000009027',94875.00,'Bank Transfer','BT-DUP-FIN-001','Final balance — Namibia Desert Journey','2026-04-25T15:00:00Z','2026-04-25T15:00:00Z'),
('00000000-0000-0000-0000-00000000f025','00000000-0000-0000-0000-000000009020',31625.00,'EFT','EFT-WOR-DEP-001','Deposit 25% — Namibia Desert Journey','2026-02-12T11:00:00Z','2026-02-12T11:00:00Z'),
('00000000-0000-0000-0000-00000000f026','00000000-0000-0000-0000-000000009021',27887.50,'Bank Transfer','BT-VDB-DEP-001','Deposit 25% — Victoria Falls Explorer','2026-02-18T11:00:00Z','2026-02-18T11:00:00Z'),
('00000000-0000-0000-0000-00000000f027','00000000-0000-0000-0000-000000009022',35650.00,'Credit Card','CC-MIT2-DEP-001','Deposit 25% — Cape Town Classic VIP','2026-02-26T11:00:00Z','2026-02-26T11:00:00Z'),
('00000000-0000-0000-0000-00000000f028','00000000-0000-0000-0000-000000009023',14317.50,'EFT','EFT-MUL2-DEP-001','Deposit 25% — Cape Town Classic','2026-03-08T11:00:00Z','2026-03-08T11:00:00Z'),
('00000000-0000-0000-0000-00000000f029','00000000-0000-0000-0000-000000009031',-1800.00,'Credit Adjustment','ADJ-TAY-001','Credit for cancelled Winelands tour (weather)','2025-10-20T10:00:00Z','2025-10-20T10:00:00Z'),
('00000000-0000-0000-0000-00000000f030','00000000-0000-0000-0000-000000009034',3000.00,'Cash','CASH-MUL-ADD-001','Additional cash — luggage supplement','2025-11-05T12:00:00Z','2025-11-05T12:00:00Z');

-- SECTION 16: DOCUMENTS
insert into public.documents (id,booking_id,kind,status,storage_path,created_at) values
('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-000000009031','quote_pdf','generated','documents/quotes/RR-2025-0001.pdf','2025-08-18T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-000000009031','invoice_pdf','generated','documents/invoices/DEP-2025-000001.pdf','2025-09-02T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-000000009031','voucher_pdf','generated','documents/vouchers/RR-2025-0001.pdf','2025-10-05T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-000000009033','quote_pdf','generated','documents/quotes/RR-2025-0003.pdf','2025-08-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-000000009033','invoice_pdf','generated','documents/invoices/DEP-2025-000003.pdf','2025-09-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa06','00000000-0000-0000-0000-000000009033','voucher_pdf','generated','documents/vouchers/RR-2025-0003.pdf','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa07','00000000-0000-0000-0000-000000009028','quote_pdf','generated','documents/quotes/RR-2025-0006.pdf','2025-10-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa08','00000000-0000-0000-0000-000000009028','invoice_pdf','generated','documents/invoices/DEP-2025-000006.pdf','2025-11-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa09','00000000-0000-0000-0000-000000009028','voucher_pdf','generated','documents/vouchers/RR-2025-0006.pdf','2026-04-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa10','00000000-0000-0000-0000-000000009029','quote_pdf','generated','documents/quotes/RR-2025-0007.pdf','2025-11-10T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa11','00000000-0000-0000-0000-000000009029','voucher_pdf','generated','documents/vouchers/RR-2025-0007.pdf','2026-05-01T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa12','00000000-0000-0000-0000-000000009030','quote_pdf','generated','documents/quotes/RR-2025-0008.pdf','2025-11-22T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa13','00000000-0000-0000-0000-000000009030','voucher_pdf','generated','documents/vouchers/RR-2025-0008.pdf','2026-04-30T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa14','00000000-0000-0000-0000-000000009022','quote_pdf','generated','documents/quotes/RR-2026-0016.pdf','2026-02-10T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa15','00000000-0000-0000-0000-000000009022','invoice_pdf','generated','documents/invoices/DEP-2026-000016.pdf','2026-02-22T09:30:00Z');

-- SECTION 17: CORRESPONDENCES (6 scheduled follow-ups for dashboard widget)
insert into public.correspondences (id,booking_id,channel,kind,subject,body_html,status,sent_at,scheduled_at,created_at) values
('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-000000009031','email','quote_email','Your Rovos Rail Quote — RR-2025-0001','<p>Dear Elizabeth, please find your quotation attached.</p>','sent','2025-08-18T09:30:00Z',null,'2025-08-18T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb02','00000000-0000-0000-0000-000000009033','email','quote_email','Your Rovos Rail Quote — RR-2025-0003','<p>Dear James, please find your quotation attached.</p>','sent','2025-08-28T09:30:00Z',null,'2025-08-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb03','00000000-0000-0000-0000-000000009026','email','quote_email','Your Rovos Rail Quote — RR-2025-0011','<p>Dear Robert, your Cape Town Classic quotation is attached.</p>','sent','2026-01-02T09:30:00Z',null,'2026-01-02T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb04','00000000-0000-0000-0000-000000009022','email','quote_email','Your Rovos Rail Quote — RR-2026-0016','<p>Dear James, your quotation for the May departure is attached.</p>','sent','2026-02-10T09:30:00Z',null,'2026-02-10T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb05','00000000-0000-0000-0000-000000009017','email','quote_email','Your Rovos Rail Quote — RR-2026-0020','<p>Dear Marco, your Cape Town Classic quotation is attached.</p>','sent','2026-03-08T09:30:00Z',null,'2026-03-08T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb06','00000000-0000-0000-0000-000000009031','email','deposit_request','Deposit Invoice — RR-2025-0001','<p>Dear Elizabeth, your deposit invoice is attached.</p>','sent','2025-09-02T09:30:00Z',null,'2025-09-02T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb07','00000000-0000-0000-0000-000000009033','email','deposit_request','Deposit Invoice — RR-2025-0003','<p>Dear James, your deposit invoice is attached.</p>','sent','2025-09-12T09:30:00Z',null,'2025-09-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb08','00000000-0000-0000-0000-000000009016','email','deposit_request','Deposit Invoice — RR-2026-0019','<p>Dear Dr van Niekerk, your deposit invoice is attached.</p>','sent','2026-03-14T09:30:00Z',null,'2026-03-14T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-000000009017','email','deposit_request','Deposit Invoice — RR-2026-0020','<p>Dear Marco, your deposit invoice is attached.</p>','sent','2026-03-22T09:30:00Z',null,'2026-03-22T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb10','00000000-0000-0000-0000-000000009018','email','deposit_request','Deposit Invoice — RR-2026-0021','<p>Dear Elizabeth, your deposit invoice is attached.</p>','sent','2026-03-25T09:30:00Z',null,'2026-03-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb11','00000000-0000-0000-0000-000000009019','email','deposit_request','Deposit Invoice — RR-2026-0022','<p>Dear David, your deposit invoice is attached.</p>','sent','2026-03-30T09:30:00Z',null,'2026-03-30T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb12','00000000-0000-0000-0000-000000009028','email','voucher_email','Your Travel Voucher — RR-2025-0006','<p>Dear Marco, your travel voucher is attached. Enjoy your journey!</p>','sent','2026-04-28T09:30:00Z',null,'2026-04-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb13','00000000-0000-0000-0000-000000009029','email','voucher_email','Your Travel Voucher — RR-2025-0007','<p>Dear Henrik, your travel voucher is attached.</p>','sent','2026-05-01T09:30:00Z',null,'2026-05-01T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb14','00000000-0000-0000-0000-000000009030','email','voucher_email','Your Travel Voucher — RR-2025-0008','<p>Dear David, your travel voucher is ready. Bon voyage!</p>','sent','2026-04-30T09:30:00Z',null,'2026-04-30T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb15','00000000-0000-0000-0000-000000009006','email','follow_up','Following up on your Namibia enquiry — RR-2026-0028','<p>Dear Thomas, we are following up on your Namibia Desert Journey quote.</p>','scheduled',null,'2026-05-20T09:00:00Z','2026-05-14T09:00:00Z'),
('00000000-0000-0000-0000-00000000bb16','00000000-0000-0000-0000-000000009007','email','follow_up','Following up on your Durban quote — RR-2026-0029','<p>Dear Marie, we are following up on your Durban Coastal Escape quote.</p>','scheduled',null,'2026-05-22T09:00:00Z','2026-05-14T09:00:00Z'),
('00000000-0000-0000-0000-00000000bb17','00000000-0000-0000-0000-000000009008','email','follow_up','Following up on your Victoria Falls quote — RR-2026-0030','<p>Dear Sarah, we are following up on your Victoria Falls Explorer quotation.</p>','scheduled',null,'2026-05-24T09:00:00Z','2026-05-14T09:00:00Z'),
('00000000-0000-0000-0000-00000000bb18','00000000-0000-0000-0000-000000009009','email','follow_up','Following up on your Cape Town quote — RR-2026-0031','<p>Dear Chloe, we are following up on your Cape Town Classic quotation.</p>','scheduled',null,'2026-05-27T09:00:00Z','2026-05-14T09:00:00Z'),
('00000000-0000-0000-0000-00000000bb19','00000000-0000-0000-0000-000000009016','email','follow_up','Deposit reminder — RR-2026-0019','<p>Dear Dr van Niekerk, a friendly reminder your deposit invoice is due.</p>','scheduled',null,'2026-05-21T09:00:00Z','2026-05-14T09:00:00Z'),
('00000000-0000-0000-0000-00000000bb20','00000000-0000-0000-0000-000000009017','email','follow_up','Deposit reminder — RR-2026-0020','<p>Dear Marco, a gentle reminder your deposit is outstanding.</p>','scheduled',null,'2026-06-05T09:00:00Z','2026-05-14T09:00:00Z');

-- SECTION 18: PIPELINE HISTORY
insert into public.pipeline_history (id,booking_id,from_stage,to_stage,moved_by,moved_by_user_id,moved_at) values
('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-000000009031','enquiry','quote_sent','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-08-18T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc02','00000000-0000-0000-0000-000000009031','quote_sent','accepted','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-08-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc03','00000000-0000-0000-0000-000000009031','accepted','deposit_requested','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-09-02T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc04','00000000-0000-0000-0000-000000009031','deposit_requested','deposit_paid','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-09-10T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc05','00000000-0000-0000-0000-000000009031','deposit_paid','final_paid','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-09-28T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc06','00000000-0000-0000-0000-000000009031','final_paid','voucher_sent','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-10-05T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc07','00000000-0000-0000-0000-000000009031','voucher_sent','closed','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2025-11-01T10:00:00Z'),
('00000000-0000-0000-0000-00000000cc08','00000000-0000-0000-0000-000000009032','enquiry','quote_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-08-22T10:00:00Z'),
('00000000-0000-0000-0000-00000000cc09','00000000-0000-0000-0000-000000009032','quote_sent','accepted','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-09-01T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc10','00000000-0000-0000-0000-000000009032','accepted','deposit_requested','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-09-05T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc11','00000000-0000-0000-0000-000000009032','deposit_requested','deposit_paid','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-09-12T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc12','00000000-0000-0000-0000-000000009032','deposit_paid','final_paid','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-09-20T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc13','00000000-0000-0000-0000-000000009032','final_paid','voucher_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-09-25T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc14','00000000-0000-0000-0000-000000009032','voucher_sent','closed','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-11-20T10:00:00Z'),
('00000000-0000-0000-0000-00000000cc15','00000000-0000-0000-0000-000000009033','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-08-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc16','00000000-0000-0000-0000-000000009033','quote_sent','accepted','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc17','00000000-0000-0000-0000-000000009033','accepted','deposit_requested','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-12T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc18','00000000-0000-0000-0000-000000009033','deposit_requested','deposit_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc19','00000000-0000-0000-0000-000000009033','deposit_paid','final_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-10-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc20','00000000-0000-0000-0000-000000009033','final_paid','voucher_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc21','00000000-0000-0000-0000-000000009033','voucher_sent','closed','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-12-01T10:00:00Z'),
('00000000-0000-0000-0000-00000000cc22','00000000-0000-0000-0000-000000009028','enquiry','quote_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc23','00000000-0000-0000-0000-000000009028','quote_sent','accepted','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-11-07T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc24','00000000-0000-0000-0000-000000009028','accepted','deposit_requested','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-11-12T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc25','00000000-0000-0000-0000-000000009028','deposit_requested','deposit_paid','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2025-11-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc26','00000000-0000-0000-0000-000000009028','deposit_paid','final_paid','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-03-15T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc27','00000000-0000-0000-0000-000000009028','final_paid','voucher_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-04-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc28','00000000-0000-0000-0000-000000009030','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-11-22T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc29','00000000-0000-0000-0000-000000009030','quote_sent','accepted','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-12-02T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc30','00000000-0000-0000-0000-000000009030','accepted','deposit_requested','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-12-08T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc31','00000000-0000-0000-0000-000000009030','deposit_requested','deposit_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-12-18T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc32','00000000-0000-0000-0000-000000009030','deposit_paid','final_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-04-01T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc33','00000000-0000-0000-0000-000000009030','final_paid','voucher_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-04-30T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc34','00000000-0000-0000-0000-000000009022','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-02-10T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc35','00000000-0000-0000-0000-000000009022','quote_sent','accepted','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-02-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc36','00000000-0000-0000-0000-000000009022','accepted','deposit_requested','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-02-22T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc37','00000000-0000-0000-0000-000000009022','deposit_requested','deposit_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-02-26T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc38','00000000-0000-0000-0000-000000009017','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-03-08T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc39','00000000-0000-0000-0000-000000009017','quote_sent','accepted','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-03-18T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc40','00000000-0000-0000-0000-000000009017','accepted','deposit_requested','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-03-22T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc41','00000000-0000-0000-0000-000000009012','enquiry','quote_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-03-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc42','00000000-0000-0000-0000-000000009012','quote_sent','accepted','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-04-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc43','00000000-0000-0000-0000-000000009036','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-01-18T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc44','00000000-0000-0000-0000-000000009036','quote_sent','lost','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2026-01-30T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc45','00000000-0000-0000-0000-000000009037','enquiry','quote_sent','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2026-02-22T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc46','00000000-0000-0000-0000-000000009037','quote_sent','accepted','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2026-03-02T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc47','00000000-0000-0000-0000-000000009037','accepted','lost','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','2026-03-10T09:00:00Z');

-- SECTION 19: AUDIT LOGS
insert into public.audit_logs (id,actor,actor_user_id,entity_type,entity_id,action,before_json,after_json,meta_json,created_at) values
('00000000-0000-0000-0000-00000000dd01','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','Booking','00000000-0000-0000-0000-000000009031','stage_change','{"stage":"enquiry"}'::jsonb,'{"stage":"quote_sent"}'::jsonb,null,'2025-08-18T09:00:00Z'),
('00000000-0000-0000-0000-00000000dd02','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','Booking','00000000-0000-0000-0000-000000009031','stage_change','{"stage":"quote_sent"}'::jsonb,'{"stage":"accepted"}'::jsonb,null,'2025-08-28T14:00:00Z'),
('00000000-0000-0000-0000-00000000dd03','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','Booking','00000000-0000-0000-0000-000000009032','stage_change','{"stage":"voucher_sent"}'::jsonb,'{"stage":"closed"}'::jsonb,null,'2025-11-20T10:00:00Z'),
('00000000-0000-0000-0000-00000000dd04','Leonie Botha','00000000-0000-0000-0000-0000000000a2','Booking','00000000-0000-0000-0000-000000009033','stage_change','{"stage":"final_paid"}'::jsonb,'{"stage":"voucher_sent"}'::jsonb,null,'2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000dd05','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','Payment','00000000-0000-0000-0000-00000000f029','credit_adjustment',null,null,'{"amount":-1800,"reason":"Tour cancelled due to weather"}'::jsonb,'2025-10-20T10:00:00Z'),
('00000000-0000-0000-0000-00000000dd06','Leonie Botha','00000000-0000-0000-0000-0000000000a2','Booking','00000000-0000-0000-0000-000000009022','stage_change','{"stage":"deposit_requested"}'::jsonb,'{"stage":"deposit_paid"}'::jsonb,null,'2026-02-26T11:00:00Z'),
('00000000-0000-0000-0000-00000000dd07','Dirk Rossouw','00000000-0000-0000-0000-0000000000a3','Booking','00000000-0000-0000-0000-000000009037','stage_change','{"stage":"accepted"}'::jsonb,'{"stage":"lost"}'::jsonb,'{"cancel_reason":"Client chose a competitor"}'::jsonb,'2026-03-10T09:00:00Z'),
('00000000-0000-0000-0000-00000000dd08','system',null,'Booking','00000000-0000-0000-0000-000000009001','created_from_web_form',null,null,'{"source":"web_form"}'::jsonb,'2026-05-10T10:00:00Z'),
('00000000-0000-0000-0000-00000000dd09','system',null,'Booking','00000000-0000-0000-0000-000000009005','created_from_travel_agent',null,null,'{"source":"travel_agent","agent":"Luxury Japan Travel"}'::jsonb,'2026-05-14T10:00:00Z'),
('00000000-0000-0000-0000-00000000dd10','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','Booking','00000000-0000-0000-0000-000000009030','stage_change','{"stage":"final_paid"}'::jsonb,'{"stage":"voucher_sent"}'::jsonb,null,'2026-04-30T09:00:00Z');

-- SECTION 20: REPORT SNAPSHOT
insert into public.report_snapshots (id,period_start,period_end,metrics,created_at) values
('00000000-0000-0000-0000-00000000ee01','2025-08-01','2026-04-30','{"bookings":37,"closed":5,"lost":2,"voucher_sent":3,"final_paid":4,"deposit_paid":4,"deposit_requested":4,"accepted":5,"quote_sent":5,"enquiry":5,"totalRevenue":1427230,"pipelineValue":510020,"outstandingBalance":824550,"conversionRate":15.6}'::jsonb,'2026-05-01T06:00:00Z');

-- SECTION 21: BOOKING NUMBER SEQUENCES
insert into public.booking_number_sequences (product_code, year, last_number)
select
  parsed.product_code,
  parsed.year,
  max(parsed.sequence_number)
from (
  select
    substring(booking_number from '^([A-Z]+)-') as product_code,
    substring(booking_number from '^[A-Z]+-([0-9]{4})-')::integer as year,
    substring(booking_number from '^[A-Z]+-[0-9]{4}-([0-9]+)$')::integer as sequence_number
  from public.bookings
  where booking_number ~ '^(BT|RR|REV)-[0-9]{4}-[0-9]{4}$'
) parsed
group by parsed.product_code, parsed.year
on conflict (product_code, year)
do update set
  last_number = greatest(public.booking_number_sequences.last_number, excluded.last_number);

-- SECTION 22: OUTCOME REASONS
insert into public.outcome_reasons (id, label, applies_to, active, created_at) values
  ('00000000-0000-0000-aa01-000000000001', 'Price too high',            'Lost',      true, now()),
  ('00000000-0000-0000-aa01-000000000002', 'Date conflict',             'Lost',      true, now()),
  ('00000000-0000-0000-aa01-000000000003', 'Chose competitor',          'Lost',      true, now()),
  ('00000000-0000-0000-aa01-000000000004', 'No response',               'Lost',      true, now()),
  ('00000000-0000-0000-aa01-000000000005', 'Other',                     'Lost',      true, now()),
  ('00000000-0000-0000-aa01-000000000006', 'Customer cancelled',        'Cancelled', true, now()),
  ('00000000-0000-0000-aa01-000000000007', 'Trip cancelled by supplier','Cancelled', true, now()),
  ('00000000-0000-0000-aa01-000000000008', 'Payment failed',            'Cancelled', true, now()),
  ('00000000-0000-0000-aa01-000000000009', 'Schedule changed',          'Cancelled', true, now()),
  ('00000000-0000-0000-aa01-000000000010', 'Other',                     'Cancelled', true, now())
on conflict (id) do update set
  label = excluded.label,
  applies_to = excluded.applies_to,
  active = excluded.active;

-- ============================================================
-- SECTION 23: VOUCHERS (sample voucher + service blocks)
insert into public.vouchers (id, booking_id, voucher_number, pdf_document_id, generated_at, sent_at, created_by, created_at)
values
  ('00000000-0000-0000-ee01-000000000001',
   '00000000-0000-0000-0000-000000009030',
   'RR-2025-0008',
   '00000000-0000-0000-0000-00000000aa13',
   '2026-04-30T09:00:00Z',
   '2026-04-30T09:30:00Z',
   '00000000-0000-0000-0000-0000000000a2',
   '2026-04-30T09:00:00Z')
on conflict (booking_id) do update set
  voucher_number = excluded.voucher_number,
  pdf_document_id = excluded.pdf_document_id,
  generated_at = excluded.generated_at,
  sent_at = excluded.sent_at;

insert into public.voucher_service_blocks (id, voucher_id, service_type, supplier_id, title, supplier_reference, contact_details, service_data, display_order, created_at)
values
  ('00000000-0000-0000-ee02-000000000001',
   '00000000-0000-0000-ee01-000000000001',
   'train',
   '00000000-0000-0000-0000-000000002001',
   'Rovos Rail Journey',
   'RR-2025-0008',
   '{"name":"Rovos Rail","phone":"+27 12 315 8242","email":"reservations@rovos.com","location":"Pretoria, South Africa"}'::jsonb,
   '{"route":"Pretoria to Cape Town","suiteType":"Royal Suite","departureDate":"2026-05-16","mealPlan":"Full Board"}'::jsonb,
   0,
   '2026-04-30T09:00:00Z')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 12: INTERNAL BOOKING NOTES (demo data)
-- ============================================================
insert into public.booking_notes (id, booking_id, author_id, body, created_at, updated_at) values
  ('00000000-0000-0000-bb01-000000000001',
   '00000000-0000-0000-0000-000000009030',
   '00000000-0000-0000-0000-0000000000a2',
   'Client requested early check-in at hotel — confirmed with hotel concierge.',
   '2026-04-15T10:00:00Z','2026-04-15T10:00:00Z'),
  ('00000000-0000-0000-bb01-000000000002',
   '00000000-0000-0000-0000-000000009030',
   '00000000-0000-0000-0000-0000000000a1',
   'Final paperwork mailed via courier on 2026-04-29.',
   '2026-04-29T14:00:00Z','2026-04-29T14:00:00Z')
on conflict (id) do nothing;

commit;

