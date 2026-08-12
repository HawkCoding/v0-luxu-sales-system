-- ============================================================
-- Luxus Sales System — Local Dev Seed
-- Resets to a fully-populated showcase dataset on every db:reset.
-- Login: password123 for all users.
--   carmen@luxustravel.co.za  admin    (CDJ)
--   leonie@luxustravel.co.za  consultant (LB)
--   dirk@luxustravel.co.za    manager  (DR)
--   monade@luxustravel.co.za  consultant (MVE)
--   douwlien@luxustravel.co.za consultant (DL)
-- 9 bookings spanning the full pipeline: enquiry, accepted, deposit_requested,
--   deposit_paid, final_paid, voucher_sent and closed, plus 3 with a fully
--   built-out multi-supplier package leg chain (train, transfers, hotel,
--   tour, flight) for exercising the Reservation/Quote build flow.
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
  ('00000000-0000-0000-0000-0000000000a5','douwlien@luxustravel.co.za','Douwlien','Louw','consultant',true,'2025-08-01T08:00:00Z','2025-08-01T08:00:00Z')
on conflict (user_id) do update set email=excluded.email,name=excluded.name,surname=excluded.surname,
  clearance_level = excluded.clearance_level,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

-- ============================================================
-- ============================================================
-- SECTION 2: LOCATIONS, COUNTRIES & ALIASES (from production)
-- ============================================================

-- LOCATIONS (from production)
insert into public.locations (id,name,country,region_code,created_at,updated_at,parent_location_id) values
  ('00000000-0000-0000-0000-000000001001','Pretoria','South Africa','ZA-GP','2025-08-10T08:00:00+00:00','2026-05-12T13:43:55.008671+00:00',null),
  ('00000000-0000-0000-0000-000000001002','Cape Town','South Africa','ZA-WC','2025-08-10T08:00:00+00:00','2026-05-12T13:43:55.008671+00:00',null),
  ('00000000-0000-0000-0000-000000001003','Durban','South Africa','ZA-KZN','2025-08-10T08:00:00+00:00','2026-05-12T13:43:55.008671+00:00',null),
  ('b53d5ed5-e65a-4b70-be34-cad755be7977','Victoria Falls','Zimbabwe',null,'2026-05-18T10:52:13.90095+00:00','2026-05-18T10:52:13.90095+00:00',null),
  ('9606f851-fe92-4c9c-a590-2a456018cb5d','Walvis Bay','Namibia',null,'2026-05-18T10:52:26.669672+00:00','2026-05-18T10:52:26.669672+00:00',null),
  ('97895a7e-6c9c-4571-8765-478fa4bcf695','Dar Es Salaam','Tanzania',null,'2026-05-18T10:52:36.511223+00:00','2026-05-18T10:52:36.511223+00:00',null),
  ('3ac373b2-7038-4838-aeae-df286c2653f3','Kruger National Park','South Africa',null,'2026-05-18T10:52:50.994447+00:00','2026-05-18T10:52:50.994447+00:00',null),
  ('6712bfc7-f082-4bf4-971e-5c99cf035569','Lobito','Angola',null,'2026-05-18T11:09:32.446603+00:00','2026-05-18T11:09:32.446603+00:00',null),
  ('e39728a4-26a3-4b3c-95c3-1168c7f964f1','Chobe','Botswana',null,'2026-05-18T11:09:41.510584+00:00','2026-05-18T11:09:41.510584+00:00',null),
  ('71df6f25-1e03-4425-8dee-ec4ae535f6fd','Swakopmund','Namibia',null,'2026-05-18T11:09:59.404768+00:00','2026-05-18T11:09:59.404768+00:00',null),
  ('b1cb4afc-3687-49a2-b67c-421c9a1f68a3','Waterfront','South Africa','ZA-WC','2026-05-26T10:48:43.770909+00:00','2026-05-26T10:48:43.770909+00:00','00000000-0000-0000-0000-000000001002'),
  ('1c464794-cddd-4a5a-ac18-609cddb6d319','Newlands','South Africa','ZA-WC','2026-05-26T10:48:43.770909+00:00','2026-05-26T10:48:43.770909+00:00','00000000-0000-0000-0000-000000001002'),
  ('1c97b645-b3a0-44c6-9e76-4d001366745c','Sea Point','South Africa','ZA-WC','2026-05-26T10:48:43.770909+00:00','2026-05-26T10:48:43.770909+00:00','00000000-0000-0000-0000-000000001002'),
  ('e7bf1842-79ab-4746-b607-bd04d07e9dad','Menlyn','South Africa','ZA-GP','2026-05-26T10:48:43.770909+00:00','2026-05-26T10:48:43.770909+00:00','00000000-0000-0000-0000-000000001001'),
  ('e83efe2a-3b91-4e39-a7bd-0e68a8421a95','OR Tambo INT Airport','South Africa','GAUTENG','2026-07-01T10:18:41.829467+00:00','2026-07-01T10:18:41.829467+00:00',null),
  ('eb8fefa1-039f-404f-8d5c-a58eb953bd91','Cape Town INT Airport','South Africa','WC','2026-07-01T10:18:53.509567+00:00','2026-07-01T10:18:53.509567+00:00',null),
  ('feb7f339-0be3-49e1-b472-5a58408275a6','King Shaka INT Airport','South Africa','KZN','2026-07-01T10:19:04.300214+00:00','2026-07-01T10:19:04.300214+00:00',null),
  ('409338ce-b57d-4981-bf00-041cea167bd4','Victoria Falls INT Airport','Zimbabwe',null,'2026-07-01T10:19:19.503253+00:00','2026-07-01T10:19:19.503253+00:00',null),
  ('6330a42d-f08e-4cfe-9f69-ff4fbfb4da8c','Livingston INT Airport','Zambia',null,'2026-07-01T10:19:32.136958+00:00','2026-07-01T10:19:32.136958+00:00',null),
  ('77931957-64c8-4f16-bace-d74b6542b0d9','Walvis Bay INT Airport','Namibia',null,'2026-07-01T10:19:47.629153+00:00','2026-07-01T10:19:47.629153+00:00',null),
  ('f1386625-6574-45dc-a23b-0112775a39a2','Dar Es Salaam INT Airport','Tanzania',null,'2026-07-01T10:20:02.332479+00:00','2026-07-01T10:20:02.332479+00:00',null),
  ('e14c390c-0c12-459a-93f5-983a35882ddc','Lanseria INT Airport','South Africa','GAUTENG','2026-07-01T10:20:38.089813+00:00','2026-07-01T10:20:38.089813+00:00',null),
  ('6ddeee99-110e-4a91-bdaf-14cc9159abc6','Sandton','South Africa','GP','2026-07-07T08:03:23.455069+00:00','2026-07-07T08:03:23.455069+00:00',null),
  ('4f4697f4-949f-4dad-85d8-7b4a5f07631a','Centurion','South Africa','GP','2026-07-07T08:03:33.263129+00:00','2026-07-07T08:03:33.263129+00:00',null),
  ('0982945d-2ade-47d6-93b3-5b5813313fc6','Umhlanga','South Africa','KZN','2026-07-07T08:04:43.981105+00:00','2026-07-07T08:04:43.981105+00:00',null),
  ('38a0e7c9-cfb6-4c4a-bffb-8811eec9ddab','George Airport','South Africa','WC','2026-07-07T11:08:03.19384+00:00','2026-07-07T11:08:03.19384+00:00',null),
  ('1158a7aa-dffe-4271-9dc8-4deaba3768f6','Port Elizabeth Airport','South Africa','EC','2026-07-07T11:08:21.582947+00:00','2026-07-07T11:08:21.582947+00:00',null),
  ('f234a9d8-ea16-4038-9f03-e0e9ec019e67','Bloemfontein Airport','South Africa','FS','2026-07-07T11:09:17.936954+00:00','2026-07-07T11:09:17.936954+00:00',null),
  ('740075d6-e70e-4c54-ba35-ec8fe24dcfbf','East London Airport','South Africa','EC','2026-07-07T11:09:41.402282+00:00','2026-07-07T11:09:41.402282+00:00',null)
on conflict (id) do update set name=excluded.name,country=excluded.country,region_code=excluded.region_code,parent_location_id=excluded.parent_location_id,updated_at=excluded.updated_at;


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
   'Swedish photographer. Often travels with his partner. Scenic routes for photography.',
   false,'Pullman Twin Suite. Good natural light and scenic views.','Email only. Very independent.',
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
-- ============================================================
-- SECTIONS 4-6: SUPPLIERS, RATE CARDS, PACKAGES (from production, full replace)
-- ============================================================

-- SUPPLIERS (from production, full replace)
insert into public.suppliers (id,kind,name,email,phone,website,notes,active,created_at,updated_at,status,location,slug,location_id,single_supplement_pct,location_detail,description,default_time_start,default_time_end,location_area_id,infant_max_age,child_max_age,inclusions,exclusions) values
  ('002b438f-df83-483a-9274-f17e9fef7f35','train_operator','The Blue Train','joseph.sono@transnet.net','+27 12 315 8242','https://www.bluetrain.co.za/',null,true,'2026-05-18T09:38:43.241232+00:00','2026-07-22T09:49:57.670901+00:00','active','Pretoria','the-blue-train',null,50,null,'The Blue Train offers an iconic luxury rail experience through the heart of South Africa, renowned for its elegance and world-class service. This prestigious train operates routes primarily between Pretoria and Cape Town, a 54-hour journey covering 1600 kilometers (994 miles) through diverse and spectacular scenery.
Guests aboard The Blue Train can expect opulent accommodations, including Deluxe and Luxury Suites, all en-suite with marble and gold-plated fittings. Onboard amenities feature fine dining, a lounge car, and a club car, providing an atmosphere of refined comfort. The journey includes an off-train excursion with a visit to the Kimberley Diamond Mine Museum, enhancing the immersive travel experience. The Blue Train has consistently been recognized as Africa''s Leading Luxury Train, offering a unique blend of heritage and modern luxury.',null,null,null,5,11,ARRAY[]::text[],ARRAY[]::text[]),
  ('100f03b0-fefd-4d50-85e7-64a715914c47','hotel_property','Apogee Boutique Hotel and Spa','reservations@apogeehotel.co.za','+27 12 786 0740','https://www.apogeehotel.co.za/','Important information
Early check in fees: (Subject to availability) •Full night''s rate chargeable for an early check in from 8 am (this is guaranteed as the room is booked from the night before your arrival) • R850 chargeable for an early check in from 11am Late check out fees: (Subject to availability not guaranteed) •R850 chargeable for a late check out at 12pm • R1350 chargeable for a late check out at 14pm • Full night''s rate chargeable for a late check out after 14pm
Animals
Pets are not accepted.
Parking
Car park is free of charge to all hotel guests - space reservation is not required.
Cancellation policy
1. Cancellation within 21 days of date of arrival is 50% payable of full accommodation balance.
2. Cancellation within 14 days of date of arrival is 100% payable of full accommodation
balance.
Children policy
1. Children under the age of 12 years are charged at R750 bed & breakfast in any room type
except for the standard suite.
2. Extra bed policy: Children over the age of 12 years are charged at R1300 bed & breakfast in
any other room type except for the standard suite.',true,'2026-07-01T08:07:23.544688+00:00','2026-07-01T08:22:50.453664+00:00','active','Pretoria','apogee-boutique-hotel-and-spa','00000000-0000-0000-0000-000000001001',0,'212 Johann Rissik Dr, Waterkloof Ridge, Pretoria, 0181','Located in Waterkloof Ridge, this upscale all-suite hotel is 4 km from Brooklyn Mall and 7 km from Groenkloof Nature Reserve. Elegant suites feature original artwork, Wi-Fi, smart TVs, minibars, and in-room exercise equipment. Some suites offer balconies and separate living rooms with butler service. Hotel amenities include a refined restaurant, upscale spa, outdoor pool, and complimentary breakfast and parking.',null,null,null,null,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('d6de79b1-07f9-4d5d-a122-35df6e7b93e6','train_operator','Rovos Rail','querida@rovos.co.za','+27 12 334 8459','https://rovos.com/',null,true,'2026-05-18T08:50:49.113459+00:00','2026-07-22T09:19:17.891929+00:00','active','Pretoria','rovos-rail',null,50,null,'Rovos Rail offers an unparalleled luxury train experience, often referred to as the "Pride of Africa." This private railway company is renowned for its meticulously restored vintage coaches, elegant interiors, and world-class service, providing a unique blend of classic charm and modern comfort. Journeys with Rovos Rail traverse diverse and breathtaking landscapes across Southern Africa, connecting iconic destinations such as Pretoria, Cape Town, Victoria Falls, and Dar es Salaam.
Passengers can expect spacious suites, gourmet dining, and exceptional amenities, including observation cars, lounge cars, and a gift shop. The experience is designed to evoke the golden age of travel, offering an immersive and unforgettable adventure through the heart of Africa.',null,null,null,2,9,ARRAY[]::text[],ARRAY[]::text[]),
  ('683e71eb-eb88-4c85-8b0a-4b1edb1c138d','hotel_property','TAJ Hotel','dollie.zeenat@tajhotels.com','+27218192000','https://www.tajhotels.com/','CHILD POLICY:
0-2 can be accommodated in Luxury City/Mountain view rooms (free cot)
3+ One Bedroom Suite at R400 per night (incl. breakfast)

CHECK-IN/OUT:
Check-in at 15h00
Check-out at 12h00',true,'2026-07-01T07:26:47.837801+00:00','2026-07-01T08:04:37.205593+00:00','active','Cape Town','taj-hotel','00000000-0000-0000-0000-000000001002',0,'1 Wale Street corner Saint Georges Mall, Wale St, Cape Town City Centre, Cape Town, 8000','This elegant hotel comprises a modern tower, a 19th-century office block, and a 1932 bank building. It is conveniently located just an 8-minute walk from Cape Town train station.

The stylish rooms feature minibars, complimentary Wi-Fi, iPod docks, and smart TVs. Some rooms boast high ceilings or private balconies. Suites include additional lounges and butler service, while a two-floor penthouse suite offers stunning views of Table Mountain, along with a gym and a steam room. Guests staying in suites and club rooms have access to a lounge that provides complimentary breakfast, high tea, and evening cocktails. Room service is also available.

Dining options at the hotel include three restaurants and a lobby lounge. Additionally, there is an Ayurvedic spa, a fitness centre, and an indoor pool.',null,null,null,2,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('87cbbf54-5085-4146-afe7-172f522b3325','tour_operator','City Sightseeing Bus Tours','info@citysightseeing.co.za','+27 21 511 6000','https://citysightseeing.co.za/','Agents Login: https://agent.citysightseeing.co.za/en/login/agent 

Cancellation Fees R20 admin fee per voucher, at the discretion of City Sightseeing Management.
Children 0 - 3 Free of Charge. Child fares apply to children from 4 up to 17 years of age.',true,'2026-07-01T08:26:00.843085+00:00','2026-07-01T10:03:34.340876+00:00','active','Cape Town','city-sightseeing-bus-tours','00000000-0000-0000-0000-000000001002',0,'36 Auckland Street, Paarden Eiland, Cape Town, 7420','Starts: At any of the 20 Hop-on-Hop-off Stops Tour assistance office - V&A Waterfront, located outside the Two Oceans Aquarium - CBD, located at 81 Long Street Duration: Valid from the first day of use. * Classic Ticket: 1 day * Premium Ticket: 2 consecutive days * Deluxe Ticket: 3 consecutive days Operates: Hop-on-Hop- off tours and boat cruises operate daily.   Know before you go: Hop-on-Hop-off at any of the stops along the route network and simply show the same ticket when boarding. Your ticket remains valid for the duration of the ticket purchased (1, 2 or 3 consecutive days). Cancellation Policy: Refundable if not used within the validity period. Cancellation fee of R20, per ticket cancelled, will be charged and a refund request must be sent before the voucher expires. Entrances are not included What''s included in each ticket All tickets include unlimited Hop-on-Hop-off bus access on the Red, Blue and Purple routes. Premium and Deluxe Tickets include additional experiences. Please refer to the ticket comparison section above for full details.',null,null,null,3,17,ARRAY[]::text[],ARRAY[]::text[]),
  ('d13eedf1-9700-40ae-8fce-e9cf1cb277fa','transfers','Ulysses Tours & Transfers','reservations@ulysses.co.za','+27 012 653 0018','https://www.ulysses.co.za/',null,true,'2026-05-18T11:22:16.587292+00:00','2026-07-01T08:45:12.925872+00:00','active','Pretoria','ulysses-tours-transfers',null,0,null,'Ulysses Transfers provides comprehensive transfer and tour services across South Africa, specializing in reliable and punctual door-to-door airport transfers to major hubs like OR Tambo International, Lanseria, Wonderboom, King Shaka, and Cape Town International Airports. Beyond airport shuttles, Ulysses offers chauffeur services and a diverse range of day and overnight tours, including cultural experiences, wildlife safaris, and city explorations in regions such as Gauteng, North West Province, and the Western Cape. Their fleet is equipped with air-conditioning, vehicle insurance, and tracker systems, and all chauffeurs are qualified, healthy, and maintain two-way communication with their operations office, ensuring a safe and comfortable journey for corporate, leisure, and international travelers.',null,null,null,null,null,ARRAY[]::text[],ARRAY[]::text[]),
  ('a034fb5e-10fc-48bb-be41-9a2c5ec8e681','hotel_property','Ivory Manor Boutique Hotel','frontoffice@ivorymanor.co.za','+27 12 110 4380','https://www.ivorymanor.co.za/','24-hour front desk
Wheelchair access
Bar / Lounge
Business Centre
Secured parking
Conference facilities
Free parking
Laundry service
Outdoor Pool
Restaurant
Room service
BBQ / Picnic area
WIFI',true,'2026-07-07T07:48:44.844252+00:00','2026-07-07T08:01:49.83526+00:00','active','Pretoria','ivory-manor-boutique-hotel','00000000-0000-0000-0000-000000001001',0,'280 Jochem St, Rietvalleirand, Pretoria, 0122','This upscale hotel, set in beautiful gardens, is located 30 km from Wonderboom Airport and near Erasmus Castle and Rietvlei Nature Reserve. It features nine elegant rooms with free Wi-Fi, flat-screen TVs, minibars, and tea and coffee-making facilities. Some rooms include balconies or chandeliers. Breakfast is included, and amenities include a wine cellar, an elegant restaurant with a terrace, an outdoor pool, and meeting spaces. An airport shuttle service is also available.','14:00:00','10:00:00',null,3,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('287e3a06-46fc-4676-a5c2-5faaa576bfe7','hotel_property','DaVinci Hotel & Suites','davinci@legacyhotels.com','+27 11 292 7000','https://www.legacyhotels.co.za/','Children
Children aged 12 years and younger (maximum one child per room) will be accommodated free of charge on a Bed Only basis if sharing with one or two adults, but will be charged for breakfast. Children occupying their own rooms will be charged the full adult rate. Children aged 0-2, no charge. Children aged 3-12, 50% of the applicable rate per meal per day for breakfast. This policy does not apply to room service meals.

Satellite TV
Bathroom with bath
Minibar
Slippers
Tea and coffee making set
Safe
Bathroom with shower
Towels
Air Conditioning
Hairdryer
Internet available
TV
Desk
Wardrobe
40 inch LCD flat-screen TV
51 DSTV channels and 9 Radio stations
Legacy channel
Open minibar stocked on request
Nespresso machine
En suite bathroom',true,'2026-07-07T08:06:40.732287+00:00','2026-07-07T08:24:46.647515+00:00','active','Sandton','davinci-hotel-suites','6ddeee99-110e-4a91-bdaf-14cc9159abc6',0,'Corner 5th Street &, Maude St, Sandton, 2031','This luxurious hotel is located in Sandton''s financial district, connected to Legacy Corner Mall and near the Sandton Convention Centre and Sandton City Mall, just 2.9 km from the M1 motorway. The contemporary rooms feature elegant furnishings, free Wi-Fi, and satellite TV. Suites include full kitchens, with 24/7 room service available. Guests can relax at the infinity pool with a sundeck, enjoy the full-service spa and gym, and dine at a fine restaurant specializing in Asian fusion cuisine. An ornate lounge offers a selection of wine, whiskey, and cigars. The hotel also provides conference space for up to 120 guests.','14:00:00','11:00:00',null,2,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('c3c2de5c-c68d-41c5-b04a-053708edca5a','airline','FlySafair','help@flysafair.co.za','+27 87 357 0030','https://www.flysafair.co.za/',null,true,'2026-07-01T09:34:33.028609+00:00','2026-07-01T10:23:20.654618+00:00','active',null,'flysafair',null,0,null,null,null,null,null,2,11,ARRAY[]::text[],ARRAY[]::text[]),
  ('fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','hotel_property','The President Hotel','FabianT@presidenthotel.co.za','+27 21 434 8111','https://www.presidenthotel.co.za/',null,true,'2026-07-01T08:49:07.125536+00:00','2026-07-06T10:05:58.267146+00:00','active','Cape Town','the-president-hotel','00000000-0000-0000-0000-000000001002',0,'4 Alexander Rd, Bantry Bay, Cape Town, 8001','Just a minute''s walk from Sea Point Promenade and the beach, this relaxed hotel is 6.7 km from the Table Mountain Aerial Cableway. The airy rooms and suites feature contemporary decor, en suite bathrooms, kitchenettes, and mountain or sea views, along with free WiFi and flat-screen TVs. Apartment suites offer 1 or 2 bedrooms and separate living areas.

Enjoy a complimentary breakfast buffet in the restaurant, along with amenities like an outdoor pool, spa treatment rooms, exercise room, lounge bar, gift shop, hair salon, and secure parking.','14:00:00','11:00:00',null,null,11,ARRAY[]::text[],ARRAY[]::text[]),
  ('53278302-6b75-4a49-9f16-cd8cf6d4fef6','hotel_property','Raphael Penthouse Suites','raphael@legacyhotels.com','+27 11 245 6000','https://www.legacyhotels.co.za/','Children
Children aged 12 years and younger (maximum two children per room) will be accommodated free of charge on a Bed Only basis if sharing with one or two adults, but will be charged for breakfast. Children occupying their own rooms will be charged the full adult rate. Children aged 0-2, no charge. Children aged 3-12, 50% of the applicable rate per meal per day for breakfast. This policy does not apply to room service meals.

Satellite TV
Bathroom with bath
Bathrobes
Slippers
Tea and coffee making set
Leisure section of the room
Smart Tv
Safe
Stove
Bathroom with shower
Fridge
Toaster
Microwave
Iron and ironing board
Oven
Cookware
Towels
Air Conditioning
Hairdryer
Internet available
Desk
Wardrobe
One bedroom
Free WiFi
Free Parking
Private bathroom
Lounge
Dining area
Outdoor dining area
Kitchen fully equipped
Flat screen TV
Limited DSTV bouquet
Electronic safe
Complimentary tea & coffee
Individually controlled air-conditioner
Direct-dialing telephones',true,'2026-07-07T08:26:12.770819+00:00','2026-07-07T08:35:55.92067+00:00','active','Sandton','raphael-penthouse-suites','6ddeee99-110e-4a91-bdaf-14cc9159abc6',0,'163 5th Street, Sandown, Sandton, 2031','Raphael Penthouse Suites offers exclusive all-suite accommodations for both long-term and short-term stays, catering to discerning guests who want to experience the vibrant energy of city living. Situated overlooking Nelson Mandela Square, guests can enjoy a variety of restaurants and lifestyle options nearby, along with easy access to the adjacent Sandton City Mall, Legacy Corner Mall, and Michelangelo Towers Mall. Raphael Penthouse Suites provides an unparalleled lifestyle for a fortunate few, making luxury more convenient than ever.','14:00:00','10:00:00',null,2,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('e16883b1-4dc4-4700-a8ed-3f6238d57fe9','hotel_property','The Centurion Hotel','centurion@legacyhotels.com','+27 12 643 3600','https://www.legacyhotels.co.za/','Children
Children aged 12 years and younger (maximum two children per room) will be accommodated free of charge on a Bed Only basis if sharing with one or two adults, but will be charged for meals. Children occupying their own rooms will be charged the full adult rate. Children aged 0-2, no charge. Children aged 3-12, 50% of the applicable rate per meal per day. This policy does not apply to room service meals.

Satellite TV
Tea and coffee making set
Smart Tv
Safe
Phone
Towels
Air Conditioning
Beauty set
Hairdryer
Internet available
Desk
Bathroom with bath (shower-over-bath)
Bright and spacious
Individual air-conditioning
LCD TV
Direct-dialling telephones
Electric razor plugs (100/200V)
Internet access
Electronic safe
Important information',true,'2026-07-07T08:37:13.224774+00:00','2026-07-07T08:46:01.9748+00:00','active','Centurion','the-centurion-hotel','4f4697f4-949f-4dad-85d8-7b4a5f07631a',0,'1001 Lenchen Ave N, Centurion Central, Centurion, 0046','Discover a place where you truly belong. At The Centurion Hotel, comfort and convenience combine to create a welcoming retreat for both business and leisure travelers. Enjoy tasteful decor and cozy surroundings that make you feel at home. With every detail designed for your comfort, The Centurion Hotel is the perfect choice for your next stay, offering heartfelt hospitality and a relaxing atmosphere to help you recharge and connect.','14:00:00','10:00:00',null,2,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','hotel_property','The Commodore Hotel','commodore@legacyhotels.com','+27 21 415 1000','https://www.legacyhotels.co.za/','Satellite TV
Minibar
Tea and coffee making set
Smart Tv
Safe
Bathroom with shower
Towels
Air Conditioning
Hairdryer
Internet available
TV
Desk
Wardrobe

Satellite TV
Minibar
Tea and coffee making set
Smart Tv
Safe
Bathroom with shower
Towels
Air Conditioning
Hairdryer
Internet available
TV
Desk
Wardrobe',true,'2026-07-07T08:47:30.900114+00:00','2026-07-07T09:02:03.39861+00:00','active','Cape Town','the-commodore-hotel','00000000-0000-0000-0000-000000001002',0,'Portswood Rd, Victoria & Alfred Waterfront, Cape Town, 8002','This harbour-view hotel is a 4-minute walk from the V&A Waterfront and within walking distance of the Two Oceans Aquarium and the Cape Town Diamond Museum. The contemporary rooms feature minibars, free Wi-Fi, flat-screen TVs, and tea/coffee-making facilities, with 24-hour room service available. On-site amenities include a cocktail bar, a restaurant with a harbour-view terrace, a spa, a 24-hour gym, a business centre, and two meeting rooms.','14:00:00','10:00:00',null,2,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('a78f401b-90c9-402d-8d35-0cf3dc79710c','hotel_property','Portswood Hotel','portswood@legacyhotels.com','+27 21 418 3281','https://www.legacyhotels.co.za/',null,true,'2026-07-07T09:04:42.539893+00:00','2026-07-07T09:12:23.42205+00:00','active','Cape Town','portswood-hotel','00000000-0000-0000-0000-000000001002',0,'Portswood Square, Portswood Road, V & A Waterfront, Cape Town, 8001','The Portswood Hotel is situated at the entrance of the Victoria & Alfred Waterfront. It features a lobby and restaurant that are built around a 300-year-old well, as well as the cells that once held prisoners bound for Robben Island. Its rich history makes the hotel an intriguing choice for those looking for a unique stay in Cape Town. Additionally, the hotel showcases maritime-themed historical memorabilia, including old maps and menus, offering guests a fascinating glimpse into the past.','14:00:00','10:00:00',null,2,12,ARRAY[]::text[],ARRAY[]::text[]),
  ('7dafbd36-5230-4a89-b587-4c37d409edaf','hotel_property','Kruger Shalati - Train on the Bridge','info@krugershalati.com','+27 13 591 6000','https://www.krugershalati.com/','Children staying at Kruger Shalati Train on the Bridge:
* Children below the age of 12 will not be allowed to stay in the Train on the Bridge. They will need to be accommodated in Kruger Shalati Bridge House.

Our rate includes the following: Accommodation, all meals, teas and coffees, daily soft drinks, house wines, local brand spirits and beers. It also includes two game drives daily in open game drive vehicles. There is also a complementary return road transfers between the Skukuza Airport and the lodge.

Our rate excludes the following: 1% compulsory community levy and Kruger National Park Entrance fees, premium beverages, telephone calls, and purchases from the Kruger Shalati Curio Shop. The rate also excludes spa treatments (outsourced) and transfers to and from the lodge other than to/from Skukuza Airport, and where applicable gratuities.',true,'2026-07-07T09:13:48.602562+00:00','2026-07-07T11:00:50.435619+00:00','active','Kruger National Park','kruger-shalati-train-on-the-bridge','3ac373b2-7038-4838-aeae-df286c2653f3',0,'Selati Station & Bridge, Skukuza Rest Camp, Kruger National Park','Experience the breathtaking beauty of Africa combined with luxurious comfort aboard a newly refurbished train that embodies African excellence. Permanently stationed on the historically rich Selati Bridge above the Sabie River, Kruger Shalati offers unique luxury accommodation in a reimagined train. This train pays tribute to the guests who explored the park nearly 100 years ago while inviting new adventurers from near and far. It marks the spot where the first visits to the iconic Kruger National Park were allowed in the early 1920s, when the train would overnight exactly where Kruger Shalati is now located.','14:00:00','11:00:00',null,5,12,ARRAY[]::text[],ARRAY[]::text[])
on conflict (id) do update set kind=excluded.kind,name=excluded.name,email=excluded.email,phone=excluded.phone,website=excluded.website,notes=excluded.notes,active=excluded.active,created_at=excluded.created_at,updated_at=excluded.updated_at,status=excluded.status,location=excluded.location,slug=excluded.slug,location_id=excluded.location_id,single_supplement_pct=excluded.single_supplement_pct,location_detail=excluded.location_detail,description=excluded.description,default_time_start=excluded.default_time_start,default_time_end=excluded.default_time_end,location_area_id=excluded.location_area_id,infant_max_age=excluded.infant_max_age,child_max_age=excluded.child_max_age,inclusions=excluded.inclusions,exclusions=excluded.exclusions;

update public.suppliers set active = true where id in ('002b438f-df83-483a-9274-f17e9fef7f35','100f03b0-fefd-4d50-85e7-64a715914c47','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','87cbbf54-5085-4146-afe7-172f522b3325','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','287e3a06-46fc-4676-a5c2-5faaa576bfe7','c3c2de5c-c68d-41c5-b04a-053708edca5a','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','53278302-6b75-4a49-9f16-cd8cf6d4fef6','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','a78f401b-90c9-402d-8d35-0cf3dc79710c','7dafbd36-5230-4a89-b587-4c37d409edaf');

-- SUPPLIER EMAILS & LABELS (from production)
insert into public.supplier_emails (id,supplier_id,email,label,created_at) values
  ('5e4b3ef2-1205-42d2-aab9-e8e37dee5f00','87cbbf54-5085-4146-afe7-172f522b3325','info@citysightseeing.co.za','General','2026-07-01T08:26:01.108868+00:00'),
  ('c1cf48c7-f357-4599-8150-70f0def85ce1','c3c2de5c-c68d-41c5-b04a-053708edca5a','help@flysafair.co.za','Reservations','2026-07-01T09:34:33.439733+00:00'),
  ('8e076314-6bd7-4217-8a85-442c8385cb47','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','reservations@ulysses.co.za','General','2026-05-18T11:22:16.848481+00:00'),
  ('e3ba65ac-c6a6-45d7-a40c-8f343c214225','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','ulysses@ulysses.co.za','General','2026-05-18T11:22:16.848481+00:00'),
  ('f53cf8ea-a81c-4ba5-8c95-4e3ae29a75f4','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','waterfront@ulysses.co.za','General','2026-05-18T11:22:16.848481+00:00'),
  ('02b6cfdb-2905-4aa0-ae00-b0b9f3e5205e','002b438f-df83-483a-9274-f17e9fef7f35','joseph.sono@transnet.net','Charters','2026-05-18T09:38:43.607955+00:00'),
  ('cbc119d2-fef2-4b7e-a34c-2cdaa7427b20','002b438f-df83-483a-9274-f17e9fef7f35','info@bluetrain.co.za','General','2026-05-18T09:38:43.607955+00:00'),
  ('67d9a495-bf7a-455f-975e-1e78e334d1cd','002b438f-df83-483a-9274-f17e9fef7f35','bafana.mlambo@transnet.net','Management','2026-05-18T09:38:43.607955+00:00'),
  ('2cb61d7e-f6e7-4180-ace9-352114251d84','002b438f-df83-483a-9274-f17e9fef7f35','Godfrey.Cader@transnet.net','Management','2026-07-06T09:00:24.484486+00:00'),
  ('28d397e4-43e1-46ff-a18e-70a568a79025','002b438f-df83-483a-9274-f17e9fef7f35','Ditiro.Kgautlhe@transnet.net','Marketing','2026-07-06T09:00:24.484486+00:00'),
  ('53073f80-ad21-40dc-ba0a-be96b5d9869d','002b438f-df83-483a-9274-f17e9fef7f35','carla.west@transnet.net','Reservations','2026-05-18T09:38:43.607955+00:00'),
  ('45cff0ec-31af-4062-9fa2-c3d34a286212','002b438f-df83-483a-9274-f17e9fef7f35','godfrey.nondaba@transnet.net','Reservations','2026-05-18T09:38:43.607955+00:00'),
  ('c5d93c51-3589-449d-a62e-8684c7f99175','002b438f-df83-483a-9274-f17e9fef7f35','itumeleng.rooi@transnet.net','Reservations','2026-05-18T09:38:43.607955+00:00'),
  ('be000efc-b436-4655-877a-ea19b1a75586','002b438f-df83-483a-9274-f17e9fef7f35','Lesedi.Mogapi@transnet.net','Reservations','2026-07-06T09:00:24.484486+00:00'),
  ('6bd55c75-73a9-48fa-9e2b-2b6e18f1bd0c','a78f401b-90c9-402d-8d35-0cf3dc79710c','portswood@legacyhotels.com','General','2026-07-07T09:04:42.827876+00:00'),
  ('c6723604-c1e0-43b3-9fea-f4721e239cd3','a78f401b-90c9-402d-8d35-0cf3dc79710c','crsa@legacyhotels.co.za','Reservations','2026-07-07T09:04:42.827876+00:00'),
  ('d5e4a3a2-f04e-41b6-bc2f-41f4c6d96691','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','FabianT@presidenthotel.co.za','Management','2026-07-01T08:49:07.446605+00:00'),
  ('779b15cf-f593-4cf6-b03f-c68d99031f36','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','BukiweG@presidenthotel.co.za','Reservations','2026-07-01T08:49:07.446605+00:00'),
  ('9214ca7a-a430-404e-8649-a8fbff99bb51','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','IhmaahnP@presidenthotel.co.za','Reservations','2026-07-01T08:49:07.446605+00:00'),
  ('2224112f-709d-4f1c-aa92-d31e42bd8aa1','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','reservations@presidenthotel.co.za','Reservations','2026-07-01T08:49:07.446605+00:00'),
  ('b89703ab-d677-4c9d-a56d-36c06fc96754','7dafbd36-5230-4a89-b587-4c37d409edaf','info@krugershalati.com','General','2026-07-07T09:35:07.211586+00:00'),
  ('097af839-761e-4e68-a6bb-28bf81cf8805','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','frontoffice@ivorymanor.co.za','General','2026-07-07T07:48:45.166734+00:00'),
  ('ed7d3b07-5fb1-43db-9207-778c76802996','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','dollie.zeenat@tajhotels.com','Reservations','2026-07-01T07:26:48.149653+00:00'),
  ('9d168347-a249-4390-934a-2d16328a0f71','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','res.capetown@tajhotels.com','Reservations','2026-07-01T07:26:48.149653+00:00'),
  ('e8b7eccb-57a1-4100-94db-92de59c7fe2a','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','shanaaz.rhoda@Tajhotels.com','Reservations','2026-07-01T07:26:48.149653+00:00'),
  ('0e1e1848-03cd-4ac7-a10e-5963147dd25f','100f03b0-fefd-4d50-85e7-64a715914c47','reservations@apogeehotel.co.za','Reservations','2026-07-01T08:07:23.784515+00:00'),
  ('db520d9c-9c1e-4423-87b8-d50e57aabb58','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','reception@ivorymanor.co.za','Reservations','2026-07-07T07:48:45.166734+00:00'),
  ('67dadc05-b6bf-48e9-b402-705e0d98b2c4','287e3a06-46fc-4676-a5c2-5faaa576bfe7','davinci@legacyhotels.com','General','2026-07-07T08:24:46.95951+00:00'),
  ('ab5813c0-a1a9-4d53-8f05-62a880a34c35','287e3a06-46fc-4676-a5c2-5faaa576bfe7','crsa@legacyhotels.co.za','Reservations','2026-07-07T08:24:46.95951+00:00'),
  ('6b3a409a-6b1c-40c7-9b7e-cc3f234c8a2d','7dafbd36-5230-4a89-b587-4c37d409edaf','salesadmin@motsamayi.com','Marketing','2026-07-07T09:35:07.211586+00:00'),
  ('9872ca8b-dc46-451e-bc0d-274c3b47562f','7dafbd36-5230-4a89-b587-4c37d409edaf','res4@krugershalati.com','Reservations','2026-07-07T09:35:07.211586+00:00'),
  ('1b0785cf-ea4c-497f-bed2-32d61a65a957','53278302-6b75-4a49-9f16-cd8cf6d4fef6','raphael@legacyhotels.com','General','2026-07-07T08:35:33.9606+00:00'),
  ('0f3fa679-75f9-4dc4-aeac-141aa7a0b613','53278302-6b75-4a49-9f16-cd8cf6d4fef6','crsa@legacyhotels.co.za','Reservations','2026-07-07T08:35:33.9606+00:00'),
  ('aeccba30-efc2-4dc0-b1ef-b5abe8056927','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','centurion@legacyhotels.com','General','2026-07-07T08:46:02.266228+00:00'),
  ('a303a669-93e1-4839-b50c-0bc1d3bafcd7','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','crsa@legacyhotels.co.za','Reservations','2026-07-07T08:46:02.266228+00:00'),
  ('ed06a60a-7b1a-4a24-8adf-2152c9989836','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','commodore@legacyhotels.com','General','2026-07-07T09:02:03.738699+00:00'),
  ('d93cbfb0-786e-4441-ba6d-2131c850e7bd','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','crsa@legacyhotels.co.za','Reservations','2026-07-07T09:02:03.738699+00:00'),
  ('bcb9c238-d732-4a7e-9a5a-add02121cb18','7dafbd36-5230-4a89-b587-4c37d409edaf','reservations@krugershalati.com','Reservations','2026-07-07T10:19:45.510105+00:00'),
  ('80de8130-4cf7-4544-a284-722d5ad8cacb','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','querida@rovos.co.za','Charters','2026-06-30T07:51:37.858549+00:00'),
  ('6cf5423b-2077-4994-92b8-a288ee521b95','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','communications@rovos.co.za','Communication','2026-06-30T07:51:37.858549+00:00'),
  ('eec162c6-1b13-42cc-bc22-8d425745c163','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','caitlin@rovos.co.za','Finance','2026-06-30T07:51:37.858549+00:00'),
  ('f3631078-6071-4a09-8bc5-4aa03ebf6308','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','karin@rovos.co.za','Finance','2026-05-18T08:50:49.395016+00:00'),
  ('d4e3926a-ab94-40cc-952d-8a4616c696cd','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','reservations@rovos.co.za','General','2026-05-18T08:50:49.395016+00:00'),
  ('74099884-c33f-4270-be27-3664d0fed2e0','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','armand@rovos.co.za','Marketing','2026-05-18T08:50:49.395016+00:00'),
  ('ced07f78-2809-4053-a0f7-ef2f6e2d9b1b','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','alicia@rovos.co.za','Operations','2026-06-30T07:51:37.858549+00:00'),
  ('7c1b09ce-0932-469f-a47d-3a8ad7c25e80','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','biankav@rovos.co.za','Reservations','2026-05-18T08:50:49.395016+00:00'),
  ('6838b05d-4e7e-44d4-a701-dd41dd465bfa','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','johan@rovos.co.za','Reservations','2026-05-18T08:50:49.395016+00:00'),
  ('0f5d2814-f8cb-4e1c-976c-9f2e3d86ea92','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','pieter@rovos.co.za','Reservations','2026-05-18T08:50:49.395016+00:00')
on conflict (id) do update set supplier_id=excluded.supplier_id,email=excluded.email,label=excluded.label;

insert into public.supplier_email_labels (id,name,sort_order,created_at) values
  ('becebe3a-7d46-44fa-95fe-2a189ea0da0b','Marketing',999,'2026-06-21T15:10:15.407696+00:00'),
  ('32f409cc-ec93-4d24-933b-949371a02924','Reservations',999,'2026-06-21T15:10:23.655045+00:00'),
  ('a1a52112-90b6-479a-b4f2-b97b67fb4858','Finance',999,'2026-06-21T15:10:32.622945+00:00'),
  ('d8f447b8-4929-4582-b7e1-3fe1dea998c2','General',999,'2026-06-30T07:18:06.533549+00:00'),
  ('acb39003-52f1-4959-8278-50e207f26e3b','Charters',999,'2026-06-30T07:18:32.29981+00:00'),
  ('3da62425-46d1-4131-8c52-a2a63e52bc41','Communication',999,'2026-06-30T07:19:45.044451+00:00'),
  ('23c66cbe-734f-4e60-aeda-8d6217e27464','Operations',999,'2026-06-30T07:20:03.054451+00:00'),
  ('5112e807-aa01-4b31-a081-2bb936e329c6','Management',999,'2026-06-30T08:46:34.904824+00:00')
on conflict (name) do update set sort_order=excluded.sort_order;

insert into public.rate_types (id,code,name,sort_order,is_default,archived_at,created_at,updated_at,is_standard) values
  ('60410446-b60b-45bd-ba08-8ad61a3b5250','NETT','Nett Rate',2,false,null,'2026-05-26T10:48:51.121744+00:00','2026-05-26T10:48:51.121744+00:00',false),
  ('78fc2fd2-ea30-4698-8bcd-df86c90c3f80','RAC','Rack Rate',0,true,null,'2026-05-26T10:48:51.121744+00:00','2026-05-26T10:48:51.121744+00:00',true),
  ('d0ddb7fc-2f8a-4214-8f20-cc73ad15f4ae','STO','Standard Tour Operator',1,false,null,'2026-05-26T10:48:51.121744+00:00','2026-05-26T10:48:51.121744+00:00',true),
  ('1d20eef4-9854-47d3-84ef-0c5177a95da5','SASPECIAL','SASPECIAL',4,false,'2026-06-30T08:23:07.485+00:00','2026-06-24T09:14:25.278192+00:00','2026-06-30T08:23:07.485+00:00',false),
  ('e95aee03-d7d8-4eae-bbe9-41c7a5a0426b','RESIDENT','Resident Rate',3,false,'2026-06-30T08:23:11.273+00:00','2026-05-26T10:48:51.121744+00:00','2026-06-30T08:23:11.273+00:00',false),
  ('224172d1-3ee4-4957-bc6a-75c1acd4f763','AFRICA','Africa Rate',5,false,'2026-06-30T08:25:53.367+00:00','2026-06-30T08:25:03.020173+00:00','2026-06-30T08:25:53.367+00:00',false),
  ('b1944573-da85-4edd-9b16-ca52c9f4ad63','SADC','SADC Rate',6,false,'2026-06-30T08:25:59.552+00:00','2026-06-30T08:25:15.891446+00:00','2026-06-30T08:25:59.552+00:00',false),
  ('9679b75f-ef65-4ca9-becb-96dc3bd356ae','HIGHERDOM','Higher Domestic Rate',7,false,'2026-06-30T08:26:02.896+00:00','2026-06-30T08:25:44.010377+00:00','2026-06-30T08:26:02.896+00:00',false),
  ('02879291-1b92-4d0b-996d-613423d4c746','BTLD','Blue Train Domestic Rate',8,false,null,'2026-06-30T08:30:36.386976+00:00','2026-06-30T08:30:36.386976+00:00',false),
  ('e931dcc3-237e-4408-8465-81f2e237f7b9','BTHD','Blue Train Higher Domestic',9,false,null,'2026-06-30T08:30:52.465714+00:00','2026-06-30T08:30:52.465714+00:00',false),
  ('c3b0aadf-d135-4c3f-9257-d6fcef421c8e','RVSADC','Rovos Rail SADC',10,false,null,'2026-06-30T08:31:10.542308+00:00','2026-06-30T08:31:10.542308+00:00',false),
  ('7de0ff86-1643-4b83-90fe-10772de89236','KSSADC','Shalati SADC',11,false,null,'2026-07-07T09:23:06.644042+00:00','2026-07-07T09:23:06.644042+00:00',false),
  ('193c1110-6347-41c0-b1fb-e8b2f29f86c5','KSSADCSTO','Shalati SADC STO',12,false,null,'2026-07-07T10:29:14.841057+00:00','2026-07-07T10:29:14.841057+00:00',false)
on conflict (code) do update set name=excluded.name,sort_order=excluded.sort_order,is_default=excluded.is_default,archived_at=excluded.archived_at,is_standard=excluded.is_standard,updated_at=excluded.updated_at;

insert into public.supplier_rate_adjustments (id,supplier_id,rate_type_id,discount_pct,created_at,updated_at) values
  ('83d3ca55-c069-4db2-9a3f-05b55d059692','002b438f-df83-483a-9274-f17e9fef7f35',(select id from public.rate_types where code='STO'),0,'2026-06-24T09:26:14.661764+00:00','2026-07-22T09:50:00.388+00:00'),
  ('83923ff7-650d-48de-b0f4-5d52804b7bff','002b438f-df83-483a-9274-f17e9fef7f35',(select id from public.rate_types where code='BTLD'),0,'2026-07-01T08:32:23.419221+00:00','2026-07-22T09:50:00.388+00:00'),
  ('3053dd7f-5607-4f3b-b6ab-45fb56b79ddc','002b438f-df83-483a-9274-f17e9fef7f35',(select id from public.rate_types where code='BTHD'),0,'2026-07-01T08:32:23.419221+00:00','2026-07-22T09:50:00.388+00:00'),
  ('6248db79-f631-44eb-b9c2-f8a6bb703e0c','87cbbf54-5085-4146-afe7-172f522b3325',(select id from public.rate_types where code='STO'),0,'2026-07-01T08:38:41.363287+00:00','2026-07-01T10:03:36.222+00:00'),
  ('e1d4c5d3-c9bd-429c-88c0-c94a42b85b7b','7dafbd36-5230-4a89-b587-4c37d409edaf',(select id from public.rate_types where code='RAC'),0,'2026-07-07T09:35:10.161679+00:00','2026-07-07T11:00:53.964+00:00'),
  ('b98eb7c5-47f7-4b5f-981c-eb7973aa7dcb','7dafbd36-5230-4a89-b587-4c37d409edaf',(select id from public.rate_types where code='KSSADC'),0,'2026-07-07T09:35:10.161679+00:00','2026-07-07T11:00:53.964+00:00'),
  ('49e04404-9d65-4188-a41d-167dd835dde4','7dafbd36-5230-4a89-b587-4c37d409edaf',(select id from public.rate_types where code='KSSADCSTO'),0,'2026-07-07T10:46:46.932304+00:00','2026-07-07T11:00:53.964+00:00'),
  ('2f8f5fa2-b088-4d83-af72-70faba2bff24','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',(select id from public.rate_types where code='RVSADC'),50,'2026-06-30T08:36:32.793817+00:00','2026-07-22T09:19:21.136+00:00'),
  ('189be0f8-6b00-4680-9e6c-d7828bd7be6e','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',(select id from public.rate_types where code='STO'),20,'2026-06-30T08:45:20.584836+00:00','2026-07-22T09:19:21.136+00:00')
on conflict (id) do update set supplier_id=excluded.supplier_id,rate_type_id=excluded.rate_type_id,discount_pct=excluded.discount_pct,updated_at=excluded.updated_at;

insert into public.supplier_kind_default_rate_types (kind,rate_type_id,created_at,updated_at) values
  ('train_operator',(select id from public.rate_types where code='RAC'),'2026-06-19T09:06:44.217399+00:00','2026-07-07T09:23:18.172+00:00'),
  ('hotel_property',(select id from public.rate_types where code='STO'),'2026-06-19T09:06:44.217399+00:00','2026-07-07T09:23:18.172+00:00'),
  ('transfers',(select id from public.rate_types where code='RAC'),'2026-06-19T09:06:44.217399+00:00','2026-07-07T09:23:18.172+00:00'),
  ('vehicle_rental',(select id from public.rate_types where code='RAC'),'2026-06-19T09:06:44.217399+00:00','2026-07-07T09:23:18.172+00:00'),
  ('tour_operator',(select id from public.rate_types where code='RAC'),'2026-06-19T09:06:44.217399+00:00','2026-07-07T09:23:18.172+00:00'),
  ('airline',(select id from public.rate_types where code='RAC'),'2026-06-19T09:06:44.217399+00:00','2026-07-07T09:23:18.172+00:00')
on conflict (kind) do update set rate_type_id=excluded.rate_type_id,updated_at=excluded.updated_at;
-- SUITE TYPES & VARIANT VOCABULARY (from production)
insert into public.suite_types (id,name,active,created_at,updated_at,supplier_id,passenger_capacity,luggage_capacity,description,sort_order) values
  ('d11d12fd-f300-437d-990e-d1c5401d23cf','1 Bedroom Luxury Suite',true,'2026-07-07T08:35:55.79+00:00','2026-07-07T08:35:57.114802+00:00','53278302-6b75-4a49-9f16-cd8cf6d4fef6',null,null,null,0),
  ('38f93cb6-c7b0-4fe1-b342-5a3b07ab3fc1','Classic Hop-on-Hop-off Ticket',true,'2026-07-01T10:03:34.156+00:00','2026-07-01T10:03:34.921255+00:00','87cbbf54-5085-4146-afe7-172f522b3325',null,null,null,0),
  ('cde72288-c439-418b-b505-90d040dcf4b7','1 Bedroom Executive Suite',true,'2026-07-07T08:35:55.79+00:00','2026-07-07T08:35:57.114802+00:00','53278302-6b75-4a49-9f16-cd8cf6d4fef6',null,null,null,1),
  ('8fa38777-5b0d-456c-8849-8c198b613d8f','Standard Room',true,'2026-07-07T08:46:01.849+00:00','2026-07-07T08:46:01.849+00:00','e16883b1-4dc4-4700-a8ed-3f6238d57fe9',null,null,null,0),
  ('c3d7646e-a08f-426b-a020-c43fb459fde3','Deluxe Room',true,'2026-07-07T08:46:01.849+00:00','2026-07-07T08:46:01.849+00:00','e16883b1-4dc4-4700-a8ed-3f6238d57fe9',null,null,null,1),
  ('a8d3f47b-2301-4b6e-8e32-580a574e6fa3','Executive King',true,'2026-07-07T08:46:01.849+00:00','2026-07-07T08:46:01.849+00:00','e16883b1-4dc4-4700-a8ed-3f6238d57fe9',null,null,null,2),
  ('8650f4df-c659-4163-95e1-a613bef319da','Luxury King',true,'2026-07-07T08:46:01.849+00:00','2026-07-07T08:46:01.849+00:00','e16883b1-4dc4-4700-a8ed-3f6238d57fe9',null,null,null,3),
  ('68326292-7dd9-44d7-9469-3e9dfddbd75b','Suite',true,'2026-07-07T08:46:01.849+00:00','2026-07-07T08:46:01.849+00:00','e16883b1-4dc4-4700-a8ed-3f6238d57fe9',null,null,null,4),
  ('3719c0fe-c465-4c0b-b2a5-744d4e853279','Standard Room',true,'2026-07-07T09:02:03.24+00:00','2026-07-07T09:02:03.24+00:00','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c',null,null,null,0),
  ('16627fd4-3197-4094-9a97-77f227660ce6','Deluxe Room',true,'2026-07-07T09:02:03.24+00:00','2026-07-07T09:02:03.24+00:00','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c',null,null,null,1),
  ('42f04b04-afa7-41e5-8b6a-d312ff759dfe','Economy',true,'2026-07-01T10:23:20.514+00:00','2026-07-01T10:23:21.117446+00:00','c3c2de5c-c68d-41c5-b04a-053708edca5a',null,null,null,0),
  ('d646dbde-7806-4c82-bb0a-3c9c45a5148d','Premium Economy',true,'2026-07-01T10:23:20.514+00:00','2026-07-01T10:23:21.117446+00:00','c3c2de5c-c68d-41c5-b04a-053708edca5a',null,null,null,1),
  ('9e2dd30b-0cbd-4ed1-b748-529da7db3e8b','Business Class',true,'2026-07-01T10:23:20.514+00:00','2026-07-01T10:23:21.117446+00:00','c3c2de5c-c68d-41c5-b04a-053708edca5a',null,null,null,2),
  ('6eccbfe5-3488-47d2-adcc-9196090c6b07','First Class',true,'2026-07-01T10:23:20.514+00:00','2026-07-01T10:23:21.117446+00:00','c3c2de5c-c68d-41c5-b04a-053708edca5a',null,null,null,3),
  ('698046fb-9ba5-40e5-9254-410074499ca7','Executive Family Room',true,'2026-07-07T09:02:03.24+00:00','2026-07-07T09:02:03.24+00:00','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c',null,null,null,2),
  ('889e8446-c099-4241-b565-1ce2a56fbd6f','Junior Suite',true,'2026-07-07T09:02:03.24+00:00','2026-07-07T09:02:03.24+00:00','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c',null,null,null,3),
  ('642e34ee-9a7b-4532-bb20-12a61c2f6e85','Deluxe',true,'2026-07-22T09:49:57.502+00:00','2026-07-22T09:49:58.723478+00:00','002b438f-df83-483a-9274-f17e9fef7f35',null,null,null,0),
  ('66958bfc-888f-44db-9279-e2babc8b5e7c','Luxury',true,'2026-07-22T09:49:57.502+00:00','2026-07-22T09:49:58.723478+00:00','002b438f-df83-483a-9274-f17e9fef7f35',null,null,null,0),
  ('33b334aa-db20-450c-8d83-6380a8692ebc','Standard Room',true,'2026-07-07T09:12:23.281+00:00','2026-07-07T09:12:23.281+00:00','a78f401b-90c9-402d-8d35-0cf3dc79710c',null,null,null,0),
  ('7aefb834-a2e4-4bb7-bf18-0c0d2f615d06','Deluxe Room',true,'2026-07-07T09:12:23.281+00:00','2026-07-07T09:12:23.281+00:00','a78f401b-90c9-402d-8d35-0cf3dc79710c',null,null,null,1),
  ('7d114d75-bf52-44dc-ad53-251004039070','Stuido Suite',true,'2026-07-07T09:12:23.281+00:00','2026-07-07T09:12:23.281+00:00','a78f401b-90c9-402d-8d35-0cf3dc79710c',null,null,null,2),
  ('9cf0d3f0-db74-4f57-82e5-f0c983dc2e11','Captain''s Suite',true,'2026-07-07T09:12:23.281+00:00','2026-07-07T09:12:23.281+00:00','a78f401b-90c9-402d-8d35-0cf3dc79710c',null,null,null,3),
  ('4e483e4d-a98c-44b4-a48b-71eee8ad05ca','Carriage Room',true,'2026-07-07T11:00:50.261+00:00','2026-07-07T11:00:51.799403+00:00','7dafbd36-5230-4a89-b587-4c37d409edaf',null,null,null,0),
  ('26971a30-6ed3-43ad-997c-576f26c6beb9','Bridge House Room',true,'2026-07-07T11:00:50.261+00:00','2026-07-07T11:00:51.799403+00:00','7dafbd36-5230-4a89-b587-4c37d409edaf',null,null,null,1),
  ('a8cb7e9a-fa21-4103-91a4-271ffd5f8d02','Classic Room',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:05:59.47692+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,null,0),
  ('116b14f6-0ffe-4413-ab84-2da025794a5c','Classic Mountain Room',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:05:59.47692+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,null,1),
  ('48a4d650-4b0b-422e-ac5a-13f95437d342','Studio Room',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:05:59.47692+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,null,2),
  ('f6ec6260-5d6c-4130-81be-0fd21e77d021','Classic Ocean room',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:05:59.47692+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,null,3),
  ('0d145872-160a-4518-9495-fb430f773355','Classic Ocean Room with Balcony',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:05:59.47692+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,null,4),
  ('159d8f01-77b1-45a6-add6-198d66241d52','Classic Apartment',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:05:58.137+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,null,5),
  ('bafeee2b-54cf-4fbc-beff-3f37c3917204','Luxury City View Room',true,'2026-07-01T08:04:37.043+00:00','2026-07-01T08:04:37.043+00:00','683e71eb-eb88-4c85-8b0a-4b1edb1c138d',null,null,null,0),
  ('ec650a3f-6700-48c9-a24e-ed497e838df1','Luxury Mountain View Room',true,'2026-07-01T08:04:37.043+00:00','2026-07-01T08:04:37.043+00:00','683e71eb-eb88-4c85-8b0a-4b1edb1c138d',null,null,null,1),
  ('90126d1c-24ce-4a97-a756-839c233b4171','One Bedroom Suite',true,'2026-07-01T08:04:37.043+00:00','2026-07-01T08:04:37.043+00:00','683e71eb-eb88-4c85-8b0a-4b1edb1c138d',null,null,null,2),
  ('d872a2b9-f291-46cc-9b3b-fff10fa02461','Standard Suite',true,'2026-07-01T08:22:50.321+00:00','2026-07-01T08:22:50.321+00:00','100f03b0-fefd-4d50-85e7-64a715914c47',null,null,null,0),
  ('dc37e8a3-11c0-4473-9b8f-22e0e9ed87ce','Executive Suite',true,'2026-07-01T08:22:50.321+00:00','2026-07-01T08:22:50.321+00:00','100f03b0-fefd-4d50-85e7-64a715914c47',null,null,null,1),
  ('b4784f1e-3796-4f11-96e5-a7c9f5f2d268','Deluxe Suite',true,'2026-07-07T08:01:49.692+00:00','2026-07-07T08:01:51.034077+00:00','a034fb5e-10fc-48bb-be41-9a2c5ec8e681',null,null,null,0),
  ('4c3fc73f-caeb-4344-aa90-8a6aea9c73eb','Premier Suite',true,'2026-07-07T08:01:49.692+00:00','2026-07-07T08:01:51.034077+00:00','a034fb5e-10fc-48bb-be41-9a2c5ec8e681',null,null,null,1),
  ('1be89798-a43a-40ad-bcb6-8a731fd38596','Presidential Suite',true,'2026-07-01T08:22:50.321+00:00','2026-07-01T08:22:50.321+00:00','100f03b0-fefd-4d50-85e7-64a715914c47',null,null,null,2),
  ('61012de5-914d-40e6-ad12-d4b21bbbe175','Honeymoon Suite',true,'2026-07-01T08:22:50.321+00:00','2026-07-01T08:22:50.321+00:00','100f03b0-fefd-4d50-85e7-64a715914c47',null,null,null,3),
  ('ec45f517-d406-4e98-bd71-45c0f3e5abdc','Standard Room',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,0),
  ('9c475bbe-471c-4663-8779-1d4e803d768e','Deluxe Room',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,1),
  ('57bc0e95-96aa-4c78-9b74-1d578b36fba0','Patio Deluxe',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,2),
  ('4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de','Executive Room',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,3),
  ('f423ea01-a62e-4186-b3ed-65ac4a0e1fc7','Sunset Suite',true,'2026-07-07T11:00:50.261+00:00','2026-07-07T11:00:51.799403+00:00','7dafbd36-5230-4a89-b587-4c37d409edaf',null,null,null,2),
  ('db501917-3bd6-44ce-af56-2a5facc4e5b4','Junior Suite',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,4),
  ('52696af6-a2bf-4b59-ade8-b13190fecf5d','1 Bedroom Suite',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,5),
  ('121e51b1-58bc-493b-bbcd-7a3fb7e914d3','2 Bedroom Suite',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,6),
  ('31689a4a-0865-4d77-8720-aff2622ea08f','Luxury',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:13.446678+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa',4,4,null,0),
  ('611d503f-a46b-449b-9853-453262f8458d','Minivan',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:13.446678+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa',8,8,null,0),
  ('8c26a5e8-4d2a-4754-b455-6ea680673121','SUV',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:13.446678+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa',3,3,null,0),
  ('0e68be05-16cb-491c-a43e-1f3dbbe3f59d','3 Bedroom Presidential Suite',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,null,7),
  ('5a9a0950-4f9a-43ef-b93f-2466de784bb8','Family Suite',true,'2026-07-07T11:00:50.261+00:00','2026-07-07T11:00:51.799403+00:00','7dafbd36-5230-4a89-b587-4c37d409edaf',null,null,null,3),
  ('fa56e79b-5b79-46d3-a1e4-0e9eeccb5368','Pullman Suite',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:19.07654+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,null,0),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','Deluxe Suite',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:19.07654+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,null,1),
  ('7c0aa56d-d302-4b41-91f1-d5187113dad5','Royal Suite',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:19.07654+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,null,2)
on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,description=excluded.description,passenger_capacity=excluded.passenger_capacity,luggage_capacity=excluded.luggage_capacity,sort_order=excluded.sort_order,active=excluded.active,updated_at=excluded.updated_at;

insert into public.bathroom_types (id,supplier_id,name,sort_order,archived_at,created_at,updated_at) values
  ('34eb2982-8f0f-4f22-a6ad-26373a9e6c50','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','En Suite Shower',0,null,'2026-07-01T09:03:29.039958+00:00','2026-07-01T09:03:29.039958+00:00'),
  ('ec1ce8c1-80c6-4a7e-bb89-64c7861f07b9','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','En Suite Shower in Bath',1,null,'2026-07-01T09:03:29.039958+00:00','2026-07-01T09:03:29.039958+00:00'),
  ('37ce9912-5d86-414a-87f4-539bbe9a3d19','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','En Suite Shower and Separate Bath',2,null,'2026-07-01T09:03:29.039958+00:00','2026-07-01T09:03:29.039958+00:00'),
  ('ddcaf93c-e06b-40cb-9d88-4f566c5a82dd','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','En-suite bathroom with separate bath and shower',0,null,'2026-07-07T08:00:35.056258+00:00','2026-07-07T08:00:35.056258+00:00'),
  ('935beb90-0b95-41f1-8d03-777b42c5dd5c','287e3a06-46fc-4676-a5c2-5faaa576bfe7','En-suite bathroom with a separate bath and shower',0,null,'2026-07-07T08:24:47.666893+00:00','2026-07-07T08:24:47.666893+00:00'),
  ('04832a0d-3b1d-4ac1-952c-d6d8e807d70d','53278302-6b75-4a49-9f16-cd8cf6d4fef6','Bathroom with bath',0,null,'2026-07-07T08:35:34.757002+00:00','2026-07-07T08:35:34.757002+00:00'),
  ('09285a4e-0939-416f-8f87-4648cb324c7b','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Bathroom with bath (shower-over-bath)',0,null,'2026-07-07T08:46:02.977787+00:00','2026-07-07T08:46:02.977787+00:00'),
  ('2b94ec1e-1eae-478c-bc9d-906b03c59810','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Bathroom with bath',1,null,'2026-07-07T08:46:02.977787+00:00','2026-07-07T08:46:02.977787+00:00'),
  ('5f7c8fd2-1164-4e66-a9d5-06f14bb3d352','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','En-suite with shower',0,null,'2026-07-07T09:02:04.534491+00:00','2026-07-07T09:02:04.534491+00:00'),
  ('fba295e5-87f0-454d-8fbd-e9585a8edd9c','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','En-suite with seperate bath and shower',1,null,'2026-07-07T09:02:04.534491+00:00','2026-07-07T09:02:04.534491+00:00'),
  ('0abfe60e-2e8e-4e9c-b3ef-165bb4650c67','a78f401b-90c9-402d-8d35-0cf3dc79710c','En-suite bathroom with walk-in shower',0,null,'2026-07-07T09:12:24.445574+00:00','2026-07-07T09:12:24.445574+00:00'),
  ('2f4599f8-efe9-4a87-ad42-e844a0c1ed93','a78f401b-90c9-402d-8d35-0cf3dc79710c','En-suite bathroom with separate shower and bath',1,null,'2026-07-07T09:12:24.445574+00:00','2026-07-07T09:12:24.445574+00:00'),
  ('a27c77db-813a-4baf-88a7-cf73702e75ae','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','En Suite Shower',0,null,'2026-07-01T08:04:38.262922+00:00','2026-07-01T08:04:38.262922+00:00'),
  ('dd32775b-b0b6-4c1b-91d6-8b399c491120','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','En suite Shower and Bath',1,null,'2026-07-01T08:04:38.262922+00:00','2026-07-01T08:04:38.262922+00:00'),
  ('480e130a-6301-438b-bc86-f428308edd1d','100f03b0-fefd-4d50-85e7-64a715914c47','En Suite with Shower',0,null,'2026-07-01T08:22:51.489329+00:00','2026-07-01T08:22:51.489329+00:00'),
  ('d1f10a60-114e-41de-ac6e-78d9b2266133','100f03b0-fefd-4d50-85e7-64a715914c47','En Suite with Shower and Bath',1,null,'2026-07-01T08:22:51.489329+00:00','2026-07-01T08:22:51.489329+00:00'),
  ('2611b0ae-1734-4327-8e98-fb914e92be4b','7dafbd36-5230-4a89-b587-4c37d409edaf','En-suite bathroom with shower and bath',0,null,'2026-07-07T09:35:07.946274+00:00','2026-07-07T09:35:07.946274+00:00'),
  ('c17883dd-86fb-4062-a248-e4b0d7df7a63','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Shower',0,null,'2026-06-30T07:51:38.565779+00:00','2026-06-30T07:51:38.565779+00:00'),
  ('dbadd781-fe51-40a5-8065-96ddc2e96df2','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Shower and Bath',1,null,'2026-06-30T07:51:38.565779+00:00','2026-06-30T07:51:38.565779+00:00'),
  ('36ef61f7-a30e-431b-ae99-7200836fae1a','002b438f-df83-483a-9274-f17e9fef7f35','3/4 bath',0,null,'2026-06-24T09:26:12.061468+00:00','2026-06-24T09:26:12.061468+00:00'),
  ('94973456-aab5-4ced-be6c-a0000a84ec4d','002b438f-df83-483a-9274-f17e9fef7f35','Full bath',1,null,'2026-06-24T09:26:12.061468+00:00','2026-06-24T09:26:12.061468+00:00'),
  ('b16fd91d-eafe-483e-b32d-439c6b6478e6','002b438f-df83-483a-9274-f17e9fef7f35','Shower',2,null,'2026-06-24T09:26:12.061468+00:00','2026-06-24T09:26:12.061468+00:00')
on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at;

insert into public.bedroom_layouts (id,supplier_id,name,sort_order,archived_at,created_at,updated_at) values
  ('0f1a83fd-2a1f-4232-a1ce-ed5cc0431bc8','7dafbd36-5230-4a89-b587-4c37d409edaf','Twin',0,null,'2026-07-07T09:35:07.706975+00:00','2026-07-07T09:35:07.706975+00:00'),
  ('0bd94e16-a525-495c-86c0-93b670dd869a','7dafbd36-5230-4a89-b587-4c37d409edaf','King',1,null,'2026-07-07T09:35:07.706975+00:00','2026-07-07T09:35:07.706975+00:00'),
  ('969e3a12-a908-4857-80b6-2fa00a99533c','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Crosswise',0,null,'2026-06-24T09:41:08.677806+00:00','2026-06-24T09:41:08.677806+00:00'),
  ('a1474f9a-1157-4765-9eba-7b06ddfa5c63','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Lengthways',1,null,'2026-06-24T09:41:08.677806+00:00','2026-06-24T09:41:08.677806+00:00'),
  ('1d5b4027-46fc-46f4-9b6c-51272e4a1c17','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','L-Shape',2,null,'2026-06-24T09:41:08.677806+00:00','2026-06-24T09:41:08.677806+00:00'),
  ('bc902d6c-ba6c-4537-a782-575593f5fe44','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Lengthways Split Twin',3,null,'2026-06-24T09:41:08.677806+00:00','2026-06-24T09:41:08.677806+00:00'),
  ('11a9d9c7-6a00-48fd-b747-df3569db80f9','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','Twin Room',0,null,'2026-07-01T08:04:38.019305+00:00','2026-07-01T08:04:38.019305+00:00'),
  ('7de8be38-7658-4f71-95e8-bac947f67c9a','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','King Room',1,null,'2026-07-01T08:04:38.019305+00:00','2026-07-01T08:04:38.019305+00:00'),
  ('32caa0d0-626b-4792-99df-cf9bfde3e0ee','100f03b0-fefd-4d50-85e7-64a715914c47','Twin Beds',0,null,'2026-07-01T08:22:51.248915+00:00','2026-07-01T08:22:51.248915+00:00'),
  ('5ebeff70-eeb4-4c2e-951d-8ce671060a6d','100f03b0-fefd-4d50-85e7-64a715914c47','King Bed',1,null,'2026-07-01T08:22:51.248915+00:00','2026-07-01T08:22:51.248915+00:00'),
  ('1960a53d-0fb2-4fe7-9e04-996e16398929','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Twin',0,null,'2026-07-01T09:03:28.804642+00:00','2026-07-01T09:03:28.804642+00:00'),
  ('cade8a2c-7420-401f-ac47-e05f31eccfca','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Queen',1,null,'2026-07-01T09:03:28.804642+00:00','2026-07-01T09:03:28.804642+00:00'),
  ('042ec405-88bd-4e46-adb1-85a02791f1e8','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','King',2,null,'2026-07-01T09:03:28.804642+00:00','2026-07-01T09:03:28.804642+00:00'),
  ('f4ff3fe1-303a-4406-8585-29f0e386a1ea','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','Twin',0,null,'2026-07-07T08:00:34.829923+00:00','2026-07-07T08:00:34.829923+00:00'),
  ('ee89462c-6560-4286-8a6e-8ec6b4626a8f','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','King',1,null,'2026-07-07T08:00:34.829923+00:00','2026-07-07T08:00:34.829923+00:00'),
  ('25bd02f8-0bd0-4397-b4ea-f5bb8236f385','287e3a06-46fc-4676-a5c2-5faaa576bfe7','Twin',0,null,'2026-07-07T08:24:47.435397+00:00','2026-07-07T08:24:47.435397+00:00'),
  ('f0846a79-be43-447d-a823-636547f0f96d','287e3a06-46fc-4676-a5c2-5faaa576bfe7','King',1,null,'2026-07-07T08:24:47.435397+00:00','2026-07-07T08:24:47.435397+00:00'),
  ('63e6f830-1f62-411e-90f2-4997024cf895','53278302-6b75-4a49-9f16-cd8cf6d4fef6','King',0,null,'2026-07-07T08:35:34.500065+00:00','2026-07-07T08:35:34.500065+00:00'),
  ('3f482043-741c-40e9-9fc9-22c6db575e8f','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Twin',0,null,'2026-07-07T08:46:02.747895+00:00','2026-07-07T08:46:02.747895+00:00'),
  ('31a1bd67-c115-4baf-a461-1dc2a78b75c2','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Queen',1,null,'2026-07-07T08:46:02.747895+00:00','2026-07-07T08:46:02.747895+00:00'),
  ('40eb40a0-e89a-4239-9fba-a2a74b8d45a7','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','King',2,null,'2026-07-07T08:46:02.747895+00:00','2026-07-07T08:46:02.747895+00:00'),
  ('70c678e7-320a-47e5-9e98-04cc86b04721','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Twin',0,null,'2026-07-07T09:02:04.263994+00:00','2026-07-07T09:02:04.263994+00:00'),
  ('f36bfe8d-1227-4c80-b745-77d6854f1ac1','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Queen',1,null,'2026-07-07T09:02:04.263994+00:00','2026-07-07T09:02:04.263994+00:00'),
  ('ad38513c-777d-49dc-bb1d-15648de59d42','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','King',2,null,'2026-07-07T09:02:04.263994+00:00','2026-07-07T09:02:04.263994+00:00'),
  ('27cbf700-1b6e-412e-9db1-f2dfa354b782','a78f401b-90c9-402d-8d35-0cf3dc79710c','Twin',0,null,'2026-07-07T09:12:24.209128+00:00','2026-07-07T09:12:24.209128+00:00'),
  ('784fa2be-8671-4a76-8971-e4d35d056f89','a78f401b-90c9-402d-8d35-0cf3dc79710c','Queen',1,null,'2026-07-07T09:12:24.209128+00:00','2026-07-07T09:12:24.209128+00:00'),
  ('b45705a0-ae1b-4b85-b3b2-67928d02dc4c','a78f401b-90c9-402d-8d35-0cf3dc79710c','King',2,null,'2026-07-07T09:12:24.209128+00:00','2026-07-07T09:12:24.209128+00:00')
on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at;

insert into public.bedroom_types (id,supplier_id,name,sort_order,archived_at,created_at,updated_at) values
  ('50594170-c669-4b37-91f6-f14ccfd8fe3b','7dafbd36-5230-4a89-b587-4c37d409edaf','Carriage Rooms',0,null,'2026-07-07T09:35:07.456664+00:00','2026-07-07T09:35:07.456664+00:00'),
  ('b25be4cd-2d4c-4d84-9891-8662fdd211be','7dafbd36-5230-4a89-b587-4c37d409edaf','Bridge House Rooms',1,null,'2026-07-07T09:35:07.456664+00:00','2026-07-07T09:35:07.456664+00:00'),
  ('cfba0ac7-c57d-4bb6-aba5-d78053974387','7dafbd36-5230-4a89-b587-4c37d409edaf','Sunset Suite',2,null,'2026-07-07T09:35:07.456664+00:00','2026-07-07T09:35:07.456664+00:00'),
  ('10c1eacd-5d13-425a-b129-f1109444bd9f','7dafbd36-5230-4a89-b587-4c37d409edaf','Family Suite',3,null,'2026-07-07T09:35:07.456664+00:00','2026-07-07T09:35:07.456664+00:00'),
  ('78b80549-b2ed-4d74-a576-19dfdc76c4db','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Double',0,null,'2026-06-24T09:41:08.456668+00:00','2026-06-24T09:41:08.456668+00:00'),
  ('b1e437c2-8d75-4ed4-890b-75e60e4da8a2','d6de79b1-07f9-4d5d-a122-35df6e7b93e6','Twin',1,null,'2026-06-24T09:41:08.456668+00:00','2026-06-24T09:41:08.456668+00:00'),
  ('13130e74-0855-405d-b255-6ccedd0936f0','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Room',0,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('883e17c6-d5fb-427e-9fb1-739f61ac4a58','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Mountain Room',1,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('d8fb0a83-97cd-4939-be41-bb4aedca82cd','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Studio Room',2,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('16f7be89-6b9d-491c-85f4-bdddcd6ddd9b','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Ocean Room',3,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('219c84f0-3b1f-48f4-8478-047da85b7111','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Ocean Room with Balcony',4,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('b8cb8108-6eb0-4c15-a245-d2229a046c3f','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Apartment',5,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('1fc98cd3-c9ed-402a-a643-7ec6c5d9372d','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Mountain Apartment',6,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('bf8771a0-6c95-4181-8c5a-60708a87fffb','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Classic Mountain Apartment with Balcony',7,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('e134caf4-8f5f-4c1b-bab9-dfd1e1200aef','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','Ocean Suite',8,null,'2026-07-01T09:03:28.572398+00:00','2026-07-01T09:03:28.572398+00:00'),
  ('10a2c998-9bf4-4be1-ad32-33af130662b9','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','Deluxe Suite',0,null,'2026-07-07T08:00:34.589745+00:00','2026-07-07T08:00:34.589745+00:00'),
  ('1192789e-9999-411d-884c-a8fc0a13565f','a034fb5e-10fc-48bb-be41-9a2c5ec8e681','Premier Suite',1,null,'2026-07-07T08:00:34.589745+00:00','2026-07-07T08:00:34.589745+00:00'),
  ('d67ee1ec-b0fd-4559-8476-b1885e73d8a3','287e3a06-46fc-4676-a5c2-5faaa576bfe7','Standard Room',0,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('8a2612c8-7cf9-4a79-9939-f5a442f2612f','287e3a06-46fc-4676-a5c2-5faaa576bfe7','Deluxe Room',1,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('22f50361-9cd6-4c68-9d9c-93f86c098dad','287e3a06-46fc-4676-a5c2-5faaa576bfe7','Patio Deluxe',2,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('e7446f0c-93c7-4b0f-a2d9-088b5789babc','287e3a06-46fc-4676-a5c2-5faaa576bfe7','Executive Room',3,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('65df61d0-f669-4bff-9c5e-217502cc4c6b','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','Luxury City View Room',0,null,'2026-07-01T08:04:37.773132+00:00','2026-07-01T08:04:37.773132+00:00'),
  ('3fffc787-2320-4196-bd6e-4c56a1fdd5ff','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','Luxury Mountain View Room',1,null,'2026-07-01T08:04:37.773132+00:00','2026-07-01T08:04:37.773132+00:00'),
  ('b53051b1-8846-417e-b4a7-778d80bfb49c','683e71eb-eb88-4c85-8b0a-4b1edb1c138d','One Bedroom Suite',2,null,'2026-07-01T08:04:37.773132+00:00','2026-07-01T08:04:37.773132+00:00'),
  ('f98f57db-b3f7-4109-a395-e59834e945f0','100f03b0-fefd-4d50-85e7-64a715914c47','Standard Suites',0,null,'2026-07-01T08:22:51.007211+00:00','2026-07-01T08:22:51.007211+00:00'),
  ('0e802cf7-9494-443c-aa0a-1c84dc2ce6b7','100f03b0-fefd-4d50-85e7-64a715914c47','Executive Suites',1,null,'2026-07-01T08:22:51.007211+00:00','2026-07-01T08:22:51.007211+00:00'),
  ('3d01ac97-3613-4bcd-9568-83494d046f25','100f03b0-fefd-4d50-85e7-64a715914c47','Presidential Suite',2,null,'2026-07-01T08:22:51.007211+00:00','2026-07-01T08:22:51.007211+00:00'),
  ('a74ae49b-3c44-4e3a-9553-8f812849a474','100f03b0-fefd-4d50-85e7-64a715914c47','Honeymoon Suite',3,null,'2026-07-01T08:22:51.007211+00:00','2026-07-01T08:22:51.007211+00:00'),
  ('20d1fa4f-5668-4418-91bd-46b4410ec7bf','287e3a06-46fc-4676-a5c2-5faaa576bfe7','Junior Suite',4,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('44cee538-7dca-493e-8be0-67b0b55feee5','287e3a06-46fc-4676-a5c2-5faaa576bfe7','1 Bedroom Suite',5,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('100eb00c-3f5a-40be-a977-991eb4043e60','287e3a06-46fc-4676-a5c2-5faaa576bfe7','2 Bedroom Suite',6,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('c0bcc3b4-defe-4c14-97aa-044d5e83f79f','287e3a06-46fc-4676-a5c2-5faaa576bfe7','3 Bedroom Presidential Suite',7,null,'2026-07-07T08:24:47.191678+00:00','2026-07-07T08:24:47.191678+00:00'),
  ('f5b5b10c-389c-4ff2-8071-b8aab24118ad','53278302-6b75-4a49-9f16-cd8cf6d4fef6','1 Bedroom Luxury Suite',0,null,'2026-07-07T08:35:34.232056+00:00','2026-07-07T08:35:34.232056+00:00'),
  ('95bb3d7e-05a1-40fe-bf51-87fdc540c45f','53278302-6b75-4a49-9f16-cd8cf6d4fef6','1 Bedroom Executive Suite',1,null,'2026-07-07T08:35:34.232056+00:00','2026-07-07T08:35:34.232056+00:00'),
  ('14dab3e2-4896-43ad-af23-a0757c2d7e5b','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Standard Room',0,null,'2026-07-07T08:46:02.513949+00:00','2026-07-07T08:46:02.513949+00:00'),
  ('5c6184e6-d1d3-4ff8-8317-1c044cbdff4f','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Deluxe Room',1,null,'2026-07-07T08:46:02.513949+00:00','2026-07-07T08:46:02.513949+00:00'),
  ('5e5dfcf5-e8f7-4204-802b-1c044f0faba8','002b438f-df83-483a-9274-f17e9fef7f35','Double',0,null,'2026-06-24T09:26:11.835436+00:00','2026-06-24T09:26:11.835436+00:00'),
  ('9bba2965-8044-41b0-8b90-fff47715372c','002b438f-df83-483a-9274-f17e9fef7f35','Twin',1,null,'2026-06-24T09:26:11.835436+00:00','2026-06-24T09:26:11.835436+00:00'),
  ('254db418-0909-4c93-a5e8-b5a6aa22a293','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Executive King',2,null,'2026-07-07T08:46:02.513949+00:00','2026-07-07T08:46:02.513949+00:00'),
  ('8e9c6802-2dd1-484a-9c09-4d6cc430858a','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Luxury King',3,null,'2026-07-07T08:46:02.513949+00:00','2026-07-07T08:46:02.513949+00:00'),
  ('a027f9e3-d67e-48c2-ae83-6d3bf41acc49','e16883b1-4dc4-4700-a8ed-3f6238d57fe9','Suite',4,null,'2026-07-07T08:46:02.513949+00:00','2026-07-07T08:46:02.513949+00:00'),
  ('49001abd-3cac-488b-85d1-fe92b681e60e','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Standard Room',0,null,'2026-07-07T09:02:03.992001+00:00','2026-07-07T09:02:03.992001+00:00'),
  ('574acd69-b636-4087-8d03-966033ac6d39','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Deluxe Room',1,null,'2026-07-07T09:02:03.992001+00:00','2026-07-07T09:02:03.992001+00:00'),
  ('ba6d9b91-8959-41cc-97a2-4a2c90de63df','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Executive Room',2,null,'2026-07-07T09:02:03.992001+00:00','2026-07-07T09:02:03.992001+00:00'),
  ('4ea59e3f-5cf9-479a-b2bb-9d40a7e00537','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Family Room',3,null,'2026-07-07T09:02:03.992001+00:00','2026-07-07T09:02:03.992001+00:00'),
  ('e0f7fe42-4b73-4472-855c-f081e19feceb','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c','Junior Suite',4,null,'2026-07-07T09:02:03.992001+00:00','2026-07-07T09:02:03.992001+00:00'),
  ('5faf3cbd-812b-4327-99fd-eadb6e4dd915','a78f401b-90c9-402d-8d35-0cf3dc79710c','Standard Room',0,null,'2026-07-07T09:12:23.963349+00:00','2026-07-07T09:12:23.963349+00:00'),
  ('da04fe06-2cb8-4f44-b137-b3db407cfd50','a78f401b-90c9-402d-8d35-0cf3dc79710c','Deluxe Room',1,null,'2026-07-07T09:12:23.963349+00:00','2026-07-07T09:12:23.963349+00:00'),
  ('67859fa9-0054-4558-aecc-7ed2f0235675','a78f401b-90c9-402d-8d35-0cf3dc79710c','Studio Suite',2,null,'2026-07-07T09:12:23.963349+00:00','2026-07-07T09:12:23.963349+00:00'),
  ('66437872-3af5-47c0-94b7-3ca9425cb961','a78f401b-90c9-402d-8d35-0cf3dc79710c','Captain''s Suite',3,null,'2026-07-07T09:12:23.963349+00:00','2026-07-07T09:12:23.963349+00:00')
on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at;

insert into public.suite_type_bathroom_types (suite_type_id,bathroom_type_id,created_at) values
  ('a8cb7e9a-fa21-4103-91a4-271ffd5f8d02','ec1ce8c1-80c6-4a7e-bb89-64c7861f07b9','2026-07-06T10:06:00.400388+00:00'),
  ('116b14f6-0ffe-4413-ab84-2da025794a5c','ec1ce8c1-80c6-4a7e-bb89-64c7861f07b9','2026-07-06T10:06:00.400388+00:00'),
  ('48a4d650-4b0b-422e-ac5a-13f95437d342','ec1ce8c1-80c6-4a7e-bb89-64c7861f07b9','2026-07-06T10:06:00.400388+00:00'),
  ('f6ec6260-5d6c-4130-81be-0fd21e77d021','ec1ce8c1-80c6-4a7e-bb89-64c7861f07b9','2026-07-06T10:06:00.400388+00:00'),
  ('0d145872-160a-4518-9495-fb430f773355','ec1ce8c1-80c6-4a7e-bb89-64c7861f07b9','2026-07-06T10:06:00.400388+00:00'),
  ('159d8f01-77b1-45a6-add6-198d66241d52','37ce9912-5d86-414a-87f4-539bbe9a3d19','2026-07-06T10:06:00.400388+00:00'),
  ('b4784f1e-3796-4f11-96e5-a7c9f5f2d268','ddcaf93c-e06b-40cb-9d88-4f566c5a82dd','2026-07-07T08:01:51.952451+00:00'),
  ('4c3fc73f-caeb-4344-aa90-8a6aea9c73eb','ddcaf93c-e06b-40cb-9d88-4f566c5a82dd','2026-07-07T08:01:51.952451+00:00'),
  ('ec45f517-d406-4e98-bd71-45c0f3e5abdc','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('9c475bbe-471c-4663-8779-1d4e803d768e','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('57bc0e95-96aa-4c78-9b74-1d578b36fba0','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('db501917-3bd6-44ce-af56-2a5facc4e5b4','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('52696af6-a2bf-4b59-ade8-b13190fecf5d','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('121e51b1-58bc-493b-bbcd-7a3fb7e914d3','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('0e68be05-16cb-491c-a43e-1f3dbbe3f59d','935beb90-0b95-41f1-8d03-777b42c5dd5c','2026-07-07T08:24:48.864212+00:00'),
  ('d11d12fd-f300-437d-990e-d1c5401d23cf','04832a0d-3b1d-4ac1-952c-d6d8e807d70d','2026-07-07T08:35:58.047419+00:00'),
  ('cde72288-c439-418b-b505-90d040dcf4b7','04832a0d-3b1d-4ac1-952c-d6d8e807d70d','2026-07-07T08:35:58.047419+00:00'),
  ('bafeee2b-54cf-4fbc-beff-3f37c3917204','a27c77db-813a-4baf-88a7-cf73702e75ae','2026-07-01T08:04:39.461902+00:00'),
  ('ec650a3f-6700-48c9-a24e-ed497e838df1','dd32775b-b0b6-4c1b-91d6-8b399c491120','2026-07-01T08:04:39.461902+00:00'),
  ('90126d1c-24ce-4a97-a756-839c233b4171','dd32775b-b0b6-4c1b-91d6-8b399c491120','2026-07-01T08:04:39.461902+00:00'),
  ('d872a2b9-f291-46cc-9b3b-fff10fa02461','480e130a-6301-438b-bc86-f428308edd1d','2026-07-01T08:22:52.682823+00:00'),
  ('dc37e8a3-11c0-4473-9b8f-22e0e9ed87ce','480e130a-6301-438b-bc86-f428308edd1d','2026-07-01T08:22:52.682823+00:00'),
  ('1be89798-a43a-40ad-bcb6-8a731fd38596','d1f10a60-114e-41de-ac6e-78d9b2266133','2026-07-01T08:22:52.682823+00:00'),
  ('61012de5-914d-40e6-ad12-d4b21bbbe175','d1f10a60-114e-41de-ac6e-78d9b2266133','2026-07-01T08:22:52.682823+00:00'),
  ('c3d7646e-a08f-426b-a020-c43fb459fde3','09285a4e-0939-416f-8f87-4648cb324c7b','2026-07-07T08:46:04.162959+00:00'),
  ('a8d3f47b-2301-4b6e-8e32-580a574e6fa3','09285a4e-0939-416f-8f87-4648cb324c7b','2026-07-07T08:46:04.162959+00:00'),
  ('8650f4df-c659-4163-95e1-a613bef319da','09285a4e-0939-416f-8f87-4648cb324c7b','2026-07-07T08:46:04.162959+00:00'),
  ('68326292-7dd9-44d7-9469-3e9dfddbd75b','2b94ec1e-1eae-478c-bc9d-906b03c59810','2026-07-07T08:46:04.162959+00:00'),
  ('3719c0fe-c465-4c0b-b2a5-744d4e853279','5f7c8fd2-1164-4e66-a9d5-06f14bb3d352','2026-07-07T09:02:05.82015+00:00'),
  ('16627fd4-3197-4094-9a97-77f227660ce6','5f7c8fd2-1164-4e66-a9d5-06f14bb3d352','2026-07-07T09:02:05.82015+00:00'),
  ('698046fb-9ba5-40e5-9254-410074499ca7','fba295e5-87f0-454d-8fbd-e9585a8edd9c','2026-07-07T09:02:05.82015+00:00'),
  ('889e8446-c099-4241-b565-1ce2a56fbd6f','fba295e5-87f0-454d-8fbd-e9585a8edd9c','2026-07-07T09:02:05.82015+00:00'),
  ('33b334aa-db20-450c-8d83-6380a8692ebc','0abfe60e-2e8e-4e9c-b3ef-165bb4650c67','2026-07-07T09:12:25.631341+00:00'),
  ('7aefb834-a2e4-4bb7-bf18-0c0d2f615d06','2f4599f8-efe9-4a87-ad42-e844a0c1ed93','2026-07-07T09:12:25.631341+00:00'),
  ('7d114d75-bf52-44dc-ad53-251004039070','2f4599f8-efe9-4a87-ad42-e844a0c1ed93','2026-07-07T09:12:25.631341+00:00'),
  ('9cf0d3f0-db74-4f57-82e5-f0c983dc2e11','2f4599f8-efe9-4a87-ad42-e844a0c1ed93','2026-07-07T09:12:25.631341+00:00'),
  ('4e483e4d-a98c-44b4-a48b-71eee8ad05ca','2611b0ae-1734-4327-8e98-fb914e92be4b','2026-07-07T11:00:52.830291+00:00'),
  ('26971a30-6ed3-43ad-997c-576f26c6beb9','2611b0ae-1734-4327-8e98-fb914e92be4b','2026-07-07T11:00:52.830291+00:00'),
  ('f423ea01-a62e-4186-b3ed-65ac4a0e1fc7','2611b0ae-1734-4327-8e98-fb914e92be4b','2026-07-07T11:00:52.830291+00:00'),
  ('5a9a0950-4f9a-43ef-b93f-2466de784bb8','2611b0ae-1734-4327-8e98-fb914e92be4b','2026-07-07T11:00:52.830291+00:00'),
  ('fa56e79b-5b79-46d3-a1e4-0e9eeccb5368','c17883dd-86fb-4062-a248-e4b0d7df7a63','2026-07-22T09:19:19.930686+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','c17883dd-86fb-4062-a248-e4b0d7df7a63','2026-07-22T09:19:19.930686+00:00'),
  ('7c0aa56d-d302-4b41-91f1-d5187113dad5','dbadd781-fe51-40a5-8065-96ddc2e96df2','2026-07-22T09:19:19.930686+00:00'),
  ('642e34ee-9a7b-4532-bb20-12a61c2f6e85','36ef61f7-a30e-431b-ae99-7200836fae1a','2026-07-22T09:49:59.442212+00:00'),
  ('642e34ee-9a7b-4532-bb20-12a61c2f6e85','b16fd91d-eafe-483e-b32d-439c6b6478e6','2026-07-22T09:49:59.442212+00:00'),
  ('66958bfc-888f-44db-9279-e2babc8b5e7c','94973456-aab5-4ced-be6c-a0000a84ec4d','2026-07-22T09:49:59.442212+00:00')
on conflict do nothing;

insert into public.suite_type_bedroom_layouts (suite_type_id,bedroom_layout_id,created_at) values
  ('fa56e79b-5b79-46d3-a1e4-0e9eeccb5368','a1474f9a-1157-4765-9eba-7b06ddfa5c63','2026-07-22T09:19:19.721592+00:00'),
  ('fa56e79b-5b79-46d3-a1e4-0e9eeccb5368','969e3a12-a908-4857-80b6-2fa00a99533c','2026-07-22T09:19:19.721592+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','969e3a12-a908-4857-80b6-2fa00a99533c','2026-07-22T09:19:19.721592+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','1d5b4027-46fc-46f4-9b6c-51272e4a1c17','2026-07-22T09:19:19.721592+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','a1474f9a-1157-4765-9eba-7b06ddfa5c63','2026-07-22T09:19:19.721592+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','bc902d6c-ba6c-4537-a782-575593f5fe44','2026-07-22T09:19:19.721592+00:00'),
  ('7c0aa56d-d302-4b41-91f1-d5187113dad5','a1474f9a-1157-4765-9eba-7b06ddfa5c63','2026-07-22T09:19:19.721592+00:00'),
  ('7c0aa56d-d302-4b41-91f1-d5187113dad5','bc902d6c-ba6c-4537-a782-575593f5fe44','2026-07-22T09:19:19.721592+00:00'),
  ('a8cb7e9a-fa21-4103-91a4-271ffd5f8d02','1960a53d-0fb2-4fe7-9e04-996e16398929','2026-07-06T10:06:00.1727+00:00'),
  ('a8cb7e9a-fa21-4103-91a4-271ffd5f8d02','cade8a2c-7420-401f-ac47-e05f31eccfca','2026-07-06T10:06:00.1727+00:00'),
  ('116b14f6-0ffe-4413-ab84-2da025794a5c','cade8a2c-7420-401f-ac47-e05f31eccfca','2026-07-06T10:06:00.1727+00:00'),
  ('116b14f6-0ffe-4413-ab84-2da025794a5c','1960a53d-0fb2-4fe7-9e04-996e16398929','2026-07-06T10:06:00.1727+00:00'),
  ('48a4d650-4b0b-422e-ac5a-13f95437d342','1960a53d-0fb2-4fe7-9e04-996e16398929','2026-07-06T10:06:00.1727+00:00'),
  ('48a4d650-4b0b-422e-ac5a-13f95437d342','cade8a2c-7420-401f-ac47-e05f31eccfca','2026-07-06T10:06:00.1727+00:00'),
  ('f6ec6260-5d6c-4130-81be-0fd21e77d021','cade8a2c-7420-401f-ac47-e05f31eccfca','2026-07-06T10:06:00.1727+00:00'),
  ('f6ec6260-5d6c-4130-81be-0fd21e77d021','1960a53d-0fb2-4fe7-9e04-996e16398929','2026-07-06T10:06:00.1727+00:00'),
  ('0d145872-160a-4518-9495-fb430f773355','cade8a2c-7420-401f-ac47-e05f31eccfca','2026-07-06T10:06:00.1727+00:00'),
  ('0d145872-160a-4518-9495-fb430f773355','1960a53d-0fb2-4fe7-9e04-996e16398929','2026-07-06T10:06:00.1727+00:00'),
  ('159d8f01-77b1-45a6-add6-198d66241d52','042ec405-88bd-4e46-adb1-85a02791f1e8','2026-07-06T10:06:00.1727+00:00'),
  ('159d8f01-77b1-45a6-add6-198d66241d52','1960a53d-0fb2-4fe7-9e04-996e16398929','2026-07-06T10:06:00.1727+00:00'),
  ('b4784f1e-3796-4f11-96e5-a7c9f5f2d268','f4ff3fe1-303a-4406-8585-29f0e386a1ea','2026-07-07T08:01:51.732451+00:00'),
  ('b4784f1e-3796-4f11-96e5-a7c9f5f2d268','ee89462c-6560-4286-8a6e-8ec6b4626a8f','2026-07-07T08:01:51.732451+00:00'),
  ('4c3fc73f-caeb-4344-aa90-8a6aea9c73eb','f4ff3fe1-303a-4406-8585-29f0e386a1ea','2026-07-07T08:01:51.732451+00:00'),
  ('4c3fc73f-caeb-4344-aa90-8a6aea9c73eb','ee89462c-6560-4286-8a6e-8ec6b4626a8f','2026-07-07T08:01:51.732451+00:00'),
  ('ec45f517-d406-4e98-bd71-45c0f3e5abdc','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('ec45f517-d406-4e98-bd71-45c0f3e5abdc','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('9c475bbe-471c-4663-8779-1d4e803d768e','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('9c475bbe-471c-4663-8779-1d4e803d768e','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('57bc0e95-96aa-4c78-9b74-1d578b36fba0','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('57bc0e95-96aa-4c78-9b74-1d578b36fba0','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('db501917-3bd6-44ce-af56-2a5facc4e5b4','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('db501917-3bd6-44ce-af56-2a5facc4e5b4','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('bafeee2b-54cf-4fbc-beff-3f37c3917204','7de8be38-7658-4f71-95e8-bac947f67c9a','2026-07-01T08:04:39.236664+00:00'),
  ('ec650a3f-6700-48c9-a24e-ed497e838df1','11a9d9c7-6a00-48fd-b747-df3569db80f9','2026-07-01T08:04:39.236664+00:00'),
  ('ec650a3f-6700-48c9-a24e-ed497e838df1','7de8be38-7658-4f71-95e8-bac947f67c9a','2026-07-01T08:04:39.236664+00:00'),
  ('90126d1c-24ce-4a97-a756-839c233b4171','11a9d9c7-6a00-48fd-b747-df3569db80f9','2026-07-01T08:04:39.236664+00:00'),
  ('90126d1c-24ce-4a97-a756-839c233b4171','7de8be38-7658-4f71-95e8-bac947f67c9a','2026-07-01T08:04:39.236664+00:00'),
  ('d872a2b9-f291-46cc-9b3b-fff10fa02461','32caa0d0-626b-4792-99df-cf9bfde3e0ee','2026-07-01T08:22:52.460969+00:00'),
  ('d872a2b9-f291-46cc-9b3b-fff10fa02461','5ebeff70-eeb4-4c2e-951d-8ce671060a6d','2026-07-01T08:22:52.460969+00:00'),
  ('dc37e8a3-11c0-4473-9b8f-22e0e9ed87ce','32caa0d0-626b-4792-99df-cf9bfde3e0ee','2026-07-01T08:22:52.460969+00:00'),
  ('dc37e8a3-11c0-4473-9b8f-22e0e9ed87ce','5ebeff70-eeb4-4c2e-951d-8ce671060a6d','2026-07-01T08:22:52.460969+00:00'),
  ('1be89798-a43a-40ad-bcb6-8a731fd38596','32caa0d0-626b-4792-99df-cf9bfde3e0ee','2026-07-01T08:22:52.460969+00:00'),
  ('1be89798-a43a-40ad-bcb6-8a731fd38596','5ebeff70-eeb4-4c2e-951d-8ce671060a6d','2026-07-01T08:22:52.460969+00:00'),
  ('61012de5-914d-40e6-ad12-d4b21bbbe175','32caa0d0-626b-4792-99df-cf9bfde3e0ee','2026-07-01T08:22:52.460969+00:00'),
  ('61012de5-914d-40e6-ad12-d4b21bbbe175','5ebeff70-eeb4-4c2e-951d-8ce671060a6d','2026-07-01T08:22:52.460969+00:00'),
  ('52696af6-a2bf-4b59-ade8-b13190fecf5d','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('52696af6-a2bf-4b59-ade8-b13190fecf5d','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('121e51b1-58bc-493b-bbcd-7a3fb7e914d3','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('121e51b1-58bc-493b-bbcd-7a3fb7e914d3','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('0e68be05-16cb-491c-a43e-1f3dbbe3f59d','25bd02f8-0bd0-4397-b4ea-f5bb8236f385','2026-07-07T08:24:48.63528+00:00'),
  ('0e68be05-16cb-491c-a43e-1f3dbbe3f59d','f0846a79-be43-447d-a823-636547f0f96d','2026-07-07T08:24:48.63528+00:00'),
  ('d11d12fd-f300-437d-990e-d1c5401d23cf','63e6f830-1f62-411e-90f2-4997024cf895','2026-07-07T08:35:57.821762+00:00'),
  ('cde72288-c439-418b-b505-90d040dcf4b7','63e6f830-1f62-411e-90f2-4997024cf895','2026-07-07T08:35:57.821762+00:00'),
  ('8fa38777-5b0d-456c-8849-8c198b613d8f','3f482043-741c-40e9-9fc9-22c6db575e8f','2026-07-07T08:46:03.927926+00:00'),
  ('8fa38777-5b0d-456c-8849-8c198b613d8f','31a1bd67-c115-4baf-a461-1dc2a78b75c2','2026-07-07T08:46:03.927926+00:00'),
  ('c3d7646e-a08f-426b-a020-c43fb459fde3','3f482043-741c-40e9-9fc9-22c6db575e8f','2026-07-07T08:46:03.927926+00:00'),
  ('c3d7646e-a08f-426b-a020-c43fb459fde3','31a1bd67-c115-4baf-a461-1dc2a78b75c2','2026-07-07T08:46:03.927926+00:00'),
  ('a8d3f47b-2301-4b6e-8e32-580a574e6fa3','3f482043-741c-40e9-9fc9-22c6db575e8f','2026-07-07T08:46:03.927926+00:00'),
  ('a8d3f47b-2301-4b6e-8e32-580a574e6fa3','40eb40a0-e89a-4239-9fba-a2a74b8d45a7','2026-07-07T08:46:03.927926+00:00'),
  ('8650f4df-c659-4163-95e1-a613bef319da','3f482043-741c-40e9-9fc9-22c6db575e8f','2026-07-07T08:46:03.927926+00:00'),
  ('8650f4df-c659-4163-95e1-a613bef319da','40eb40a0-e89a-4239-9fba-a2a74b8d45a7','2026-07-07T08:46:03.927926+00:00'),
  ('68326292-7dd9-44d7-9469-3e9dfddbd75b','40eb40a0-e89a-4239-9fba-a2a74b8d45a7','2026-07-07T08:46:03.927926+00:00'),
  ('68326292-7dd9-44d7-9469-3e9dfddbd75b','3f482043-741c-40e9-9fc9-22c6db575e8f','2026-07-07T08:46:03.927926+00:00'),
  ('3719c0fe-c465-4c0b-b2a5-744d4e853279','70c678e7-320a-47e5-9e98-04cc86b04721','2026-07-07T09:02:05.573677+00:00'),
  ('3719c0fe-c465-4c0b-b2a5-744d4e853279','f36bfe8d-1227-4c80-b745-77d6854f1ac1','2026-07-07T09:02:05.573677+00:00'),
  ('16627fd4-3197-4094-9a97-77f227660ce6','70c678e7-320a-47e5-9e98-04cc86b04721','2026-07-07T09:02:05.573677+00:00'),
  ('16627fd4-3197-4094-9a97-77f227660ce6','f36bfe8d-1227-4c80-b745-77d6854f1ac1','2026-07-07T09:02:05.573677+00:00'),
  ('698046fb-9ba5-40e5-9254-410074499ca7','70c678e7-320a-47e5-9e98-04cc86b04721','2026-07-07T09:02:05.573677+00:00'),
  ('698046fb-9ba5-40e5-9254-410074499ca7','f36bfe8d-1227-4c80-b745-77d6854f1ac1','2026-07-07T09:02:05.573677+00:00'),
  ('889e8446-c099-4241-b565-1ce2a56fbd6f','ad38513c-777d-49dc-bb1d-15648de59d42','2026-07-07T09:02:05.573677+00:00'),
  ('889e8446-c099-4241-b565-1ce2a56fbd6f','70c678e7-320a-47e5-9e98-04cc86b04721','2026-07-07T09:02:05.573677+00:00'),
  ('33b334aa-db20-450c-8d83-6380a8692ebc','27cbf700-1b6e-412e-9db1-f2dfa354b782','2026-07-07T09:12:25.395596+00:00'),
  ('33b334aa-db20-450c-8d83-6380a8692ebc','784fa2be-8671-4a76-8971-e4d35d056f89','2026-07-07T09:12:25.395596+00:00'),
  ('7aefb834-a2e4-4bb7-bf18-0c0d2f615d06','27cbf700-1b6e-412e-9db1-f2dfa354b782','2026-07-07T09:12:25.395596+00:00'),
  ('7aefb834-a2e4-4bb7-bf18-0c0d2f615d06','784fa2be-8671-4a76-8971-e4d35d056f89','2026-07-07T09:12:25.395596+00:00'),
  ('7d114d75-bf52-44dc-ad53-251004039070','27cbf700-1b6e-412e-9db1-f2dfa354b782','2026-07-07T09:12:25.395596+00:00'),
  ('7d114d75-bf52-44dc-ad53-251004039070','b45705a0-ae1b-4b85-b3b2-67928d02dc4c','2026-07-07T09:12:25.395596+00:00'),
  ('9cf0d3f0-db74-4f57-82e5-f0c983dc2e11','27cbf700-1b6e-412e-9db1-f2dfa354b782','2026-07-07T09:12:25.395596+00:00'),
  ('9cf0d3f0-db74-4f57-82e5-f0c983dc2e11','b45705a0-ae1b-4b85-b3b2-67928d02dc4c','2026-07-07T09:12:25.395596+00:00'),
  ('4e483e4d-a98c-44b4-a48b-71eee8ad05ca','0f1a83fd-2a1f-4232-a1ce-ed5cc0431bc8','2026-07-07T11:00:52.570054+00:00'),
  ('4e483e4d-a98c-44b4-a48b-71eee8ad05ca','0bd94e16-a525-495c-86c0-93b670dd869a','2026-07-07T11:00:52.570054+00:00'),
  ('26971a30-6ed3-43ad-997c-576f26c6beb9','0f1a83fd-2a1f-4232-a1ce-ed5cc0431bc8','2026-07-07T11:00:52.570054+00:00'),
  ('26971a30-6ed3-43ad-997c-576f26c6beb9','0bd94e16-a525-495c-86c0-93b670dd869a','2026-07-07T11:00:52.570054+00:00'),
  ('f423ea01-a62e-4186-b3ed-65ac4a0e1fc7','0f1a83fd-2a1f-4232-a1ce-ed5cc0431bc8','2026-07-07T11:00:52.570054+00:00'),
  ('f423ea01-a62e-4186-b3ed-65ac4a0e1fc7','0bd94e16-a525-495c-86c0-93b670dd869a','2026-07-07T11:00:52.570054+00:00'),
  ('5a9a0950-4f9a-43ef-b93f-2466de784bb8','0f1a83fd-2a1f-4232-a1ce-ed5cc0431bc8','2026-07-07T11:00:52.570054+00:00'),
  ('5a9a0950-4f9a-43ef-b93f-2466de784bb8','0bd94e16-a525-495c-86c0-93b670dd869a','2026-07-07T11:00:52.570054+00:00')
on conflict do nothing;

insert into public.suite_type_bedroom_types (suite_type_id,bedroom_type_id,created_at) values
  ('b4784f1e-3796-4f11-96e5-a7c9f5f2d268','10a2c998-9bf4-4be1-ad32-33af130662b9','2026-07-07T08:01:51.509806+00:00'),
  ('4c3fc73f-caeb-4344-aa90-8a6aea9c73eb','1192789e-9999-411d-884c-a8fc0a13565f','2026-07-07T08:01:51.509806+00:00'),
  ('bafeee2b-54cf-4fbc-beff-3f37c3917204','65df61d0-f669-4bff-9c5e-217502cc4c6b','2026-07-01T08:04:38.996464+00:00'),
  ('ec650a3f-6700-48c9-a24e-ed497e838df1','3fffc787-2320-4196-bd6e-4c56a1fdd5ff','2026-07-01T08:04:38.996464+00:00'),
  ('90126d1c-24ce-4a97-a756-839c233b4171','b53051b1-8846-417e-b4a7-778d80bfb49c','2026-07-01T08:04:38.996464+00:00'),
  ('d872a2b9-f291-46cc-9b3b-fff10fa02461','f98f57db-b3f7-4109-a395-e59834e945f0','2026-07-01T08:22:52.201076+00:00'),
  ('dc37e8a3-11c0-4473-9b8f-22e0e9ed87ce','0e802cf7-9494-443c-aa0a-1c84dc2ce6b7','2026-07-01T08:22:52.201076+00:00'),
  ('1be89798-a43a-40ad-bcb6-8a731fd38596','3d01ac97-3613-4bcd-9568-83494d046f25','2026-07-01T08:22:52.201076+00:00'),
  ('61012de5-914d-40e6-ad12-d4b21bbbe175','a74ae49b-3c44-4e3a-9553-8f812849a474','2026-07-01T08:22:52.201076+00:00'),
  ('ec45f517-d406-4e98-bd71-45c0f3e5abdc','d67ee1ec-b0fd-4559-8476-b1885e73d8a3','2026-07-07T08:24:48.410631+00:00'),
  ('9c475bbe-471c-4663-8779-1d4e803d768e','8a2612c8-7cf9-4a79-9939-f5a442f2612f','2026-07-07T08:24:48.410631+00:00'),
  ('57bc0e95-96aa-4c78-9b74-1d578b36fba0','22f50361-9cd6-4c68-9d9c-93f86c098dad','2026-07-07T08:24:48.410631+00:00'),
  ('4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de','e7446f0c-93c7-4b0f-a2d9-088b5789babc','2026-07-07T08:24:48.410631+00:00'),
  ('db501917-3bd6-44ce-af56-2a5facc4e5b4','20d1fa4f-5668-4418-91bd-46b4410ec7bf','2026-07-07T08:24:48.410631+00:00'),
  ('52696af6-a2bf-4b59-ade8-b13190fecf5d','44cee538-7dca-493e-8be0-67b0b55feee5','2026-07-07T08:24:48.410631+00:00'),
  ('121e51b1-58bc-493b-bbcd-7a3fb7e914d3','100eb00c-3f5a-40be-a977-991eb4043e60','2026-07-07T08:24:48.410631+00:00'),
  ('0e68be05-16cb-491c-a43e-1f3dbbe3f59d','c0bcc3b4-defe-4c14-97aa-044d5e83f79f','2026-07-07T08:24:48.410631+00:00'),
  ('d11d12fd-f300-437d-990e-d1c5401d23cf','f5b5b10c-389c-4ff2-8071-b8aab24118ad','2026-07-07T08:35:57.597177+00:00'),
  ('cde72288-c439-418b-b505-90d040dcf4b7','95bb3d7e-05a1-40fe-bf51-87fdc540c45f','2026-07-07T08:35:57.597177+00:00'),
  ('8fa38777-5b0d-456c-8849-8c198b613d8f','14dab3e2-4896-43ad-af23-a0757c2d7e5b','2026-07-07T08:46:03.696489+00:00'),
  ('c3d7646e-a08f-426b-a020-c43fb459fde3','5c6184e6-d1d3-4ff8-8317-1c044cbdff4f','2026-07-07T08:46:03.696489+00:00'),
  ('a8d3f47b-2301-4b6e-8e32-580a574e6fa3','254db418-0909-4c93-a5e8-b5a6aa22a293','2026-07-07T08:46:03.696489+00:00'),
  ('8650f4df-c659-4163-95e1-a613bef319da','8e9c6802-2dd1-484a-9c09-4d6cc430858a','2026-07-07T08:46:03.696489+00:00'),
  ('68326292-7dd9-44d7-9469-3e9dfddbd75b','a027f9e3-d67e-48c2-ae83-6d3bf41acc49','2026-07-07T08:46:03.696489+00:00'),
  ('3719c0fe-c465-4c0b-b2a5-744d4e853279','49001abd-3cac-488b-85d1-fe92b681e60e','2026-07-07T09:02:05.329992+00:00'),
  ('16627fd4-3197-4094-9a97-77f227660ce6','574acd69-b636-4087-8d03-966033ac6d39','2026-07-07T09:02:05.329992+00:00'),
  ('698046fb-9ba5-40e5-9254-410074499ca7','ba6d9b91-8959-41cc-97a2-4a2c90de63df','2026-07-07T09:02:05.329992+00:00'),
  ('698046fb-9ba5-40e5-9254-410074499ca7','4ea59e3f-5cf9-479a-b2bb-9d40a7e00537','2026-07-07T09:02:05.329992+00:00'),
  ('889e8446-c099-4241-b565-1ce2a56fbd6f','e0f7fe42-4b73-4472-855c-f081e19feceb','2026-07-07T09:02:05.329992+00:00'),
  ('33b334aa-db20-450c-8d83-6380a8692ebc','5faf3cbd-812b-4327-99fd-eadb6e4dd915','2026-07-07T09:12:25.157304+00:00'),
  ('7aefb834-a2e4-4bb7-bf18-0c0d2f615d06','da04fe06-2cb8-4f44-b137-b3db407cfd50','2026-07-07T09:12:25.157304+00:00'),
  ('7d114d75-bf52-44dc-ad53-251004039070','67859fa9-0054-4558-aecc-7ed2f0235675','2026-07-07T09:12:25.157304+00:00'),
  ('9cf0d3f0-db74-4f57-82e5-f0c983dc2e11','66437872-3af5-47c0-94b7-3ca9425cb961','2026-07-07T09:12:25.157304+00:00'),
  ('a8cb7e9a-fa21-4103-91a4-271ffd5f8d02','13130e74-0855-405d-b255-6ccedd0936f0','2026-07-06T10:05:59.942385+00:00'),
  ('116b14f6-0ffe-4413-ab84-2da025794a5c','883e17c6-d5fb-427e-9fb1-739f61ac4a58','2026-07-06T10:05:59.942385+00:00'),
  ('48a4d650-4b0b-422e-ac5a-13f95437d342','d8fb0a83-97cd-4939-be41-bb4aedca82cd','2026-07-06T10:05:59.942385+00:00'),
  ('f6ec6260-5d6c-4130-81be-0fd21e77d021','16f7be89-6b9d-491c-85f4-bdddcd6ddd9b','2026-07-06T10:05:59.942385+00:00'),
  ('0d145872-160a-4518-9495-fb430f773355','219c84f0-3b1f-48f4-8478-047da85b7111','2026-07-06T10:05:59.942385+00:00'),
  ('159d8f01-77b1-45a6-add6-198d66241d52','b8cb8108-6eb0-4c15-a245-d2229a046c3f','2026-07-06T10:05:59.942385+00:00'),
  ('4e483e4d-a98c-44b4-a48b-71eee8ad05ca','50594170-c669-4b37-91f6-f14ccfd8fe3b','2026-07-07T11:00:52.324736+00:00'),
  ('26971a30-6ed3-43ad-997c-576f26c6beb9','b25be4cd-2d4c-4d84-9891-8662fdd211be','2026-07-07T11:00:52.324736+00:00'),
  ('f423ea01-a62e-4186-b3ed-65ac4a0e1fc7','cfba0ac7-c57d-4bb6-aba5-d78053974387','2026-07-07T11:00:52.324736+00:00'),
  ('5a9a0950-4f9a-43ef-b93f-2466de784bb8','10c1eacd-5d13-425a-b129-f1109444bd9f','2026-07-07T11:00:52.324736+00:00'),
  ('fa56e79b-5b79-46d3-a1e4-0e9eeccb5368','78b80549-b2ed-4d74-a576-19dfdc76c4db','2026-07-22T09:19:19.504138+00:00'),
  ('fa56e79b-5b79-46d3-a1e4-0e9eeccb5368','b1e437c2-8d75-4ed4-890b-75e60e4da8a2','2026-07-22T09:19:19.504138+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','78b80549-b2ed-4d74-a576-19dfdc76c4db','2026-07-22T09:19:19.504138+00:00'),
  ('ff632a10-6faf-42ad-a7ef-d1fec7072707','b1e437c2-8d75-4ed4-890b-75e60e4da8a2','2026-07-22T09:19:19.504138+00:00'),
  ('7c0aa56d-d302-4b41-91f1-d5187113dad5','78b80549-b2ed-4d74-a576-19dfdc76c4db','2026-07-22T09:19:19.504138+00:00'),
  ('7c0aa56d-d302-4b41-91f1-d5187113dad5','b1e437c2-8d75-4ed4-890b-75e60e4da8a2','2026-07-22T09:19:19.504138+00:00'),
  ('642e34ee-9a7b-4532-bb20-12a61c2f6e85','5e5dfcf5-e8f7-4204-802b-1c044f0faba8','2026-07-22T09:49:59.232824+00:00'),
  ('642e34ee-9a7b-4532-bb20-12a61c2f6e85','9bba2965-8044-41b0-8b90-fff47715372c','2026-07-22T09:49:59.232824+00:00'),
  ('66958bfc-888f-44db-9279-e2babc8b5e7c','5e5dfcf5-e8f7-4204-802b-1c044f0faba8','2026-07-22T09:49:59.232824+00:00'),
  ('66958bfc-888f-44db-9279-e2babc8b5e7c','9bba2965-8044-41b0-8b90-fff47715372c','2026-07-22T09:49:59.232824+00:00')
on conflict do nothing;

-- ROUTES (from production)
insert into public.routes (id,origin_location_id,destination_location_id,name,active,created_at,updated_at,supplier_id,pickup_point,dropoff_point,direction_mode,transport_service_type,included_km_per_day,extra_km_price,security_deposit,one_way_fee,duration_days) values
  ('2d0219a4-cefe-4068-a28a-6bbdb99abfe3',null,null,'Bed & Breakfast',true,'2026-07-07T08:01:49.692+00:00','2026-07-07T08:01:52.208057+00:00','a034fb5e-10fc-48bb-be41-9a2c5ec8e681',null,null,'one_way',null,null,null,null,null,null),
  ('4b8b200f-f34d-4e5a-9192-4e60e5d91a24',null,null,'CT Hotel > Airport',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:13.927574+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','Cape Town Hotel','Cape Town Airport','round_trip',null,null,null,null,null,null),
  ('5d50f736-f4a3-4fb1-9518-da7dc67c14e6',null,null,'CT Station > Hotel',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:13.927574+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','Cape Town Station','Cape Town Hotel (CBD)','round_trip',null,null,null,null,null,null),
  ('0db5f51a-1426-4d97-8e22-61d85567dba4',null,null,'Dinner, bed & breakfast',true,'2026-07-07T08:01:49.692+00:00','2026-07-07T08:01:52.208057+00:00','a034fb5e-10fc-48bb-be41-9a2c5ec8e681',null,null,'one_way',null,null,null,null,null,null),
  ('d3c12bfe-9340-46c9-a40c-0cc6e8848826',null,null,'Bed & breakfast',true,'2026-07-07T08:35:55.79+00:00','2026-07-07T08:35:58.271413+00:00','53278302-6b75-4a49-9f16-cd8cf6d4fef6',null,null,'one_way',null,null,null,null,null,null),
  ('e22f38d5-dcdd-45ad-80ec-b0f27735cdf9',null,null,'Bed & Breakfast',true,'2026-07-07T09:02:03.24+00:00','2026-07-07T09:02:03.24+00:00','4ec1e87e-a7f5-401a-9b04-0807b1f34f9c',null,null,'one_way',null,null,null,null,null,null),
  ('78a68673-85e6-40bb-922f-fe624492e71c','feb7f339-0be3-49e1-b472-5a58408275a6','e83efe2a-3b91-4e39-a7bd-0e68a8421a95','DUR > ORT',true,'2026-07-01T10:23:20.514+00:00','2026-07-01T10:23:21.609424+00:00','c3c2de5c-c68d-41c5-b04a-053708edca5a',null,null,'round_trip',null,null,null,null,null,null),
  ('d614d530-c090-4917-9f8f-c7983ef5fde6',null,null,'All-inclusive',true,'2026-07-07T11:00:50.261+00:00','2026-07-07T11:00:53.066498+00:00','7dafbd36-5230-4a89-b587-4c37d409edaf',null,null,'one_way',null,null,null,null,null,null),
  ('caaad4de-fd7b-4640-958d-0d31a50b0782','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001002','African Collage Tour',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'one_way',null,null,null,null,null,null),
  ('7969d301-15e3-4307-8d14-5df563f211f6','00000000-0000-0000-0000-000000001001','9606f851-fe92-4c9c-a590-2a456018cb5d','African Trilogy Tour',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'one_way',null,null,null,null,null,null),
  ('249e387f-4a90-4f9c-9941-b5c504022ae4','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001002','Cape Town Journey',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('55c5edba-2e9e-4199-bca4-f0d23fc41091','00000000-0000-0000-0000-000000001002','97895a7e-6c9c-4571-8765-478fa4bcf695','Dar Es Salaam Journey',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('70e5aae0-ebb5-4703-b4ad-a5c23ee42950','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001003','Durban Safari',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('ba6f9040-da8a-4f44-adb3-df550eb3ed37','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001001','Golf Safari',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'one_way',null,null,null,null,null,null),
  ('7f9d0411-caf9-4b05-ad9b-bace43d13bef','00000000-0000-0000-0000-000000001001','9606f851-fe92-4c9c-a590-2a456018cb5d','Namibia Safari',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('123c91f5-1234-4451-9dbb-ef18abc88b4d','00000000-0000-0000-0000-000000001001','b53d5ed5-e65a-4b70-be34-cad755be7977','Southern Cross Tour',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'one_way',null,null,null,null,null,null),
  ('518e80f9-be66-4122-9b6a-625197152340','00000000-0000-0000-0000-000000001001','b53d5ed5-e65a-4b70-be34-cad755be7977','Victoria Falls Journey',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f',null,null,'Bed and Breakfast',true,'2026-07-06T10:05:58.137+00:00','2026-07-06T10:06:00.637247+00:00','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,null,'one_way',null,null,null,null,null,null),
  ('a409fa56-f2d0-4981-a211-798ab54f1fa6','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000001002','Pretoria ↔ Cape Town',true,'2026-07-22T09:49:57.502+00:00','2026-07-22T09:49:59.666285+00:00','002b438f-df83-483a-9274-f17e9fef7f35',null,null,'round_trip',null,null,null,null,null,3),
  ('338b28dd-0597-476c-bcea-d6dee2ade0a9',null,null,'GT Station > Hotel',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:12.803+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','Pretoria Station','Pretoria Hotel','round_trip',null,null,null,null,null,null),
  ('083fa15f-69dd-4ecd-9804-8e7273206b11',null,null,'GT Hotel > Airport',true,'2026-07-01T08:45:12.803+00:00','2026-07-01T08:45:12.803+00:00','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','Pretoria Hotel','Johannesburg Airport','round_trip',null,null,null,null,null,null),
  ('fdd66479-3d2c-4b75-b7d2-23743d12203e','eb8fefa1-039f-404f-8d5c-a58eb953bd91','e83efe2a-3b91-4e39-a7bd-0e68a8421a95','CPT > ORT',true,'2026-07-01T10:23:20.514+00:00','2026-07-01T10:23:21.609424+00:00','c3c2de5c-c68d-41c5-b04a-053708edca5a',null,null,'round_trip',null,null,null,null,null,null),
  ('ac7dd721-c73f-40b6-87ec-8732930cd1d8',null,null,'Bed & Breakfast',true,'2026-07-01T08:04:37.043+00:00','2026-07-02T15:35:59.596833+00:00','683e71eb-eb88-4c85-8b0a-4b1edb1c138d',null,null,'one_way',null,null,null,null,null,null),
  ('dc3fef89-4409-49fc-8bf3-880c90a07f8c',null,null,'Bed and Breakfast',true,'2026-07-01T08:22:50.321+00:00','2026-07-02T15:35:59.596833+00:00','100f03b0-fefd-4d50-85e7-64a715914c47',null,null,'one_way',null,null,null,null,null,null),
  ('635df36f-b0b9-4199-bec7-4e6d8bf00332',null,null,'Cape Town - One Day Pass',true,'2026-07-01T10:03:34.156+00:00','2026-07-02T15:35:59.596833+00:00','87cbbf54-5085-4146-afe7-172f522b3325',null,null,'one_way',null,null,null,null,null,null),
  ('01daf8fe-e566-48e2-abbc-8fe79cea3c53',null,null,'Bed & Breakfast',true,'2026-07-07T08:24:46.46+00:00','2026-07-07T08:24:46.46+00:00','287e3a06-46fc-4676-a5c2-5faaa576bfe7',null,null,'one_way',null,null,null,null,null,null),
  ('4de1f038-55ee-4c97-a807-f10ff4c175c2',null,null,'Bed & Breakfast',true,'2026-07-07T08:46:01.849+00:00','2026-07-07T08:46:01.849+00:00','e16883b1-4dc4-4700-a8ed-3f6238d57fe9',null,null,'one_way',null,null,null,null,null,null),
  ('3aa95f8a-33bc-4cc1-9b83-c27035562913',null,null,'Bed & Breakfast',true,'2026-07-07T09:12:23.281+00:00','2026-07-07T09:12:23.281+00:00','a78f401b-90c9-402d-8d35-0cf3dc79710c',null,null,'one_way',null,null,null,null,null,null),
  ('37e26069-0919-4844-ab63-4256771eb91c','b53d5ed5-e65a-4b70-be34-cad755be7977','6712bfc7-f082-4bf4-971e-5c99cf035569','Copper Trail',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('82804308-696a-4c21-ba70-7738d2e5b4af','00000000-0000-0000-0000-000000001002','9606f851-fe92-4c9c-a590-2a456018cb5d','Namibia Safari (CPT)',true,'2026-07-22T09:19:17.763+00:00','2026-07-22T09:19:20.144828+00:00','d6de79b1-07f9-4d5d-a122-35df6e7b93e6',null,null,'round_trip',null,null,null,null,null,null),
  ('fc389376-c2fe-4e1a-8138-1ffad4b27271','00000000-0000-0000-0000-000000001001','3ac373b2-7038-4838-aeae-df286c2653f3','Kruger National Park',true,'2026-07-22T09:49:57.502+00:00','2026-07-22T09:49:59.666285+00:00','002b438f-df83-483a-9274-f17e9fef7f35',null,null,'one_way',null,null,null,null,null,3)
on conflict (id) do nothing;

insert into public.rate_cards (id,route_id,suite_type_id,rate_type_id,price_per_person,currency,valid_from,valid_to,created_at,child_price,infant_price) values
  ('506e89e2-b2e9-434a-af83-194d083b6828','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','48a4d650-4b0b-422e-ac5a-13f95437d342',(select id from public.rate_types where code='STO'),3575,'ZAR','2026-07-01','2026-08-31','2026-07-06T09:59:14.602+00:00',null,null),
  ('e9be597c-0fde-4e24-b32a-cb437eb5bdc6','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','116b14f6-0ffe-4413-ab84-2da025794a5c',(select id from public.rate_types where code='STO'),3425,'ZAR','2026-07-01','2026-08-31','2026-07-06T09:59:14.602+00:00',null,null),
  ('7ddc6d5b-22cc-411c-8a52-ddd899ba8e95','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','0d145872-160a-4518-9495-fb430f773355',(select id from public.rate_types where code='STO'),3865,'ZAR','2026-07-01','2026-08-31','2026-07-06T09:59:14.602+00:00',null,null),
  ('e3c45f56-a23c-48a5-a0b0-ddcb930fdc14','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','f6ec6260-5d6c-4130-81be-0fd21e77d021',(select id from public.rate_types where code='STO'),3740,'ZAR','2026-07-01','2026-08-31','2026-07-06T09:59:14.602+00:00',null,null),
  ('278e81d0-b4e2-4c9e-ac5f-1362935a5100','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','116b14f6-0ffe-4413-ab84-2da025794a5c',(select id from public.rate_types where code='STO'),4685,'ZAR','2026-09-01','2026-12-19','2026-07-06T09:59:14.602+00:00',null,null),
  ('1c276932-fb9f-45cc-a3de-58696e964780','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',(select id from public.rate_types where code='STO'),4360,'ZAR','2026-09-01','2026-12-19','2026-07-06T09:59:14.602+00:00',null,null),
  ('c778db00-33b6-4da3-8c0e-5efbe7a170bb','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','0d145872-160a-4518-9495-fb430f773355',(select id from public.rate_types where code='STO'),5595,'ZAR','2026-09-01','2026-12-19','2026-07-06T09:59:14.602+00:00',null,null),
  ('8f5cc5c1-98a4-4015-94eb-45812c9f9f55','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','f6ec6260-5d6c-4130-81be-0fd21e77d021',(select id from public.rate_types where code='STO'),5465,'ZAR','2026-09-01','2026-12-19','2026-07-06T09:59:14.602+00:00',null,null),
  ('12b2b6da-a864-403c-8924-0c9c0f11e329','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','48a4d650-4b0b-422e-ac5a-13f95437d342',(select id from public.rate_types where code='STO'),4935,'ZAR','2026-09-01','2026-12-19','2026-07-06T09:59:14.602+00:00',null,null),
  ('399751eb-7e16-475f-a4c0-5b7c3fb82dc9','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','116b14f6-0ffe-4413-ab84-2da025794a5c',(select id from public.rate_types where code='STO'),6885,'ZAR','2026-12-20','2027-01-10','2026-07-06T09:59:14.602+00:00',null,null),
  ('091e4fae-1307-4d90-8936-c4b66d611f3a','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','f6ec6260-5d6c-4130-81be-0fd21e77d021',(select id from public.rate_types where code='STO'),7665,'ZAR','2026-12-20','2027-01-10','2026-07-06T09:59:14.602+00:00',null,null),
  ('3243104a-2ee5-4f3a-8a34-8a299401ac68','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',(select id from public.rate_types where code='STO'),6560,'ZAR','2026-12-20','2027-01-10','2026-07-06T09:59:14.602+00:00',null,null),
  ('58f33a21-17af-47e5-ba19-d50ed74c40d4','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','48a4d650-4b0b-422e-ac5a-13f95437d342',(select id from public.rate_types where code='STO'),7135,'ZAR','2026-12-20','2027-01-10','2026-07-06T09:59:14.602+00:00',null,null),
  ('65949adb-545b-4cd3-a34d-f03cad0f0b68','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','0d145872-160a-4518-9495-fb430f773355',(select id from public.rate_types where code='STO'),7795,'ZAR','2026-12-20','2027-01-10','2026-07-06T09:59:14.602+00:00',null,null),
  ('cd5db86d-4f13-474b-80f2-5323bcd15dd7','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','48a4d650-4b0b-422e-ac5a-13f95437d342',(select id from public.rate_types where code='STO'),4935,'ZAR','2027-01-11','2027-01-24','2026-07-06T09:59:14.602+00:00',null,null),
  ('5e4b25dd-0907-43de-9446-ad026c0b8403','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','0d145872-160a-4518-9495-fb430f773355',(select id from public.rate_types where code='STO'),5595,'ZAR','2027-01-11','2027-01-24','2026-07-06T09:59:14.602+00:00',null,null),
  ('87b774a0-30be-4ea8-8abb-be27a34a60bf','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','116b14f6-0ffe-4413-ab84-2da025794a5c',(select id from public.rate_types where code='STO'),4685,'ZAR','2027-01-11','2027-01-24','2026-07-06T09:59:14.602+00:00',null,null),
  ('9052dc09-99c8-413f-aa22-dddc99b5a0c5','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',(select id from public.rate_types where code='STO'),4360,'ZAR','2027-01-11','2027-01-24','2026-07-06T09:59:14.602+00:00',null,null),
  ('589cfd79-fd93-453c-ba06-ffc2e618604e','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','f6ec6260-5d6c-4130-81be-0fd21e77d021',(select id from public.rate_types where code='STO'),5465,'ZAR','2027-01-11','2027-01-24','2026-07-06T09:59:14.602+00:00',null,null),
  ('10df9f27-6ebc-414e-a1ca-d56d4f8ede2f','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','f6ec6260-5d6c-4130-81be-0fd21e77d021',(select id from public.rate_types where code='STO'),7665,'ZAR','2027-01-25','2027-02-28','2026-07-06T09:59:14.602+00:00',null,null),
  ('b43e3a73-57d7-4e7c-8bd2-4aec37136878','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',(select id from public.rate_types where code='STO'),6560,'ZAR','2027-01-25','2027-02-28','2026-07-06T09:59:14.602+00:00',null,null),
  ('aa768edc-1275-4bae-a4ce-78684f73127b','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','116b14f6-0ffe-4413-ab84-2da025794a5c',(select id from public.rate_types where code='STO'),6885,'ZAR','2027-01-25','2027-02-28','2026-07-06T09:59:14.602+00:00',null,null),
  ('55be2ff9-2914-41c0-bf3b-10121cde7603','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','3719c0fe-c465-4c0b-b2a5-744d4e853279',(select id from public.rate_types where code='STO'),2870,'ZAR','2026-06-01','2026-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('d1c75c4b-a06b-43d4-9952-86b124e19332','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','16627fd4-3197-4094-9a97-77f227660ce6',(select id from public.rate_types where code='STO'),3270,'ZAR','2026-06-01','2026-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('29232f3a-7596-4da8-9c1f-6c8650789c87','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','698046fb-9ba5-40e5-9254-410074499ca7',(select id from public.rate_types where code='STO'),3470,'ZAR','2026-06-01','2026-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('33398d9f-f139-4292-b664-59682b446f4a','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','889e8446-c099-4241-b565-1ce2a56fbd6f',(select id from public.rate_types where code='STO'),3870,'ZAR','2026-06-01','2026-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('505677f8-0cf2-47f5-ab3b-4b723a1110a0','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','3719c0fe-c465-4c0b-b2a5-744d4e853279',(select id from public.rate_types where code='STO'),4390,'ZAR','2026-09-01','2026-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('ecde8f15-bf64-4b48-9db7-1af8d461acf6','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','16627fd4-3197-4094-9a97-77f227660ce6',(select id from public.rate_types where code='STO'),4790,'ZAR','2026-09-01','2026-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('65c3dfeb-ac98-429d-a1da-ea8a90adea28','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','698046fb-9ba5-40e5-9254-410074499ca7',(select id from public.rate_types where code='STO'),4990,'ZAR','2026-09-01','2026-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('29e8b3bd-71a8-4e73-b647-de47184ddcd7','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','889e8446-c099-4241-b565-1ce2a56fbd6f',(select id from public.rate_types where code='STO'),5390,'ZAR','2026-09-01','2026-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('a6d5c9b6-1cb5-4b2f-988b-c21d3e493a8d','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','3719c0fe-c465-4c0b-b2a5-744d4e853279',(select id from public.rate_types where code='STO'),4840,'ZAR','2027-01-01','2027-05-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('a26496db-eb45-42d8-9205-b31c81fe7e0d','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','16627fd4-3197-4094-9a97-77f227660ce6',(select id from public.rate_types where code='STO'),5240,'ZAR','2027-01-01','2027-05-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('81049a1c-9288-4acd-844f-167ed96e9e9a','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','698046fb-9ba5-40e5-9254-410074499ca7',(select id from public.rate_types where code='STO'),5440,'ZAR','2027-01-01','2027-05-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('4f75ded7-bf7d-40d0-b093-4c69734f65c9','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','889e8446-c099-4241-b565-1ce2a56fbd6f',(select id from public.rate_types where code='STO'),5840,'ZAR','2027-01-01','2027-05-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('4c8f85e0-0f6a-4968-a4e2-98c48fc0946a','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','3719c0fe-c465-4c0b-b2a5-744d4e853279',(select id from public.rate_types where code='STO'),3180,'ZAR','2027-06-01','2027-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('85c09c68-2ef7-45da-b69f-bae08dd6f165','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','16627fd4-3197-4094-9a97-77f227660ce6',(select id from public.rate_types where code='STO'),3580,'ZAR','2027-06-01','2027-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('3ceae90c-b8d5-4760-8ba8-f7cf078627e4','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','698046fb-9ba5-40e5-9254-410074499ca7',(select id from public.rate_types where code='STO'),3780,'ZAR','2027-06-01','2027-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('45bfddbb-6a51-4a4f-92e4-de4cb234e628','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','889e8446-c099-4241-b565-1ce2a56fbd6f',(select id from public.rate_types where code='STO'),4180,'ZAR','2027-06-01','2027-08-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('3de0ce8e-07f1-4ebf-bb43-6e8b635dadf6','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','3719c0fe-c465-4c0b-b2a5-744d4e853279',(select id from public.rate_types where code='STO'),4840,'ZAR','2027-09-01','2027-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('2b967305-2093-4036-b770-c619adb1455c','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','16627fd4-3197-4094-9a97-77f227660ce6',(select id from public.rate_types where code='STO'),5240,'ZAR','2027-09-01','2027-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('32bcb3d1-c100-4ae6-acfc-bda3a88f467f','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','698046fb-9ba5-40e5-9254-410074499ca7',(select id from public.rate_types where code='STO'),5440,'ZAR','2027-09-01','2027-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('20ba14e1-7020-45c2-bbcb-f15bd1042433','e22f38d5-dcdd-45ad-80ec-b0f27735cdf9','889e8446-c099-4241-b565-1ce2a56fbd6f',(select id from public.rate_types where code='STO'),5840,'ZAR','2027-09-01','2027-12-31','2026-07-07T09:02:03.24+00:00',null,null),
  ('9d1907a5-18dc-42e9-a55b-ee6988d4d1f8','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),29800,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',null,null),
  ('b5b10702-d973-482a-ab2e-2c162f32faa4','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),18300,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',4575,null),
  ('edd3b911-359e-482a-9c83-f7e380499728','caaad4de-fd7b-4640-958d-0d31a50b0782','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),144000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',72000,null),
  ('a35638ed-e631-4ac7-9449-135b8ebb5aab','caaad4de-fd7b-4640-958d-0d31a50b0782','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),200000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',100000,null),
  ('dc5d15b6-b6bc-46df-ac3b-fd6e71e9c0aa','caaad4de-fd7b-4640-958d-0d31a50b0782','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),258400,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',129200,null),
  ('4236b215-f251-4c46-97bc-ebb9f4cdd3e4','caaad4de-fd7b-4640-958d-0d31a50b0782','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),230400,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',115200,null),
  ('2bddda37-b6d1-4327-9104-a9298b084f72','caaad4de-fd7b-4640-958d-0d31a50b0782','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),297600,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',148800,null),
  ('8cbdcef8-d89a-4f06-a240-6cc58e6d174a','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','0d145872-160a-4518-9495-fb430f773355',(select id from public.rate_types where code='STO'),7795,'ZAR','2027-01-25','2027-02-28','2026-07-06T09:59:14.602+00:00',null,null),
  ('4720fad3-f22c-421b-ba32-00eab098f2b8','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','48a4d650-4b0b-422e-ac5a-13f95437d342',(select id from public.rate_types where code='STO'),7135,'ZAR','2027-01-25','2027-02-28','2026-07-06T09:59:14.602+00:00',null,null),
  ('02916f37-22bb-4e39-9427-c90ebd9ba7e0','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','0d145872-160a-4518-9495-fb430f773355',(select id from public.rate_types where code='STO'),5595,'ZAR','2027-03-01','2027-04-30','2026-07-06T09:59:14.602+00:00',null,null),
  ('69d11f91-f525-4a21-9e74-7efcf4c390b0','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','48a4d650-4b0b-422e-ac5a-13f95437d342',(select id from public.rate_types where code='STO'),4935,'ZAR','2027-03-01','2027-04-30','2026-07-06T09:59:14.602+00:00',null,null),
  ('fefcfdab-8165-4847-8025-b14cfdf0a48f','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',(select id from public.rate_types where code='STO'),4360,'ZAR','2027-03-01','2027-04-30','2026-07-06T09:59:14.602+00:00',null,null),
  ('33329950-b97b-4c35-803b-55434720ed7b','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','116b14f6-0ffe-4413-ab84-2da025794a5c',(select id from public.rate_types where code='STO'),4685,'ZAR','2027-03-01','2027-04-30','2026-07-06T09:59:14.602+00:00',null,null),
  ('58fe6e47-47f3-481d-ac9c-c7681bbc7c87','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','f6ec6260-5d6c-4130-81be-0fd21e77d021',(select id from public.rate_types where code='STO'),5465,'ZAR','2027-03-01','2027-04-30','2026-07-06T09:59:14.602+00:00',null,null),
  ('03315697-538b-4291-8d22-c3a0f2d3bf8b','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','159d8f01-77b1-45a6-add6-198d66241d52',(select id from public.rate_types where code='STO'),5110,'ZAR','2026-07-01','2026-08-31','2026-07-06T10:05:58.137+00:00',null,3865),
  ('5173ee98-8e54-455d-98c2-17823ac9c3b5','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','159d8f01-77b1-45a6-add6-198d66241d52',(select id from public.rate_types where code='STO'),5110,'ZAR','2026-09-01','2026-12-19','2026-07-06T10:05:58.137+00:00',null,null),
  ('fbc167cd-c428-42aa-9849-10182e2acd8e','3aa95f8a-33bc-4cc1-9b83-c27035562913','33b334aa-db20-450c-8d83-6380a8692ebc',(select id from public.rate_types where code='STO'),3070,'ZAR','2026-07-07','2026-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('27d1a46a-4750-431e-bbc8-7e271783021d','3aa95f8a-33bc-4cc1-9b83-c27035562913','7aefb834-a2e4-4bb7-bf18-0c0d2f615d06',(select id from public.rate_types where code='STO'),3470,'ZAR','2026-07-07','2026-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('7f3eb6f6-7d1a-4e99-8dd7-a6187b815310','3aa95f8a-33bc-4cc1-9b83-c27035562913','7d114d75-bf52-44dc-ad53-251004039070',(select id from public.rate_types where code='STO'),3870,'ZAR','2026-07-07','2026-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('2c66f444-0ae5-449e-8a01-a45e77ffc107','3aa95f8a-33bc-4cc1-9b83-c27035562913','9cf0d3f0-db74-4f57-82e5-f0c983dc2e11',(select id from public.rate_types where code='STO'),12570,'ZAR','2026-07-07','2026-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('b2fe09ad-8f98-488a-801a-20f67bf68681','3aa95f8a-33bc-4cc1-9b83-c27035562913','33b334aa-db20-450c-8d83-6380a8692ebc',(select id from public.rate_types where code='STO'),3440,'ZAR','2027-01-01','2027-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('5a9c546e-ac5b-4f60-b1c6-60c3fa7d4043','3aa95f8a-33bc-4cc1-9b83-c27035562913','7aefb834-a2e4-4bb7-bf18-0c0d2f615d06',(select id from public.rate_types where code='STO'),3840,'ZAR','2027-01-01','2027-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('4dce5b9c-915c-48ff-8c0c-4a817923941c','3aa95f8a-33bc-4cc1-9b83-c27035562913','7d114d75-bf52-44dc-ad53-251004039070',(select id from public.rate_types where code='STO'),4240,'ZAR','2027-01-01','2027-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('a7d3f274-feee-457e-8397-b1161398ee23','3aa95f8a-33bc-4cc1-9b83-c27035562913','9cf0d3f0-db74-4f57-82e5-f0c983dc2e11',(select id from public.rate_types where code='STO'),12790,'ZAR','2027-01-01','2027-12-31','2026-07-07T09:12:23.281+00:00',null,null),
  ('951a770e-b70c-4ab0-bb7a-9fab72d527a4','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),16848,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',null,null),
  ('bc796be6-8f86-461b-9470-4b7137c1f3ec','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),14960,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:40:56.567+00:00',3740,null),
  ('5574330f-47e1-4205-9e5d-7023c1fb6d55','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),14640,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',3660,null),
  ('9a20eddd-6db5-4bac-a567-0b2a21946801','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),21980,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:40:56.567+00:00',null,null),
  ('58248dcf-91ea-42c8-8e68-90319b48ecfe','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),23840,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',null,null),
  ('bc5f19c2-f293-4ea1-ac54-f5d4395abf32','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),14960,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:40:56.567+00:00',3740,null),
  ('e3b5b8db-7d61-460d-b7b7-074b4478d517','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),31600,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:07:20.739+00:00',null,null),
  ('d003d22a-ee38-4956-8a6f-9b6762e362e5','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),19400,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:07:20.739+00:00',null,null),
  ('5e3af829-a0a2-4976-b81e-9a867e08b768','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),22800,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:07:20.739+00:00',null,null),
  ('6ed6e0da-bdfa-45c1-851a-f84654580eae','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),19400,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:07:20.739+00:00',null,null),
  ('291bb521-e538-4742-9b69-297310183781','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),20000,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('7a1dde76-c9d2-4281-896c-63a96b4ede39','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),17400,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('1a14d5c6-1fcd-42ed-8dbe-01c78ff195c1','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),27500,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('fbaec23a-e73d-4860-8323-8ec7031d55a4','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),17400,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('df8592a9-1dbe-4a72-9b2c-10a6bb2820b8','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),19400,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:07:20.739+00:00',null,null),
  ('df549b8f-9dee-4e79-a48a-d8e74278e612','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),19400,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:07:20.739+00:00',null,null),
  ('6c9786e2-9843-4bfb-8038-d6aa0a5cfbc9','7969d301-15e3-4307-8d14-5df563f211f6','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),384000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',192000,null),
  ('72b30a4c-bacf-4a58-8e83-2becc48d2c6e','7969d301-15e3-4307-8d14-5df563f211f6','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),284000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',142000,null),
  ('ed494330-1898-442a-a54c-ec8b69e9fcc5','2d0219a4-cefe-4068-a28a-6bbdb99abfe3','b4784f1e-3796-4f11-96e5-a7c9f5f2d268',(select id from public.rate_types where code='STO'),3777,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('8e916e2e-8900-441e-84e0-b16d97e5a988','2d0219a4-cefe-4068-a28a-6bbdb99abfe3','4c3fc73f-caeb-4344-aa90-8a6aea9c73eb',(select id from public.rate_types where code='STO'),4422,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('b4fd835b-92eb-4ca0-a3b7-e1538681932c','2d0219a4-cefe-4068-a28a-6bbdb99abfe3','b4784f1e-3796-4f11-96e5-a7c9f5f2d268',(select id from public.rate_types where code='STO'),4080,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('d33cb34b-9a2e-4158-a225-a5bef019114e','2d0219a4-cefe-4068-a28a-6bbdb99abfe3','4c3fc73f-caeb-4344-aa90-8a6aea9c73eb',(select id from public.rate_types where code='STO'),4773.75,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('4fbfcb82-ce0c-49f9-aeea-d100a89fe7cd','0db5f51a-1426-4d97-8e22-61d85567dba4','b4784f1e-3796-4f11-96e5-a7c9f5f2d268',(select id from public.rate_types where code='STO'),4410,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('da5f4ae0-4ebd-4e3a-baae-ca78411f8af7','0db5f51a-1426-4d97-8e22-61d85567dba4','4c3fc73f-caeb-4344-aa90-8a6aea9c73eb',(select id from public.rate_types where code='STO'),5097,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('d9bba8f4-d5bd-4612-983a-14f48ad5403d','0db5f51a-1426-4d97-8e22-61d85567dba4','b4784f1e-3796-4f11-96e5-a7c9f5f2d268',(select id from public.rate_types where code='STO'),4762.5,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('604e1837-ca03-414c-b4d9-33f6116fc1e9','0db5f51a-1426-4d97-8e22-61d85567dba4','4c3fc73f-caeb-4344-aa90-8a6aea9c73eb',(select id from public.rate_types where code='STO'),5505,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:00:33.891+00:00',null,null),
  ('fc98ce34-b1c0-4f8e-ad91-255e5e08917e','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),63420,'ZAR','2026-09-01','2026-11-15','2026-07-01T09:08:30.56+00:00',31710,null),
  ('a785de77-8082-4aeb-aedd-4bde5e825266','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),50220,'ZAR','2026-09-01','2026-11-15','2026-07-01T09:08:30.56+00:00',25110,null),
  ('b55c898f-92e0-49de-a5ea-654c8b6fb0c3','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),40685,'ZAR','2026-11-16','2026-12-31','2026-07-01T09:08:30.56+00:00',20342.5,null),
  ('4504ee5b-8ceb-4b66-84f9-7f1e78158e6f','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),51905,'ZAR','2026-11-16','2026-12-31','2026-07-01T09:08:30.56+00:00',25952.5,null),
  ('7ce93ea8-2937-4bb0-968c-b8d03e8b5aaf','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),51905,'ZAR','2026-07-01','2026-08-31','2026-07-01T09:08:30.56+00:00',25952.5,null),
  ('b17e136a-85d6-4a29-ad3b-485076f2f018','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),40685,'ZAR','2026-07-01','2026-08-31','2026-07-01T09:08:30.56+00:00',20342.5,null),
  ('e74fea9c-3f7d-4b21-b86c-399968f9ac61','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),28475,'ZAR','2026-07-01','2026-08-31','2026-07-01T08:31:01.111+00:00',14237.5,null),
  ('9ff54751-ca79-4f0e-8549-2b14207fa70a','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),36330,'ZAR','2026-07-01','2026-08-31','2026-07-01T08:31:01.111+00:00',18165,null),
  ('b24dc833-2842-4e29-8e6b-c00559b6677c','78a68673-85e6-40bb-922f-fe624492e71c','42f04b04-afa7-41e5-8b6a-d312ff759dfe',(select id from public.rate_types where code='RAC'),2000,'ZAR','2026-07-01',null,'2026-07-01T10:22:15.669+00:00',2000,null),
  ('80037bf9-d965-4913-a95a-baa9af2f8467','78a68673-85e6-40bb-922f-fe624492e71c','6eccbfe5-3488-47d2-adcc-9196090c6b07',(select id from public.rate_types where code='RAC'),0,'ZAR','2026-07-01',null,'2026-07-01T10:22:15.669+00:00',null,null),
  ('fc421140-c299-44ca-bf9d-f72eeebcb40e','78a68673-85e6-40bb-922f-fe624492e71c','9e2dd30b-0cbd-4ed1-b748-529da7db3e8b',(select id from public.rate_types where code='RAC'),0,'ZAR','2026-07-01',null,'2026-07-01T10:22:15.669+00:00',null,null),
  ('da3c9052-c2da-48d3-b48c-931866e34cb7','78a68673-85e6-40bb-922f-fe624492e71c','d646dbde-7806-4c82-bb0a-3c9c45a5148d',(select id from public.rate_types where code='RAC'),0,'ZAR','2026-07-01',null,'2026-07-01T10:22:15.669+00:00',null,null),
  ('b00b0fc9-56d5-4176-9a2e-94c4f3b78c9d','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','31689a4a-0865-4d77-8720-aff2622ea08f',(select id from public.rate_types where code='RAC'),850,'ZAR','2026-07-01',null,'2026-07-01T08:42:43.731+00:00',null,null),
  ('dc9f4863-9ee9-4bf5-add6-593ef6f19ccc','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','611d503f-a46b-449b-9853-453262f8458d',(select id from public.rate_types where code='RAC'),850,'ZAR','2026-07-01',null,'2026-07-01T08:42:43.731+00:00',null,null),
  ('341a0641-a084-497d-9a42-9f60c6108a1f','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','8c26a5e8-4d2a-4754-b455-6ea680673121',(select id from public.rate_types where code='RAC'),550,'ZAR','2026-07-01',null,'2026-07-01T08:42:43.731+00:00',null,null),
  ('ee28ee3e-8f1e-4849-baba-6b1242848f63','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','31689a4a-0865-4d77-8720-aff2622ea08f',(select id from public.rate_types where code='RAC'),450,'ZAR','2026-07-01',null,'2026-07-01T08:42:43.731+00:00',null,null),
  ('014cdbc1-ccaf-451f-ad7a-75f8135c5fbf','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','611d503f-a46b-449b-9853-453262f8458d',(select id from public.rate_types where code='RAC'),450,'ZAR','2026-07-01',null,'2026-07-01T08:42:43.731+00:00',null,null),
  ('c2a74833-b690-4f60-b0e0-fed0a0c28f9d','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','8c26a5e8-4d2a-4754-b455-6ea680673121',(select id from public.rate_types where code='RAC'),350,'ZAR','2026-07-01',null,'2026-07-01T08:42:43.731+00:00',null,null),
  ('adf3ce05-6cc7-4757-a1b4-d8ed4ac4393b','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),54000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',27000,null),
  ('36582907-2b63-4564-a2bc-68866a5d5092','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),78000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',39000,null),
  ('fc11f28b-4bb6-440b-83ee-3f08b7fc3ef3','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),16160,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',4040,null),
  ('d267c9c1-1a24-48fc-be5b-742f7e103c1f','7969d301-15e3-4307-8d14-5df563f211f6','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),384000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',192000,null),
  ('f2f8b549-640d-4907-b27d-2166173fa5e5','7969d301-15e3-4307-8d14-5df563f211f6','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),228800,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',114400,null),
  ('da19498e-3411-4350-aa73-0d656489bf73','7969d301-15e3-4307-8d14-5df563f211f6','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),308000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',154000,null),
  ('ba058cda-9dc8-4688-8018-d604cf1d4112','7969d301-15e3-4307-8d14-5df563f211f6','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),422400,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',211200,null),
  ('8501e77f-d989-4779-b4d3-c02f8d9c363f','7969d301-15e3-4307-8d14-5df563f211f6','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),251680,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',125840,null),
  ('ff3423e5-2c4b-4ac8-a181-9790c52ec9f3','7969d301-15e3-4307-8d14-5df563f211f6','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),338800,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',169400,null),
  ('2e60c0d1-0486-4e4d-ac44-5f356644ca51','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RVSADC'),27000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',13500,null),
  ('c4123096-26f3-4b2c-b785-69d810e55399','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),104000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',52000,null),
  ('43cb4063-63bd-4898-8ef6-cdcdbddb32cc','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RVSADC'),52000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',26000,null),
  ('1f490abe-1801-4ef1-8e5e-876b2142a90c','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RVSADC'),39000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',19500,null),
  ('cfb68068-f342-4951-b77e-11c6932387d1','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),47920,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',23960,null),
  ('0e2c74e2-751e-472e-8c6f-c87e8533d40d','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),114000,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',57000,null),
  ('73df7c26-9a14-4ecd-b146-c330547978ca','ac7dd721-c73f-40b6-87ec-8732930cd1d8','bafeee2b-54cf-4fbc-beff-3f37c3917204',(select id from public.rate_types where code='STO'),3710,'ZAR','2026-07-01','2026-09-30','2026-07-01T08:04:37.043+00:00',null,null),
  ('1fe9285a-efe6-446e-8feb-6e7708f87445','ac7dd721-c73f-40b6-87ec-8732930cd1d8','bafeee2b-54cf-4fbc-beff-3f37c3917204',(select id from public.rate_types where code='STO'),4490,'ZAR','2026-10-01','2026-12-24','2026-07-01T08:04:37.043+00:00',null,null),
  ('d2b1508f-9d64-43de-baa1-3dce5c9988b3','ac7dd721-c73f-40b6-87ec-8732930cd1d8','ec650a3f-6700-48c9-a24e-ed497e838df1',(select id from public.rate_types where code='STO'),4260,'ZAR','2026-07-01','2026-09-30','2026-07-01T08:04:37.043+00:00',null,null),
  ('c3062316-1ea4-47e7-8152-0007c7a0faa0','ac7dd721-c73f-40b6-87ec-8732930cd1d8','90126d1c-24ce-4a97-a756-839c233b4171',(select id from public.rate_types where code='STO'),5850,'ZAR','2026-07-01','2026-09-30','2026-07-01T08:04:37.043+00:00',null,null),
  ('14359203-c4b6-444a-b425-15e9d56cd512','ac7dd721-c73f-40b6-87ec-8732930cd1d8','ec650a3f-6700-48c9-a24e-ed497e838df1',(select id from public.rate_types where code='STO'),4990,'ZAR','2026-10-01','2026-12-24','2026-07-01T08:04:37.043+00:00',null,null),
  ('e4252c0b-dcad-4776-b043-badecf7cc96b','ac7dd721-c73f-40b6-87ec-8732930cd1d8','90126d1c-24ce-4a97-a756-839c233b4171',(select id from public.rate_types where code='STO'),6560,'ZAR','2026-10-01','2026-12-24','2026-07-01T08:04:37.043+00:00',null,null),
  ('b33d4834-ba8f-499c-a982-e3322820a74d','fc389376-c2fe-4e1a-8138-1ffad4b27271','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),58230,'ZAR','2027-06-24','2027-06-26','2026-07-06T09:15:00.18+00:00',29115,null),
  ('3999af28-493a-437b-a585-5e36a51994d2','fc389376-c2fe-4e1a-8138-1ffad4b27271','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),72780,'ZAR','2027-06-24','2027-06-26','2026-07-06T09:15:00.18+00:00',36390,null),
  ('edb90742-9f28-432c-aa6d-758db18952c6','fc389376-c2fe-4e1a-8138-1ffad4b27271','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),83190,'ZAR','2027-06-24','2027-06-26','2026-07-06T09:15:00.18+00:00',41595,null),
  ('2d6bca88-a674-4264-a873-8a74dbd7b787','fc389376-c2fe-4e1a-8138-1ffad4b27271','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),103975,'ZAR','2027-06-24','2027-06-26','2026-07-06T09:15:00.18+00:00',51987.5,null),
  ('3edcc4c0-2016-48c1-a578-3734013dd407','338b28dd-0597-476c-bcea-d6dee2ade0a9','31689a4a-0865-4d77-8720-aff2622ea08f',(select id from public.rate_types where code='RAC'),650,'ZAR','2026-07-01',null,'2026-07-01T08:45:12.803+00:00',null,null),
  ('1104b9e2-fff4-4804-bf21-bcfdae4e2f55','338b28dd-0597-476c-bcea-d6dee2ade0a9','611d503f-a46b-449b-9853-453262f8458d',(select id from public.rate_types where code='RAC'),650,'ZAR','2026-07-01',null,'2026-07-01T08:45:12.803+00:00',null,null),
  ('64606b59-03f9-474b-8f32-884272577d81','338b28dd-0597-476c-bcea-d6dee2ade0a9','8c26a5e8-4d2a-4754-b455-6ea680673121',(select id from public.rate_types where code='RAC'),550,'ZAR','2026-07-01',null,'2026-07-01T08:45:12.803+00:00',null,null),
  ('802ec6d8-5240-474c-b06c-f72d9bab0026','083fa15f-69dd-4ecd-9804-8e7273206b11','31689a4a-0865-4d77-8720-aff2622ea08f',(select id from public.rate_types where code='RAC'),1250,'ZAR','2026-07-01',null,'2026-07-01T08:45:12.803+00:00',null,null),
  ('b3e78152-0cd0-4697-8936-0f86e3128553','083fa15f-69dd-4ecd-9804-8e7273206b11','611d503f-a46b-449b-9853-453262f8458d',(select id from public.rate_types where code='RAC'),1250,'ZAR','2026-07-01',null,'2026-07-01T08:45:12.803+00:00',null,null),
  ('b1b25f80-955a-4019-822f-a1b6510274ac','083fa15f-69dd-4ecd-9804-8e7273206b11','8c26a5e8-4d2a-4754-b455-6ea680673121',(select id from public.rate_types where code='RAC'),850,'ZAR','2026-07-01',null,'2026-07-01T08:45:12.803+00:00',null,null),
  ('055c5e4d-ca43-43a0-8e87-8b7045296e11','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='BTHD'),23620,'ZAR','2026-07-01','2026-12-31','2026-07-01T08:32:20.573+00:00',11810,null),
  ('ef50a4f8-d05a-40e0-9944-b49153e92249','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='BTLD'),17550,'ZAR','2026-07-01','2026-12-31','2026-07-01T08:32:20.573+00:00',8775,null),
  ('b34ac60f-d956-4c51-9778-307c48235901','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),35150,'ZAR','2026-09-01','2026-11-15','2026-07-01T09:11:55.435+00:00',17575,null),
  ('22a23875-801c-4036-8c87-ce5571257503','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),44390,'ZAR','2026-09-01','2026-11-15','2026-07-01T09:11:55.435+00:00',22195,null),
  ('2eabae6f-d882-4a8a-85f8-0ef4caf9bdd9','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),28475,'ZAR','2026-11-16','2026-12-31','2026-07-01T09:11:55.435+00:00',14237.5,null),
  ('000eaec3-5773-4df1-99b9-46fc7da7e7c7','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),36330,'ZAR','2026-11-16','2026-12-31','2026-07-01T09:11:55.435+00:00',18165,null),
  ('64f1aa86-63b6-4f07-9378-fb0f3013d524','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),40690,'ZAR','2027-01-01','2027-08-31','2026-07-06T09:15:00.18+00:00',20345,null),
  ('63ad424d-0667-4c00-905c-4a261f96a99b','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),31895,'ZAR','2027-01-01','2027-08-31','2026-07-06T09:15:00.18+00:00',15947.5,null),
  ('9ec83794-057c-495b-97e8-6156f8000da6','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),45565,'ZAR','2027-01-01','2027-08-31','2026-07-06T09:15:00.18+00:00',22782.5,null),
  ('b27106d2-734d-4b7f-9942-2875ba8ee270','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),58135,'ZAR','2027-01-01','2027-08-31','2026-07-06T09:15:00.18+00:00',29067.5,null),
  ('2a09d64b-a097-46a7-8407-0869643f45e5','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),56245,'ZAR','2027-09-01','2027-11-15','2026-07-06T09:15:00.18+00:00',28122.5,null),
  ('b3f4827e-3c34-427d-9f0b-d366b05f1720','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),71030,'ZAR','2027-09-01','2027-11-15','2026-07-06T09:15:00.18+00:00',35515,null),
  ('00a4732c-13f6-4506-a09f-466f278e1463','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),39370,'ZAR','2027-09-01','2027-11-15','2026-07-06T09:15:00.18+00:00',19685,null),
  ('5db7f202-372f-4855-bb5c-9ff6dcaee6d6','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),49720,'ZAR','2027-09-01','2027-11-15','2026-07-06T09:15:00.18+00:00',24860,null),
  ('e349c007-facc-4bf2-b381-224d3f587c05','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='RAC'),45565,'ZAR','2027-11-16','2027-12-31','2026-07-06T09:15:00.18+00:00',22782.5,null),
  ('bfb1144d-2f76-4170-acb8-e60b5e4d8fc8','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='STO'),40690,'ZAR','2027-11-16','2027-12-31','2026-07-06T09:15:00.18+00:00',20345,null),
  ('2367dc3d-24e8-480b-923f-f1e0150259b1','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85',(select id from public.rate_types where code='STO'),31895,'ZAR','2027-11-16','2027-12-31','2026-07-06T09:15:00.18+00:00',15947.5,null),
  ('0eb7d8ca-1682-4bf2-8687-c88bbae8d5f4','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c',(select id from public.rate_types where code='RAC'),58135,'ZAR','2027-11-16','2027-12-31','2026-07-06T09:15:00.18+00:00',29067.5,null),
  ('df13d394-808d-47eb-ad7c-d9c6622933bb','01daf8fe-e566-48e2-abbc-8fe79cea3c53','9c475bbe-471c-4663-8779-1d4e803d768e',(select id from public.rate_types where code='STO'),4130,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('0e56de23-2f0d-44ad-bb3c-7529cebbc8e3','4cbf3ae9-3cf6-4142-8b69-2bd5ddf7a58f','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',(select id from public.rate_types where code='STO'),3115,'ZAR','2026-07-01','2026-08-31','2026-07-01T09:03:27.939+00:00',null,null),
  ('4fa108d2-dcca-439c-be66-36962cf42419','01daf8fe-e566-48e2-abbc-8fe79cea3c53','ec45f517-d406-4e98-bd71-45c0f3e5abdc',(select id from public.rate_types where code='STO'),3690,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('5aff06ca-65e6-456e-8d2f-de16ab73a4e6','01daf8fe-e566-48e2-abbc-8fe79cea3c53','9c475bbe-471c-4663-8779-1d4e803d768e',(select id from public.rate_types where code='STO'),3890,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('c441ce22-29c3-4ce7-998d-2c852cd25569','01daf8fe-e566-48e2-abbc-8fe79cea3c53','57bc0e95-96aa-4c78-9b74-1d578b36fba0',(select id from public.rate_types where code='STO'),4090,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('bf9cf32a-a7db-4529-ab88-00748acb9227','01daf8fe-e566-48e2-abbc-8fe79cea3c53','4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de',(select id from public.rate_types where code='STO'),4290,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('079adb5e-f406-4350-8aa1-f4985efaa5b0','01daf8fe-e566-48e2-abbc-8fe79cea3c53','db501917-3bd6-44ce-af56-2a5facc4e5b4',(select id from public.rate_types where code='STO'),4900,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('15f58a45-1d31-44ad-bc69-87d8853e2243','01daf8fe-e566-48e2-abbc-8fe79cea3c53','52696af6-a2bf-4b59-ade8-b13190fecf5d',(select id from public.rate_types where code='STO'),4590,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('f030faf8-5d32-4388-8b09-f36ff549d910','01daf8fe-e566-48e2-abbc-8fe79cea3c53','121e51b1-58bc-493b-bbcd-7a3fb7e914d3',(select id from public.rate_types where code='STO'),6090,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('987319c1-7c8d-42c2-94c7-2576576a5218','01daf8fe-e566-48e2-abbc-8fe79cea3c53','0e68be05-16cb-491c-a43e-1f3dbbe3f59d',(select id from public.rate_types where code='STO'),22180,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('57a2341e-cc64-4a0d-9c1b-9507e5a7ac30','01daf8fe-e566-48e2-abbc-8fe79cea3c53','ec45f517-d406-4e98-bd71-45c0f3e5abdc',(select id from public.rate_types where code='STO'),3930,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('99854648-13d8-4c29-a04c-b5ed9d1fd44b','01daf8fe-e566-48e2-abbc-8fe79cea3c53','57bc0e95-96aa-4c78-9b74-1d578b36fba0',(select id from public.rate_types where code='STO'),4330,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('1e977eb5-f5ec-4059-b0a5-bb38d2775c04','01daf8fe-e566-48e2-abbc-8fe79cea3c53','4ac146fb-2ba2-4a8f-b2f4-d0579e6f08de',(select id from public.rate_types where code='STO'),4530,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('d15bdbaf-e032-4d57-8450-90cbfa7c4b04','01daf8fe-e566-48e2-abbc-8fe79cea3c53','db501917-3bd6-44ce-af56-2a5facc4e5b4',(select id from public.rate_types where code='STO'),5140,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('1a031047-6825-4c2f-872f-1be09db3be33','01daf8fe-e566-48e2-abbc-8fe79cea3c53','52696af6-a2bf-4b59-ade8-b13190fecf5d',(select id from public.rate_types where code='STO'),4800,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('ee4008b2-0894-4e8e-ad1e-5c09455c6e65','01daf8fe-e566-48e2-abbc-8fe79cea3c53','121e51b1-58bc-493b-bbcd-7a3fb7e914d3',(select id from public.rate_types where code='STO'),6300,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('95500251-fbf7-4e1f-980d-adb5f180158a','dc3fef89-4409-49fc-8bf3-880c90a07f8c','d872a2b9-f291-46cc-9b3b-fff10fa02461',(select id from public.rate_types where code='STO'),3512,'ZAR','2026-07-01','2027-02-28','2026-07-01T08:22:50.321+00:00',null,null),
  ('bb44390e-d0d3-423f-9558-9e843a128b75','dc3fef89-4409-49fc-8bf3-880c90a07f8c','dc37e8a3-11c0-4473-9b8f-22e0e9ed87ce',(select id from public.rate_types where code='STO'),3859,'ZAR','2026-07-01','2027-02-28','2026-07-01T08:22:50.321+00:00',null,null),
  ('5d30eebf-7851-4ac2-80de-00896c88be6a','dc3fef89-4409-49fc-8bf3-880c90a07f8c','1be89798-a43a-40ad-bcb6-8a731fd38596',(select id from public.rate_types where code='STO'),6042,'ZAR','2026-07-01','2027-02-28','2026-07-01T08:22:50.321+00:00',null,null),
  ('634ec1a5-2201-4c1d-85ec-b934e12f960a','dc3fef89-4409-49fc-8bf3-880c90a07f8c','61012de5-914d-40e6-ad12-d4b21bbbe175',(select id from public.rate_types where code='STO'),7000,'ZAR','2026-07-01','2027-02-28','2026-07-01T08:22:50.321+00:00',null,null),
  ('71e902e5-0251-42cf-bc11-6cfc2908f9f6','01daf8fe-e566-48e2-abbc-8fe79cea3c53','0e68be05-16cb-491c-a43e-1f3dbbe3f59d',(select id from public.rate_types where code='STO'),22390,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:24:46.46+00:00',null,null),
  ('652c09b0-5aee-40f9-b031-6864b4dcb3e5','635df36f-b0b9-4199-bec7-4e6d8bf00332','38f93cb6-c7b0-4fe1-b342-5a3b07ab3fc1',(select id from public.rate_types where code='STO'),320,'ZAR','2026-07-01','2026-09-30','2026-07-01T08:38:39.525+00:00',170,null),
  ('5a892769-244c-440f-ba5c-ddd19943f959','635df36f-b0b9-4199-bec7-4e6d8bf00332','38f93cb6-c7b0-4fe1-b342-5a3b07ab3fc1',(select id from public.rate_types where code='STO'),330,'ZAR','2026-10-01',null,'2026-07-01T08:38:39.525+00:00',200,null),
  ('3b136623-f93b-4252-b592-f76eaa048019','fdd66479-3d2c-4b75-b7d2-23743d12203e','42f04b04-afa7-41e5-8b6a-d312ff759dfe',(select id from public.rate_types where code='RAC'),2000,'ZAR','2026-07-01',null,'2026-07-01T09:36:05.832+00:00',2000,500),
  ('c2064b1e-9d13-4805-becc-9127249afcfa','fdd66479-3d2c-4b75-b7d2-23743d12203e','6eccbfe5-3488-47d2-adcc-9196090c6b07',(select id from public.rate_types where code='RAC'),0,'ZAR','2026-07-01',null,'2026-07-01T09:36:05.832+00:00',null,null),
  ('fda3640e-0a92-4728-8af0-f8831ce3f5d0','fdd66479-3d2c-4b75-b7d2-23743d12203e','9e2dd30b-0cbd-4ed1-b748-529da7db3e8b',(select id from public.rate_types where code='RAC'),0,'ZAR','2026-07-01',null,'2026-07-01T09:36:05.832+00:00',null,null),
  ('8d66f687-6319-4fea-a9f9-d3ea5e0dbd72','fdd66479-3d2c-4b75-b7d2-23743d12203e','d646dbde-7806-4c82-bb0a-3c9c45a5148d',(select id from public.rate_types where code='RAC'),0,'ZAR','2026-07-01',null,'2026-07-01T09:36:05.832+00:00',null,null),
  ('50ba5436-bae3-4c1a-a3f6-53b7afcb5441','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),69120,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',34560,null),
  ('95373449-54e6-45bf-82bf-534442949978','d3c12bfe-9340-46c9-a40c-0cc6e8848826','cde72288-c439-418b-b505-90d040dcf4b7',(select id from public.rate_types where code='STO'),3620,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:35:33.427+00:00',null,null),
  ('546e820f-a1e6-4709-a21f-967e4f496b28','d3c12bfe-9340-46c9-a40c-0cc6e8848826','d11d12fd-f300-437d-990e-d1c5401d23cf',(select id from public.rate_types where code='STO'),3120,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:35:33.427+00:00',null,null),
  ('b4b322c9-1de5-4451-ad98-7f2002b8b074','caaad4de-fd7b-4640-958d-0d31a50b0782','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),323000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',161500,null),
  ('daa16e83-f1da-4a1c-892d-3d9fc107cbf0','caaad4de-fd7b-4640-958d-0d31a50b0782','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),250000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',125000,null),
  ('b41b1302-4a8f-44d8-9b39-07f69219f376','caaad4de-fd7b-4640-958d-0d31a50b0782','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),180000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',90000,null),
  ('6f81890c-4ea2-4192-be6c-f3a8bfc1cb32','caaad4de-fd7b-4640-958d-0d31a50b0782','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),207000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',103500,null),
  ('3cdc5ce6-d50e-4895-8d04-acc9594a5ad3','caaad4de-fd7b-4640-958d-0d31a50b0782','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),288000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',144000,null),
  ('232d5e23-223c-4534-883f-dc645642d78f','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),20200,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',5050,null),
  ('d161eab9-29e7-46a5-afee-03e6d2b4a286','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),18600,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',null,null),
  ('0c23906a-ae9e-4048-8215-eccda60dc1cd','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),23260,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',null,null),
  ('a1ef5a15-59c6-433c-ad9d-7be0d80a5b28','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),20200,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',5050,null),
  ('82ec0bfe-a27c-47ba-b313-66f1ea5b8c23','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),26320,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',null,null),
  ('d7dda840-f430-4dd4-86f5-53b57f0ce4b3','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),32900,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',0,null),
  ('98568322-1e2f-4f3c-be21-a99e17a6228c','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),16160,'ZAR','2026-07-07','2026-10-31','2026-07-07T09:35:06.723+00:00',4040,null),
  ('f2f064af-4c96-42b9-8a8e-c629140582e4','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),21060,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',null,null),
  ('8fae993b-91eb-48ef-86b1-a1e337d7b757','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),14640,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',3660,null),
  ('d4d0c261-9659-4257-8374-1d84c8ed30dd','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),17260,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:40:56.567+00:00',null,null),
  ('972189bd-cd95-479b-a534-5245a34a78f3','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),18300,'ZAR','2026-11-01','2026-12-15','2026-07-07T09:35:06.723+00:00',4575,null),
  ('f71fa320-3c0f-4044-bbcb-404175de333d','caaad4de-fd7b-4640-958d-0d31a50b0782','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),372000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',186000,null),
  ('3cabc8e9-a2a7-436b-8139-c28851ca2679','caaad4de-fd7b-4640-958d-0d31a50b0782','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),230000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',115000,null),
  ('88d62b43-3eab-4dfa-a40a-2d3dccd2487c','caaad4de-fd7b-4640-958d-0d31a50b0782','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),328000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',164000,null),
  ('c34444f4-6ab6-4f61-a4d1-3146eb1ba5ca','caaad4de-fd7b-4640-958d-0d31a50b0782','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),437000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',218500,null),
  ('87a1cb6f-075a-4774-a6d7-7322a752fd20','7969d301-15e3-4307-8d14-5df563f211f6','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),355000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',177500,null),
  ('ec7bc39c-d72c-4337-a928-031d8512f2e7','7969d301-15e3-4307-8d14-5df563f211f6','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),263500,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',131750,null),
  ('1e980bdf-a774-429a-b326-354702d83e69','7969d301-15e3-4307-8d14-5df563f211f6','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),480000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',240000,null),
  ('5ca48d50-585e-411e-9487-c834ac9587b1','7969d301-15e3-4307-8d14-5df563f211f6','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),286000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',143000,null),
  ('7e111938-1c42-461a-8503-fa8a17fe54ed','7969d301-15e3-4307-8d14-5df563f211f6','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),385000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',192500,null),
  ('5b01827a-fd93-47d1-b779-53d6fd764a0a','7969d301-15e3-4307-8d14-5df563f211f6','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),528000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',264000,null),
  ('200b4ce3-31a3-42a2-a18b-ce8ad32c2a7d','7969d301-15e3-4307-8d14-5df563f211f6','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),314600,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',157300,null),
  ('db4a07f7-f341-427c-b3dc-3fce68f8b1f4','4de1f038-55ee-4c97-a807-f10ff4c175c2','8fa38777-5b0d-456c-8849-8c198b613d8f',(select id from public.rate_types where code='STO'),1560,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('354a4362-f26e-4221-96df-c9787c3e4ee4','4de1f038-55ee-4c97-a807-f10ff4c175c2','c3d7646e-a08f-426b-a020-c43fb459fde3',(select id from public.rate_types where code='STO'),1950,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('e9ec58e8-f69e-4568-99cd-b08251160697','4de1f038-55ee-4c97-a807-f10ff4c175c2','a8d3f47b-2301-4b6e-8e32-580a574e6fa3',(select id from public.rate_types where code='STO'),2150,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('9bc3d622-60d0-49ca-8b24-f29b55257e4a','4de1f038-55ee-4c97-a807-f10ff4c175c2','8650f4df-c659-4163-95e1-a613bef319da',(select id from public.rate_types where code='STO'),2350,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('72abc765-28e9-4f68-a353-0201af7e1c7b','4de1f038-55ee-4c97-a807-f10ff4c175c2','68326292-7dd9-44d7-9469-3e9dfddbd75b',(select id from public.rate_types where code='STO'),2760,'ZAR','2026-07-07','2026-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('0ae2f108-56bc-41ca-82f3-c36e041f9372','4de1f038-55ee-4c97-a807-f10ff4c175c2','8fa38777-5b0d-456c-8849-8c198b613d8f',(select id from public.rate_types where code='STO'),1670,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('5936615f-edb6-4ea7-811b-53ba45f56abe','4de1f038-55ee-4c97-a807-f10ff4c175c2','c3d7646e-a08f-426b-a020-c43fb459fde3',(select id from public.rate_types where code='STO'),2050,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('e1c709c2-f19d-4d96-8707-2a495a8e1801','4de1f038-55ee-4c97-a807-f10ff4c175c2','a8d3f47b-2301-4b6e-8e32-580a574e6fa3',(select id from public.rate_types where code='STO'),2250,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('1ec28919-ad02-48de-bfba-b13c53304fe0','4de1f038-55ee-4c97-a807-f10ff4c175c2','8650f4df-c659-4163-95e1-a613bef319da',(select id from public.rate_types where code='STO'),2450,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('8f63400a-b273-4f68-b97b-9c04c1fed528','4de1f038-55ee-4c97-a807-f10ff4c175c2','68326292-7dd9-44d7-9469-3e9dfddbd75b',(select id from public.rate_types where code='STO'),2870,'ZAR','2027-01-01','2027-12-31','2026-07-07T08:46:01.849+00:00',null,null),
  ('6e6c9dd0-bf55-4889-b88d-2ade11e187fc','82804308-696a-4c21-ba70-7738d2e5b4af','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),403200,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:31:17.59+00:00',201600,null),
  ('1562d023-e11f-411e-a303-89d19b0bf0d8','82804308-696a-4c21-ba70-7738d2e5b4af','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),258000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:31:17.59+00:00',129000,null),
  ('309f5dcc-632e-4ebd-af4a-4b0e728fb9ae','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),16520,'ZAR','2026-07-07','2026-10-31','2026-07-07T10:46:43.213+00:00',4130,null),
  ('57dda25e-466b-4dd2-b0e4-8a8834c87770','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),19120,'ZAR','2026-07-07','2026-10-31','2026-07-07T10:46:43.213+00:00',null,null),
  ('300464fd-bacb-4954-8878-9dfdfcd6cae4','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),16520,'ZAR','2026-07-07','2026-10-31','2026-07-07T10:46:43.213+00:00',4130,null),
  ('757bf33a-f394-41db-bbf1-48fd02626481','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),24260,'ZAR','2026-07-07','2026-10-31','2026-07-07T10:46:43.213+00:00',null,null),
  ('81a4ff6d-40c7-4472-a1bf-c8c0322eedbd','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),15520,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:19:45.072+00:00',3880,null),
  ('7aecfe2a-28d4-4cd4-bfb0-fcb1a00836a1','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),18190,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:19:45.072+00:00',null,null),
  ('86065546-cfd6-4d28-b533-b6e61e1b2847','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),25280,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:19:45.072+00:00',null,null),
  ('9119f499-8aed-44b7-8c2a-663e958f85a2','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),15520,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:19:45.072+00:00',3880,null),
  ('61c11360-c450-4492-8f00-6546edc2cc4b','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),23300,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:46:43.213+00:00',null,null),
  ('4865af1d-f296-4f50-a7ec-0f4213020358','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),15900,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:46:43.213+00:00',3975,null),
  ('364a0e68-eeb4-4a49-9e9c-49596c160cbc','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),18700,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:46:43.213+00:00',null,null),
  ('695f02fa-f609-4bdc-b33f-99202b114eb4','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),15900,'ZAR','2026-12-16','2027-01-10','2026-07-07T10:46:43.213+00:00',3975,null),
  ('5d89adcf-eb7b-45cd-ab50-d0587e009443','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),13870,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:19:45.072+00:00',3470,null),
  ('0666f6a3-77e8-49e6-9250-32944f00cc21','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),13870,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:19:45.072+00:00',3470,null),
  ('1ffcd85b-5890-490f-96a6-cc2b4decdfd7','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),20300,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:46:43.213+00:00',null,null),
  ('05f97939-f0b6-4725-b0f3-933e568e3f0d','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),14200,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:46:43.213+00:00',3550,null),
  ('89289232-5dd0-4081-9ed5-70b1305dc6f5','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),16400,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:46:43.213+00:00',null,null),
  ('1a1fafee-4e57-4484-a73c-8900a9c941e1','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),14200,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:46:43.213+00:00',3550,null),
  ('ad8c5b11-c5e3-4f18-839b-32e20efa0389','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),23300,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:46:43.213+00:00',null,null),
  ('d8a945f3-4b20-4b04-bfbb-b0a9579b1844','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),15900,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:46:43.213+00:00',3975,null),
  ('e95904d9-efbd-4e0a-917a-10d134a02021','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),18700,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:46:43.213+00:00',null,null),
  ('5e8f70e7-48d2-4e1b-a951-5e4b0ebee0d0','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),15900,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:46:43.213+00:00',3975,null),
  ('c17fa9a2-1cf6-4430-be23-f29b83adfe82','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),25800,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:46:43.213+00:00',null,null),
  ('883b4ca8-2f3f-4ea7-8a6a-6f6d8c746ca6','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),17500,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:46:43.213+00:00',4375,null),
  ('af6233de-20eb-46b7-894f-7aa87f870d0b','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),21100,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:46:43.213+00:00',null,null),
  ('732ff65d-9279-477d-bfc8-62e718f9a139','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),17500,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:46:43.213+00:00',4375,null),
  ('8ce97aa2-f297-42fa-8aea-680bc421ccc0','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADC'),15900,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:46:43.213+00:00',3975,null),
  ('c3df0825-8bd5-4f24-b4c6-000e8d073f84','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADC'),18700,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:46:43.213+00:00',null,null),
  ('70fb9e96-b010-419b-9ea9-d440f3cce029','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADC'),15900,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:46:43.213+00:00',3975,null),
  ('cb88a269-0264-4e8b-8781-3512434a2c0d','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),20640,'ZAR','2026-07-07','2026-10-31','2026-07-07T11:00:50.261+00:00',null,null),
  ('01aab54f-0125-48ab-827c-f1dc62dd718d','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),14060,'ZAR','2026-07-07','2026-10-31','2026-07-07T11:00:50.261+00:00',3515,null),
  ('f8194577-30a2-4ff8-ae1a-1f5dcc063573','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),16260,'ZAR','2026-07-07','2026-10-31','2026-07-07T11:00:50.261+00:00',null,null),
  ('ecc42c45-19c2-4ad9-af28-c48f5bd4603b','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),14060,'ZAR','2026-07-07','2026-10-31','2026-07-07T11:00:50.261+00:00',3515,null),
  ('74217f3c-1ccb-4c4d-a8c5-e3667b44c04f','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),18700,'ZAR','2026-11-01','2026-12-15','2026-07-07T11:00:50.261+00:00',null,null),
  ('ec2c9da3-acbd-47a6-84b2-38f890b6fce8','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),12720,'ZAR','2026-11-01','2026-12-15','2026-07-07T11:00:50.261+00:00',3180,null),
  ('ac1ad36a-5314-418a-b17a-d8887da295f3','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),14680,'ZAR','2026-11-01','2026-12-15','2026-07-07T11:00:50.261+00:00',null,null),
  ('ae92a726-f8cf-4401-98dc-2a7f925aa8f7','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),12720,'ZAR','2026-11-01','2026-12-15','2026-07-07T11:00:50.261+00:00',3180,null),
  ('51e14b9f-d49f-480c-8507-05dd715a84ed','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),19800,'ZAR','2026-12-16','2027-01-10','2026-07-07T11:00:50.261+00:00',null,null),
  ('1c8b85cb-f497-4297-b8f3-c99013db293b','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),13480,'ZAR','2026-12-16','2027-01-10','2026-07-07T11:00:50.261+00:00',3370,null),
  ('bcd3c7c1-d48a-4f71-9c39-b0e2fddadb40','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),15850,'ZAR','2026-12-16','2027-01-10','2026-07-07T11:00:50.261+00:00',null,null),
  ('36ba5758-fe75-4bf2-a547-5e4dbbc014ca','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),13480,'ZAR','2026-12-16','2027-01-10','2026-07-07T11:00:50.261+00:00',3370,null),
  ('c8220556-3fb3-45bb-b66e-2b03d1ca1f5a','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),17210,'ZAR','2027-01-11','2027-03-31','2026-07-07T11:00:50.261+00:00',null,null),
  ('f006d985-ef76-4d1b-bfce-e46db03ad3ce','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),12050,'ZAR','2027-01-11','2027-03-31','2026-07-07T11:00:50.261+00:00',3015,null),
  ('b1f70f30-e08a-4d40-af98-10553c141a3a','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),13900,'ZAR','2027-01-11','2027-03-31','2026-07-07T11:00:50.261+00:00',null,null),
  ('b5897d77-2dad-4333-acfe-0480caaa9fb2','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),12050,'ZAR','2027-01-11','2027-03-31','2026-07-07T11:00:50.261+00:00',3015,null),
  ('a7265f43-8682-4e4d-9300-f3f8660f1089','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),19800,'ZAR','2027-04-01','2027-06-30','2026-07-07T11:00:50.261+00:00',null,null),
  ('ae201f24-3aa9-4d00-ac80-4da9c9c8dd0d','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),13480,'ZAR','2027-04-01','2027-06-30','2026-07-07T11:00:50.261+00:00',3370,null),
  ('48d9e53b-bd5f-436c-8279-63b65234fd07','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),15850,'ZAR','2027-04-01','2027-06-30','2026-07-07T11:00:50.261+00:00',null,null),
  ('bec71647-2560-4941-ac9a-9c03df5fb28c','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),13480,'ZAR','2027-04-01','2027-06-30','2026-07-07T11:00:50.261+00:00',3370,null),
  ('82645eba-aa49-4112-ae72-511065085f1f','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),21860,'ZAR','2027-07-01','2027-10-31','2026-07-07T11:00:50.261+00:00',null,null),
  ('96f962f2-c65f-4660-be1a-517140b49a92','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),14900,'ZAR','2027-07-01','2027-10-31','2026-07-07T11:00:50.261+00:00',3725,null),
  ('b12cf811-9290-4806-b4d2-f1a357df9202','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),17880,'ZAR','2027-07-01','2027-10-31','2026-07-07T11:00:50.261+00:00',null,null),
  ('518004ed-0847-4d2a-a025-76e9bb084310','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),14900,'ZAR','2027-07-01','2027-10-31','2026-07-07T11:00:50.261+00:00',3725,null),
  ('31975a33-135c-42ac-b6e8-388af61f5c74','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADCSTO'),19800,'ZAR','2027-11-01','2027-12-15','2026-07-07T11:00:50.261+00:00',null,null),
  ('f9ea5592-1370-434a-ad76-47771ef8afd0','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='KSSADCSTO'),13480,'ZAR','2027-11-01','2027-12-15','2026-07-07T11:00:50.261+00:00',3370,null),
  ('ceb966fc-2fdd-4132-ae78-bb3526df7b68','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='KSSADCSTO'),15850,'ZAR','2027-11-01','2027-12-15','2026-07-07T11:00:50.261+00:00',null,null),
  ('386fde0a-5aa4-4f75-bcd4-3d3a5f014bd6','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='KSSADCSTO'),13480,'ZAR','2027-11-01','2027-12-15','2026-07-07T11:00:50.261+00:00',3370,null),
  ('6a409bb0-0431-443a-8a51-1e4cbbb07c28','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),22000,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:19:45.072+00:00',null,null),
  ('74d65146-90d5-4fde-87a9-17ea8bf28100','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),15960,'ZAR','2027-01-11','2027-03-31','2026-07-07T10:19:45.072+00:00',null,null),
  ('fdc9f742-2c00-419a-af78-db0e251fef23','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),15520,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:19:45.072+00:00',3880,null),
  ('c6361ab4-9b20-41df-9169-adf21e518664','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),18190,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:19:45.072+00:00',null,null),
  ('5f07a76a-4599-493b-87c2-ee93317f742a','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),22800,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:07:20.739+00:00',null,null),
  ('d4480c94-3734-4df9-9317-4b44e7f8fe8d','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),31600,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:07:20.739+00:00',null,null),
  ('273e4a14-7bb2-4c88-a38f-3aed2850f67c','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),15520,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:19:45.072+00:00',3880,null),
  ('46449624-5bf2-44e0-ab3f-2b29038b1dfb','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),25280,'ZAR','2027-04-01','2027-06-30','2026-07-07T10:19:45.072+00:00',null,null),
  ('8692e438-4c1a-4a57-8306-6cdea967e055','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),27920,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:19:45.072+00:00',null,null),
  ('81744d5f-7ae7-4ae3-b5f2-0a9517da9c1b','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),21400,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('c02a776b-c90b-4fe4-b688-e1b7c7d025b4','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),35000,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('d43b5cc7-b17a-4c79-834f-579f998e88a7','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),25600,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('ab608adc-224f-4faa-b682-52ca432f1f73','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),17130,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:19:45.072+00:00',4285,null),
  ('67d83db5-6148-4911-906e-1d1af3606f6c','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),20460,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:19:45.072+00:00',null,null),
  ('debe41b4-f33f-4677-accd-a3eb9dbba22d','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),17130,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:19:45.072+00:00',4285,null),
  ('3fb82029-bb5a-48e3-9ce1-ed63852e024e','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),21400,'ZAR','2027-07-01','2027-10-31','2026-07-07T10:07:20.739+00:00',null,null),
  ('0954d753-3b59-42f7-9661-212c26524267','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='STO'),15520,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:19:45.072+00:00',3880,null),
  ('e8a7578e-e569-4b1d-91e5-3107af82e473','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='RAC'),31600,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:07:20.739+00:00',null,null),
  ('427965ed-f1bf-4844-b112-aa5090444606','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='STO'),25280,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:19:45.072+00:00',null,null),
  ('c915eb20-2622-4556-82df-502b7f79f2b0','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='STO'),15520,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:19:45.072+00:00',3880,null),
  ('dbc6e1e2-d828-48f6-9ce0-6810ef8d6774','d614d530-c090-4917-9f8f-c7983ef5fde6','26971a30-6ed3-43ad-997c-576f26c6beb9',(select id from public.rate_types where code='RAC'),19400,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:07:20.739+00:00',null,null),
  ('163f2027-63fa-4263-a8f2-510a78e27fea','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='STO'),18190,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:19:45.072+00:00',null,null),
  ('98cc7c2d-2aa4-431a-adec-01f84e55c762','d614d530-c090-4917-9f8f-c7983ef5fde6','5a9a0950-4f9a-43ef-b93f-2466de784bb8',(select id from public.rate_types where code='RAC'),19400,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:07:20.739+00:00',null,null),
  ('cf5a8b8b-0782-437f-998c-04880873ca86','d614d530-c090-4917-9f8f-c7983ef5fde6','4e483e4d-a98c-44b4-a48b-71eee8ad05ca',(select id from public.rate_types where code='KSSADC'),23300,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:46:43.213+00:00',null,null),
  ('b949320d-3d11-4fbc-8155-311507f1047c','d614d530-c090-4917-9f8f-c7983ef5fde6','f423ea01-a62e-4186-b3ed-65ac4a0e1fc7',(select id from public.rate_types where code='RAC'),22800,'ZAR','2027-11-01','2027-12-15','2026-07-07T10:07:20.739+00:00',null,null),
  ('19aece30-325e-435f-b952-c6b63cb10bd8','caaad4de-fd7b-4640-958d-0d31a50b0782','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),165600,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',82800,null),
  ('8787532f-a91c-4924-9372-13dc57ad9018','caaad4de-fd7b-4640-958d-0d31a50b0782','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),262400,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',131200,null),
  ('92971a41-db06-4881-b6b9-5409294e27d4','caaad4de-fd7b-4640-958d-0d31a50b0782','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),184000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',92000,null),
  ('98a8785f-10bc-4203-82df-bc0aab2c10ed','caaad4de-fd7b-4640-958d-0d31a50b0782','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),349600,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',174800,null),
  ('644f61d1-ec1b-45a2-952d-76a645427504','7969d301-15e3-4307-8d14-5df563f211f6','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),210800,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',105400,null),
  ('c178ef9f-8046-498e-bb00-ad0ec5e88e10','7969d301-15e3-4307-8d14-5df563f211f6','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),423500,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',211750,null),
  ('73cd7060-ae9b-4c32-ab16-39235c68eb22','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RVSADC'),43200,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',21600,null),
  ('36450754-be3c-4b21-83ef-b89ff1870f48','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),86400,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',43200,null),
  ('75e5a668-e301-4cbf-83f2-57ce4ce3a56c','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),36000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',18000,null),
  ('ad962848-9c22-4741-9947-4f86ba649768','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RVSADC'),22500,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',11250,null),
  ('f7e5513b-974e-4a8e-83ad-27d3532c938f','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),45000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',22500,null),
  ('77ab3994-aa49-4c22-8aa4-2833fa6a2c57','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),51840,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',25920,null),
  ('8cc0bbb3-d3e9-42a3-8130-bdc2f164b741','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RVSADC'),32400,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',16200,null),
  ('de0b756e-e113-4b01-aafe-577e093a8058','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),64800,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',32400,null),
  ('03c998f6-5ece-48ac-81c3-9dfe19ea8642','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),83200,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',41600,null),
  ('d25d1352-7781-47a4-b46e-0d2f1f5bbccd','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),43200,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',21600,null),
  ('bb520bac-6190-429f-9e61-c570b47c49cf','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),62400,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',31200,null),
  ('8a5f7c65-3151-458a-b4b9-8c395353685a','249e387f-4a90-4f9c-9941-b5c504022ae4','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),59900,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',29950,null),
  ('522dd30e-40c7-4b08-bac4-33737be10214','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),69200,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',34600,null),
  ('1c7f1be3-c899-467d-92b9-dd7ff872b21f','249e387f-4a90-4f9c-9941-b5c504022ae4','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),86500,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',43250,null),
  ('eb20bfbd-d4bf-4e38-ac76-9cfee671f77b','249e387f-4a90-4f9c-9941-b5c504022ae4','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),91200,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',45600,null),
  ('1f5ddd3a-e43e-4db2-90d0-d75f29581a7c','37e26069-0919-4844-ab63-4256771eb91c','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),13200,'USD','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',6600,null),
  ('9c35a592-f449-4ae5-b552-480c0bdff408','37e26069-0919-4844-ab63-4256771eb91c','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),16500,'USD','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',8250,null),
  ('b51f184f-1109-4d40-8dab-e0982d0465fe','37e26069-0919-4844-ab63-4256771eb91c','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),17440,'USD','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',8720,null),
  ('340fb596-a4c8-4a37-927f-e9b9fd1114dc','37e26069-0919-4844-ab63-4256771eb91c','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),21800,'USD','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',10900,null),
  ('73702f77-78db-4b02-869d-9181881ea75e','37e26069-0919-4844-ab63-4256771eb91c','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),28600,'USD','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',14300,null),
  ('09e0e0a1-565e-44c6-abe2-8cfd9e2ce2c6','37e26069-0919-4844-ab63-4256771eb91c','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),22880,'USD','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',11440,null),
  ('e13437ef-17db-4430-b80a-e601fe70df8c','37e26069-0919-4844-ab63-4256771eb91c','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),24000,'USD','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',12000,null),
  ('24b8f6fa-78a1-40ad-94df-04d3eda24a7b','37e26069-0919-4844-ab63-4256771eb91c','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),19200,'USD','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',9600,null),
  ('77b9ffa1-29ba-4f97-8b4b-ebd39dea928b','37e26069-0919-4844-ab63-4256771eb91c','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),18200,'USD','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',9100,null),
  ('136fbc58-dd24-4c4b-a853-1af2d6ef7c23','37e26069-0919-4844-ab63-4256771eb91c','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),14560,'USD','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',7280,null),
  ('50724776-8425-4f6f-a5d9-79db8cf81682','37e26069-0919-4844-ab63-4256771eb91c','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),31500,'USD','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',15750,null),
  ('c063a4c2-450c-44b0-8308-04eb59ea73b3','37e26069-0919-4844-ab63-4256771eb91c','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),25200,'USD','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',12600,null),
  ('2cf97765-dd63-45f1-9a95-a10467006066','37e26069-0919-4844-ab63-4256771eb91c','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),21120,'USD','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',10560,null),
  ('e5483480-db25-425b-9453-800331c5b5c7','37e26069-0919-4844-ab63-4256771eb91c','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),26400,'USD','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',13200,null),
  ('42c5bc75-a6f2-42fd-94f4-95a6ce18c30d','37e26069-0919-4844-ab63-4256771eb91c','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),16016,'USD','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',8008,null),
  ('19c02937-24f6-4ff3-9504-18cdd1919282','37e26069-0919-4844-ab63-4256771eb91c','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),20020,'USD','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',10010,null),
  ('9b5c06f4-9b7a-40be-b39d-171a8386952d','37e26069-0919-4844-ab63-4256771eb91c','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),27720,'USD','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',13860,null),
  ('30f0a46d-56ec-45e3-9572-5c4df1e5e948','37e26069-0919-4844-ab63-4256771eb91c','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),34650,'USD','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',17325,null),
  ('b77734c8-63c3-42a9-a382-074b1d2e66a1','55c5edba-2e9e-4199-bca4-f0d23fc41091','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),22880,'USD','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',11440,null),
  ('6083bc10-e5bb-4d75-8e8a-ad997cff5081','55c5edba-2e9e-4199-bca4-f0d23fc41091','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),28600,'USD','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',14300,null),
  ('f54cc283-4146-4cff-999d-bd2a7d365426','55c5edba-2e9e-4199-bca4-f0d23fc41091','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),21800,'USD','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',10900,null),
  ('b23cef23-6146-45bc-9273-11d02faf6ccc','55c5edba-2e9e-4199-bca4-f0d23fc41091','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),17440,'USD','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',8720,null),
  ('fbe1a2f5-ef30-4370-b848-003ef9d115be','55c5edba-2e9e-4199-bca4-f0d23fc41091','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),16500,'USD','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',8250,null),
  ('f521484a-9a2b-4dad-9245-dbfdfdcb6056','55c5edba-2e9e-4199-bca4-f0d23fc41091','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),13200,'USD','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',6600,null),
  ('5472235e-f559-417b-83e0-d182174ab264','55c5edba-2e9e-4199-bca4-f0d23fc41091','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),24000,'USD','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',12000,null),
  ('9721f0d4-aea2-4e55-875d-ed5d08ee2cc1','55c5edba-2e9e-4199-bca4-f0d23fc41091','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),14560,'USD','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',7280,null),
  ('e2f61e77-182e-4e73-b922-ffaab0506d3c','55c5edba-2e9e-4199-bca4-f0d23fc41091','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),18200,'USD','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',9100,null),
  ('ef6ed090-13f4-4d72-9496-e7bbd6fdf764','55c5edba-2e9e-4199-bca4-f0d23fc41091','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),31500,'USD','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',15750,null),
  ('0d05c1cd-8a03-4223-82bd-8635be0894e3','55c5edba-2e9e-4199-bca4-f0d23fc41091','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),25200,'USD','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',12600,null),
  ('95d142a2-eb96-4650-9460-1c51be95fbfa','55c5edba-2e9e-4199-bca4-f0d23fc41091','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),19200,'USD','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',9600,null),
  ('09b6f4b4-44c4-4b21-b629-109defb6091c','55c5edba-2e9e-4199-bca4-f0d23fc41091','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),26400,'USD','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',13200,null),
  ('370e18f2-d331-4098-bb2d-8239e913363d','55c5edba-2e9e-4199-bca4-f0d23fc41091','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),21120,'USD','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',10560,null),
  ('444a4e85-90a3-4fcb-a7c8-498250413c3e','55c5edba-2e9e-4199-bca4-f0d23fc41091','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),16016,'USD','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',8008,null),
  ('10c71f82-2bd5-422d-9c82-723870313750','55c5edba-2e9e-4199-bca4-f0d23fc41091','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),20020,'USD','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',10010,null),
  ('0a32ca9c-2fc4-40ca-93b4-1250acb9dcdd','55c5edba-2e9e-4199-bca4-f0d23fc41091','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),34650,'USD','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',17325,null),
  ('38e2a495-5851-4758-b31f-d846e45a1798','55c5edba-2e9e-4199-bca4-f0d23fc41091','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),27720,'USD','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',13860,null),
  ('40e37f89-888a-46a1-a5fb-792e02456858','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RVSADC'),20400,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',10200,null),
  ('130a880e-1dc3-480d-9aa3-babced2fb3fa','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),32640,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',16320,null),
  ('65e961df-2b88-4fb7-a68a-954dc2ce1c4e','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RVSADC'),31500,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',15750,null),
  ('462b7b06-aa3f-4300-a250-a3d902ce9ef5','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),50400,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',25200,null),
  ('aa85c0fa-101a-47f6-8fd4-db615605dfae','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),63000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',31500,null),
  ('d49411f5-3232-4734-a1c2-e45f907b24d2','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),40800,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',20400,null),
  ('b40bf7f1-6a5e-4b29-b59c-73d72e86544d','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RVSADC'),42000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',21000,null),
  ('464af779-57c7-44a2-a53c-4de0efb7be10','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),67200,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',33600,null),
  ('f8e5e558-5c6c-41d3-bc52-266598f3a52b','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),84000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',42000,null),
  ('0a81866b-db73-4693-b517-ae8da9aad147','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),95000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',47500,null),
  ('4da31752-5072-4d99-9d2a-4899e5781ec9','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),76000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',38000,null),
  ('4f62aa51-33f1-499a-914d-696007b9c4de','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RVSADC'),47500,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',23750,null),
  ('7e908dc8-e455-4a07-9120-d49850d837d4','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),49900,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',24950,null),
  ('049626c1-9f9c-4a7b-8fa8-d08b51f382f6','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RVSADC'),24950,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',12475,null),
  ('30c32f2f-fb2e-4342-9dd9-ae14a8c84f01','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),39920,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',19960,null),
  ('8a3c7927-2a36-4565-af86-3c1451bfbe6e','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),71500,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',35750,null),
  ('47ef3806-3e5e-49bc-b605-806882d9331c','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),57200,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',28600,null),
  ('3cc1dc5a-ebe2-4c89-9ffb-fda02631d22d','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RVSADC'),35750,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',17875,null),
  ('740d504e-8ae3-48a8-a526-05292e3566c3','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),54500,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',27250,null),
  ('7747dd33-6a04-4b29-af54-9ce80f830e92','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),43600,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',21800,null),
  ('374bb19d-d91c-4261-8403-a87280a16cc6','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),82400,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',41200,null),
  ('518c362d-0fa1-463f-8b32-ac3022ee0251','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),103000,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',51500,null),
  ('84193921-7ac0-471a-bd8c-bc31553209ff','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),62000,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',31000,null),
  ('3f81f4d1-fea9-450a-b2b4-ce62d4ea0e12','70e5aae0-ebb5-4703-b4ad-a5c23ee42950','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),77500,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',38750,null),
  ('59c6f77a-35b5-47d2-977c-526e33a33b82','ba6f9040-da8a-4f44-adb3-df550eb3ed37','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),178000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',89000,null),
  ('d7f5a5f9-60d9-4a4c-99be-264c7d4fb400','ba6f9040-da8a-4f44-adb3-df550eb3ed37','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),142400,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',71200,null),
  ('7291fb7c-6358-460c-806b-1656042a057d','ba6f9040-da8a-4f44-adb3-df550eb3ed37','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),125000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',62500,null),
  ('f814ae06-0636-45e5-b760-1eb07eec6b06','ba6f9040-da8a-4f44-adb3-df550eb3ed37','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),100000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',50000,null),
  ('d4343938-98da-454c-a29a-45ea24e74508','ba6f9040-da8a-4f44-adb3-df550eb3ed37','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),236000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',118000,null),
  ('75ecea9f-4d97-4965-99ed-ddbfdd9fe493','ba6f9040-da8a-4f44-adb3-df550eb3ed37','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),188800,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',94400,null),
  ('4567f415-22de-4f2e-a4d9-091f789514bb','ba6f9040-da8a-4f44-adb3-df550eb3ed37','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),204800,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',102400,null),
  ('7b757f1c-058e-451c-b48c-126a15c6ad00','ba6f9040-da8a-4f44-adb3-df550eb3ed37','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),256000,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',128000,null),
  ('0c1d6122-ea33-40c4-817e-e0332ba822f3','ba6f9040-da8a-4f44-adb3-df550eb3ed37','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),108800,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',54400,null),
  ('8389289c-0440-4937-bcf6-61816a558ab2','ba6f9040-da8a-4f44-adb3-df550eb3ed37','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),136000,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',68000,null),
  ('8e67089a-d90d-4cf3-aaf2-b40947d324d7','ba6f9040-da8a-4f44-adb3-df550eb3ed37','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),154400,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',77200,null),
  ('c52a9704-18f2-4fe4-9d53-b1097123abd0','ba6f9040-da8a-4f44-adb3-df550eb3ed37','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),193000,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',96500,null),
  ('967071a6-37d6-48b9-b177-3ccde8738592','ba6f9040-da8a-4f44-adb3-df550eb3ed37','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),209500,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',104750,null),
  ('8f56787c-2b08-4e27-b637-a194ddb7114b','ba6f9040-da8a-4f44-adb3-df550eb3ed37','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),167600,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',83800,null),
  ('aae660d6-3d54-405f-945f-a4f239fddbac','ba6f9040-da8a-4f44-adb3-df550eb3ed37','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),277800,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',138900,null),
  ('39d066d5-b7fc-48e7-83ac-8bee1587063d','ba6f9040-da8a-4f44-adb3-df550eb3ed37','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),222240,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',111120,null),
  ('7538cc83-ed08-468c-8dff-668dd35ebcb7','ba6f9040-da8a-4f44-adb3-df550eb3ed37','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),147500,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',73750,null),
  ('d8db00b8-5b5f-42c0-afca-974d58b48a69','ba6f9040-da8a-4f44-adb3-df550eb3ed37','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),118000,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',59000,null),
  ('2c09a723-5f0a-481e-b993-05c62157e43b','7f9d0411-caf9-4b05-ad9b-bace43d13bef','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),218400,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',109200,null),
  ('26d9a169-40e6-4cab-9481-2cce3d50e1da','7f9d0411-caf9-4b05-ad9b-bace43d13bef','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),273000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',136500,null),
  ('28ca51d2-4a8a-4ee8-96bc-ff2a994fbccf','7f9d0411-caf9-4b05-ad9b-bace43d13bef','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),172000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',86000,null),
  ('d7b27d1d-f844-4c88-87b1-fbb4fb1b5d4e','7f9d0411-caf9-4b05-ad9b-bace43d13bef','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),215000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',107500,null),
  ('e80fb6db-b94c-4953-a221-be6f1aa085df','7f9d0411-caf9-4b05-ad9b-bace43d13bef','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),268800,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:45:16.619+00:00',134400,null),
  ('2b16b678-8ccd-472d-810c-b08c278c1138','7f9d0411-caf9-4b05-ad9b-bace43d13bef','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),336000,'ZAR','2026-06-30','2026-12-31','2026-06-30T08:20:57.88+00:00',168000,null),
  ('175fb049-04d3-4a16-96a5-8b49716b6329','7f9d0411-caf9-4b05-ad9b-bace43d13bef','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),322560,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',161280,null),
  ('f243eae7-5d4e-48f3-8702-98c4c7b9b28d','7f9d0411-caf9-4b05-ad9b-bace43d13bef','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),403200,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',201600,null),
  ('3a2716b9-8965-42d1-8f9f-2490fbd0c970','7f9d0411-caf9-4b05-ad9b-bace43d13bef','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),206400,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',103200,null),
  ('fce3a8a7-24c9-42f5-b644-779ca1c7b408','7f9d0411-caf9-4b05-ad9b-bace43d13bef','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),258000,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',129000,null),
  ('fea544e7-0cd6-4fc2-bd3d-04ae7e69a1e3','7f9d0411-caf9-4b05-ad9b-bace43d13bef','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),262080,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:45:16.619+00:00',131040,null),
  ('96ab38f5-0a7e-4128-a49f-bfa3fee1fc93','7f9d0411-caf9-4b05-ad9b-bace43d13bef','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),327600,'ZAR','2027-01-01','2027-12-31','2026-06-30T08:20:57.88+00:00',163800,null),
  ('78f1a49d-36ed-40a2-9bb8-ef4a21e5afac','7f9d0411-caf9-4b05-ad9b-bace43d13bef','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),438000,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',219000,null),
  ('43c8701c-9d6e-4d32-a064-0bb714a14bd6','7f9d0411-caf9-4b05-ad9b-bace43d13bef','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),350400,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',175200,null),
  ('8d74fdc4-1897-4bcf-8478-45dd31e7beef','7f9d0411-caf9-4b05-ad9b-bace43d13bef','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),280000,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',140000,null),
  ('268f1f60-c9c5-4872-9a40-013199e6bcdc','7f9d0411-caf9-4b05-ad9b-bace43d13bef','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),224000,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',112000,null),
  ('7b3efc60-4475-43ae-a264-9983d982c329','7f9d0411-caf9-4b05-ad9b-bace43d13bef','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),355000,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:20:57.88+00:00',177500,null),
  ('ebc28b57-d752-4299-a8b0-52a2eeddce57','7f9d0411-caf9-4b05-ad9b-bace43d13bef','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),284000,'ZAR','2028-01-01','2028-12-31','2026-06-30T08:45:16.619+00:00',142000,null),
  ('f7998bf6-7549-4134-b432-52035c1690e3','82804308-696a-4c21-ba70-7738d2e5b4af','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),215000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:31:17.59+00:00',107500,null),
  ('d7abade4-1204-4453-9b85-47191f3a3c86','82804308-696a-4c21-ba70-7738d2e5b4af','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),172000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',86000,null),
  ('2e9f10e9-6b6a-4c59-961f-a715f4057e67','82804308-696a-4c21-ba70-7738d2e5b4af','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),336000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:31:17.59+00:00',168000,null),
  ('c12f1053-b718-4232-be8b-6d648bcba1a5','82804308-696a-4c21-ba70-7738d2e5b4af','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),268800,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',134400,null),
  ('9f98bcbe-5254-4ee7-8f64-e1b28cf37b3d','82804308-696a-4c21-ba70-7738d2e5b4af','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),273000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:31:17.59+00:00',136500,null),
  ('7ed9086d-fee8-4eed-9dbc-27e841d699c8','82804308-696a-4c21-ba70-7738d2e5b4af','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),218400,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',109200,null),
  ('2970c60b-6279-4b03-b33f-2fdc8ad1dc0f','82804308-696a-4c21-ba70-7738d2e5b4af','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),322560,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',161280,null),
  ('f7bbfab7-c5b3-492c-98ab-2948206bb54b','82804308-696a-4c21-ba70-7738d2e5b4af','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),206400,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',103200,null),
  ('b2ab9755-3e9e-48b4-8919-932b6c2c5637','82804308-696a-4c21-ba70-7738d2e5b4af','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),262080,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',131040,null),
  ('a8e37e35-0265-41e0-8c8f-928a8779fbe5','82804308-696a-4c21-ba70-7738d2e5b4af','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),327600,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:31:17.59+00:00',163800,null),
  ('41d069ea-8677-4da5-ba37-ec177af0f126','82804308-696a-4c21-ba70-7738d2e5b4af','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),224000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',112000,null),
  ('947eff5b-13ca-421d-a9d2-2ef230e4b2fb','82804308-696a-4c21-ba70-7738d2e5b4af','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),280000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:31:17.59+00:00',140000,null),
  ('9c583ce4-886a-481c-a2d4-f09503a9861d','82804308-696a-4c21-ba70-7738d2e5b4af','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),284000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',142000,null),
  ('058790a5-b3c6-40f8-b0bb-9c29e6eb60ef','82804308-696a-4c21-ba70-7738d2e5b4af','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),355000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:31:17.59+00:00',177500,null),
  ('bcdc1342-0196-45f1-9d39-a45d7fd2b0b1','82804308-696a-4c21-ba70-7738d2e5b4af','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),350400,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',175200,null),
  ('91f4b7ce-b641-4f20-be19-b01a74604dd4','82804308-696a-4c21-ba70-7738d2e5b4af','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),438000,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:31:17.59+00:00',219000,null),
  ('791ab5f6-7dd4-4134-89e7-b82f1134983b','123c91f5-1234-4451-9dbb-ef18abc88b4d','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),235000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',117500,null),
  ('5efb3354-4859-4e17-963c-1f5199008bbe','123c91f5-1234-4451-9dbb-ef18abc88b4d','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),132000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',66000,null),
  ('35d451de-61d4-478e-bcca-7861d0f3fe01','123c91f5-1234-4451-9dbb-ef18abc88b4d','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),165000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',82500,null),
  ('e54187ea-c9c8-4c6c-b62d-32a966a7f563','123c91f5-1234-4451-9dbb-ef18abc88b4d','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),188000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',94000,null),
  ('1047e24a-2019-40e6-a64f-51cf37a0d49a','123c91f5-1234-4451-9dbb-ef18abc88b4d','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),313000,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:27:35.782+00:00',156500,null),
  ('d28713b3-d4c6-4689-a7ed-eafa3579c3e1','123c91f5-1234-4451-9dbb-ef18abc88b4d','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),250400,'ZAR','2026-07-06','2026-12-31','2026-07-06T09:42:20.047+00:00',125200,null),
  ('2c5975bd-39c2-4336-bd74-945e59df1803','123c91f5-1234-4451-9dbb-ef18abc88b4d','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),204000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',102000,null),
  ('bd2e0651-862f-4cea-9e8b-0c7e158e5175','123c91f5-1234-4451-9dbb-ef18abc88b4d','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),339500,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',169750,null),
  ('40458760-acf2-4248-96b2-659e8cf76446','123c91f5-1234-4451-9dbb-ef18abc88b4d','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),271600,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',135800,null),
  ('5e37748b-fb9c-4d9a-bd1b-64ad0a7822c2','123c91f5-1234-4451-9dbb-ef18abc88b4d','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),255000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',127500,null),
  ('d1c52fd1-132a-4ee0-97c8-f928e1f298f8','123c91f5-1234-4451-9dbb-ef18abc88b4d','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),179000,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:27:35.782+00:00',89500,null),
  ('92ace28c-af7e-4a80-b6d4-e818fc7972a2','123c91f5-1234-4451-9dbb-ef18abc88b4d','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),143200,'ZAR','2027-01-01','2027-12-31','2026-07-06T09:42:20.047+00:00',71600,null),
  ('7f3149f9-40a1-4b78-bbd9-a06b25679701','123c91f5-1234-4451-9dbb-ef18abc88b4d','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),294800,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',147400,null),
  ('32dfb22f-51f2-4711-b9c6-26a4839245ad','123c91f5-1234-4451-9dbb-ef18abc88b4d','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),276500,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',138250,null),
  ('7f9407ba-2ac4-404a-972d-7a616fbe3a28','123c91f5-1234-4451-9dbb-ef18abc88b4d','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),155600,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',77800,null),
  ('bdff1025-0592-449a-a34e-6caef36529fb','123c91f5-1234-4451-9dbb-ef18abc88b4d','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),221200,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:42:20.047+00:00',110600,null),
  ('9978e67e-dd6f-4118-82b5-cc282b8e5d3c','123c91f5-1234-4451-9dbb-ef18abc88b4d','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),194500,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',97250,null),
  ('bfb39e89-c113-4c77-adc4-fe89cc4ebfb3','123c91f5-1234-4451-9dbb-ef18abc88b4d','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),368500,'ZAR','2028-01-01','2028-12-31','2026-07-06T09:27:35.782+00:00',184250,null),
  ('2ef15934-168c-4c63-9473-f76f4dd74ea3','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RVSADC'),41400,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',20700,null),
  ('01e0d55c-8d13-4aba-9b1d-5c8f831aa64f','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),66240,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',33120,null),
  ('d66fa9db-26ee-4d9b-af99-f5b6cb0cc936','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),82800,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',41400,null),
  ('312c5a15-dd79-4168-a195-d16b84aab22a','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),108000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',54000,null),
  ('d98600e3-98db-4661-be22-063cdebf260b','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RVSADC'),54000,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',27000,null),
  ('fcc9c140-fab7-4267-8913-a54f727d04f8','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),86400,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',43200,null),
  ('592204f9-3794-48d0-940a-08e53dfaf710','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),46080,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:45:16.619+00:00',23040,null),
  ('df559a44-6158-41b2-99e9-fee474d5f704','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),57600,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:20:57.88+00:00',28800,null),
  ('76fd57b2-4d82-4581-beef-ae1abccc63c2','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RVSADC'),28800,'ZAR','2026-06-30','2026-09-30','2026-06-30T08:36:29.322+00:00',14400,null),
  ('576f4564-1913-40e2-b40f-e3418bd055db','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),99200,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',49600,null),
  ('d0bfe02e-015e-4531-85de-442588c70416','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RVSADC'),62000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',31000,null),
  ('c1959dcf-3b2a-4f5e-b18b-e9a3f2e88e13','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),124000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',62000,null),
  ('552e67dc-22be-4dce-a56a-c90b779d6ada','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),66500,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',33250,null),
  ('897125ec-47f7-48b3-a637-a6a0f79cc2b6','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RVSADC'),33250,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',16625,null),
  ('266642b5-280e-4aea-be85-90e5e6968351','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),53200,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',26600,null),
  ('afa4cd7e-f082-44df-a525-5c00dbcdd0ab','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),95000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:20:57.88+00:00',47500,null),
  ('27318f76-da44-461a-a656-e0465956ac76','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),76000,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:45:16.619+00:00',38000,null),
  ('a931b34b-240e-4f72-96b4-fb93d2ee351e','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RVSADC'),47500,'ZAR','2026-10-01','2027-09-30','2026-06-30T08:36:29.322+00:00',23750,null),
  ('cc2b017b-a3ce-4886-ae7e-1de8b5e6aca9','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='RAC'),143000,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',71500,null),
  ('8363e4c1-8a5f-44a0-be15-55e48ef05840','518e80f9-be66-4122-9b6a-625197152340','7c0aa56d-d302-4b41-91f1-d5187113dad5',(select id from public.rate_types where code='STO'),114400,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',57200,null),
  ('c158956b-5152-4471-8ce1-e9ba9ca91388','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='STO'),87600,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',43800,null),
  ('3e0e763f-269a-4b0c-a44b-ffc0f77b260e','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='STO'),60800,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:45:16.619+00:00',30400,null),
  ('a15f095b-62fa-4558-a131-0be11728576d','518e80f9-be66-4122-9b6a-625197152340','fa56e79b-5b79-46d3-a1e4-0e9eeccb5368',(select id from public.rate_types where code='RAC'),76000,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',38000,null),
  ('2ecdff3b-78fc-4eb7-9c2d-363f69bf6556','518e80f9-be66-4122-9b6a-625197152340','ff632a10-6faf-42ad-a7ef-d1fec7072707',(select id from public.rate_types where code='RAC'),109500,'ZAR','2027-10-01','2028-09-30','2026-06-30T08:20:57.88+00:00',54750,null)
on conflict (id) do nothing;

-- PACKAGES, LEGS & LEG ROUTES (from production, excluding per-booking synthetic packages)
insert into public.packages (id,name,description,active,created_at,updated_at,duration_nights,single_supplement_pct,currency,slug,fixed_price_per_person,markup_pct) values
  ('7af631c8-99ff-4eff-8964-96971736278f','Blue Train Five Night Package',null,true,'2026-07-08T09:10:59.747152+00:00','2026-07-08T09:10:59.747152+00:00',5,50,'ZAR','blue-train-five-night-package',null,0)
on conflict (id) do nothing;

insert into public.package_legs (id,package_id,supplier_id,label,sort_order,created_at,date_anchor) values
  ('1631c0a8-9c2b-4fe9-8b94-884084beeaa0','7af631c8-99ff-4eff-8964-96971736278f','002b438f-df83-483a-9274-f17e9fef7f35','The Blue Train',0,'2026-07-08T09:11:00.134+00:00',null),
  ('5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4','7af631c8-99ff-4eff-8964-96971736278f','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','Ulysses Tours & Transfers',1,'2026-07-08T09:11:00.134+00:00',null),
  ('18da3cc2-ebe5-440a-958e-5474ec0f349f','7af631c8-99ff-4eff-8964-96971736278f','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9','The President Hotel',2,'2026-07-08T09:11:00.134+00:00',null),
  ('569ef307-9a27-4e6d-84a4-8be9e4b12766','7af631c8-99ff-4eff-8964-96971736278f','87cbbf54-5085-4146-afe7-172f522b3325','City Sightseeing Bus Tours',3,'2026-07-08T09:11:00.134+00:00',null),
  ('c68f1ea0-df95-4a61-95d3-6b84ad6c6353','7af631c8-99ff-4eff-8964-96971736278f','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','Ulysses Tours & Transfers',4,'2026-07-08T09:11:00.134+00:00',null),
  ('54e9d8bd-aa12-46d7-b15e-1e38660242ae','7af631c8-99ff-4eff-8964-96971736278f','c3c2de5c-c68d-41c5-b04a-053708edca5a','FlySafair',5,'2026-07-08T09:11:00.134+00:00',null)
on conflict (id) do nothing;

insert into public.package_leg_routes (package_leg_id,route_id,created_at) values
  ('1631c0a8-9c2b-4fe9-8b94-884084beeaa0','a409fa56-f2d0-4981-a211-798ab54f1fa6','2026-07-08T09:11:00.134+00:00'),
  ('5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','2026-07-08T09:11:00.134+00:00'),
  ('569ef307-9a27-4e6d-84a4-8be9e4b12766','635df36f-b0b9-4199-bec7-4e6d8bf00332','2026-07-08T09:11:00.134+00:00'),
  ('c68f1ea0-df95-4a61-95d3-6b84ad6c6353','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','2026-07-08T09:11:00.134+00:00'),
  ('54e9d8bd-aa12-46d7-b15e-1e38660242ae','fdd66479-3d2c-4b75-b7d2-23743d12203e','2026-07-08T09:11:00.134+00:00')
on conflict do nothing;

commit;

begin;

-- ============================================================
-- SECTION 7: EMAIL TEMPLATES (from production)
-- ============================================================

insert into public.templates (id,key,subject,body_html,version,active,is_system,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000007001','quote_email','{{supplierName}} | {{clientSurname}} - {{direction}} - {{departureDateShort}}','<p>Dear {{customerName}}</p><p>Thank you for your valued {{supplierName}} enquiry.</p><p><strong>AVAILABILITY</strong><br>On the <strong>{{direction}}</strong> departure, <strong>{{departureDate}}</strong>, we can still assist you with <strong>{{suiteDescription}}</strong>.</p><p><strong>QUOTATION</strong> <em>(This quotation is exclusive to SA Rail – a division of Luxus Travel &amp; Tours)</em></p>{{quoteSummaryTable}}<p><br><strong>RESERVATION PROCEDURE</strong><br>Should you wish to proceed with a:</p><p><strong>Waitlist</strong> – kindly provide me with the first names, surnames &amp; dates of birth of all the guests travelling.</p><p><strong>Provisional Reservation</strong> – kindly provide me with the first names, surnames &amp; ID/Passport numbers of all the guests travelling. A provisional reservation can only be held for 72 hours.</p><p><strong>Definite Reservation</strong> – please complete and return the attached reservation form by email together with ID copies of all passengers travelling.</p><p><strong>BOOKING STATUS</strong><br>The booking status will only change to confirmed once your deposit has been received. The reservation will only be guaranteed once full payment has been received.</p><p><strong>PAYMENT TERMS</strong><br>A 25% non-refundable deposit is required within 72 hours of receiving your confirmation invoice to secure your reservation. The final payment is due 60 days before your departure. Should the reservation be made within 60 days before the departure period, the full amount will be due 48 hours after invoicing.</p><p>**Kindly ensure that payments are received on due dates to avoid cancellation.</p><p><strong>PAYMENT METHOD</strong><br>Payment can either be made by Electronic transfer (EFT) or Credit Card. We accept Mastercard and Visa card payments via PayGate, a secure online site. There is a 2.6% surcharge to partially cover the high credit card fees. Kindly request the payment link from your reservation consultant to use this facility.</p><p><strong>TICKETS &amp; VOUCHERS</strong><br>Once full payment is received, all your travel documents will be issued, and your vouchers will be sent to you electronically. Your actual train tickets will be provided at the station on the day of departure.</p><p><strong>CHANGES / CANCELLATION</strong><br>Our standard travel terms &amp; conditions apply to all reservations.</p><p><strong>INSURANCE</strong><br>It is highly recommended that clients obtain comprehensive travel insurance coverage that includes protection against trip cancellation penalties.</p><p><strong>CLIENT PROTECTION</strong><br>We are proud members of SATSA (membership number 2485) and insured through SATIB. As part of the Southern Africa Tourism Services Association, we are dedicated to raising tourism standards in South Africa.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong><br>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me. I am here to ensure that your travel experience is seamless and enjoyable.</p><p><strong>PLEASE FIND ATTACHED TO THIS EMAIL:</strong><br>1. Quotation in PDF <br>2. Reservation form with terms and conditions<br>3. Detailed train itinerary</p><p>Thank you for your enquiry. If you need any additional information or assistance, please don''t hesitate to reach out. I look forward to your response.</p>',11,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-22T09:46:06.250494+00:00'),
  ('00000000-0000-0000-0000-000000007002','follow_up','Following up on your enquiry — {{jobNumber}}','<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007003','deposit_request','{{supplierName}} | {{clientSurname}} - {{direction}} - {{departureDateShort}}','<p>Dear {{customerName}}</p><p>Thank you for your {{supplierName}} reservation request.</p><p><strong>GUEST DETAILS</strong></p><p>Please ensure that all details match those on the ID or passport.</p><p><strong>RESERVATION/ITINERARY DETAILS</strong></p><p>Provisional reservations are secured for the travel services listed on your confirmation invoice. Please ensure all details are correct, as travel arrangements will be issued accordingly and change fees may apply.</p><p><strong>PLEASE FIND ATTACHED</strong></p><p>Your confirmation invoice with bank details.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Deposit due Now: <strong>{{depositAmount}}</strong></p><p>Final amount due {{finalDueDate}}: <strong>{{finalAmount}}</strong></p><p><strong>PAYMENT TERMS</strong></p><p>A non-refundable deposit of {{depositPercentage}}% is required within 72 hours of receiving your confirmation invoice to secure your reservation. The final payment must be made 60 days prior to departure. If the reservation is made within 60 days of the departure date, the full amount will be due 48 hours after invoicing.</p><p>**Kindly ensure that payments are received on due dates to avoid automatic cancellation.</p><p><strong>BANK DETAILS FOR ELECTRONIC PAYMENTS</strong></p>{{bankingDetails}}<p><strong>REF NO: {{invoiceNumber}}</strong></p><p>Please note: the amounts transferred should be exclusive of all bank charges.</p><p><strong>CREDIT CARD PAYMENTS</strong></p><p>We accept MasterCard and Visa payments via PayGate, a secure online platform. Please request the payment link from your reservation consultant to use this service. Note: there will be a 2.6% surcharge on Credit Card payments.</p><p><strong>BOOKING STATUS</strong></p><p>Your booking status will be confirmed only after we receive your deposit. The reservation will be secured once full payment is made.</p><p><strong>TICKETS &amp; VOUCHERS</strong></p><p>After full payment is received, all travel documents will be issued, and vouchers will be sent to you electronically. Your train tickets will be provided during check-in.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong></p><p>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me.</p><p>I thank you for your most valued reservation. Please do not hesitate to contact me should you require further information.</p>',3,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-22T10:37:32.602372+00:00'),
  ('00000000-0000-0000-0000-000000007004','voucher_email','Your Travel Voucher — {{jobNumber}}','<p>Dear {{customerName}}</p><p>Thank you for your most valued reservation.</p><p>Attached, you will find the following documents:</p><ul><li>Your confirmation invoice</li><li>Your travel vouchers with contact details - <em>South Africa is voucherless. The reference found on your itinerary is all you need to confirm payment for the services booked for you. Each relevant reference number needs to be given to each service provider when using their respective service. All passengers will be required to provide identification (ID or passport) when checking in to any accommodation establishment.</em></li><li>Train Itinerary &amp; Fact Sheet</li></ul><p>Please keep a copy of the travel vouchers with you for reference purposes together with your South African IDs or Passports.</p><p>Your train tickets will be given to you at the lounge when checking in for your departure.</p><p>Please read through all the documents to see if everything is correct and advise if any changes must be made.</p><p><strong>IMPORTANT INFORMATION BEFORE YOU TRAVEL</strong><br>We recommend that you do not make use of Uber services at either departure or arrival stations. Rather make use of a private transfer or the Gautrain.</p><p>As the train runs on a shared railway line, there may be occasions when it stops for a period of time. If there are any significant delays, your train manager will inform you and the necessary arrangements will be made. The train and Luxus Travel &amp; Tours cannot be held responsible or liable for any delays or changes in tour arrangements that may be caused by natural or other factors beyond our control. We strongly advise against same-day air travel on departure or arrival days due to possible train delays.</p><p><strong>We urge all our clients to take out adequate travel insurance.</strong></p><p>I wish you a safe and pleasant journey on the ***  and please do not hesitate to contact me if you require any further assistance.</p>',3,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-22T11:09:20.065545+00:00'),
  ('00000000-0000-0000-0000-000000007005','final_invoice','Final Invoice {{invoiceNumber}}','<p>Dear {{customerName}},</p><p>Please find attached your final invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong>, due by <strong>{{dueDate}}</strong>.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',2,true,true,'2026-07-13T20:23:38.992853+00:00','2026-08-04T00:00:00.000000+00:00'),
  ('00000000-0000-0000-0000-000000007006','payment_reminder','Payment Reminder — Invoice {{invoiceNumber}}','<p>Dear {{customerName}},</p><p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong> is due by <strong>{{dueDate}}</strong>. Please find the invoice attached.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007008','thank_you','Thank you for travelling with us — {{jobNumber}}','<p>Dear {{customerName}},</p><p>We hope you had a wonderful journey on <strong>{{routeName}}</strong>. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you aboard again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007009','reservation_received','{{supplierName}} | {{clientSurname}} - {{direction}} - {{departureDateShort}}','<p>Dear {{customerName}}</p><p>Thank you for your reservation form well received.</p><p>The confirmation invoice with payment instructions will follow shortly.</p><p>In the meantime, I have secured your suite for you.</p>',3,true,true,'2026-07-21T11:11:33.288351+00:00','2026-07-22T10:31:31.037437+00:00'),
  ('00000000-0000-0000-0000-000000007010','payment_received','Payment received — {{invoiceNumber}}','<p>Dear {{customerName}}</p><p>Thank you very much for your payment well received.</p><p>Please find attached your amended confirmation invoice.</p><p><strong>PAYMENT SCHEDULE</strong><br>Amount received: <strong>{{receivedAmount}}</strong> – Received, thank you.</p><p>Final amount due {{finalDueDate}}: <strong>{{outstandingAmount}}</strong></p><p>Hope you have a wonderful day.</p>',5,true,true,'2026-07-21T11:11:33.288351+00:00','2026-08-04T00:00:00.000000+00:00')
-- Conflict target is `key` (unique index): the unify-email-templates migration
-- pre-inserts the newer system keys with generated ids on a fresh reset. The
-- 'full_payment_request' key is seeded separately by migration
-- 20260723120000_full_payment_invoice.sql and intentionally left untouched here.
on conflict (key) do update set subject=excluded.subject,
  body_html=excluded.body_html,version=excluded.version,active=excluded.active,is_system=excluded.is_system,updated_at=excluded.updated_at;

-- ============================================================
-- SECTION 8: APP SETTINGS (from production) & VOUCHER TEMPLATE
-- ============================================================

-- APP SETTINGS (from production, full replace)
insert into public.app_settings (key,value,updated_at) values
  ('business_name','Luxus Travel and Tours','2026-05-12T13:43:55.008671+00:00'),
  ('default_deposit_percentage','25','2026-05-12T13:43:55.008671+00:00'),
  ('default_commission_type','percent','2026-07-28T00:00:00+00:00'),
  ('default_commission_value','0','2026-07-28T00:00:00+00:00'),
  ('session_timeout_minutes','400','2026-05-20T09:28:48.138+00:00'),
  ('deposit_due_rule','after_quote_acceptance','2026-05-26T10:48:44.602608+00:00'),
  ('deposit_due_days','7','2026-05-26T10:48:44.602608+00:00'),
  ('final_payment_due_days_before_departure','30','2026-05-26T10:48:44.602608+00:00'),
  ('outbound_email_provider','tbd_provider_not_selected','2026-05-26T10:48:44.602608+00:00'),
  ('backup_storage_provider','supabase_storage','2026-05-26T10:48:44.602608+00:00'),
  ('backup_storage_bucket','backups','2026-05-26T10:48:44.602608+00:00'),
  ('read_only_exports_allowed','false','2026-05-26T10:48:44.602608+00:00'),
  ('payment_reference_required','false','2026-05-26T10:48:44.602608+00:00'),
  ('quote_acceptance_after_expiry','blocked','2026-05-26T10:48:44.602608+00:00'),
  ('attachment_max_size_mb','10','2026-05-26T10:48:48.544463+00:00'),
  ('attachment_allowed_mime_types','["application/pdf","image/jpeg","image/png","image/webp","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]','2026-05-26T10:48:48.544463+00:00'),
  ('default_infant_max_age','2','2026-05-26T10:48:52.327451+00:00'),
  ('default_child_max_age','12','2026-05-26T10:48:52.327451+00:00'),
  ('quote_validity_days','7','2026-06-30T08:22:30.904+00:00'),
  ('company_email','info@luxustravel.co.za','2026-07-13T20:23:35.570182+00:00'),
  ('company_phone','+27 12 345 6789','2026-07-13T20:23:35.570182+00:00'),
  ('vat_rate','15','2026-07-13T20:23:35.570182+00:00'),
  ('hotel_default_check_in_time','14:00','2026-07-13T20:23:37.691273+00:00'),
  ('hotel_default_check_out_time','11:00','2026-07-13T20:23:37.691273+00:00'),
  ('email_footer_tagline','Luxury train journeys, handled with care.','2026-07-13T20:23:38.009841+00:00'),
  ('quote_doc_excludes_heading','Your Package Excludes','2026-07-21T11:11:29.487455+00:00'),
  ('quote_doc_excludes_default','Services not mentioned.','2026-07-21T11:11:29.487455+00:00'),
  ('quote_doc_footer_text','This quotation is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys.','2026-07-21T11:11:29.84507+00:00'),
  ('quote_doc_title','QUOTATION','2026-07-13T20:23:38.009841+00:00'),
  ('company_tel','','2026-07-21T11:11:32.604265+00:00'),
  ('company_cell','','2026-07-21T11:11:32.604265+00:00'),
  ('company_fax','','2026-07-21T11:11:32.604265+00:00'),
  ('company_website','','2026-07-21T11:11:32.604265+00:00'),
  ('invoice_doc_payment_note','Please e-mail proof of payment. Reservations can only be confirmed once payment has been received.','2026-07-21T11:11:32.604265+00:00'),
  ('invoice_doc_bank_charges_note','Please note that the amounts transferred should be exclusive of all bank charges.','2026-07-21T11:11:32.604265+00:00'),
  ('invoice_status_options','[{"role":"provisional","label":"Provisional"},{"role":"confirmed","label":"Confirmed"},{"role":"paid","label":"Paid in Full"},{"role":"cancelled","label":"Cancelled"}]','2026-07-21T11:11:33.288351+00:00'),
  ('brand_block_heading','BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI','2026-07-21T11:11:33.661601+00:00'),
  ('brand_block_subheading','A division of Luxus Travel & Tours','2026-07-21T11:11:33.661601+00:00'),
  ('brand_block_position_quote','top','2026-07-21T11:11:33.661601+00:00'),
  ('brand_block_position_invoice','top','2026-07-21T11:11:33.661601+00:00'),
  ('deposit_refundable','false','2026-07-21T11:25:40.93795+00:00'),
  ('quote_follow_up_cadence','[3,7]','2026-07-21T11:25:40.93795+00:00'),
  ('quote_follow_up_enabled','true','2026-07-21T11:25:40.93795+00:00'),
  ('email_font_family','Calibri, Candara, Segoe, ''Segoe UI'', Optima, Arial, sans-serif','2026-07-22T08:53:01.264+00:00'),
  ('email_font_size','14px','2026-07-22T08:53:01.264+00:00'),
  ('brand_block_position_email','top','2026-07-22T09:05:10.628+00:00'),
  ('brand_block_logo_url','https://qlwldfhjfbxliyjvoziu.supabase.co/storage/v1/object/public/voucher-assets/brand/sarail-footer-logo.png?t=1784711198487','2026-07-22T09:06:38.69+00:00')
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
-- SECTION 9: BOOKINGS (9)
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
('00000000-0000-0000-0000-000000009040','LTT-2025-0001','00000000-0000-0000-0000-000000008007','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','email','closed','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2025-05-15',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,true,0,'2025-02-10T09:00:00Z','2025-02-20T14:00:00Z','2025-02-22T09:00:00Z','2025-03-01T11:00:00Z','2025-04-15T15:00:00Z','2025-05-01T09:00:00Z','2025-07-01T10:00:00Z','2025-02-01T09:00:00Z','2025-07-01T10:00:00Z'),
('00000000-0000-0000-0000-000000009033','LTT-2025-0003','00000000-0000-0000-0000-000000008001','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','web_form','closed','LB','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','2025-11-10',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,true,0,'2025-08-28T09:00:00Z','2025-09-08T14:00:00Z','2025-09-12T09:00:00Z','2025-09-20T11:00:00Z','2025-10-05T15:00:00Z','2025-10-28T09:00:00Z','2025-12-01T10:00:00Z','2025-08-20T09:00:00Z','2025-12-01T10:00:00Z'),
('00000000-0000-0000-0000-000000009029','LTT-2025-0007','00000000-0000-0000-0000-000000008011','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','referral','voucher_sent','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-08',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,true,0,'2025-11-10T09:00:00Z','2025-11-20T14:00:00Z','2025-11-25T09:00:00Z','2025-12-05T11:00:00Z','2026-03-28T15:00:00Z','2026-05-01T09:00:00Z',null,'2025-11-01T09:00:00Z','2026-05-01T09:00:00Z'),
('00000000-0000-0000-0000-000000009024','LTT-2025-0009','00000000-0000-0000-0000-000000008014','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','email','final_paid','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-06-11',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,true,0,'2025-12-05T09:00:00Z','2025-12-15T14:00:00Z','2025-12-20T09:00:00Z','2025-12-28T11:00:00Z','2026-04-10T15:00:00Z',null,null,'2025-11-28T09:00:00Z','2026-04-10T15:00:00Z'),
('00000000-0000-0000-0000-000000009021','LTT-2026-0015','00000000-0000-0000-0000-000000008002','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','travel_agent','deposit_paid','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-06-04',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,true,83662.50,'2026-01-30T09:00:00Z','2026-02-08T14:00:00Z','2026-02-12T09:00:00Z','2026-02-18T11:00:00Z',null,null,null,'2026-01-25T09:00:00Z','2026-02-18T11:00:00Z'),
('00000000-0000-0000-0000-000000009018','LTT-2026-0021','00000000-0000-0000-0000-000000008008','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','email','deposit_requested','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-09-15',4,2,2,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,true,'Cape Town city sightseeing day tour',true,false,152400.00,'2026-03-12T09:00:00Z','2026-03-20T14:00:00Z','2026-03-25T09:00:00Z',null,null,null,null,'2026-03-05T09:00:00Z','2026-03-25T09:00:00Z'),
('00000000-0000-0000-0000-000000009013','LTT-2026-0025','00000000-0000-0000-0000-000000008006','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','walk_in','accepted','DR','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','2026-09-01',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,false,null,'2026-04-01T09:00:00Z','2026-04-10T14:00:00Z',null,null,null,null,null,'2026-03-25T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-000000009008','LTT-2026-0030','00000000-0000-0000-0000-000000008002','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','email','quote_sent','CDJ','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','2026-09-10',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,false,null,true,false,null,'2026-04-25T09:00:00Z',null,null,null,null,null,null,'2026-04-20T09:00:00Z','2026-04-25T09:00:00Z'),
('00000000-0000-0000-0000-000000009002','LTT-2026-0033','00000000-0000-0000-0000-000000008018','7af631c8-99ff-4eff-8964-96971736278f','a409fa56-f2d0-4981-a211-798ab54f1fa6','reservation','email','enquiry','DL','00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a5','2026-09-20',4,2,0,1,'post','fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',false,null,true,'Honeymoon arrangement — rose petals, champagne, private dinner',false,false,null,null,null,null,null,null,null,null,'2026-05-08T09:00:00Z','2026-05-08T09:00:00Z');

commit;




begin;

-- SECTION 10: BOOKING SUITES
insert into public.booking_suites (id,booking_id,suite_number,suite_type_id,suite_type_name,created_at) values
('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-000000009033',1,'66958bfc-888f-44db-9279-e2babc8b5e7c','Luxury Suite','2025-08-20T09:11:00Z'),
('00000000-0000-0000-0000-00000000a007','00000000-0000-0000-0000-000000009029',1,'642e34ee-9a7b-4532-bb20-12a61c2f6e85','Deluxe Suite','2025-11-01T09:11:00Z'),
('00000000-0000-0000-0000-00000000a009','00000000-0000-0000-0000-000000009024',1,'642e34ee-9a7b-4532-bb20-12a61c2f6e85','Deluxe Suite','2025-11-28T09:11:00Z'),
('00000000-0000-0000-0000-00000000a014','00000000-0000-0000-0000-000000009021',1,'642e34ee-9a7b-4532-bb20-12a61c2f6e85','Deluxe Suite','2026-01-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a019','00000000-0000-0000-0000-000000009018',1,'66958bfc-888f-44db-9279-e2babc8b5e7c','Luxury Suite','2026-03-05T09:11:00Z'),
('00000000-0000-0000-0000-00000000a023','00000000-0000-0000-0000-000000009013',1,'66958bfc-888f-44db-9279-e2babc8b5e7c','Luxury Suite','2026-03-25T09:11:00Z'),
('00000000-0000-0000-0000-00000000a028','00000000-0000-0000-0000-000000009008',1,'642e34ee-9a7b-4532-bb20-12a61c2f6e85','Deluxe Suite','2026-04-20T09:11:00Z');

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
('00000000-0000-0000-0000-00000000b030','00000000-0000-0000-0000-000000009018','Master','Jack','Taylor','AU77778888','2015-09-20',true,4,'2026-03-05T09:12:00Z'),
('00000000-0000-0000-0000-00000000b040','00000000-0000-0000-0000-000000009008','Ms','Sarah','Van Der Berg','ZA8501015800083','1985-01-01',false,1,'2026-04-20T09:12:00Z'),
('00000000-0000-0000-0000-00000000b041','00000000-0000-0000-0000-000000009008','Mr','Michael','Ndlovu','ZA8203125800081','1982-03-12',false,2,'2026-04-20T09:12:00Z');

commit;


begin;

-- ============================================================
-- SECTION 11b: BOOKING PACKAGE SELECTIONS, UNITS & TRANSPORT REQUESTS
-- One row per Blue Train Five Night Package leg (train, transfer, hotel,
-- tour, transfer, flight) for each of the 3 bookings, so Build Booking /
-- the Reservation tab render the package's real supplier chain instead of
-- an empty leg list. Transport requests cover the two Ulysses transfer
-- legs only (booking_transport_requests.service_type allows 'transfer'/
-- 'rental', not flights); the FlySafair leg is carried purely via the
-- selection + unit rows.
-- ============================================================

insert into public.booking_package_selections (id,booking_id,package_leg_id,selected,supplier_id,route_id,suite_type_id,service_date,notes,created_at,updated_at) values
-- Sarah Van Der Berg (LTT-2026-0030)
('00000000-0000-0000-0000-00000000f110','00000000-0000-0000-0000-000000009008','1631c0a8-9c2b-4fe9-8b94-884084beeaa0',true,'002b438f-df83-483a-9274-f17e9fef7f35','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85','2026-09-10',null,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f111','00000000-0000-0000-0000-000000009008','5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4',true,'d13eedf1-9700-40ae-8fce-e9cf1cb277fa','5d50f736-f4a3-4fb1-9518-da7dc67c14e6',null,'2026-09-13',null,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f112','00000000-0000-0000-0000-000000009008','18da3cc2-ebe5-440a-958e-5474ec0f349f',true,'fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,'f6ec6260-5d6c-4130-81be-0fd21e77d021','2026-09-13',null,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f113','00000000-0000-0000-0000-000000009008','569ef307-9a27-4e6d-84a4-8be9e4b12766',true,'87cbbf54-5085-4146-afe7-172f522b3325','635df36f-b0b9-4199-bec7-4e6d8bf00332',null,'2026-09-14',null,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f114','00000000-0000-0000-0000-000000009008','c68f1ea0-df95-4a61-95d3-6b84ad6c6353',true,'d13eedf1-9700-40ae-8fce-e9cf1cb277fa','4b8b200f-f34d-4e5a-9192-4e60e5d91a24',null,'2026-09-15',null,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f115','00000000-0000-0000-0000-000000009008','54e9d8bd-aa12-46d7-b15e-1e38660242ae',true,'c3c2de5c-c68d-41c5-b04a-053708edca5a','fdd66479-3d2c-4b75-b7d2-23743d12203e',null,'2026-09-15','Flight FA123 CPT > ORT','2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
-- Elizabeth Taylor family (LTT-2026-0021)
('00000000-0000-0000-0000-00000000f120','00000000-0000-0000-0000-000000009018','1631c0a8-9c2b-4fe9-8b94-884084beeaa0',true,'002b438f-df83-483a-9274-f17e9fef7f35','a409fa56-f2d0-4981-a211-798ab54f1fa6','66958bfc-888f-44db-9279-e2babc8b5e7c','2026-09-15',null,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f121','00000000-0000-0000-0000-000000009018','5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4',true,'d13eedf1-9700-40ae-8fce-e9cf1cb277fa','5d50f736-f4a3-4fb1-9518-da7dc67c14e6',null,'2026-09-18',null,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f122','00000000-0000-0000-0000-000000009018','18da3cc2-ebe5-440a-958e-5474ec0f349f',true,'fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,'159d8f01-77b1-45a6-add6-198d66241d52','2026-09-18',null,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f123','00000000-0000-0000-0000-000000009018','569ef307-9a27-4e6d-84a4-8be9e4b12766',true,'87cbbf54-5085-4146-afe7-172f522b3325','635df36f-b0b9-4199-bec7-4e6d8bf00332',null,'2026-09-19',null,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f124','00000000-0000-0000-0000-000000009018','c68f1ea0-df95-4a61-95d3-6b84ad6c6353',true,'d13eedf1-9700-40ae-8fce-e9cf1cb277fa','4b8b200f-f34d-4e5a-9192-4e60e5d91a24',null,'2026-09-20',null,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f125','00000000-0000-0000-0000-000000009018','54e9d8bd-aa12-46d7-b15e-1e38660242ae',true,'c3c2de5c-c68d-41c5-b04a-053708edca5a','fdd66479-3d2c-4b75-b7d2-23743d12203e',null,'2026-09-20','Flight FA124 CPT > ORT','2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
-- Henrik & Astrid Johansson (LTT-2025-0007)
('00000000-0000-0000-0000-00000000f130','00000000-0000-0000-0000-000000009029','1631c0a8-9c2b-4fe9-8b94-884084beeaa0',true,'002b438f-df83-483a-9274-f17e9fef7f35','a409fa56-f2d0-4981-a211-798ab54f1fa6','642e34ee-9a7b-4532-bb20-12a61c2f6e85','2026-06-08',null,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f131','00000000-0000-0000-0000-000000009029','5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4',true,'d13eedf1-9700-40ae-8fce-e9cf1cb277fa','5d50f736-f4a3-4fb1-9518-da7dc67c14e6',null,'2026-06-11',null,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f132','00000000-0000-0000-0000-000000009029','18da3cc2-ebe5-440a-958e-5474ec0f349f',true,'fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9',null,'a8cb7e9a-fa21-4103-91a4-271ffd5f8d02','2026-06-11',null,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f133','00000000-0000-0000-0000-000000009029','569ef307-9a27-4e6d-84a4-8be9e4b12766',true,'87cbbf54-5085-4146-afe7-172f522b3325','635df36f-b0b9-4199-bec7-4e6d8bf00332',null,'2026-06-12',null,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f134','00000000-0000-0000-0000-000000009029','c68f1ea0-df95-4a61-95d3-6b84ad6c6353',true,'d13eedf1-9700-40ae-8fce-e9cf1cb277fa','4b8b200f-f34d-4e5a-9192-4e60e5d91a24',null,'2026-06-13',null,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f135','00000000-0000-0000-0000-000000009029','54e9d8bd-aa12-46d7-b15e-1e38660242ae',true,'c3c2de5c-c68d-41c5-b04a-053708edca5a','fdd66479-3d2c-4b75-b7d2-23743d12203e',null,'2026-06-13','Flight FA125 CPT > ORT','2025-11-10T09:15:00Z','2025-11-10T09:15:00Z')
on conflict (booking_id, package_leg_id) do update set
  selected=excluded.selected,supplier_id=excluded.supplier_id,route_id=excluded.route_id,
  suite_type_id=excluded.suite_type_id,service_date=excluded.service_date,notes=excluded.notes,
  updated_at=excluded.updated_at;

insert into public.booking_package_selection_units (id,selection_id,suite_type_id,adult_count,child_count,infant_count,sort_order,created_at,updated_at) values
-- Sarah
('00000000-0000-0000-0000-00000000f210','00000000-0000-0000-0000-00000000f110','642e34ee-9a7b-4532-bb20-12a61c2f6e85',2,0,0,0,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f211','00000000-0000-0000-0000-00000000f111',null,2,0,0,0,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f212','00000000-0000-0000-0000-00000000f112','f6ec6260-5d6c-4130-81be-0fd21e77d021',2,0,0,0,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f213','00000000-0000-0000-0000-00000000f113',null,2,0,0,0,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f214','00000000-0000-0000-0000-00000000f114',null,2,0,0,0,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f215','00000000-0000-0000-0000-00000000f115',null,2,0,0,0,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
-- Taylor family
('00000000-0000-0000-0000-00000000f220','00000000-0000-0000-0000-00000000f120','66958bfc-888f-44db-9279-e2babc8b5e7c',2,2,0,0,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f221','00000000-0000-0000-0000-00000000f121',null,2,2,0,0,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f222','00000000-0000-0000-0000-00000000f122','159d8f01-77b1-45a6-add6-198d66241d52',2,2,0,0,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f223','00000000-0000-0000-0000-00000000f123',null,2,2,0,0,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f224','00000000-0000-0000-0000-00000000f124',null,2,2,0,0,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f225','00000000-0000-0000-0000-00000000f125',null,2,2,0,0,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
-- Johansson
('00000000-0000-0000-0000-00000000f230','00000000-0000-0000-0000-00000000f130','642e34ee-9a7b-4532-bb20-12a61c2f6e85',2,0,0,0,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f231','00000000-0000-0000-0000-00000000f131',null,2,0,0,0,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f232','00000000-0000-0000-0000-00000000f132','a8cb7e9a-fa21-4103-91a4-271ffd5f8d02',2,0,0,0,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f233','00000000-0000-0000-0000-00000000f133',null,2,0,0,0,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f234','00000000-0000-0000-0000-00000000f134',null,2,0,0,0,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f235','00000000-0000-0000-0000-00000000f135',null,2,0,0,0,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z')
on conflict (id) do update set
  suite_type_id=excluded.suite_type_id,adult_count=excluded.adult_count,child_count=excluded.child_count,
  infant_count=excluded.infant_count,updated_at=excluded.updated_at;

insert into public.booking_transport_requests (id,booking_id,service_type,supplier_id,route_id,package_leg_id,pickup_point,dropoff_point,pickup_at,passenger_count,luggage_count,sort_order,created_at,updated_at) values
-- Sarah
('00000000-0000-0000-0000-00000000f311','00000000-0000-0000-0000-000000009008','transfer','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4','Cape Town Station','Cape Town Hotel (CBD)','2026-09-13T09:00:00Z',2,2,1,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f314','00000000-0000-0000-0000-000000009008','transfer','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','c68f1ea0-df95-4a61-95d3-6b84ad6c6353','Cape Town Hotel','Cape Town Airport','2026-09-15T09:00:00Z',2,2,4,'2026-04-25T09:15:00Z','2026-04-25T09:15:00Z'),
-- Taylor family
('00000000-0000-0000-0000-00000000f321','00000000-0000-0000-0000-000000009018','transfer','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4','Cape Town Station','Cape Town Hotel (CBD)','2026-09-18T09:00:00Z',4,4,1,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
('00000000-0000-0000-0000-00000000f324','00000000-0000-0000-0000-000000009018','transfer','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','c68f1ea0-df95-4a61-95d3-6b84ad6c6353','Cape Town Hotel','Cape Town Airport','2026-09-20T09:00:00Z',4,4,4,'2026-03-12T09:15:00Z','2026-03-25T09:15:00Z'),
-- Johansson
('00000000-0000-0000-0000-00000000f331','00000000-0000-0000-0000-000000009029','transfer','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','5d50f736-f4a3-4fb1-9518-da7dc67c14e6','5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4','Cape Town Station','Cape Town Hotel (CBD)','2026-06-11T09:00:00Z',2,2,1,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z'),
('00000000-0000-0000-0000-00000000f334','00000000-0000-0000-0000-000000009029','transfer','d13eedf1-9700-40ae-8fce-e9cf1cb277fa','4b8b200f-f34d-4e5a-9192-4e60e5d91a24','c68f1ea0-df95-4a61-95d3-6b84ad6c6353','Cape Town Hotel','Cape Town Airport','2026-06-13T09:00:00Z',2,2,4,'2025-11-10T09:15:00Z','2025-11-10T09:15:00Z')
on conflict (id) do update set
  supplier_id=excluded.supplier_id,route_id=excluded.route_id,pickup_point=excluded.pickup_point,
  dropoff_point=excluded.dropoff_point,pickup_at=excluded.pickup_at,passenger_count=excluded.passenger_count,
  luggage_count=excluded.luggage_count,updated_at=excluded.updated_at;

commit;


begin;

-- SECTION 12: ITINERARIES
insert into public.itineraries (id,booking_id,name,notes,accepted_at,created_at,updated_at) values
('00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-000000009033','Blue Train Cape Town Explorer — Mitchell VIP','Four-night Pretoria to Cape Town. Luxury Suite with post-stay at The President Hotel.','2025-09-08T14:00:00Z','2025-09-05T09:00:00Z','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c007','00000000-0000-0000-0000-000000009029','Blue Train Cape Town Explorer — Johansson','Four-night Pretoria to Cape Town. Post-stay at The President Hotel, with return transfers via Ulysses Tours & Transfers and a FlySafair flight home.','2025-11-20T14:00:00Z','2025-11-17T09:00:00Z','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000c009','00000000-0000-0000-0000-000000009024','Blue Train Cape Town Explorer — Beaumont','Four-night Pretoria to Cape Town. Post-stay at The President Hotel.','2025-12-15T14:00:00Z','2025-12-12T09:00:00Z','2025-12-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000c014','00000000-0000-0000-0000-000000009021','Blue Train Cape Town Explorer — Van Der Berg','Four-night Pretoria to Cape Town. Post-stay at The President Hotel.','2026-02-08T14:00:00Z','2026-02-05T09:00:00Z','2026-02-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000c019','00000000-0000-0000-0000-000000009018','Blue Train Cape Town Explorer — Taylor Family','Four-night with 2 children. Post-stay at The President Hotel, City Sightseeing Cape Town day tour, Ulysses transfers and a FlySafair flight home.','2026-03-20T14:00:00Z','2026-03-17T09:00:00Z','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000c023','00000000-0000-0000-0000-000000009013','Blue Train Cape Town Explorer — Naidoo (accepted)','Four-night Pretoria to Cape Town. Post-stay.','2026-04-10T14:00:00Z','2026-04-07T09:00:00Z','2026-04-10T14:00:00Z');

commit;


begin;

-- SECTION 13: QUOTES
-- validity_until is exactly 14 days from created_at (quotes are valid 14 days).
insert into public.quotes (id,booking_id,itinerary_id,quote_number,status,validity_until,subtotal,total,last_sent_at,created_at,updated_at) values
('00000000-0000-0000-0000-00000000d003','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000c003','LTT-2025-0003-Q1','accepted','2025-09-28',143478.26,143478.26,'2025-08-28T09:30:00Z','2025-08-28T09:00:00Z','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d007','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000c007','LTT-2025-0007-Q1','accepted','2025-11-24',97000.00,97000.00,'2025-11-10T09:30:00Z','2025-11-10T09:00:00Z','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000d009','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000c009','LTT-2025-0009-Q1','accepted','2026-01-05',97000.00,97000.00,'2025-12-05T09:30:00Z','2025-12-05T09:00:00Z','2025-12-15T14:00:00Z'),
('00000000-0000-0000-0000-00000000d014','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000c014','LTT-2026-0015-Q1','accepted','2026-02-28',97000.00,97000.00,'2026-01-30T09:30:00Z','2026-01-30T09:00:00Z','2026-02-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000d019','00000000-0000-0000-0000-000000009018','00000000-0000-0000-0000-00000000c019','LTT-2026-0021-Q1','accepted','2026-03-26',152400.00,152400.00,'2026-03-12T09:30:00Z','2026-03-12T09:00:00Z','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000d023','00000000-0000-0000-0000-000000009013','00000000-0000-0000-0000-00000000c023','LTT-2026-0025-Q1','accepted','2026-05-01',110400.00,110400.00,'2026-04-01T09:30:00Z','2026-04-01T09:00:00Z','2026-04-10T14:00:00Z'),
('00000000-0000-0000-0000-00000000d028','00000000-0000-0000-0000-000000009008',null,'LTT-2026-0030-Q1','sent','2026-05-09',97000.00,97000.00,'2026-04-25T09:30:00Z','2026-04-25T09:00:00Z','2026-04-25T09:30:00Z');

-- SECTION 13b: QUOTE LINE ITEMS
-- One line per package leg supplier actually selected in SECTION 11b
-- (the two Ulysses transfer legs are combined into a single return-transfers line).
insert into public.quote_line_items (id,quote_id,description,qty,unit_price,total,sort_order,created_at) values
-- James & Linda Mitchell — LTT-2025-0003-Q1 (2 adults, VIP)
('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000d003','Luxury Suite (2 pax) — Blue Train Cape Town Explorer',1,144000.00,144000.00,1,'2025-08-28T09:05:00Z'),
('00000000-0000-0000-0000-00000000e005','00000000-0000-0000-0000-00000000d003','The President Hotel — 2 nights (2 pax)',1,19000.00,19000.00,2,'2025-08-28T09:05:00Z'),
-- Chloe & Louis Beaumont — LTT-2025-0009-Q1 (2 adults)
('00000000-0000-0000-0000-00000000e011','00000000-0000-0000-0000-00000000d009','Deluxe Suite (2 pax) — Blue Train Cape Town Explorer',1,97000.00,97000.00,1,'2025-12-05T09:05:00Z'),
-- Sarah Van Der Berg (repeat booking) — LTT-2026-0015-Q1 (2 adults)
('00000000-0000-0000-0000-00000000e017','00000000-0000-0000-0000-00000000d014','Deluxe Suite (2 pax) — Blue Train Cape Town Explorer',1,97000.00,97000.00,1,'2026-01-30T09:05:00Z'),
-- Priya Naidoo — LTT-2026-0025-Q1 (2 adults)
('00000000-0000-0000-0000-00000000e027','00000000-0000-0000-0000-00000000d023','Luxury Suite (2 pax) — Blue Train Cape Town Explorer',1,110400.00,110400.00,1,'2026-04-01T09:05:00Z'),
-- Sarah Van Der Berg — LTT-2026-0030-Q1 (2 adults)
('00000000-0000-0000-0000-00000000e032','00000000-0000-0000-0000-00000000d028','The Blue Train — Deluxe Suite (2 adults), Pretoria ↔ Cape Town',1,82000.00,82000.00,1,'2026-04-25T09:05:00Z'),
('00000000-0000-0000-0000-00000000e033','00000000-0000-0000-0000-00000000d028','Ulysses Tours & Transfers — return station/airport transfers (2 adults)',1,3200.00,3200.00,2,'2026-04-25T09:05:00Z'),
('00000000-0000-0000-0000-00000000e034','00000000-0000-0000-0000-00000000d028','The President Hotel — 2 nights, Classic Ocean Room (2 adults)',1,9800.00,9800.00,3,'2026-04-25T09:05:00Z'),
('00000000-0000-0000-0000-00000000e035','00000000-0000-0000-0000-00000000d028','City Sightseeing Bus Tours — Cape Town day pass (2 adults)',1,1200.00,1200.00,4,'2026-04-25T09:05:00Z'),
('00000000-0000-0000-0000-00000000e036','00000000-0000-0000-0000-00000000d028','FlySafair — Cape Town to Johannesburg flight (2 adults)',1,800.00,800.00,5,'2026-04-25T09:05:00Z'),
-- Elizabeth Taylor family — LTT-2026-0021-Q1 (2 adults, 2 children)
('00000000-0000-0000-0000-00000000e022','00000000-0000-0000-0000-00000000d019','The Blue Train — Luxury Suite (2 adults, 2 children), Pretoria ↔ Cape Town',1,128000.00,128000.00,1,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e023','00000000-0000-0000-0000-00000000d019','Ulysses Tours & Transfers — return station/airport transfers (family of 4)',1,4800.00,4800.00,2,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e024','00000000-0000-0000-0000-00000000d019','The President Hotel — 2 nights, Classic Apartment (2 adults, 2 children)',1,14200.00,14200.00,3,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e025','00000000-0000-0000-0000-00000000d019','City Sightseeing Bus Tours — Cape Town day pass (family of 4)',1,2400.00,2400.00,4,'2026-03-12T09:05:00Z'),
('00000000-0000-0000-0000-00000000e026','00000000-0000-0000-0000-00000000d019','FlySafair — Cape Town to Johannesburg flight (family of 4)',1,3000.00,3000.00,5,'2026-03-12T09:05:00Z'),
-- Henrik & Astrid Johansson — LTT-2025-0007-Q1 (2 adults)
('00000000-0000-0000-0000-00000000e009','00000000-0000-0000-0000-00000000d007','The Blue Train — Deluxe Suite (2 adults), Pretoria ↔ Cape Town',1,82000.00,82000.00,1,'2025-11-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e010','00000000-0000-0000-0000-00000000d007','Ulysses Tours & Transfers — return station/airport transfers (2 adults)',1,3200.00,3200.00,2,'2025-11-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e014','00000000-0000-0000-0000-00000000d007','The President Hotel — 2 nights, Classic Room (2 adults)',1,9800.00,9800.00,3,'2025-11-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e012','00000000-0000-0000-0000-00000000d007','City Sightseeing Bus Tours — Cape Town day pass (2 adults)',1,1200.00,1200.00,4,'2025-11-10T09:05:00Z'),
('00000000-0000-0000-0000-00000000e013','00000000-0000-0000-0000-00000000d007','FlySafair — Cape Town to Johannesburg flight (2 adults)',1,800.00,800.00,5,'2025-11-10T09:05:00Z');

commit;


begin;

-- SECTION 14: INVOICES
-- deposit amount = 25% of quote total (default deposit rate).
insert into public.invoices (id,booking_id,quote_id,kind,status,invoice_number,deposit_percentage,amount,currency,due_date,sent_at,created_at,updated_at) values
('00000000-0000-0000-0000-0000000e0005','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000d003','deposit','paid','DEP-2025-000003',25,41250.00,'ZAR','2025-09-19','2025-09-12T09:30:00Z','2025-09-12T09:00:00Z','2025-09-20T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0006','00000000-0000-0000-0000-000000009033','00000000-0000-0000-0000-00000000d003','final','paid','FIN-2025-000003',null,123750.00,'ZAR','2025-10-02','2025-09-22T09:30:00Z','2025-09-22T09:00:00Z','2025-10-05T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0013','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000d007','deposit','paid','DEP-2025-000007',25,24250.00,'ZAR','2025-12-02','2025-11-25T09:30:00Z','2025-11-25T09:00:00Z','2025-12-05T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0014','00000000-0000-0000-0000-000000009029','00000000-0000-0000-0000-00000000d007','final','paid','FIN-2025-000007',null,72750.00,'ZAR','2026-03-21','2026-03-05T09:30:00Z','2026-03-05T09:00:00Z','2026-03-28T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0017','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000d009','deposit','paid','DEP-2025-000009',25,27887.50,'ZAR','2026-01-04','2025-12-20T09:30:00Z','2025-12-20T09:00:00Z','2025-12-28T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0018','00000000-0000-0000-0000-000000009024','00000000-0000-0000-0000-00000000d009','final','paid','FIN-2025-000009',null,83662.50,'ZAR','2026-04-03','2026-03-20T09:30:00Z','2026-03-20T09:00:00Z','2026-04-10T15:30:00Z'),
('00000000-0000-0000-0000-0000000e0027','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000d014','deposit','paid','DEP-2026-000015',25,27887.50,'ZAR','2026-02-15','2026-02-12T09:30:00Z','2026-02-12T09:00:00Z','2026-02-18T11:30:00Z'),
('00000000-0000-0000-0000-0000000e0028','00000000-0000-0000-0000-000000009021','00000000-0000-0000-0000-00000000d014','final','sent','FIN-2026-000015',null,83662.50,'ZAR','2026-05-28','2026-05-05T09:30:00Z','2026-05-05T09:00:00Z','2026-05-05T09:30:00Z'),
('00000000-0000-0000-0000-0000000e0035','00000000-0000-0000-0000-000000009018','00000000-0000-0000-0000-00000000d019','deposit','sent','DEP-2026-000021',25,38100.00,'ZAR','2026-04-01','2026-03-25T09:30:00Z','2026-03-25T09:00:00Z','2026-03-25T09:30:00Z');

commit;


begin;

-- SECTION 15: PAYMENTS
insert into public.payments (id,booking_id,amount,method,reference,notes,received_at,created_at) values
('00000000-0000-0000-0000-00000000f005','00000000-0000-0000-0000-000000009033',41250.00,'Bank Transfer','BT-MIT-DEP-001','Deposit — Blue Train Cape Town Explorer VIP','2025-09-20T11:00:00Z','2025-09-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000f006','00000000-0000-0000-0000-000000009033',123750.00,'Credit Card','CC-MIT-FIN-001','Final payment — Blue Train Cape Town Explorer','2025-10-05T15:00:00Z','2025-10-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000f013','00000000-0000-0000-0000-000000009029',24250.00,'Credit Card','CC-JOH-DEP-001','Deposit — Blue Train Cape Town Explorer','2025-12-05T11:00:00Z','2025-12-05T11:00:00Z'),
('00000000-0000-0000-0000-00000000f014','00000000-0000-0000-0000-000000009029',72750.00,'EFT','EFT-JOH-FIN-001','Final balance — Blue Train Cape Town Explorer','2026-03-28T15:00:00Z','2026-03-28T15:00:00Z'),
('00000000-0000-0000-0000-00000000f017','00000000-0000-0000-0000-000000009024',27887.50,'EFT','EFT-BEA-DEP-001','Deposit — Blue Train Cape Town Explorer','2025-12-28T11:00:00Z','2025-12-28T11:00:00Z'),
('00000000-0000-0000-0000-00000000f018','00000000-0000-0000-0000-000000009024',83662.50,'Bank Transfer','BT-BEA-FIN-001','Final balance — Blue Train Cape Town Explorer','2026-04-10T15:00:00Z','2026-04-10T15:00:00Z'),
('00000000-0000-0000-0000-00000000f026','00000000-0000-0000-0000-000000009021',27887.50,'Bank Transfer','BT-VDB-DEP-001','Deposit 25% — Blue Train Cape Town Explorer','2026-02-18T11:00:00Z','2026-02-18T11:00:00Z');

-- SECTION 16: DOCUMENTS
insert into public.documents (id,booking_id,kind,status,storage_path,created_at) values
('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-000000009033','quote_pdf','generated','documents/quotes/LTT-2025-0003.pdf','2025-08-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-000000009033','invoice_pdf','generated','documents/invoices/DEP-2025-000003.pdf','2025-09-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa06','00000000-0000-0000-0000-000000009033','voucher_pdf','generated','documents/vouchers/LTT-2025-0003.pdf','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa10','00000000-0000-0000-0000-000000009029','quote_pdf','generated','documents/quotes/LTT-2025-0007.pdf','2025-11-10T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa12','00000000-0000-0000-0000-000000009029','invoice_pdf','generated','documents/invoices/DEP-2025-000007.pdf','2025-11-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa11','00000000-0000-0000-0000-000000009029','voucher_pdf','generated','documents/vouchers/LTT-2025-0007.pdf','2026-05-01T09:00:00Z'),
('00000000-0000-0000-0000-00000000aa13','00000000-0000-0000-0000-000000009018','quote_pdf','generated','documents/quotes/LTT-2026-0021.pdf','2026-03-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa14','00000000-0000-0000-0000-000000009018','invoice_pdf','generated','documents/invoices/DEP-2026-000021.pdf','2026-03-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000aa15','00000000-0000-0000-0000-000000009008','quote_pdf','generated','documents/quotes/LTT-2026-0030.pdf','2026-04-25T09:30:00Z');

-- SECTION 17: CORRESPONDENCES
insert into public.correspondences (id,booking_id,channel,kind,subject,body_html,status,sent_at,scheduled_at,created_at) values
('00000000-0000-0000-0000-00000000bb02','00000000-0000-0000-0000-000000009033','email','quote_email','Your Blue Train Quote — LTT-2025-0003','<p>Dear James, please find your quotation attached.</p>','sent','2025-08-28T09:30:00Z',null,'2025-08-28T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb07','00000000-0000-0000-0000-000000009033','email','deposit_request','Deposit Invoice — LTT-2025-0003','<p>Dear James, your deposit invoice is attached.</p>','sent','2025-09-12T09:30:00Z',null,'2025-09-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb20','00000000-0000-0000-0000-000000009008','email','quote_email','Your Blue Train Quote — LTT-2026-0030','<p>Dear Sarah, please find your quotation attached.</p>','sent','2026-04-25T09:30:00Z',null,'2026-04-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb21','00000000-0000-0000-0000-000000009008','email','follow_up','Following up on your Blue Train quote — LTT-2026-0030','<p>Dear Sarah, we are following up on your Blue Train Cape Town Explorer quotation.</p>','scheduled',null,'2026-05-24T09:00:00Z','2026-05-14T09:00:00Z'),
('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-000000009018','email','quote_email','Your Blue Train Quote — LTT-2026-0021','<p>Dear Elizabeth, please find your quotation attached.</p>','sent','2026-03-12T09:30:00Z',null,'2026-03-12T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb10','00000000-0000-0000-0000-000000009018','email','deposit_request','Deposit Invoice — LTT-2026-0021','<p>Dear Elizabeth, your deposit invoice is attached.</p>','sent','2026-03-25T09:30:00Z',null,'2026-03-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb24','00000000-0000-0000-0000-000000009029','email','quote_email','Your Blue Train Quote — LTT-2025-0007','<p>Dear Henrik, please find your quotation attached.</p>','sent','2025-11-10T09:30:00Z',null,'2025-11-10T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb25','00000000-0000-0000-0000-000000009029','email','deposit_request','Deposit Invoice — LTT-2025-0007','<p>Dear Henrik, your deposit invoice is attached.</p>','sent','2025-11-25T09:30:00Z',null,'2025-11-25T09:30:00Z'),
('00000000-0000-0000-0000-00000000bb13','00000000-0000-0000-0000-000000009029','email','voucher_email','Your Travel Voucher — LTT-2025-0007','<p>Dear Henrik, your travel voucher is attached.</p>','sent','2026-05-01T09:30:00Z',null,'2026-05-01T09:30:00Z');

-- SECTION 18: PIPELINE HISTORY
insert into public.pipeline_history (id,booking_id,from_stage,to_stage,moved_by,moved_by_user_id,moved_at) values
('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-000000009008','enquiry','quote_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-04-25T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc10','00000000-0000-0000-0000-000000009018','enquiry','quote_sent','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-03-12T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc11','00000000-0000-0000-0000-000000009018','quote_sent','accepted','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-03-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc12','00000000-0000-0000-0000-000000009018','accepted','deposit_requested','Carmen de Jager','00000000-0000-0000-0000-0000000000a1','2026-03-25T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc40','00000000-0000-0000-0000-000000009029','enquiry','quote_sent','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','2025-11-10T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc41','00000000-0000-0000-0000-000000009029','quote_sent','accepted','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','2025-11-20T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc42','00000000-0000-0000-0000-000000009029','accepted','deposit_requested','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','2025-11-25T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc43','00000000-0000-0000-0000-000000009029','deposit_requested','deposit_paid','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','2025-12-05T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc44','00000000-0000-0000-0000-000000009029','deposit_paid','final_paid','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','2026-03-28T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc45','00000000-0000-0000-0000-000000009029','final_paid','voucher_sent','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','2026-05-01T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc15','00000000-0000-0000-0000-000000009033','enquiry','quote_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-08-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc16','00000000-0000-0000-0000-000000009033','quote_sent','accepted','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-08T14:00:00Z'),
('00000000-0000-0000-0000-00000000cc17','00000000-0000-0000-0000-000000009033','accepted','deposit_requested','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-12T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc18','00000000-0000-0000-0000-000000009033','deposit_requested','deposit_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-09-20T11:00:00Z'),
('00000000-0000-0000-0000-00000000cc19','00000000-0000-0000-0000-000000009033','deposit_paid','final_paid','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-10-05T15:00:00Z'),
('00000000-0000-0000-0000-00000000cc20','00000000-0000-0000-0000-000000009033','final_paid','voucher_sent','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000cc21','00000000-0000-0000-0000-000000009033','voucher_sent','closed','Leonie Botha','00000000-0000-0000-0000-0000000000a2','2025-12-01T10:00:00Z');

-- SECTION 19: AUDIT LOGS
insert into public.audit_logs (id,actor,actor_user_id,entity_type,entity_id,action,before_json,after_json,meta_json,created_at) values
('00000000-0000-0000-0000-00000000dd04','Leonie Botha','00000000-0000-0000-0000-0000000000a2','Booking','00000000-0000-0000-0000-000000009033','stage_change','{"stage":"final_paid"}'::jsonb,'{"stage":"voucher_sent"}'::jsonb,null,'2025-10-28T09:00:00Z'),
('00000000-0000-0000-0000-00000000dd05','Douwlien Louw','00000000-0000-0000-0000-0000000000a5','Booking','00000000-0000-0000-0000-000000009029','stage_change','{"stage":"final_paid"}'::jsonb,'{"stage":"voucher_sent"}'::jsonb,null,'2026-05-01T09:00:00Z');

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
  where booking_number ~ '^LTT-[0-9]{4}-[0-9]{4}$'
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

