# QA Plan — Primary Product, Full-Load End-to-End (3 runs) — 2026-09-04

Branch under test: `feat/payment-methods-and-flight-anchors` (HEAD `a91fda1` + uncommitted
working-tree changes). Environment: local only.

## Why this run exists

The `feat(primary-product)` series generalised "what is this booking for" away from
`kind === 'train_operator'` / `hotel_property`:

- `suppliers.sells_standalone` decides which suppliers may head a booking
  (`supabase/migrations/20260902090000_standalone_suppliers.sql`)
- `bookings.primary_supplier_id` records which supplier a booking is FOR
- `SUPPLIER_VOCABULARY[kind].primaryProduct` (`lib/types.ts`) drives intake labels, date
  anchors, readiness and document wording per kind
- `resolvePrimarySupplier` / `resolvePrimaryRoute` (`lib/quotes/resolve-primary-route.ts`)
  decide the journey line and the email's "whose product is this" voice
- `components/add-supplier-dialog.tsx` can now tick a new supplier as a main product

Nothing in that series has been driven end-to-end through a fully loaded booking by a human
sitting at the screen. That is this plan.

## Contract

Inherits `qa/prompts/system-qa/_preamble.md` in full. Restated because it is load-bearing:

- **QA only. No code fixes, no commits, no PR, no `APP_VERSION` bump.** Findings only.
- Local only. Never touch hosted dev or production.
- A failure at check N does not abort N+1. Capture, continue, report.
- Every `forceAdvanceStage` is at minimum a Sev-2 finding, and must be logged with its reason.
- PASS needs evidence (screenshot path, HTTP status, JSON field, SQL result). "Looks correct" is not evidence.
- Severity scale: Sev-1 blocks a flow · Sev-2 wrong data/money/document or a gate that does not hold ·
  Sev-3 UX/confusion · Sev-4 cosmetic.

### The lens — sit in the consultant's chair

This is the part that matters most to the user and the part a developer-eye pass always misses.
Report anything that a Luxus consultant would trip over, not only what throws:

- **Wrong vocabulary for the product.** A tour asked for a "Departure Date", a stay given a
  "Route / Direction", a train described as a "Stay", a voucher printing a meal plan as a journey.
- **Wrong money anywhere in the chain.** Quote total ≠ invoice total ≠ deposit + final ≠ voucher.
  Single supplement, child rates, per-person vs per-room vs per-vehicle bases, currency conversion.
- **Dates that drift.** Anchor date on the primary leg vs hotel check-in vs transfer date vs flight
  date; off-by-one nights; a date that changes after a reload.
- **Things that look done but did not save.** Reload after every save and re-read the value.
- **Buttons that are enabled when they should not be**, and gates that let you past without the
  precondition (voucher before balance 0, confirm before deposit paid).
- **Dead ends and holes:** empty states with no next action, error toasts with no explanation,
  a field you cannot fill, a step whose "back" loses data, a document with a blank section.
- **Wording a client would see.** Email greeting, subject, itinerary lines, supplier name in the
  body, signature. A misnamed supplier in a client email is Sev-2, not cosmetic.
- Narrow-viewport layout and keyboard reachability on each screen touched.

## Environment bring-up (once, before run 1)

```powershell
docker ps                 # supabase_* containers are already up as of 2026-09-04 19:00
pnpm db:reset             # DESTRUCTIVE, local only — migrations + supabase/seed.sql
pnpm run db:types         # only if migrations changed since last reset
pnpm dev                  # http://localhost:3000
git rev-parse --short HEAD; git status --short   # record both in every report header
```

`pnpm db:reset` runs **once**, before QA-P1. QA-P2 and QA-P3 run on the same database — three
bookings coexisting is itself part of the test (reporting, pipeline board, quote numbering).
Note the untracked migration `supabase/migrations/20260904120000_supersede_stale_sent_quotes.sql`:
it applies during the reset, so its behaviour is in scope for the quote-lifecycle checks.

Another session may be editing this repo (19 modified files at plan time). Re-run
`git status --short` at execution and record the tree state in each report; if files change
mid-run, say so in the report rather than re-reading around it.

Driving: Playwright MCP is disabled — throwaway Node scripts in the scratchpad, `createRequire`
pointed at the repo `package.json`, real login form (`carmen@luxustravel.co.za` / `password123`
for admin work, `dirk@luxustravel.co.za` for the manager-shaped steps). Reuse `qa/lib/*` helpers
(`labeledInput`, `fillBuffered`, `saveAndWaitFor`, `attachBrowserDiagnostics`, `send-flows.ts`).
Do not write driver scripts into the repo.

Screenshots: `qa/screenshots/system-qa/{P1|P2|P3}/{step}-{state}.png`.

---

## Run QA-P1 — The Blue Train as main product

**Shape:** the established happy path, run at full load. It is the control: anything broken here
is broken for the product Luxus sells most.

| | |
|---|---|
| Primary supplier | The Blue Train (`train_operator`, `sells_standalone = true`) |
| Journey | Pretoria → Cape Town, departure ~2026-11-12 |
| Pax | 2 adults + 1 child (child rate + pax-sum split are in play) |
| Add-ons | The President Hotel (2 nights, Cape Town, post-arrival) · Ulysses transfers ×2 (home→Pretoria station, hotel→CPT airport) · FlySafair CPT→JNB return · City Sightseeing tour (1 day) |
| Customer | new customer created in-run |

**Walk:**

1. New customer via `/app/customers` — required fields, duplicate handling, save round-trip.
2. New enquiry via `/app/enquiries` picking The Blue Train as the product. Watch the intake form:
   "Departure Date" with no end date, "Route / Direction" present, unit count, hotel option.
   Confirm `bookings.primary_supplier_id` lands on Blue Train.
3. Build Booking step 1 — add hotel, both transfers, flight, tour as services.
4. Build Booking step 2 — per-service supplier admin dates (`booking_date`, `confirmation_date`,
   `payment_made_date`, `paid_with`). Exercise the payment-method picker (this branch's other half)
   and check the date anchors: hotel check-in should follow the train's arrival, transfers and
   flight should anchor off the primary leg, not off today.
5. Suites/units: assign suite types summing to booking pax; single supplement behaviour with an
   odd pax count.
6. Price the quote — per-leg rates, extras, manual line, currency. Read every line as a client would.
7. Quote preview → send. Check greeting, supplier voice, journey line ("Pretoria to Cape Town",
   right direction), itinerary order, attachments. Stage → `quote_sent`.
8. Accept quote → `accepted`.
9. Deposit invoice at the 25% default, then override the percentage once — send → `deposit_requested`.
10. Record the deposit payment with a payment method → `deposit_paid`. Check the supplier-booking
    admin dates from step 4 are still intact and visible.
11. Final invoice → send → record balance payment → `final_paid` / paid in full.
12. Voucher: confirm it is refused while balance > 0, then generate and send → `voucher_sent`.
    Read the voucher as the client: service blocks, dates, supplier names, journey line.
13. Close the booking → `closed`.
14. Cross-check `/app/pipeline`, `/app/bookings`, `/app/reporting`, `/app/documents`,
    `/app/payments`, `/app/audit` — does this booking show the right product, dates and totals
    everywhere?

## Run QA-P2 — Rovos Rail as main product

**Shape:** same product class, different supplier, deliberately awkward inputs. Proves nothing
about the primary product is hard-coded to the Blue Train, and stresses reverse direction plus a
single traveller.

| | |
|---|---|
| Primary supplier | Rovos Rail (`train_operator`) |
| Journey | Cape Town → Pretoria (the **reverse** direction — check `route_reversed` everywhere) |
| Pax | 3 adults, one travelling single (single supplement must appear and price) |
| Add-ons | Pre-journey hotel in Cape Town (The Commodore or Portswood, 2 nights) · Ulysses transfer airport→hotel and hotel→station · FlySafair JNB→CPT outbound (a flight that happens **before** the primary leg — flight anchoring is the other half of this branch) |
| Customer | existing seeded customer, edited during the run |

Same 14-step walk as QA-P1, with these additions:

- The outbound flight sits before the train departure: check the itinerary orders by date, not by
  the order services were added, and that the flight date anchor does not snap to the train date.
- Reverse direction: the quote email, voucher, worksheet and `bookings.route_id`/`route_reversed`
  must all say Cape Town → Pretoria.
- Mid-flow edit: after the quote is sent, change the pax count or a suite and re-issue the quote.
  Watch versioning (`LTT-…-Q2`), supersede behaviour of the stale sent quote, and whether invoices
  and totals follow.
- Take one deliberate wrong turn (attempt to send the voucher early, attempt to confirm without
  deposit) and record what the app says.

## Run QA-P3 — A tour as main product (the new capability)

**Shape:** the run the feature was built for. A tour operator, not a train, heads the booking.

| | |
|---|---|
| Primary supplier | **New** tour operator created in-run via Add Supplier, ticked as a main product (`sells_standalone`). Fallback if creation blocks: flip City Sightseeing Bus Tours to standalone and note it as a workaround. |
| Product | multi-day tour, e.g. 4-day Kruger safari tour, 2026-11-20 → 2026-11-23 |
| Pax | 2 adults |
| Add-ons | Hotel (Ivory Manor or Apogee, 2 nights pre-tour) · Ulysses transfers ×2 · FlySafair JNB→Hoedspruit/return · optional Blue Train leg as a **non-primary** add-on if pricing allows — a train that is not the main product is the sharpest test of the generalisation |
| Customer | new customer created in-run |

Walk as above, plus the kind-specific checks:

1. **Supplier creation:** create the tour operator through `components/add-supplier-dialog.tsx`
   with the main-product tick. Then build its catalogue: tour type(s), itinerary, per-person rate,
   season/event, single supplement. Confirm the section headings speak tour language
   ("Tour Types, Itineraries and Rates"), not suites and routes.
2. **Intake:** the enquiry form must ask "Tour Date" **and** "Tour End Date", must not offer a
   route field, must count days not nights, and must still offer the hotel option.
3. **Readiness:** a tour with no itinerary chosen must still price (`routeRequiredForPricing: false`)
   and must still pass build-readiness.
4. **Journey line:** a tour's itinerary is not a direction — the booking must end with **no** route,
   and no add-on (the transfer, the flight) may donate its route to the booking. `bookings.route_id`
   should be null; the email and voucher must not print "Airport ↔ …" as though it were the journey.
5. **Documents and tokens:** worksheet, itinerary PDF, invoice, voucher and every email template
   must say "Tour" where a train would say "Journey", and must name the tour operator as the
   supplier the booking is for.
6. **Reporting:** `/app/reporting` product breakdown must file this booking under the tour operator,
   not under a hotel or a transfer company.
7. If a train leg is added as an add-on, confirm the train does **not** hijack the primary supplier,
   the journey line, or the email voice.

---

## Deliverables

Four documents, written at the end of each run (not batched at the very end):

| File | Content |
|---|---|
| `qa/reports/system-qa/2026-09-04-P1-blue-train-full-load.md` | Report contract §10, findings F-P1-n |
| `qa/reports/system-qa/2026-09-04-P2-rovos-rail-full-load.md` | findings F-P2-n |
| `qa/reports/system-qa/2026-09-04-P3-tour-primary-product.md` | findings F-P3-n |
| `qa/reports/system-qa/2026-09-04-P-summary.md` | cross-run: what is systemic vs one-off, ranked Sev-1→4, recommended fix order |

Each report carries: header (env, `APP_VERSION`, commit, tree state, roles, duration, DB reset
yes/no), summary table, findings with repro/expected/actual/evidence/suspected cause, console &
network errors from `attachBrowserDiagnostics`, workarounds used, not covered, verdict.

`qa/reports/` and `qa/screenshots/` are gitignored — output stays local unless asked otherwise.

## Timing

Plan written 2026-09-04 19:00. Execution starts at **20:33** (one-shot cron, T+90m).
Budget ≈ 40 min per run, sequential in one session, P1 → P2 → P3 → summary. If a run overruns,
finish its report before starting the next — three shallow runs are worth less than two deep ones
plus an honest "not covered".

## Assumptions taken (flag if wrong)

1. Local DB is disposable; a single `pnpm db:reset` before QA-P1 is acceptable and all three
   bookings share the resulting database.
2. QA-P3 creates a brand-new tour operator rather than reusing City Sightseeing, because supplier
   creation with the main-product tick is itself new code worth exercising.
3. "Flights" means a real `airline` service leg (FlySafair) on the booking, not just a transport request.
4. Runs execute against the working tree as it stands at 20:33, uncommitted changes included.
