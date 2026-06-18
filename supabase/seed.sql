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
   0,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002011','Sheraton Pretoria Hotel','sheraton-pretoria-hotel','hotel_property',
   'reservations@sheratonpretoria.co.za','+27124298000','https://www.marriott.com/sheraton-pretoria',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Landmark five-star hotel overlooking the Union Buildings. Spacious rooms and a polished pre-departure base in the capital.',
   'Reliable larger-group option. 20 minutes from Rovos Rail station. Good corporate rates.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002012','Villa Sterne Boutique Hotel','villa-sterne-boutique-hotel','hotel_property',
   'reservations@villasterne.co.za','+27124405281','https://www.villasterne.com',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Intimate art-filled boutique hotel in leafy Waterkloof. Suites, spa, and fine dining for a refined pre-departure overnight.',
   'Boutique scale, high personal service. Preferred by couples and VIP clients.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002013','Castello di Monte','castello-di-monte','hotel_property',
   'reservations@castellodimonte.co.za','+27123484467','https://www.castellodimonte.co.za',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'Tuscan-style luxury boutique hotel in Waterkloof Ridge with panoramic city views. Elegant suites and award-winning hospitality.',
   'Quiet, upscale setting. Good for guests wanting privacy before the journey.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002014','First Car Rental','first-car-rental','vehicle_rental',
   'reservations@firstcarrental.co.za','+27861173727','https://www.firstcarrental.co.za',
   'Pretoria','00000000-0000-0000-0000-000000001001',
   'National self-drive car rental with a premium fleet. Nationwide branch network and airport collection points.',
   'Self-drive option for guests extending their stay. Premium and SUV classes available.',
   0,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002015','Cape Executive Transfers','cape-executive-transfers','transfers',
   'bookings@capeexecutivetransfers.co.za','+27214180000','https://www.capeexecutivetransfers.co.za',
   'Cape Town','00000000-0000-0000-0000-000000001002',
   'Private chauffeured transfers and drop-offs across the Cape. Airport, hotel, and station runs in luxury vehicles.',
   'Preferred ground transfer partner in Cape Town. Meet-and-greet and luggage handling included.',
   0,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002016','Mount Nelson, A Belmond Hotel','mount-nelson-a-belmond-hotel','hotel_property',
   'reservations.mnh@belmond.com','+27214831000','https://www.belmond.com/mount-nelson',
   'Cape Town','00000000-0000-0000-0000-000000001002',
   'Iconic ''Pink Lady'' set in nine acres of gardens beneath Table Mountain. A Cape Town institution since 1899.',
   'Flagship Cape Town stay. Book early for peak season. Famous afternoon tea.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002017','The Silo Hotel','the-silo-hotel','hotel_property',
   'reservations@thesilohotel.com','+27246700000','https://www.theroyalportfolio.com/the-silo',
   'Cape Town','00000000-0000-0000-0000-000000001002',
   'Dramatic luxury hotel built into a converted grain silo above the Zeitz MOCAA museum at the V&A Waterfront.',
   'High-demand design hotel. Rooftop bar and harbour views. Limited rooms — confirm early.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002018','Cape Grace','cape-grace','hotel_property',
   'reservations@capegrace.com','+27214107100','https://www.capegrace.com',
   'Cape Town','00000000-0000-0000-0000-000000001002',
   'Elegant waterfront hotel on a private quay at the V&A Waterfront, with renowned whisky bar and personal service.',
   'Classic luxury waterfront stay. Walking distance to shops and harbour cruises.',
   50,true,'2025-08-10T08:05:00Z','2025-08-10T08:05:00Z'),
  ('00000000-0000-0000-0000-000000002019','Cape Peninsula Tours','cape-peninsula-tours','tour_operator',
   'reservations@capepeninsulatours.co.za','+27214550000','https://www.capepeninsulatours.co.za',
   'Cape Town','00000000-0000-0000-0000-000000001002',
   'Specialist Cape Peninsula day-tour operator. Cape Point, Boulders Beach penguins, Chapman''s Peak Drive, and Table Mountain — shared and private options.',
   'Strong guest reviews for the penguin colony visit. Preferred add-on for Cape Town Classic arrivals alongside Winelands Excursions.',
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
  '00000000-0000-0000-0000-000000002009','00000000-0000-0000-0000-000000002010',
  '00000000-0000-0000-0000-000000002011','00000000-0000-0000-0000-000000002012',
  '00000000-0000-0000-0000-000000002013','00000000-0000-0000-0000-000000002014',
  '00000000-0000-0000-0000-000000002015','00000000-0000-0000-0000-000000002016',
  '00000000-0000-0000-0000-000000002017','00000000-0000-0000-0000-000000002018',
  '00000000-0000-0000-0000-000000002019'
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
  ('00000000-0000-0000-0000-000000002113','00000000-0000-0000-0000-000000002009','bookings@winelandsexcursions.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002114','00000000-0000-0000-0000-000000002011','reservations@sheratonpretoria.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002115','00000000-0000-0000-0000-000000002012','reservations@villasterne.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002116','00000000-0000-0000-0000-000000002013','reservations@castellodimonte.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002117','00000000-0000-0000-0000-000000002014','reservations@firstcarrental.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002118','00000000-0000-0000-0000-000000002015','bookings@capeexecutivetransfers.co.za','Operations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002119','00000000-0000-0000-0000-000000002016','reservations.mnh@belmond.com','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002120','00000000-0000-0000-0000-000000002016','concierge.mnh@belmond.com','Concierge','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002121','00000000-0000-0000-0000-000000002017','reservations@thesilohotel.com','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002122','00000000-0000-0000-0000-000000002017','concierge@thesilohotel.com','Concierge','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002123','00000000-0000-0000-0000-000000002018','reservations@capegrace.com','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002126','00000000-0000-0000-0000-000000002009','ops@winelandsexcursions.co.za','Operations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002127','00000000-0000-0000-0000-000000002009','accounts@winelandsexcursions.co.za','Accounts','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002128','00000000-0000-0000-0000-000000002019','reservations@capepeninsulatours.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002129','00000000-0000-0000-0000-000000002019','ops@capepeninsulatours.co.za','Operations','2025-08-10T08:10:00Z')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 5: RAIL INFRASTRUCTURE (suite types, routes, rate cards)
-- ============================================================

-- Suite types: one priced row per real commercial unit; variant attributes live in
-- per-supplier vocabulary tables below.
insert into public.suite_types (id,supplier_id,name,passenger_capacity,sort_order,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000002001','Pullman',2,0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-000000002001','Deluxe', 2,1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-000000002001','Royal',  2,2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z')
on conflict (id) do nothing;

-- Per-supplier variant vocabulary
insert into public.bedroom_types (id,supplier_id,name,sort_order) values
  ('00000000-0000-0000-0000-0000000051a1','00000000-0000-0000-0000-000000002001','Twin',0),
  ('00000000-0000-0000-0000-0000000051a2','00000000-0000-0000-0000-000000002001','Double',1)
on conflict (id) do nothing;

insert into public.bedroom_layouts (id,supplier_id,name,sort_order) values
  ('00000000-0000-0000-0000-0000000051b1','00000000-0000-0000-0000-000000002001','L-Shape',0),
  ('00000000-0000-0000-0000-0000000051b2','00000000-0000-0000-0000-000000002001','Crosswise',1),
  ('00000000-0000-0000-0000-0000000051b3','00000000-0000-0000-0000-000000002001','Lengthwise',2),
  ('00000000-0000-0000-0000-0000000051b4','00000000-0000-0000-0000-000000002001','Split',3)
on conflict (id) do nothing;

insert into public.bathroom_types (id,supplier_id,name,sort_order) values
  ('00000000-0000-0000-0000-0000000051c1','00000000-0000-0000-0000-000000002001','Shower',0),
  ('00000000-0000-0000-0000-0000000051c2','00000000-0000-0000-0000-000000002001','Bath',1),
  ('00000000-0000-0000-0000-0000000051c3','00000000-0000-0000-0000-000000002001','Both',2)
on conflict (id) do nothing;

-- Suite ↔ vocabulary joins (each suite supports all variants by default)
insert into public.suite_type_bedroom_types (suite_type_id,bedroom_type_id) values
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000051a1'),
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000051a2'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051a1'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051a2'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051a1'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051a2')
on conflict do nothing;

insert into public.suite_type_bedroom_layouts (suite_type_id,bedroom_layout_id) values
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000051b1'),
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000051b2'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051b1'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051b2'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051b3'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051b4'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051b1'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051b2'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051b3'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051b4')
on conflict do nothing;

insert into public.suite_type_bathroom_types (suite_type_id,bathroom_type_id) values
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000051c1'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051c1'),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000051c2'),
  ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000051c3')
on conflict do nothing;

-- Routes: one row per bidirectional pair, priced per direction.
insert into public.routes (id,supplier_id,name,origin_location_id,destination_location_id,direction_mode,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000002001','Pretoria ↔ Cape Town',     '00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001002','round_trip',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000002001','Pretoria ↔ Durban',         '00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001003','round_trip',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000002001','Pretoria ↔ Victoria Falls', '00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001004','round_trip',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004007','00000000-0000-0000-0000-000000002001','Pretoria ↔ Swakopmund',     '00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001005','round_trip',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004009','00000000-0000-0000-0000-000000002001','Cape Town ↔ Dar es Salaam', '00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001006','round_trip',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z')
on conflict (id) do nothing;

-- Rate cards: one per (route, suite, rate_type). All seeded under the default RAC type.
insert into public.rate_cards (id,route_id,suite_type_id,rate_type_id,price_per_person,currency,valid_from,valid_to,created_at) values
  ('00000000-0000-0000-0000-000000007201','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005001',(select id from public.rate_types where code='RAC'),24900,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007202','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005002',(select id from public.rate_types where code='RAC'),38500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007203','00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000005003',(select id from public.rate_types where code='RAC'),62000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007204','00000000-0000-0000-0000-000000004003','00000000-0000-0000-0000-000000005001',(select id from public.rate_types where code='RAC'),18500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007205','00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000005002',(select id from public.rate_types where code='RAC'),48500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007206','00000000-0000-0000-0000-000000004005','00000000-0000-0000-0000-000000005003',(select id from public.rate_types where code='RAC'),72000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007207','00000000-0000-0000-0000-000000004007','00000000-0000-0000-0000-000000005002',(select id from public.rate_types where code='RAC'),55000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007208','00000000-0000-0000-0000-000000004007','00000000-0000-0000-0000-000000005003',(select id from public.rate_types where code='RAC'),78000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007209','00000000-0000-0000-0000-000000004009','00000000-0000-0000-0000-000000005002',(select id from public.rate_types where code='RAC'),64000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007210','00000000-0000-0000-0000-000000004009','00000000-0000-0000-0000-000000005003',(select id from public.rate_types where code='RAC'),82500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z')
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
-- SECTION 5B: HOTEL, TRANSPORT & BLUE TRAIN PRICING
-- Makes the non-rail suppliers quotable: room / vehicle / suite
-- types, meal-plan / transfer / rental routes, and rate cards.
-- ============================================================

-- Blue Train contact emails (previously had none)
insert into public.supplier_emails (id,supplier_id,email,label,created_at) values
  ('00000000-0000-0000-0000-000000002124','00000000-0000-0000-0000-000000002010','reservations@bluetrain.co.za','Reservations','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000002125','00000000-0000-0000-0000-000000002010','accounts@bluetrain.co.za','Accounts','2025-08-10T08:10:00Z')
on conflict (id) do nothing;

-- Suite / room / vehicle types for the newly-priced suppliers
insert into public.suite_types (id,supplier_id,name,passenger_capacity,luggage_capacity,description,sort_order,active,created_at,updated_at) values
  -- Blue Train (train suites)
  ('00000000-0000-0000-0000-000000005201','00000000-0000-0000-0000-000000002010','Deluxe Suite',2,2,'En-suite cabin with lounge seating, twin or double.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005202','00000000-0000-0000-0000-000000002010','Luxury Suite',2,2,'Larger suite with full bath and private lounge.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Sheraton Pretoria (rooms)
  ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000002011','Classic Room',2,2,'Elegant room with city or garden outlook.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005212','00000000-0000-0000-0000-000000002011','Executive Room',2,2,'Upgraded room with lounge access.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005213','00000000-0000-0000-0000-000000002011','Executive Suite',2,2,'Separate living area, Union Buildings view.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Villa Sterne (rooms)
  ('00000000-0000-0000-0000-000000005221','00000000-0000-0000-0000-000000002012','Luxury Room',2,2,'Art-filled room with garden access.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005222','00000000-0000-0000-0000-000000002012','Spa Suite',2,2,'Suite with spa-bath and private terrace.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005223','00000000-0000-0000-0000-000000002012','Presidential Suite',2,3,'Top suite with lounge, study and butler service.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Castello di Monte (suites)
  ('00000000-0000-0000-0000-000000005231','00000000-0000-0000-0000-000000002013','Classic Suite',2,2,'Tuscan-styled suite with ridge views.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005232','00000000-0000-0000-0000-000000002013','Luxury Suite',2,2,'Spacious suite with private balcony.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005233','00000000-0000-0000-0000-000000002013','Royal Suite',2,3,'Largest suite with panoramic city views.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Mount Nelson (rooms)
  ('00000000-0000-0000-0000-000000005241','00000000-0000-0000-0000-000000002016','Garden Room',2,2,'Classic room overlooking the gardens.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005242','00000000-0000-0000-0000-000000002016','Deluxe Room',2,2,'Spacious room with Table Mountain views.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005243','00000000-0000-0000-0000-000000002016','Garden Suite',2,3,'Suite with private lounge and terrace.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- The Silo (rooms)
  ('00000000-0000-0000-0000-000000005251','00000000-0000-0000-0000-000000002017','Silo Room',2,2,'Faceted glass windows with harbour views.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005252','00000000-0000-0000-0000-000000002017','Premier Room',2,2,'Premium room with city or mountain views.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005253','00000000-0000-0000-0000-000000002017','Penthouse Suite',2,4,'Rooftop penthouse with private pool.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Cape Grace (rooms)
  ('00000000-0000-0000-0000-000000005261','00000000-0000-0000-0000-000000002018','Luxury Room',2,2,'Waterfront room with marina views.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005262','00000000-0000-0000-0000-000000002018','Deluxe Room',2,2,'Larger room overlooking the quay.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005263','00000000-0000-0000-0000-000000002018','Cape Grace Suite',2,3,'Signature suite with lounge and harbour views.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- First Car Rental (vehicle classes)
  ('00000000-0000-0000-0000-000000005271','00000000-0000-0000-0000-000000002014','Compact (Group B)',5,2,'Economical compact hatch, manual or auto.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005272','00000000-0000-0000-0000-000000002014','Premium SUV (Group H)',5,4,'Full-size SUV, ideal for longer self-drives.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005273','00000000-0000-0000-0000-000000002014','Luxury Sedan (Group L)',5,3,'Executive sedan with premium trim.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Cape Executive Transfers (vehicle classes)
  ('00000000-0000-0000-0000-000000005281','00000000-0000-0000-0000-000000002015','Luxury Sedan',3,3,'Chauffeured executive sedan, up to 3 guests.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005282','00000000-0000-0000-0000-000000002015','Premium SUV',4,4,'Chauffeured SUV, up to 4 guests.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005283','00000000-0000-0000-0000-000000002015','Mercedes Viano',7,6,'Luxury van for groups up to 7 guests.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z')
on conflict (id) do nothing;

-- Hotel meal-plan routes + Blue Train journey route
insert into public.routes (id,supplier_id,name,origin_location_id,destination_location_id,direction_mode,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000004201','00000000-0000-0000-0000-000000002010','Pretoria ↔ Cape Town','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001002','round_trip',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004211','00000000-0000-0000-0000-000000002011','Bed & Breakfast','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001001','one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004221','00000000-0000-0000-0000-000000002012','Bed & Breakfast','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001001','one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004231','00000000-0000-0000-0000-000000002013','Bed & Breakfast','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001001','one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004241','00000000-0000-0000-0000-000000002016','Bed & Breakfast','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001002','one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004251','00000000-0000-0000-0000-000000002017','Bed & Breakfast','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001002','one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004261','00000000-0000-0000-0000-000000002018','Bed & Breakfast','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001002','one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z')
on conflict (id) do nothing;

-- Transport routes (transfer / rental) with service metadata
insert into public.routes (id,supplier_id,name,origin_location_id,destination_location_id,direction_mode,transport_service_type,pickup_point,dropoff_point,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000004271','00000000-0000-0000-0000-000000002014','Self-Drive Hire — Gauteng','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001001','one_way','rental','Pretoria / OR Tambo','Pretoria / OR Tambo',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004281','00000000-0000-0000-0000-000000002015','Airport ↔ V&A Waterfront','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000001002','one_way','transfer','Cape Town International Airport','V&A Waterfront',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z')
on conflict (id) do nothing;

-- Vehicle-rental terms for the self-drive route
insert into public.vehicle_rental_route_details (route_id,included_km_per_day,extra_km_price,security_deposit,one_way_fee) values
  ('00000000-0000-0000-0000-000000004271',200,4.50,5000,1500)
on conflict (route_id) do nothing;

-- Rate cards (one per route × type, under the default RAC rate type)
insert into public.rate_cards (id,route_id,suite_type_id,rate_type_id,price_per_person,currency,valid_from,valid_to,created_at) values
  -- Blue Train (per person, per journey)
  ('00000000-0000-0000-0000-000000007401','00000000-0000-0000-0000-000000004201','00000000-0000-0000-0000-000000005201',(select id from public.rate_types where code='RAC'),29950,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007402','00000000-0000-0000-0000-000000004201','00000000-0000-0000-0000-000000005202',(select id from public.rate_types where code='RAC'),44500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Sheraton Pretoria (per room, per night)
  ('00000000-0000-0000-0000-000000007411','00000000-0000-0000-0000-000000004211','00000000-0000-0000-0000-000000005211',(select id from public.rate_types where code='RAC'),3200,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007412','00000000-0000-0000-0000-000000004211','00000000-0000-0000-0000-000000005212',(select id from public.rate_types where code='RAC'),4500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007413','00000000-0000-0000-0000-000000004211','00000000-0000-0000-0000-000000005213',(select id from public.rate_types where code='RAC'),6800,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Villa Sterne
  ('00000000-0000-0000-0000-000000007421','00000000-0000-0000-0000-000000004221','00000000-0000-0000-0000-000000005221',(select id from public.rate_types where code='RAC'),3800,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007422','00000000-0000-0000-0000-000000004221','00000000-0000-0000-0000-000000005222',(select id from public.rate_types where code='RAC'),5200,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007423','00000000-0000-0000-0000-000000004221','00000000-0000-0000-0000-000000005223',(select id from public.rate_types where code='RAC'),8500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Castello di Monte
  ('00000000-0000-0000-0000-000000007431','00000000-0000-0000-0000-000000004231','00000000-0000-0000-0000-000000005231',(select id from public.rate_types where code='RAC'),3600,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007432','00000000-0000-0000-0000-000000004231','00000000-0000-0000-0000-000000005232',(select id from public.rate_types where code='RAC'),5000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007433','00000000-0000-0000-0000-000000004231','00000000-0000-0000-0000-000000005233',(select id from public.rate_types where code='RAC'),7800,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Mount Nelson
  ('00000000-0000-0000-0000-000000007441','00000000-0000-0000-0000-000000004241','00000000-0000-0000-0000-000000005241',(select id from public.rate_types where code='RAC'),9500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007442','00000000-0000-0000-0000-000000004241','00000000-0000-0000-0000-000000005242',(select id from public.rate_types where code='RAC'),13500,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007443','00000000-0000-0000-0000-000000004241','00000000-0000-0000-0000-000000005243',(select id from public.rate_types where code='RAC'),22000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- The Silo
  ('00000000-0000-0000-0000-000000007451','00000000-0000-0000-0000-000000004251','00000000-0000-0000-0000-000000005251',(select id from public.rate_types where code='RAC'),18000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007452','00000000-0000-0000-0000-000000004251','00000000-0000-0000-0000-000000005252',(select id from public.rate_types where code='RAC'),24000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007453','00000000-0000-0000-0000-000000004251','00000000-0000-0000-0000-000000005253',(select id from public.rate_types where code='RAC'),65000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Cape Grace
  ('00000000-0000-0000-0000-000000007461','00000000-0000-0000-0000-000000004261','00000000-0000-0000-0000-000000005261',(select id from public.rate_types where code='RAC'),11000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007462','00000000-0000-0000-0000-000000004261','00000000-0000-0000-0000-000000005262',(select id from public.rate_types where code='RAC'),15000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007463','00000000-0000-0000-0000-000000004261','00000000-0000-0000-0000-000000005263',(select id from public.rate_types where code='RAC'),26000,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- First Car Rental (per vehicle, per day)
  ('00000000-0000-0000-0000-000000007471','00000000-0000-0000-0000-000000004271','00000000-0000-0000-0000-000000005271',(select id from public.rate_types where code='RAC'),650,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007472','00000000-0000-0000-0000-000000004271','00000000-0000-0000-0000-000000005272',(select id from public.rate_types where code='RAC'),1450,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007473','00000000-0000-0000-0000-000000004271','00000000-0000-0000-0000-000000005273',(select id from public.rate_types where code='RAC'),1950,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Cape Executive Transfers (per transfer)
  ('00000000-0000-0000-0000-000000007481','00000000-0000-0000-0000-000000004281','00000000-0000-0000-0000-000000005281',(select id from public.rate_types where code='RAC'),950,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007482','00000000-0000-0000-0000-000000004281','00000000-0000-0000-0000-000000005282',(select id from public.rate_types where code='RAC'),1350,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007483','00000000-0000-0000-0000-000000004281','00000000-0000-0000-0000-000000005283',(select id from public.rate_types where code='RAC'),1850,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 5C: TOUR OPERATOR PRICING
-- Winelands Excursions + Cape Peninsula Tours: tour types,
-- itineraries, and per-person rate cards.
-- ============================================================

insert into public.suite_types (id,supplier_id,name,passenger_capacity,luggage_capacity,description,sort_order,active,created_at,updated_at) values
  -- Winelands Excursions (tour types)
  ('00000000-0000-0000-0000-000000005301','00000000-0000-0000-0000-000000002009','Half-Day Private Tour',6,0,'Half-day private vehicle tour visiting two boutique wine estates with tastings.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005302','00000000-0000-0000-0000-000000002009','Full-Day Private Tour',6,0,'Full-day private tour across Stellenbosch and Franschhoek with cellar tours, tastings, and an à la carte lunch.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005303','00000000-0000-0000-0000-000000002009','Premium Wine & Dine Experience',4,0,'Exclusive full-day experience pairing award-winning estates with a fine-dining lunch and a private cellar tasting.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  -- Cape Peninsula Tours (tour types)
  ('00000000-0000-0000-0000-000000005311','00000000-0000-0000-0000-000000002019','Shared Group Tour',12,0,'Small shared-coach group tour, maximum 12 guests.',0,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005312','00000000-0000-0000-0000-000000002019','Private Vehicle Tour',6,0,'Private vehicle and driver-guide for up to 6 guests.',1,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z'),
  ('00000000-0000-0000-0000-000000005313','00000000-0000-0000-0000-000000002019','Luxury Private Tour',4,0,'Premium private tour in a luxury vehicle with a dedicated guide and flexible itinerary.',2,true,'2025-08-10T08:12:00Z','2025-08-10T08:12:00Z')
on conflict (id) do nothing;

insert into public.routes (id,supplier_id,name,origin_location_id,destination_location_id,direction_mode,active,created_at,updated_at) values
  -- Winelands Excursions (itineraries)
  ('00000000-0000-0000-0000-000000004301','00000000-0000-0000-0000-000000002009','Stellenbosch & Franschhoek Classic',null,null,'one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004302','00000000-0000-0000-0000-000000002009','Constantia Valley Heritage Tour',null,null,'one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004303','00000000-0000-0000-0000-000000002009','Private Cellar & Fine Dining Experience',null,null,'one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  -- Cape Peninsula Tours (itineraries)
  ('00000000-0000-0000-0000-000000004311','00000000-0000-0000-0000-000000002019','Cape Point & Boulders Beach Full-Day',null,null,'one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004312','00000000-0000-0000-0000-000000002019','Chapman''s Peak & Hout Bay Half-Day',null,null,'one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000004313','00000000-0000-0000-0000-000000002019','Table Mountain & City Bowl Half-Day',null,null,'one_way',true,'2025-08-10T08:15:00Z','2025-08-10T08:15:00Z')
on conflict (id) do nothing;

insert into public.rate_cards (id,route_id,suite_type_id,rate_type_id,price_per_person,currency,valid_from,valid_to,created_at) values
  -- Winelands Excursions
  ('00000000-0000-0000-0000-000000007501','00000000-0000-0000-0000-000000004301','00000000-0000-0000-0000-000000005301',(select id from public.rate_types where code='RAC'),1450,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007502','00000000-0000-0000-0000-000000004301','00000000-0000-0000-0000-000000005302',(select id from public.rate_types where code='RAC'),2450,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007503','00000000-0000-0000-0000-000000004302','00000000-0000-0000-0000-000000005301',(select id from public.rate_types where code='RAC'),1350,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007504','00000000-0000-0000-0000-000000004302','00000000-0000-0000-0000-000000005302',(select id from public.rate_types where code='RAC'),2300,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007505','00000000-0000-0000-0000-000000004303','00000000-0000-0000-0000-000000005303',(select id from public.rate_types where code='RAC'),4200,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  -- Cape Peninsula Tours
  ('00000000-0000-0000-0000-000000007511','00000000-0000-0000-0000-000000004311','00000000-0000-0000-0000-000000005311',(select id from public.rate_types where code='RAC'),950,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007512','00000000-0000-0000-0000-000000004311','00000000-0000-0000-0000-000000005312',(select id from public.rate_types where code='RAC'),1850,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007513','00000000-0000-0000-0000-000000004311','00000000-0000-0000-0000-000000005313',(select id from public.rate_types where code='RAC'),3200,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007514','00000000-0000-0000-0000-000000004312','00000000-0000-0000-0000-000000005311',(select id from public.rate_types where code='RAC'),650,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007515','00000000-0000-0000-0000-000000004312','00000000-0000-0000-0000-000000005312',(select id from public.rate_types where code='RAC'),1350,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007516','00000000-0000-0000-0000-000000004313','00000000-0000-0000-0000-000000005312',(select id from public.rate_types where code='RAC'),1250,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z'),
  ('00000000-0000-0000-0000-000000007517','00000000-0000-0000-0000-000000004313','00000000-0000-0000-0000-000000005313',(select id from public.rate_types where code='RAC'),2400,'ZAR','2026-01-01',null,'2025-08-12T08:20:00Z')
on conflict (id) do nothing;

-- Example supplier rate adjustments: which non-default rates apply to a supplier
-- and how much cheaper they are than that supplier's default rate. Rovos / Blue
-- Train default to Rack Rate (train); Irene Country Lodge defaults to Standard
-- Tour Operator (hotel), so its applicable rates are cheaper still.
insert into public.supplier_rate_adjustments (supplier_id, rate_type_id, discount_pct)
select s.supplier_id, rt.id, s.discount_pct
from (values
  ('00000000-0000-0000-0000-000000002001'::uuid, 'STO',      20),
  ('00000000-0000-0000-0000-000000002001'::uuid, 'RESIDENT', 50),
  ('00000000-0000-0000-0000-000000002010'::uuid, 'STO',      15),
  ('00000000-0000-0000-0000-000000002002'::uuid, 'NETT',     10),
  ('00000000-0000-0000-0000-000000002002'::uuid, 'RESIDENT', 35)
) as s(supplier_id, code, discount_pct)
join public.rate_types rt on rt.code = s.code
on conflict (supplier_id, rate_type_id) do nothing;

-- ============================================================
-- SECTION 6: PACKAGES, LEGS, ROUTES, HOTEL OFFERS
-- ============================================================

insert into public.packages (id,slug,name,description,duration_nights,single_supplement_pct,markup_pct,currency,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000003002','victoria-falls-explorer','Victoria Falls Explorer','Four-night rail journey from Pretoria to the majestic Victoria Falls. Optional post-journey hotel stay included.',4,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z'),
  ('00000000-0000-0000-0000-000000003008','grand-south-africa-rail-tour','Grand South Africa Rail & Stay','Seven-night flagship journey: a luxury pre-departure stay in Pretoria, the Pretoria-to-Cape Town rail journey, then a Cape Town stay with private transfers and an optional self-drive extension. The complete capital-to-coast experience.',7,50,15,'ZAR',true,'2025-08-10T08:10:00Z','2025-08-10T08:10:00Z')

on conflict (id) do update set slug=excluded.slug,name=excluded.name,description=excluded.description,
  duration_nights=excluded.duration_nights,single_supplement_pct=excluded.single_supplement_pct,
  markup_pct=excluded.markup_pct,currency=excluded.currency,active=excluded.active,updated_at=excluded.updated_at;

insert into public.package_legs (id,package_id,supplier_id,label,sort_order,created_at) values
  ('00000000-0000-0000-0000-000000003102','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002001','Main Rail Journey: Rovos Rail, Pretoria to Victoria Falls',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003109','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002003','Post-journey Hotel: The Victoria Falls Hotel, Victoria Falls',2,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003110','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002001','Main Rail Journey: Rovos Rail, Pretoria to Cape Town',1,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003111','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002011','Pre-departure Hotel: Sheraton Pretoria Hotel, Pretoria',2,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003112','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002012','Pre-departure Hotel: Villa Sterne Boutique Hotel, Pretoria',3,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003113','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002013','Pre-departure Hotel: Castello di Monte, Pretoria',4,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003114','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002015','Airport / Station Transfer: Cape Executive Transfers, Cape Town',5,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003115','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002014','Self-drive Car Rental: First Car Rental, Cape Town',6,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003116','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002016','Cape Town Stay: Mount Nelson, A Belmond Hotel, Cape Town',7,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003117','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002017','Cape Town Stay: The Silo Hotel, Cape Town',8,'2025-08-10T08:14:00Z'),
  ('00000000-0000-0000-0000-000000003118','00000000-0000-0000-0000-000000003008','00000000-0000-0000-0000-000000002018','Cape Town Stay: Cape Grace, Cape Town',9,'2025-08-10T08:14:00Z')

on conflict (id) do nothing;

insert into public.package_leg_routes (package_leg_id,route_id,created_at) values
  ('00000000-0000-0000-0000-000000003102','00000000-0000-0000-0000-000000004005','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003110','00000000-0000-0000-0000-000000004001','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003114','00000000-0000-0000-0000-000000004281','2025-08-10T08:15:00Z'),
  ('00000000-0000-0000-0000-000000003115','00000000-0000-0000-0000-000000004271','2025-08-10T08:15:00Z')

on conflict (package_leg_id,route_id) do nothing;

insert into public.hotel_offers (id,hotel_supplier_id,location_id,package_id,phase,active,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000006003','00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000003002','post',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006006','00000000-0000-0000-0000-000000002011','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000003008','pre',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006007','00000000-0000-0000-0000-000000002012','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000003008','pre',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006008','00000000-0000-0000-0000-000000002013','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000003008','pre',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006009','00000000-0000-0000-0000-000000002016','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000003008','post',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006010','00000000-0000-0000-0000-000000002017','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000003008','post',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z'),
  ('00000000-0000-0000-0000-000000006011','00000000-0000-0000-0000-000000002018','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000003008','post',true,'2025-08-10T08:20:00Z','2025-08-10T08:20:00Z')

on conflict (id) do nothing;

-- ============================================================
-- SECTION 7: EMAIL TEMPLATES
-- ============================================================

insert into public.templates (id,key,subject,body_html,version,active,is_system,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000007001','quote_email','Your Quote — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Please find attached your personalised quotation for the <strong>{{direction}}</strong> journey departing <strong>{{departureDate}}</strong>.</p><p>This quote is valid until <strong>{{validityDate}}</strong>. Total: <strong>R {{total}}</strong></p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',2,true,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000007002','follow_up','Following up on your enquiry — {{jobNumber}}','<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000007003','deposit_request','Deposit Invoice — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. A deposit of <strong>R {{depositAmount}}</strong> (25%) is required to secure your booking. Please find your invoice attached.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000007004','voucher_email','Your Travel Voucher — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Your travel voucher for the <strong>{{direction}}</strong> journey is attached. Please present it to your service provider on arrival. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2025-08-12T08:00:00Z','2025-08-12T08:00:00Z')
on conflict (id) do update set key=excluded.key,subject=excluded.subject,
  body_html=excluded.body_html,version=excluded.version,active=excluded.active,is_system=excluded.is_system,updated_at=excluded.updated_at;

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
  ('quote_follow_up_enabled','true','2025-08-01T08:00:00Z'),
  ('quote_follow_up_cadence','[3,7]','2025-08-01T08:00:00Z'),
  ('quote_follow_up_template','<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>','2025-08-01T08:00:00Z'),
  ('quote_acceptance_after_expiry','blocked','2025-08-01T08:00:00Z'),
  ('session_timeout_minutes','480','2025-08-01T08:00:00Z'),
  ('business_name','Luxus Travel and Tours','2025-08-01T08:00:00Z'),
  ('deposit_refundable','false','2025-08-01T08:00:00Z')
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
('00000000-0000-0000-0000-000000009033','RR-2025-0003','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','web_form','closed','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2025-11-10',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,0,'2025-08-28T09:00:00Z','2025-09-08T14:00:00Z','2025-09-12T09:00:00Z','2025-09-20T11:00:00Z','2025-10-05T15:00:00Z','2025-10-28T09:00:00Z','2025-12-01T10:00:00Z','2025-08-20T09:00:00Z','2025-12-01T10:00:00Z'),
('00000000-0000-0000-0000-000000009029','RR-2025-0007','00000000-0000-0000-0000-000000008011','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','referral','voucher_sent','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-08',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,0,'2025-11-10T09:00:00Z','2025-11-20T14:00:00Z','2025-11-25T09:00:00Z','2025-12-05T11:00:00Z','2026-03-28T15:00:00Z','2026-05-01T09:00:00Z',null,'2025-11-01T09:00:00Z','2026-05-01T09:00:00Z'),
('00000000-0000-0000-0000-000000009024','RR-2025-0009','00000000-0000-0000-0000-000000008014','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','final_paid','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-11',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,0,'2025-12-05T09:00:00Z','2025-12-15T14:00:00Z','2025-12-20T09:00:00Z','2025-12-28T11:00:00Z','2026-04-10T15:00:00Z',null,null,'2025-11-28T09:00:00Z','2026-04-10T15:00:00Z'),
('00000000-0000-0000-0000-000000009021','RR-2026-0015','00000000-0000-0000-0000-000000008002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','travel_agent','deposit_paid','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-06-04',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,true,83662.50,'2026-01-30T09:00:00Z','2026-02-08T14:00:00Z','2026-02-12T09:00:00Z','2026-02-18T11:00:00Z',null,null,null,'2026-01-25T09:00:00Z','2026-02-18T11:00:00Z'),
('00000000-0000-0000-0000-000000009018','RR-2026-0021','00000000-0000-0000-0000-000000008008','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','deposit_requested','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-09-15',4,2,2,1,'post','00000000-0000-0000-0000-000000002003',false,null,true,'Airport transfer from VFA and sunset cruise',true,false,175260.00,'2026-03-12T09:00:00Z','2026-03-20T14:00:00Z','2026-03-25T09:00:00Z',null,null,null,null,'2026-03-05T09:00:00Z','2026-03-25T09:00:00Z'),
('00000000-0000-0000-0000-000000009013','RR-2026-0025','00000000-0000-0000-0000-000000008006','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','walk_in','accepted','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-09-01',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,false,null,'2026-04-01T09:00:00Z','2026-04-10T14:00:00Z',null,null,null,null,null,'2026-03-25T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-000000009008','RR-2026-0030','00000000-0000-0000-0000-000000008002','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','quote_sent','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-09-10',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,false,null,true,false,null,'2026-04-25T09:00:00Z',null,null,null,null,null,null,'2026-04-20T09:00:00Z','2026-04-25T09:00:00Z'),
('00000000-0000-0000-0000-000000009002','RR-2026-0033','00000000-0000-0000-0000-000000008018','00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000004005','reservation','email','enquiry','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-09-20',4,2,0,1,'post','00000000-0000-0000-0000-000000002003',false,null,true,'Honeymoon arrangement — rose petals, champagne, private dinner',false,false,null,null,null,null,null,null,null,null,'2026-05-08T09:00:00Z','2026-05-08T09:00:00Z');

commit;




begin;

-- SECTION 10: BOOKING SUITES
insert into public.booking_suites (id,booking_id,suite_number,suite_type_id,suite_type_name,created_at) values
('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-000000009033',1,'00000000-0000-0000-0000-000000005003','Royal Double Suite','2025-08-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a007','00000000-0000-0000-0000-000000009029',1,'00000000-0000-0000-0000-000000005002','Deluxe Double Suite','2025-11-01T09:11:00Z'),
('00000000-0000-0000-0000-00000000a009','00000000-0000-0000-0000-000000009024',1,'00000000-0000-0000-0000-000000005002','Deluxe Double Suite','2025-11-28T09:11:00Z'),
('00000000-0000-0000-0000-00000000a014','00000000-0000-0000-0000-000000009021',1,'00000000-0000-0000-0000-000000005002','Deluxe Twin Suite','2026-01-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a019','00000000-0000-0000-0000-000000009018',1,'00000000-0000-0000-0000-000000005003','Royal Double Suite','2026-03-05T09:11:00Z'),
('00000000-0000-0000-0000-00000000a023','00000000-0000-0000-0000-000000009013',1,'00000000-0000-0000-0000-000000005003','Royal Twin Suite','2026-03-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a028','00000000-0000-0000-0000-000000009008',1,'00000000-0000-0000-0000-000000005002','Deluxe Twin Suite','2026-04-20T09:11:00Z');

-- SECTION 11: TRAVELLERS (key bookings)
insert into public.travellers (id,booking_id,prefix,first_name,last_name,id_passport,date_of_birth,is_child,sort_order,created_at) values
('00000000-0000-0000-0000-00000000b007','00000000-0000-0000-0000-000000009033','Mr','James','Mitchell','ZA8501015800081','1985-01-15',false,1,'2025-08-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b008','00000000-0000-0000-0000-000000009033','Mrs','Linda','Mitchell','ZA8703025800082','1987-03-02',false,2,'2025-08-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b015','00000000-0000-0000-0000-000000009029','Mr','Henrik','Johansson','SE12345678','1982-04-22',false,1,'2025-11-01T09:12:00Z'),
('00000000-0000-0000-0000-00000000b016','00000000-0000-0000-0000-000000009029','Ms','Astrid','Johansson','SE87654321','1985-08-14',false,2,'2025-11-01T09:12:00Z'),
('00000000-0000-0000-0000-00000000b019','00000000-0000-0000-0000-000000009024','Mrs','Chloe','Beaumont','CA23456789','1988-06-15',false,1,'2025-11-28T09:12:00Z'),
('00000000-0000-0000-0000-00000000b020','00000000-0000-0000-0000-000000009024','Mr','Louis','Beaumont','CA98765432','1985-11-03',false,2,'2025-11-28T09:12:00Z'),
('00000000-0000-0000-0000-00000000b027','00000000-0000-0000-0000-000000009018','Mrs','Elizabeth','Taylor','AU12345678','1980-03-12',false,1,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b028','00000000-0000-0000-0000-000000009018','Mr','George','Taylor','AU87654321','1978-07-18',false,2,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b029','00000000-0000-0000-0000-000000009018','Miss','Emma','Taylor','AU55556666','2018-05-12',true,3,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b030','00000000-0000-0000-0000-000000009018','Master','Jack','Taylor','AU77778888','2015-09-20',true,4,'2026-03-05T09:12:00Z');

commit;


begin;

-- SECTION 12: ITINERARIES
insert into public.itineraries (id,booking_id,name,notes,accepted_at,created_at,updated_at) values
('00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-000000009033','Victoria Falls Explorer — Mitchell VIP','Four-night Pretoria to Victoria Falls. Royal Double Suite with post-stay at Victoria Falls Hotel.','2025-09-08T14:00:00Z','2025-09-05T09:00:00Z','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c007','00000000-0000-0000-0000-000000009029','Victoria Falls Explorer — Johansson','Four-night Pretoria to Victoria Falls. Post-stay at Victoria Falls Hotel.','2025-11-20T14:00:00Z','2025-11-17T09:00:00Z','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000c009','00000000-0000-0000-0000-000000009024','Victoria Falls Explorer — Beaumont','Four-night Pretoria to Victoria Falls. Post-stay Victoria Falls Hotel.','2025-12-15T14:00:00Z','2025-12-12T09:00:00Z','2025-12-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000c014','00000000-0000-0000-0000-000000009021','Victoria Falls Explorer — Van Der Berg','Four-night Pretoria to Victoria Falls. Post-stay Victoria Falls Hotel.','2026-02-08T14:00:00Z','2026-02-05T09:00:00Z','2026-02-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c019','00000000-0000-0000-0000-000000009018','Victoria Falls Explorer — Taylor Family','Four-night with 2 children. Post-stay and sunset cruise.','2026-03-20T14:00:00Z','2026-03-17T09:00:00Z','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000c023','00000000-0000-0000-0000-000000009013','Victoria Falls Explorer — Naidoo (accepted)','Four-night Pretoria to Victoria Falls. Post-stay.','2026-04-10T14:00:00Z','2026-04-07T09:00:00Z','2026-04-10T14:00:00Z');

commit;


begin;

-- SECTION 13: QUOTES
insert into public.quotes (id,booking_id,itinerary_id,quote_number,status,validity_until,subtotal,vat,total,last_sent_at,created_at,updated_at) values
('00000000-0000-0000-0000-00000000d003','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000c003','RR-2025-0003-Q1','accepted','2025-09-28',143478.26,21521.74,165000.00,'2025-08-28T09:30:00Z','2025-08-28T09:00:00Z','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d007','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000c007','RR-2025-0007-Q1','accepted','2025-12-10',97000.00,14550.00,111550.00,'2025-11-10T09:30:00Z','2025-11-10T09:00:00Z','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000d009','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000c009','RR-2025-0009-Q1','accepted','2026-01-05',97000.00,14550.00,111550.00,'2025-12-05T09:30:00Z','2025-12-05T09:00:00Z','2025-12-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000d014','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000c014','RR-2026-0015-Q1','accepted','2026-02-28',97000.00,14550.00,111550.00,'2026-01-30T09:30:00Z','2026-01-30T09:00:00Z','2026-02-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d019','00000000-0000-0000-0000-000000009018','00000000-0000-0000-0000-00000000c019','RR-2026-0021-Q1','accepted','2026-04-12',152400.00,22860.00,175260.00,'2026-03-12T09:30:00Z','2026-03-12T09:00:00Z','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000d023','00000000-0000-0000-0000-000000009013','00000000-0000-0000-0000-00000000c023','RR-2026-0025-Q1','accepted','2026-05-01',110400.00,16560.00,126960.00,'2026-04-01T09:30:00Z','2026-04-01T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-00000000d028','00000000-0000-0000-0000-000000009008',null,'RR-2026-0030-Q1','sent','2026-05-09',97000.00,14550.00,111550.00,'2026-04-25T09:30:00Z','2026-04-25T09:00:00Z','2026-04-25T09:30:00Z');

-- SECTION 13b: QUOTE LINE ITEMS
insert into public.quote_line_items (id,quote_id,description,qty,unit_price,total,sort_order,created_at) values
('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000d003','Royal Double Suite (2 pax) — Victoria Falls Explorer',1,144000.00,144000.00,1,'2025-08-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e005','00000000-0000-0000-0000-00000000d003','Victoria Falls Hotel — 2 nights (2 pax)',1,19000.00,19000.00,2,'2025-08-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e009','00000000-0000-0000-0000-00000000d007','Deluxe Double Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2025-11-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e011','00000000-0000-0000-0000-00000000d009','Deluxe Double Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2025-12-05T09:05:00Z'),
('00000000-0000-0000-0000-00000000e017','00000000-0000-0000-0000-00000000d014','Deluxe Twin Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2026-01-30T09:05:00Z'),
('00000000-0000-0000-0000-00000000e022','00000000-0000-0000-0000-00000000d019','Royal Double Suite (2 adults 2 children) — VF Explorer',1,144000.00,144000.00,1,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e023','00000000-0000-0000-0000-00000000d019','Airport transfer VFA + sunset cruise (family)',1,8400.00,8400.00,2,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e027','00000000-0000-0000-0000-00000000d023','Royal Twin Suite (2 pax) — Victoria Falls Explorer',1,110400.00,110400.00,1,'2026-04-01T09:05:00Z'),
('00000000-0000-0000-0000-00000000e032','00000000-0000-0000-0000-00000000d028','Deluxe Twin Suite (2 pax) — Victoria Falls Explorer',1,97000.00,97000.00,1,'2026-04-25T09:05:00Z');

commit;


begin;

-- SECTION 14: INVOICES
insert into public.invoices (id,booking_id,quote_id,kind,status,invoice_number,deposit_percentage,amount,currency,due_date,sent_at,created_at,updated_at) values
('00000000-0000-0000-0000-0000000e0005','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000d003','deposit','paid','DEP-2025-000003',25,41250.00,'ZAR','2025-09-19','2025-09-12T09:30:00Z','2025-09-12T09:00:00Z','2025-09-20T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0006','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000d003','final','paid','FIN-2025-000003',null,123750.00,'ZAR','2025-10-02','2025-09-22T09:30:00Z','2025-09-22T09:00:00Z','2025-10-05T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0013','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000d007','deposit','paid','DEP-2025-000007',25,27887.50,'ZAR','2025-12-02','2025-11-25T09:30:00Z','2025-11-25T09:00:00Z','2025-12-05T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0014','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000d007','final','paid','FIN-2025-000007',null,83662.50,'ZAR','2026-03-21','2026-03-05T09:30:00Z','2026-03-05T09:00:00Z','2026-03-28T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0017','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000d009','deposit','paid','DEP-2025-000009',25,27887.50,'ZAR','2026-01-04','2025-12-20T09:30:00Z','2025-12-20T09:00:00Z','2025-12-28T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0018','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000d009','final','paid','FIN-2025-000009',null,83662.50,'ZAR','2026-04-03','2026-03-20T09:30:00Z','2026-03-20T09:00:00Z','2026-04-10T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0027','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000d014','deposit','paid','DEP-2026-000015',25,27887.50,'ZAR','2026-02-15','2026-02-12T09:30:00Z','2026-02-12T09:00:00Z','2026-02-18T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0028','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000d014','final','sent','FIN-2026-000015',null,83662.50,'ZAR','2026-05-28','2026-05-05T09:30:00Z','2026-05-05T09:00:00Z','2026-05-05T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0035','00000000-0000-0000-0000-000000009018','00000000-0000-0000-0000-00000000d019','deposit','sent','DEP-2026-000021',25,43815.00,'ZAR','2026-04-01','2026-03-25T09:30:00Z','2026-03-25T09:00:00Z','2026-03-25T09:30:00Z');

commit;


begin;

-- SECTION 15: PAYMENTS
insert into public.payments (id,booking_id,amount,method,reference,notes,received_at,created_at) values
('00000000-0000-0000-0000-00000000f005','00000000-0000-0000-0000-000000009033',41250.00,'Bank Transfer','BT-MIT-DEP-001','Deposit — Victoria Falls Explorer VIP','2025-09-20T11:00:00Z','2025-09-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000f006','00000000-0000-0000-0000-000000009033',123750.00,'Credit Card','CC-MIT-FIN-001','Final payment — Victoria Falls Explorer','2025-10-05T15:00:00Z','2025-10-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000f013','00000000-0000-0000-0000-000000009029',27887.50,'Credit Card','CC-JOH-DEP-001','Deposit — Victoria Falls Explorer','2025-12-05T11:00:00Z','2025-12-05T11:00:00Z'),
('00000000-0000-0000-0000-00000000f014','00000000-0000-0000-0000-000000009029',83662.50,'EFT','EFT-JOH-FIN-001','Final balance — Victoria Falls Explorer','2026-03-28T15:00:00Z','2026-03-28T15:00:00Z'),
('00000000-0000-0000-0000-00000000f017','00000000-0000-0000-0000-000000009024',27887.50,'EFT','EFT-BEA-DEP-001','Deposit — Victoria Falls Explorer','2025-12-28T11:00:00Z','2025-12-28T11:00:00Z'),
('00000000-0000-0000-0000-00000000f018','00000000-0000-0000-0000-000000009024',83662.50,'Bank Transfer','BT-BEA-FIN-001','Final balance — Victoria Falls Explorer','2026-04-10T15:00:00Z','2026-04-10T15:00:00Z'),
('00000000-0000-0000-0000-00000000f026','00000000-0000-0000-0000-000000009021',27887.50,'Bank Transfer','BT-VDB-DEP-001','Deposit 25% — Victoria Falls Explorer','2026-02-18T11:00:00Z','2026-02-18T11:00:00Z');

-- SECTION 16: DOCUMENTS
insert into public.documents (id,booking_id,kind,status,storage_path,created_at) values
('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-000000009033','quote_pdf','generated','documents/quotes/RR-2025-0003.pdf','2025-08-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-000000009033','invoice_pdf','generated','documents/invoices/DEP-2025-000003.pdf','2025-09-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa06','00000000-0000-0000-0000-000000009033','voucher_pdf','generated','documents/vouchers/RR-2025-0003.pdf','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa10','00000000-0000-0000-0000-000000009029','quote_pdf','generated','documents/quotes/RR-2025-0007.pdf','2025-11-10T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa11','00000000-0000-0000-0000-000000009029','voucher_pdf','generated','documents/vouchers/RR-2025-0007.pdf','2026-05-01T09:00:00Z');

-- SECTION 17: CORRESPONDENCES (6 scheduled follow-ups for dashboard widget)
insert into public.correspondences (id,booking_id,channel,kind,subject,body_html,status,sent_at,scheduled_at,created_at) values
('00000000-0000-0000-0000-00000000bb02','00000000-0000-0000-0000-000000009033','email','quote_email','Your Rovos Rail Quote — RR-2025-0003','<p>Dear James, please find your quotation attached.</p>','sent','2025-08-28T09:30:00Z',null,'2025-08-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb07','00000000-0000-0000-0000-000000009033','email','deposit_request','Deposit Invoice — RR-2025-0003','<p>Dear James, your deposit invoice is attached.</p>','sent','2025-09-12T09:30:00Z',null,'2025-09-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb10','00000000-0000-0000-0000-000000009018','email','deposit_request','Deposit Invoice — RR-2026-0021','<p>Dear Elizabeth, your deposit invoice is attached.</p>','sent','2026-03-25T09:30:00Z',null,'2026-03-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb13','00000000-0000-0000-0000-000000009029','email','voucher_email','Your Travel Voucher — RR-2025-0007','<p>Dear Henrik, your travel voucher is attached.</p>','sent','2026-05-01T09:30:00Z',null,'2026-05-01T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb17','00000000-0000-0000-0000-000000009008','email','follow_up','Following up on your Victoria Falls quote — RR-2026-0030','<p>Dear Sarah, we are following up on your Victoria Falls Explorer quotation.</p>','scheduled',null,'2026-05-24T09:00:00Z','2026-05-14T09:00:00Z');

-- SECTION 18: PIPELINE HISTORY
insert into public.pipeline_history (id,booking_id,from_stage,to_stage,moved_by,moved_by_user_id,moved_at) values
('00000000-0000-0000-0000-00000000cc15','00000000-0000-0000-0000-000000009033','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-08-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc16','00000000-0000-0000-0000-000000009033','quote_sent','accepted','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc17','00000000-0000-0000-0000-000000009033','accepted','deposit_requested','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-12T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc18','00000000-0000-0000-0000-000000009033','deposit_requested','deposit_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc19','00000000-0000-0000-0000-000000009033','deposit_paid','final_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-10-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc20','00000000-0000-0000-0000-000000009033','final_paid','voucher_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc21','00000000-0000-0000-0000-000000009033','voucher_sent','closed','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-12-01T10:00:00Z');

-- SECTION 19: AUDIT LOGS
insert into public.audit_logs (id,actor,actor_user_id,entity_type,entity_id,action,before_json,after_json,meta_json,created_at) values
('00000000-0000-0000-0000-00000000dd04','Leonie Botha','00000000-0000-0000-0000-0000000000a2','Booking','00000000-0000-0000-0000-000000009033','stage_change','{"stage":"final_paid"}'::jsonb,'{"stage":"voucher_sent"}'::jsonb,null,'2025-10-28T09:00:00Z');

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


-- ============================================================
-- SECTION 12: INTERNAL BOOKING NOTES (demo data)
-- ============================================================

commit;

