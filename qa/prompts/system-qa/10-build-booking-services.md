# QA 10 — Build Booking, Services, Travellers & Transport

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Between the enquiry and the quote sits the booking's service list: what the
customer is actually getting, per supplier, per leg, with dates, times and
passenger allocation. This is the data that later becomes quote lines, invoice
lines, and voucher blocks — so an error here propagates to every client-facing
document.

## Prerequisites

QA 08 (THE QA BOOKING exists in `enquiry`), QA 06 (supplier).
Run as consultant (leonie).

## Surfaces under test

- [app/api/jobs/[id]/build-booking/route.ts](../../../app/api/jobs/[id]/build-booking/route.ts)
- `app/api/jobs/[id]/services/*` — `route.ts`, `apply`, `confirm`, `discard`
- [lib/packages/seed-service-units.ts](../../../lib/packages/seed-service-units.ts), [lib/quotes/adapters/from-booking-services.ts](../../../lib/quotes/adapters/from-booking-services.ts)
- [app/api/jobs/[id]/travellers/route.ts](../../../app/api/jobs/[id]/travellers/route.ts)
- [app/api/jobs/[id]/transport-requests/route.ts](../../../app/api/jobs/[id]/transport-requests/route.ts)
- [app/api/jobs/[id]/supplier-schedules/route.ts](../../../app/api/jobs/[id]/supplier-schedules/route.ts)
- [app/api/jobs/[id]/passenger-totals/route.ts](../../../app/api/jobs/[id]/passenger-totals/route.ts)
- [app/api/jobs/[id]/reservation-details/route.ts](../../../app/api/jobs/[id]/reservation-details/route.ts), [app/api/jobs/[id]/reservation-received/route.ts](../../../app/api/jobs/[id]/reservation-received/route.ts)
- [components/job-reservation-tab.tsx](../../../components/job-reservation-tab.tsx), [components/job-enquiry-tab.tsx](../../../components/job-enquiry-tab.tsx)
- [lib/pricing/age-buckets.ts](../../../lib/pricing/age-buckets.ts), [lib/packages/passenger-totals.ts](../../../lib/packages/passenger-totals.ts)

## Checks

### Build Booking

1. `GET /api/jobs/{id}/build-booking` on the QA booking → returns the buildable
   service list derived from the attached package, suppliers and transport
   requests. Screenshot the UI equivalent.
2. `POST` the build → `booking_services` and `booking_service_units` rows created
   with `origin='auto'`. Verify in the DB.
3. Build twice → confirm it is idempotent or that it clearly replaces rather than
   duplicating. Duplicated services silently doubling a quote is Sev-1.
4. Build on a booking with no package attached → clear error, no partial write.

### Services

5. `GET /api/jobs/{id}/services` returns services with their units.
6. `PATCH` — edit a service's date, time, supplier, and unit allocation. Reload,
   persisted.
7. Add a service manually (not from the package) and confirm it prices.
8. Remove a service; confirm its units go with it.
9. **`POST /services/apply`** — prices the services into quote lines. Confirm the
   line items match the rate cards from QA 06 for the travel date, and that a
   date with no covering rate card surfaces as missing pricing rather than zero.
10. **`POST /services/confirm`** — stamps `services_confirmed_at` /
    `services_confirmed_by` and flips `origin: 'auto' → 'consultant'`. Verify
    both in the DB and confirm the UI reflects "confirmed".
11. Editing a confirmed service — is it still editable, and does it stay
    `'consultant'`? Record the behaviour.
12. **`POST /services/discard`** — discards auto-built services *and their draft
    quote*. Test on a throwaway booking (not the QA booking): confirm both go,
    and that a *confirmed* service list is not discardable by accident.

### Service selections

13. `POST /api/jobs/{id}/build-booking` creates the `booking_services` rows and
    seeds their units via `lib/packages/seed-service-units.ts`. Confirm every
    service comes back with `selected: true` and a unit carrying the enquiry's
    headcount — units seeded 0/0/0 are what leave a booking unpriceable.
14. `PATCH /api/jobs/{id}/services` — this is a **full replace-set for the legs
    you send**. Send only some legs and confirm what happens to the ones you
    omitted. If omission silently deselects a leg, that is at least Sev-2 and
    must be documented loudly.
15. Deselect an optional leg → it disappears from the apply output. Attempt to
    deselect the train leg → blocked (non-optional).
16. Set `units` on a suite that do not sum to the booking pax → apply must 400.
17. Change `routeId` and `serviceDate` on the train leg → both reflected in the
    apply output and in the eventual itinerary order.

### Travellers

18. `PUT /api/jobs/{id}/travellers` — add the full roster: 2 adults with names,
    surnames and ID/passport numbers. Reload, persisted.
19. Add a child and an infant with dates of birth; confirm
    `GET /passenger-totals` buckets them per the age bands from QA 04/06
    (`lib/pricing/age-buckets.ts`).
20. **Boundary ages** — a traveller whose DOB puts them exactly on a band
    boundary. Confirm which side they fall and that it is consistent between
    `passenger-totals` and the quote pricing.
21. Traveller count not matching the booking pax → surfaced where? Record it;
    QA 13 needs complete guest details before a deposit invoice will generate,
    so an unflagged mismatch here becomes a blocked invoice there.
22. `PUT` with an empty roster → does it wipe existing travellers? Confirm the
    replace-set semantics and that it is not destructive by accident.

### Transport & schedules

23. `PUT /api/jobs/{id}/transport-requests` — **full replace-set**. Add transfer,
    vehicle rental and airline requests. Then PUT a subset and confirm the
    omitted ones are removed (that is the contract — confirm the UI makes it
    obvious).
24. `PUT /api/jobs/{id}/supplier-schedules` — per-supplier schedule rows: dates,
    times, pickup/dropoff. These feed the voucher, so record exactly what you
    entered for QA 14 to check.
25. A schedule time missing → confirm it becomes a **warning** (not a block) in
    `lib/voucher/check-readiness.ts`. Verify by reading the readiness result now.

### Reservation

26. `PUT /api/jobs/{id}/reservation-details` — all reservation-tab fields and
    special requests. Reload, persisted.
27. `POST /api/jobs/{id}/reservation-received` — stamps
    `reservation_form_received_at` and prepares the acknowledgement email.
    Confirm the email is *prepared*, not sent, and that it lands in the scheduled
    queue for review.
28. Confirm the `reservation_form_received` gate in
    `lib/pipeline/validate-transition.ts` is unblocked by check 27 — QA 12 tests
    the gate itself, here just confirm the stamp exists.

## Probes

- `POST /services/apply` with a travel date outside every rate card window →
  missing pricing reported, nothing priced at zero.
- Concurrent edits: two tabs editing the same service, save both. Confirm the
  second does not silently discard the first.
- `PUT /travellers` and `PUT /transport-requests` unauthenticated → 401.
- Discard services on a booking that already has a *sent* quote → must be
  blocked or must clearly warn. Silently deleting the quote behind a sent
  document is Sev-1.

## Report

`qa/reports/system-qa/{date}-10-build-booking-services.md`

Extra sections:

- **Service list as built**: service · supplier · date · time · units · origin.
  QA 11 prices this and QA 14 renders it, so it must be recorded verbatim.
- **Traveller roster** as entered, including DOBs and ID numbers.
- **Replace-set semantics**: endpoint · sent subset · resulting state ·
  destructive? This is the section most likely to contain a real finding.

## Acceptance

- The QA booking has a confirmed service list, a complete traveller roster with
  guest details, transport requests and supplier schedules.
- Checks 14, 22 and 23 (replace-set semantics) documented explicitly.
- Age boundary case (20) resolved consistently across both endpoints.
