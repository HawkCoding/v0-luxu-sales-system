# Step 6 — Consultant Handbook, Chapter 5: Reservation, guests and schedule changes

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/consultant/05-reservation-and-guests.md`
**Screenshot slugs:** `05-*` · new describe block `ch05 reservation`

## Scope

What happens between the client accepting a quote and the invoice going out: the
reservation form, the guest roster, and correcting travel times later.

## Source of truth — read these

- `components/job-reservation-tab.tsx` — guests, company, agency, billing, special requests
- `components/reservation-form-card.tsx` — the **Reservation form received** tick
- `components/job-transfer-times-tab.tsx` — flights and transfers, the stale-voucher alert
- `lib/pipeline/validate-transition.ts:278-285` — the `reservation_form_received` gate
- `app/api/jobs/[id]/reservation-details/route.ts`

## Must cover

1. **Reservation form received** — this is not a passive tick. Ticking it composes the
   acknowledgement email and opens the send dialog, and the flag only sets **once the email
   actually sends**. Sending from Quote Sent moves the booking to Quote Accepted.
   This trips people up; give it a WARNING callout.
2. **The guest roster** — adding guests, names, ID or passport number, date of birth, the
   child and primary flags, **Save guests**.
3. **Applying the guest list to passenger counts** — what it does, when the numbers can
   disagree, and that a mismatch warns but never blocks a stage move.
4. **Company details, agency details and billing address** — when each is used.
5. **Special requests** — where they surface downstream.
6. **Transfer Times** — updating a rescheduled flight or transfer without creating a new
   quote version. Flights (flight number, departure and arrival airport codes) and
   transfers and vehicle rentals. Per-row **Save**.
7. **The stale-voucher warning** — when a time change makes an already-generated voucher
   wrong, and that the voucher must be regenerated. STOP callout.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `05-reservation-tab` | The Reservation tab |
| `05-form-received` | The Reservation form received card |
| `05-guest-roster` | The guest roster with two guests |
| `05-transfer-times` | The Transfer Times tab |
| `05-stale-voucher` | The stale-voucher warning |

## Done when

- The chapter makes clear that the tick sends an email — a reader must not be able to
  finish this chapter thinking it is a silent checkbox.
