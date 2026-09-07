# QA Plan — Primary Product, Full-Load End-to-End on Production (4 runs) — 2026-09-07

**Standalone deliverable.** This plan is independent of the build that must ship before it can run
— see `docs/plans/2026-09-07-cruise-kind-and-per-kind-templates-build-plan.md` for that work. Hand
this file to a QA agent only after that build is merged to `dev`, deployed to production, and its
migrations pushed to the production database. Do not start this plan and the build in the same
session/branch at the same time — the QA runs must exercise what is actually live.

## Context

Three prior QA runs (2026-09-04 → 09-07, reports `qa/reports/system-qa/2026-09-04-P1/P2/P3-*.md`)
drove the `feat(primary-product)` generalisation end to end **locally**: The Blue Train, Rovos
Rail, and a tour operator as primary products. They found ~40 defects, roughly half already fixed
in the branch's working tree at plan time.

This run is different in three ways the user asked for explicitly:

1. **On the live production site** (`tools.luxustravel.co.za`), not local — with test data, which
   is fine to create and leave there.
2. **A hotel as the main product** (Kruger Shalati) — never yet driven as a primary product in any
   prior run.
3. **A cruise as the main product** — requires the `cruise_line` supplier kind and its own template
   wording, both delivered by the paired build plan.

## Non-negotiables on production

1. **Email test mode must stay ON.** Read Settings → confirm `email_test_mode_enabled` is on and
   record the test recipient (`lib/email/test-mode.ts` — enforced inside `sendEmail`, the single
   choke point every send passes through). **Never change it.** If found OFF: **stop, send
   nothing, report immediately** — do not turn it on yourself, do not proceed.
2. **QA only. No code fixes, no commits, no PR, no `APP_VERSION` bump.** Findings only.
3. **No writes to the production database outside the app's own UI and API.** No `db:reset` (local
   only), no SQL `UPDATE`/`DELETE`, no service-role writes. Evidence comes from the UI, API
   response bodies, and read-only `SELECT`s if a prod connection string is supplied.
4. **Every record created must be identifiable as test data.** Customer surnames carry the suffix
   `QA0907`; supplier records created in-run are named so a human can spot them. Log every id
   created — booking, customer, supplier, invoice, payment — in a table at the end of each report,
   so the user can clean up.
5. Live crons act on these bookings — the follow-up worker, pipeline auto-close, email sync all run
   in production. Expect follow-up emails on quotes left sitting; they will be redirected by test
   mode. Note anything a cron does to a QA booking rather than treating it as a defect.
6. Every `forceAdvanceStage` is at minimum a Sev-2 finding, logged with its reason.
7. A failure at check N does not abort N+1. Capture, continue, report.
8. PASS needs evidence — screenshot path, HTTP status, JSON field. "Looks correct" is not evidence.
9. Severity: Sev-1 blocks a flow · Sev-2 wrong data/money/document, or a gate that does not hold ·
   Sev-3 UX/confusion · Sev-4 cosmetic.

## The lens — sit in the consultant's chair

The part a developer-eye pass always misses, and the part the user cares about most:

- **Wrong vocabulary for the product.** A voyage asked for a "Departure Date", a stay given a
  "Route / Direction", a cruise described as a "Tour", a voucher printing a meal plan as a journey.
- **Wrong money anywhere in the chain.** Quote total ≠ invoice total ≠ deposit + final ≠ voucher.
  Single supplement, child rates, per-person vs per-room vs per-cabin bases.
- **Dates that drift.** Primary-leg anchor vs hotel check-in vs transfer vs flight; off-by-one
  nights; a date that changes after a reload.
- **Things that look done but did not save.** Reload after every save and re-read the value.
- **Gates that let you past without the precondition** (voucher before balance 0, paid-in-full
  self-certified, confirm without deposit).
- **Wording a client would see.** Greeting, subject, itinerary lines, supplier name, signature.
  A misnamed supplier in a client email is Sev-2, not cosmetic.
- Narrow-viewport layout (390 px) and keyboard reachability on each screen touched.

## Driving

Throwaway Node scripts in the scratchpad using the repo's installed `@playwright/test`
(`createRequire` pointed at the repo `package.json`), **headed** so the run can be watched.
Reuse `qa/lib/*` — `labeledInput`, `fillBuffered`, `saveAndWaitFor`, `attachBrowserDiagnostics`,
`send-flows.ts`. Real login form against production. **Do not write driver scripts into the repo.**
Screenshots to `qa/screenshots/system-qa/{P4|P5|P6|P7}/{step}-{state}.png` (gitignored).

**Required input, not yet supplied: production login credentials.** The
`…@luxustravel.co.za` / `password123` seed accounts are local fixtures and must not be assumed to
exist on prod. The QA agent stops at the login screen without them.

## Pre-flight (once, before P4)

1. `tools.luxustravel.co.za` loads; footer shows the version the build plan produced.
2. Add Supplier offers **Cruises** — proof the build actually shipped, not just merged.
3. Settings → Templates: a `quote_email`, `voucher_email` and `thank_you` variant exist tagged
   `hotel_property`, `tour_operator` and `cruise_line` (the seeded rows from the build's
   `20260907110000_template_supplier_kind.sql`).
4. Settings → email test mode ON, recipient recorded. Screenshot it. Change nothing.
5. Record the production supplier inventory: which of Blue Train, Rovos Rail, Kruger Shalati,
   Ulysses, FlySafair, a Cape Town hotel actually exist, and which carry `sells_standalone`.
   The four runs below assume they do; if one is missing, note it and adapt rather than stopping.
6. Note the current job-number counter, so the numbers these runs consume are on record.

## Run P4 — The Blue Train as main product

The control. Anything broken here is broken for the product Luxus sells most.

| | |
|---|---|
| Primary | The Blue Train (`train_operator`) |
| Journey | Pretoria → Cape Town, departing ~2026-11-12 |
| Pax | 2 adults + 1 child (child rate + pax-sum split in play) |
| Add-ons | Cape Town hotel 2 nights post-arrival · Ulysses transfers ×2 · FlySafair CPT→JNB · a day tour |
| Customer | created in-run |

**Walk** (the same 14 steps every run follows):

1. New customer — required fields, duplicate handling, save round-trip.
2. New enquiry picking the primary product. Read the intake form against the kind's vocabulary.
   Confirm `primary_supplier_id` lands correctly.
3. Build Booking step 1 — add every add-on as a service.
4. Build Booking step 2 — per-service supplier admin dates (`booking_date`, `confirmation_date`,
   `payment_made_date`, `paid_with`) and the payment-method picker. Check date anchors resolve off
   the **primary product**, not off list position or today. *(P3 left these fields unexercised —
   cover them this time.)*
5. Units — assign types summing to booking pax; single-supplement behaviour on an odd count.
6. Price the quote — per-leg rates, extras, a manual line. Read every line as a client would.
7. Quote preview → send. Greeting, supplier voice, journey/stay/voyage line, itinerary order,
   attachments. → `quote_sent`.
8. Accept → `accepted` (reservation-form gate).
9. Deposit invoice at the 25% default, then override the percentage once → `deposit_requested`.
10. Record the deposit with a payment method → `deposit_paid`. Re-check step 4's admin dates survived.
11. Final invoice → send → record balance → paid in full.
12. Voucher: confirm refusal while balance > 0, then generate and send → `voucher_sent`. Read it
    as the client.
13. Close → `closed`.
14. Cross-check `/app/pipeline`, `/app/bookings`, `/app/reporting`, `/app/documents`,
    `/app/payments`, `/app/audit` — right product, dates and totals **everywhere**.

## Run P5 — Rovos Rail as main product

Same product class, different supplier, deliberately awkward inputs.

| | |
|---|---|
| Primary | Rovos Rail (`train_operator`) |
| Journey | **Cape Town → Pretoria** — the reverse direction |
| Pax | 3 adults, one travelling single (single supplement must appear and price) |
| Add-ons | Cape Town hotel 2 nights **pre**-journey · Ulysses airport→hotel and hotel→station · FlySafair JNB→CPT **before** the primary leg |
| Customer | an existing production customer, edited in-run |

Same walk, plus:
- The outbound flight sits **before** the train: the itinerary must order by date, not by the order
  services were added, and the flight must not snap to the train's date.
- Reverse direction: email, voucher, worksheet and `route_reversed` must all say Cape Town →
  Pretoria. *(F-P2-3 stored `false` here; `20260907090000_backfill_booking_route_reversed.sql`
  claims the fix — verify it.)*
- Mid-flow re-quote: after sending, change pax or a suite and re-issue. Watch versioning
  (`…-Q2`), the supersede-stale-sent-quotes behaviour, and whether invoices and totals follow.
  *(Not covered by any of P1–P3.)*
- Two deliberate wrong turns: send the voucher early; confirm without a deposit. Record what the
  app says.

## Run P6 — Kruger Shalati as main product

**New shape.** A property heads the booking. P1–P3 covered two trains and a tour; a stay as the
primary product has never been driven end to end.

| | |
|---|---|
| Primary | Kruger Shalati — Train on the Bridge (`hotel_property`, `sells_standalone`) |
| Product | 3-night stay, ~2026-11-18 → 2026-11-21, a meal plan selected |
| Pax | 2 adults, 1 room |
| Add-ons | FlySafair JNB→Skukuza return · Ulysses transfers ×2 · a game-drive extra |
| Customer | created in-run |

Kind-specific checks:
1. **Intake** asks **Check-in Date and Check-out Date**, offers no "Route / Direction", counts
   **nights**, and says **Room Type** not Suite Type.
2. **The hotel's "route" is its meal plan** — confirm the meal plan reaches `{{mealPlan}}` and the
   documents, and that no document prints the meal plan where a journey line belongs.
3. **Stay tokens** — `{{checkInDate}}`, `{{checkOutDate}}`, `{{nights}}`, `{{propertyName}}`,
   `{{propertyAddress}}`, `{{roomDescription}}` all resolve in the quote email, and the **per-kind
   `hotel_property` template variant (built by the paired build) is the one that renders** — not
   the rail default. Confirm via the actual subject/body wording (the seeded hotel variant says
   "your stay at {{propertyName}}", not "your journey").
4. **`bookings.route_id` must stay null**, and neither the flight nor a transfer may donate its
   route to the booking. *(This is F-P3-2's shape on a stay: the invoice's "YOUR JOURNEY" block
   printed an add-on train's route. Check the invoice PDF header specifically.)*
5. **Attribution** — `/app/bookings` and `/app/documents` must file the booking under Kruger
   Shalati, not under FlySafair or Ulysses. *(F-P3-3 filed a tour booking under a hotel add-on;
   this is the same defect from the other side.)*
6. **Reporting** files the revenue under the property.
7. Anchor wording on the add-ons must not read "Pre-train / Post-train" on a stay. *(F-P2-7 /
   F-P3-10.)*

## Run P7 — A cruise line as main product

The run the paired build's `cruise_line` kind exists for. The first booking ever headed by a
`cruise_line` supplier.

| | |
|---|---|
| Primary | **New** cruise line, created in-run through Add Supplier with the main-product tick |
| Product | a multi-day voyage, ~2026-11-24 → 2026-11-29, priced per person by cabin type |
| Pax | 2 adults, 1 cabin — plus a single supplement configured on the supplier |
| Add-ons | Cape Town hotel 2 nights pre-sailing · Ulysses transfers ×2 · FlySafair · **The Blue Train as a non-primary add-on** — a train that is not the main product is the sharpest test of the generalisation |
| Customer | created in-run |

Kind-specific checks:
1. **Supplier creation** — create the cruise line through Add Supplier with the main-product tick,
   then build its catalogue: cabin type(s), itinerary, per-person rate, single supplement. Section
   headings must speak cruise language ("Cabin Types, Itineraries and Rates"), not suites and
   routes.
   *(Watch F-P3-7: "Save & Publish" toasted success while the supplier stayed `draft`/`active=false`
   and so never appeared in New Enquiry. Reload and re-read `status` before continuing.)*
2. **Intake** asks **Sailing Date and Return Date**, offers no route field, and counts nights (a
   20→23 Nov voyage is a 3-night one — cruises are counted in nights, unlike a tour's days).
3. **Readiness** — a voyage with no itinerary chosen must still price
   (`routeRequiredForPricing: false`) and still pass build-readiness.
4. **A manual (non-email) enquiry must be able to leave the `enquiry` stage.** *(F-P3-1 was Sev-1:
   the "Resolve review" button rendered only for `source === "email"`, freezing every manual
   enquiry. The tree at build time claims a fix — this run is the proof.)*
5. **No route** — `bookings.route_id` null, and no add-on donates one. The email and voucher must
   not print "Airport ↔ …" as though it were the voyage.
6. **Documents and tokens** — worksheet, invoice, voucher and every email say **Voyage** where a
   train says Journey, **Cabin** where a train says Suite, and name the cruise line as the
   supplier the booking is for. The **`cruise_line` per-kind template variant** must be the one
   that renders — check the actual wording ("your voyage with {{supplierName}}, sailing …").
7. **The train add-on must not hijack** the primary supplier, the journey line, the email voice or
   the reporting attribution.
8. **"the The Blue Train"** — the doubled article reached the client in both P1 and P3 (F-P1-5,
   F-P3-8). This booking carries a Blue Train add-on, so it is testable here.

## Regression checks carried across all four runs

Findings from P1–P3 that were never fixed, or whose fix shipped with the paired build and is
unproven. Record PASS/FAIL for each on whichever runs can exercise it:

| Carried finding | What to watch |
|---|---|
| F-P1-8 / F-P3-6 (Sev-2) | "Paid in Full" self-certified with a balance outstanding — the tick-box moved the booking and zeroed the balance. Reproduce on P4; do **not** use it. |
| F-P1-5 / F-P3-8 (Sev-2) | "the The Blue Train" in client copy — P4 and P7. |
| F-P3-2 (Sev-2) | Invoice "YOUR JOURNEY" block printing an add-on's route — P6 and P7. |
| F-P3-3 (Sev-2) | `/app/bookings` and `/app/documents` attributing the booking to an add-on — all four. |
| F-P3-9 (Sev-2) | A leg with no date priced into the quote and printed to the client — leave one transfer's date unset on P5. |
| F-P1-4 / F-P2-4/5 / F-P3-11 | Transfer and flight anchors resolving by list position rather than off the primary product. |
| F-P3-4 / F-P3-5 (Sev-2) | The primary product's own dates surviving intake; the 00:00-pickup UTC day-shift between voucher and worksheet. |
| F-P2-3 | `bookings.route_reversed` on a reverse-direction enquiry — P5. |
| F-P3-7 (Sev-2) | "Save & Publish" reporting success on a still-draft supplier — P7 (and P6, on the hotel). |
| F-P3-13 | An itinerary saved with its own UUID as its name — P7. |
| F-P3-14 / F-P3-15 | Invoice pre-conditions revealed one at a time; one guest row pre-filled for a two-adult booking. |

## Deliverables

Five documents, each written **at the end of its own run**, not batched:

| File | Content |
|---|---|
| `qa/reports/system-qa/2026-09-07-P4-blue-train-prod.md` | findings `F-P4-n` |
| `qa/reports/system-qa/2026-09-07-P5-rovos-rail-prod.md` | findings `F-P5-n` |
| `qa/reports/system-qa/2026-09-07-P6-kruger-shalati-prod.md` | findings `F-P6-n` |
| `qa/reports/system-qa/2026-09-07-P7-cruise-line-prod.md` | findings `F-P7-n` |
| `qa/reports/system-qa/2026-09-07-P-summary.md` | cross-run: systemic vs one-off, ranked Sev-1→4, regression table, recommended fix order |

Each report carries: header (environment = **production**, URL, `APP_VERSION`, roles, duration,
email-test-mode state); the summary check table; findings with repro / expected / actual / evidence
/ suspected cause; console and network errors from `attachBrowserDiagnostics`; workarounds used;
**the test-data inventory (every id created, for cleanup)**; not covered; verdict.

`qa/reports/` and `qa/screenshots/` are gitignored — output stays local unless asked otherwise.

Budget ≈ 45 min per run, sequential, P4 → P5 → P6 → P7 → summary. If a run overruns, finish its
report before starting the next: four shallow runs are worth less than three deep ones plus an
honest "not covered".

## Verification of the plan itself

The QA plan is proven by its own pre-flight: if Add Supplier does not offer **Cruises** and the
Settings → Templates page does not show hotel/tour/cruise variants, the paired build did not reach
production and the QA runs would be testing the old code — exactly the trap that made the original
combined plan for this work risky. Stop at pre-flight and report rather than run.

## Open items

1. **Production login credentials** — required before any QA run can start. Not in the repo.
2. **Read-only production DB access** — `.env.sync.local` has `SUPABASE_PROD_DB_URL` commented out.
   Without it, evidence is UI- and API-level only, which is workable but weaker than P1–P3 (those
   quoted DB rows). Worth supplying if DB-level evidence is wanted.
3. **Cleanup** — four full bookings on prod consume real job and invoice numbers and leave real
   PDFs in prod storage. The plan makes them identifiable; it does not delete them. Say if
   cleanup should be part of the QA agent's job or handled separately afterwards.
