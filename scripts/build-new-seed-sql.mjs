import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const seedPath = path.join(repoRoot, "supabase", "seed.sql")
const catalogPath = path.join(repoRoot, "tmp-db-sync", "prod-config-sql", "catalog.sql")

const seedLines = readFileSync(seedPath, "utf8").split("\n")
const catalogLines = readFileSync(catalogPath, "utf8").split("\n")

// 1-indexed line helper: slice [startLine, endLineExclusive)
function seedSlice(startLine, endLineExclusive) {
  return seedLines.slice(startLine - 1, endLineExclusive - 1).join("\n")
}
function catalogSlice(startLine, endLineExclusive) {
  return catalogLines.slice(startLine - 1, endLineExclusive - 1).join("\n")
}

const preambleAndAuth = seedSlice(1, 58) // through end of section 1, before "-- SECTION 2" header
const customersSection = seedSlice(90, 179) // section 3 header through blank line before "-- SECTION 4"

const locationsAndCountries = catalogSlice(1, 163) // LOCATIONS + COUNTRIES & ALIASES
const supplierThroughPackages = catalogSlice(163, 1353) // SUPPLIERS ... PACKAGES/LEGS/LEG_ROUTES
const appSettingsBlock = catalogSlice(1367, catalogLines.length + 1)

const templatesSection = `-- ============================================================
-- SECTION 7: EMAIL TEMPLATES (from production)
-- ============================================================

insert into public.templates (id,key,subject,body_html,version,active,is_system,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000007001','quote_email','{{supplierName}} | {{clientSurname}} - {{direction}} - {{departureDateShort}}','<p>Dear {{customerName}}</p><p>Thank you for your valued {{supplierName}} enquiry.</p><p><strong>AVAILABILITY</strong><br>On the <strong>{{direction}}</strong> departure, <strong>{{departureDate}}</strong>, we can still assist you with <strong>{{suiteDescription}}</strong>.</p><p><strong>QUOTATION</strong> <em>(This quotation is exclusive to SA Rail – a division of Luxus Travel &amp; Tours)</em></p>{{quoteSummaryTable}}<p><br><strong>RESERVATION PROCEDURE</strong><br>Should you wish to proceed with a:</p><p><strong>Waitlist</strong> – kindly provide me with the first names, surnames &amp; dates of birth of all the guests travelling.</p><p><strong>Provisional Reservation</strong> – kindly provide me with the first names, surnames &amp; ID/Passport numbers of all the guests travelling. A provisional reservation can only be held for 72 hours.</p><p><strong>Definite Reservation</strong> – please complete and return the attached reservation form by email together with ID copies of all passengers travelling.</p><p><strong>BOOKING STATUS</strong><br>The booking status will only change to confirmed once your deposit has been received. The reservation will only be guaranteed once full payment has been received.</p><p><strong>PAYMENT TERMS</strong><br>A 25% non-refundable deposit is required within 72 hours of receiving your confirmation invoice to secure your reservation. The final payment is due 60 days before your departure. Should the reservation be made within 60 days before the departure period, the full amount will be due 48 hours after invoicing.</p><p>**Kindly ensure that payments are received on due dates to avoid cancellation.</p><p><strong>PAYMENT METHOD</strong><br>Payment can either be made by Electronic transfer (EFT) or Credit Card. We accept Mastercard and Visa card payments via PayGate, a secure online site. There is a 2.6% surcharge to partially cover the high credit card fees. Kindly request the payment link from your reservation consultant to use this facility.</p><p><strong>TICKETS &amp; VOUCHERS</strong><br>Once full payment is received, all your travel documents will be issued, and your vouchers will be sent to you electronically. Your actual train tickets will be provided at the station on the day of departure.</p><p><strong>CHANGES / CANCELLATION</strong><br>Our standard travel terms &amp; conditions apply to all reservations.</p><p><strong>INSURANCE</strong><br>It is highly recommended that clients obtain comprehensive travel insurance coverage that includes protection against trip cancellation penalties.</p><p><strong>CLIENT PROTECTION</strong><br>We are proud members of SATSA (membership number 2485) and insured through SATIB. As part of the Southern Africa Tourism Services Association, we are dedicated to raising tourism standards in South Africa.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong><br>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me. I am here to ensure that your travel experience is seamless and enjoyable.</p><p><strong>PLEASE FIND ATTACHED TO THIS EMAIL:</strong><br>1. Quotation in PDF <br>2. Reservation form with terms and conditions<br>3. Detailed train itinerary</p><p>Thank you for your enquiry. If you need any additional information or assistance, please don''t hesitate to reach out. I look forward to your response.</p>',11,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-22T09:46:06.250494+00:00'),
  ('00000000-0000-0000-0000-000000007002','follow_up','Following up on your enquiry — {{jobNumber}}','<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007003','deposit_request','{{supplierName}} | {{clientSurname}} - {{direction}} - {{departureDateShort}}','<p>Dear {{customerName}}</p><p>Thank you for your {{supplierName}} reservation request.</p><p><strong>GUEST DETAILS</strong></p><p>Please ensure that all details match those on the ID or passport.</p><p><strong>RESERVATION/ITINERARY DETAILS</strong></p><p>Provisional reservations are secured for the travel services listed on your confirmation invoice. Please ensure all details are correct, as travel arrangements will be issued accordingly and change fees may apply.</p><p><strong>PLEASE FIND ATTACHED</strong></p><p>Your confirmation invoice with bank details.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Deposit due Now: <strong>{{depositAmount}}</strong></p><p>Final amount due {{finalDueDate}}: <strong>{{finalAmount}}</strong></p><p><strong>PAYMENT TERMS</strong></p><p>A non-refundable deposit of {{depositPercentage}}% is required within 72 hours of receiving your confirmation invoice to secure your reservation. The final payment must be made 60 days prior to departure. If the reservation is made within 60 days of the departure date, the full amount will be due 48 hours after invoicing.</p><p>**Kindly ensure that payments are received on due dates to avoid automatic cancellation.</p><p><strong>BANK DETAILS FOR ELECTRONIC PAYMENTS</strong></p>{{bankingDetails}}<p><strong>REF NO: {{invoiceNumber}}</strong></p><p>Please note: the amounts transferred should be exclusive of all bank charges.</p><p><strong>CREDIT CARD PAYMENTS</strong></p><p>We accept MasterCard and Visa payments via PayGate, a secure online platform. Please request the payment link from your reservation consultant to use this service. Note: there will be a 2.6% surcharge on Credit Card payments.</p><p><strong>BOOKING STATUS</strong></p><p>Your booking status will be confirmed only after we receive your deposit. The reservation will be secured once full payment is made.</p><p><strong>TICKETS &amp; VOUCHERS</strong></p><p>After full payment is received, all travel documents will be issued, and vouchers will be sent to you electronically. Your train tickets will be provided during check-in.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong></p><p>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me.</p><p>I thank you for your most valued reservation. Please do not hesitate to contact me should you require further information.</p>',3,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-22T10:37:32.602372+00:00'),
  ('00000000-0000-0000-0000-000000007004','voucher_email','Your Travel Voucher — {{jobNumber}}','<p>Dear {{customerName}}</p><p>Thank you for your most valued reservation.</p><p>Attached, you will find the following documents:</p><ul><li>Your confirmation invoice</li><li>Your travel vouchers with contact details - <em>South Africa is voucherless. The reference found on your itinerary is all you need to confirm payment for the services booked for you. Each relevant reference number needs to be given to each service provider when using their respective service. All passengers will be required to provide identification (ID or passport) when checking in to any accommodation establishment.</em></li><li>Train Itinerary &amp; Fact Sheet</li></ul><p>Please keep a copy of the travel vouchers with you for reference purposes together with your South African IDs or Passports.</p><p>Your train tickets will be given to you at the lounge when checking in for your departure.</p><p>Please read through all the documents to see if everything is correct and advise if any changes must be made.</p><p><strong>IMPORTANT INFORMATION BEFORE YOU TRAVEL</strong><br>We recommend that you do not make use of Uber services at either departure or arrival stations. Rather make use of a private transfer or the Gautrain.</p><p>As the train runs on a shared railway line, there may be occasions when it stops for a period of time. If there are any significant delays, your train manager will inform you and the necessary arrangements will be made. The train and Luxus Travel &amp; Tours cannot be held responsible or liable for any delays or changes in tour arrangements that may be caused by natural or other factors beyond our control. We strongly advise against same-day air travel on departure or arrival days due to possible train delays.</p><p><strong>We urge all our clients to take out adequate travel insurance.</strong></p><p>I wish you a safe and pleasant journey on the ***  and please do not hesitate to contact me if you require any further assistance.</p>',3,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-22T11:09:20.065545+00:00'),
  ('00000000-0000-0000-0000-000000007005','final_invoice','Final Invoice — {{jobNumber}}','<p>Dear {{customerName}},</p><p>Please find attached your final invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong>, due by <strong>{{dueDate}}</strong>.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007006','payment_reminder','Payment Reminder — Invoice {{invoiceNumber}}','<p>Dear {{customerName}},</p><p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong> is due by <strong>{{dueDate}}</strong>. Please find the invoice attached.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007008','thank_you','Thank you for travelling with us — {{jobNumber}}','<p>Dear {{customerName}},</p><p>We hope you had a wonderful journey on <strong>{{routeName}}</strong>. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you aboard again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',1,true,true,'2026-07-13T20:23:38.992853+00:00','2026-07-13T20:23:38.992853+00:00'),
  ('00000000-0000-0000-0000-000000007009','reservation_received','{{supplierName}} | {{clientSurname}} - {{direction}} - {{departureDateShort}}','<p>Dear {{customerName}}</p><p>Thank you for your reservation form well received.</p><p>The confirmation invoice with payment instructions will follow shortly.</p><p>In the meantime, I have secured your suite for you.</p>',3,true,true,'2026-07-21T11:11:33.288351+00:00','2026-07-22T10:31:31.037437+00:00'),
  ('00000000-0000-0000-0000-000000007010','payment_received','Payment received — {{jobNumber}}','<p>Dear {{customerName}}</p><p>Thank you very much for your payment well received.</p><p>Please find attached your amended confirmation invoice.</p><p><strong>PAYMENT SCHEDULE</strong><br>Amount received: <strong>{{receivedAmount}}</strong> – Received, thank you.</p><p>Final amount due {{finalDueDate}}: <strong>{{outstandingAmount}}</strong></p><p>Hope you have a wonderful day.</p>',4,true,true,'2026-07-21T11:11:33.288351+00:00','2026-07-22T11:01:02.581431+00:00')
-- Conflict target is \`key\` (unique index): the unify-email-templates migration
-- pre-inserts the newer system keys with generated ids on a fresh reset. The
-- 'full_payment_request' key is seeded separately by migration
-- 20260723120000_full_payment_invoice.sql and intentionally left untouched here.
on conflict (key) do update set subject=excluded.subject,
  body_html=excluded.body_html,version=excluded.version,active=excluded.active,is_system=excluded.is_system,updated_at=excluded.updated_at;

`

const appSettingsSection = `-- ============================================================
-- SECTION 8: APP SETTINGS (from production) & VOUCHER TEMPLATE
-- ============================================================

${appSettingsBlock.trim()}

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

`

// ---- Rebuilt small dummy transactional layer, re-pointed at real
// prod-sourced catalog rows (Blue Train / Pretoria <-> Cape Town / The
// Commodore Hotel) instead of the old fictional Rovos Rail / Victoria Falls
// dummy IDs which no longer exist after the full-replace above.
let transactional = seedSlice(952, 1136) // "begin;" through end of SECTION 21 (booking_number_sequences)

const idSwaps = [
  ["00000000-0000-0000-0000-000000003002", "7af631c8-99ff-4eff-8964-96971736278f"], // package_id -> Blue Train Five Night Package
  ["00000000-0000-0000-0000-000000004005", "a409fa56-f2d0-4981-a211-798ab54f1fa6"], // route_id -> Blue Train Pretoria<->Cape Town
  ["00000000-0000-0000-0000-000000002003", "4ec1e87e-a7f5-401a-9b04-0807b1f34f9c"], // hotel_supplier_id -> The Commodore Hotel
  ["00000000-0000-0000-0000-000000005003", "66958bfc-888f-44db-9279-e2babc8b5e7c"], // suite_type_id (Royal) -> Blue Train Luxury
  ["00000000-0000-0000-0000-000000005002", "642e34ee-9a7b-4532-bb20-12a61c2f6e85"], // suite_type_id (Deluxe) -> Blue Train Deluxe
]
for (const [oldId, newId] of idSwaps) {
  transactional = transactional.split(oldId).join(newId)
}

const textSwaps = [
  ["Victoria Falls Explorer", "Blue Train Cape Town Explorer"],
  ["Pretoria to Victoria Falls", "Pretoria to Cape Town"],
  ["post-stay at Victoria Falls Hotel", "post-stay at The Commodore Hotel"],
  ["Post-stay Victoria Falls Hotel", "Post-stay at The Commodore Hotel"],
  ["Post-stay and sunset cruise", "Post-stay and Winelands day tour"],
  ["Royal Double Suite", "Luxury Suite"],
  ["Royal Twin Suite", "Luxury Suite"],
  ["Deluxe Double Suite", "Deluxe Suite"],
  ["Deluxe Twin Suite", "Deluxe Suite"],
  ["Your Rovos Rail Quote", "Your Blue Train Quote"],
  ["Airport transfer VFA + sunset cruise (family)", "Winelands day tour (family)"],
  ["Airport transfer from VFA and sunset cruise", "Cape Winelands day tour"],
]
for (const [oldText, newText] of textSwaps) {
  transactional = transactional.split(oldText).join(newText)
}

const finalContent = [
  preambleAndAuth,
  "-- ============================================================",
  "-- SECTION 2: LOCATIONS, COUNTRIES & ALIASES (from production)",
  "-- ============================================================",
  "",
  locationsAndCountries.trim(),
  "",
  customersSection,
  "-- ============================================================",
  "-- SECTIONS 4-6: SUPPLIERS, RATE CARDS, PACKAGES (from production, full replace)",
  "-- ============================================================",
  "",
  supplierThroughPackages.trim(),
  "",
  "commit;",
  "",
  "begin;",
  "",
  templatesSection.trim(),
  "",
  appSettingsSection.trim(),
  "",
  transactional,
  "",
  seedSlice(1136, seedLines.length + 1),
].join("\n")

writeFileSync(seedPath, finalContent)
console.log(`Wrote new supabase/seed.sql (${finalContent.length} bytes)`)
