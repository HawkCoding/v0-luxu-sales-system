# QA 06 — Suppliers, Locations & Rate Cards

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Suppliers carry the pricing model. Everything a quote costs comes out of rate
cards, suite types, age bands and commission configured here, so an error in this
area produces wrong money on every downstream document. This pass configures one
complete supplier that prompts 07–15 will price against.

## Prerequisites

QA 01 GREEN, QA 04 complete (rate types and default commission configured and
restored). Run as admin; repeat the edit checks as manager and consultant.

## Surfaces under test

- [app/app/suppliers/page.tsx](../../../app/app/suppliers/page.tsx), [app/app/suppliers/[slug]/page.tsx](../../../app/app/suppliers/[slug]/page.tsx)
- [components/supplier-detail-view.tsx](../../../components/supplier-detail-view.tsx) (~4700 lines — the largest surface in the app)
- [components/supplier-email-editor.tsx](../../../components/supplier-email-editor.tsx), [components/supplier-station-address-editor.tsx](../../../components/supplier-station-address-editor.tsx)
- [components/supplier/commission-control.tsx](../../../components/supplier/commission-control.tsx), [components/supplier/suite-vocabulary-card.tsx](../../../components/supplier/suite-vocabulary-card.tsx), [components/supplier/applicable-rates-card.tsx](../../../components/supplier/applicable-rates-card.tsx)
- [app/api/suppliers/route.ts](../../../app/api/suppliers/route.ts), [app/api/suppliers/[slug]/route.ts](../../../app/api/suppliers/[slug]/route.ts), [app/api/suppliers/quick/route.ts](../../../app/api/suppliers/quick/route.ts)
- [app/api/locations/route.ts](../../../app/api/locations/route.ts), [app/api/supplier-email-labels/route.ts](../../../app/api/supplier-email-labels/route.ts)
- [lib/rate-cards/resolve.ts](../../../lib/rate-cards/resolve.ts), [lib/rate-cards/overlap.ts](../../../lib/rate-cards/overlap.ts), [lib/rate-card-validity.ts](../../../lib/rate-card-validity.ts)
- [lib/suppliers.ts](../../../lib/suppliers.ts), [lib/supplier-save-guard.ts](../../../lib/supplier-save-guard.ts), [lib/suppliers/auto-child-price.ts](../../../lib/suppliers/auto-child-price.ts)

## Checks

### Create

1. **Quick-create** (`POST /api/suppliers/quick`) — creates supplier + route +
   suite type + rate card in one call. Verify all four records exist and are
   linked.
2. **Full create** via the Add Supplier dialog for each supplier kind (train,
   hotel, transfer, tour, flight, vehicle rental). Record which kinds exist and
   which fields each kind exposes.
3. Slug generation: create two suppliers with the same display name → slugs must
   not collide.
4. The list groups and collapses by kind; the inline detail modal and the
   full-page `/app/suppliers/{slug}` show the same data.

### Contacts & addresses

5. Supplier emails: add several with different labels, edit, delete, reorder.
   Order is persisted (`supplier_emails.sort_order`) and the **first** address is
   the supplier's primary contact, mirrored onto `suppliers.email` — confirm the
   order survives a save/reload and that reordering changes the primary contact.
   Also confirm that deleting an address and re-adding the same one in a single
   save succeeds rather than 500-ing part-way (see F06-1).
6. Email labels vocabulary (`/api/supplier-email-labels`): create a label, use
   it, then delete it — confirm suppliers using the deleted label degrade
   gracefully rather than erroring.
7. **Station addresses per city** — add addresses for two cities on a train
   supplier. These feed the voucher; QA 14 checks they render, so record exactly
   what you entered.
8. Invalid email format rejected at the API.

### Routes & locations

9. Create locations, then a route between two of them. Confirm the route appears
   on the supplier and is selectable when configuring a leg.
10. Bidirectional routes: create A→B, then add B→A. Two one-way routes is a
    **supported** configuration — rate cards hang off `route_id`, so an operator
    charging a different fare each way can only be modelled this way, and a
    `round_trip` route carries a single price list. The save must therefore
    succeed. What is required is that the editor **warns** (dismissible, not
    blocking) that the new route is the reverse of an existing one, so the
    common mistake — filing the return leg and assuming the first route's rate
    cards cover it — is caught. Confirm the warning appears, dismisses, and does
    not prevent the save. `scripts/merge-bidirectional-routes.mjs` remains the
    after-the-fact cleanup for pairs that were meant to be one round trip.
11. Delete a location that a route references → blocked or cascaded
    deliberately, never leaving a dangling route.

### Suite types & vocabulary

12. Create a suite type with bedroom type, bedroom layout and bathroom type
    variants. Confirm the `suite_type_*` join rows exist.
13. `lib/packages/suite-config.ts::loadAllowedSuiteVariantIds` — attempt to save
    a unit with a variant combination the suite type does not allow. Must be
    rejected. An invalid combination reaching a quote is Sev-2.
14. Suite vocabulary card: add an alias for a suite name. Confirm the alias is
    stored (`lib/suites/suite-alias-store.ts`) — QA 09 verifies it resolves an
    inbound email phrase.
15. Confirm the system **never guesses** a suite: an unrecognised phrase must
    raise a review flag rather than picking the closest match.

### Rate cards — the high-risk area

16. Create a rate card with an explicit `validFrom` and `validTo`. Confirm both
    bounds are **inclusive** (`lib/rate-cards/resolve.ts`): price on the
    `validFrom` date and on the `validTo` date must both resolve.
17. Create a rate card with `validTo` NULL and one with `validTo` `""` — both
    mean "ongoing". Confirm both resolve for a far-future date.
18. **Overlap rejection.** Create a second rate card whose window overlaps an
    existing one for the same supplier/suite. The DB constraint
    `no_overlapping_rate_cards` and the client mirror `lib/rate-cards/overlap.ts`
    must both reject it. Test three shapes: full containment, partial overlap at
    the start, and identical windows. A raw Postgres constraint-violation error
    surfacing to the user is Sev-3; an overlap being *accepted* is Sev-2.
19. Adjacent, non-overlapping windows (one ends the day the next begins) must be
    accepted — confirm the inclusive bounds do not cause a false overlap here.
20. A date with no covering rate card → `hasAnyRateCardFor` false → the quote
    build must report missing pricing (`isMissingPricing`), not price it at zero.
    **Zero-priced silent output is Sev-1.**
21. Rate adjustments and `lib/rate-types/rebase-adjustments.ts`: apply an
    adjustment, confirm the resulting price and that the rate-type pills
    (`view-rate-type-pills.ts`) show what was applied. Note that
    `supplier_rate_adjustments.discount_pct` is an **authoring aid**, not a
    pricing rule: nothing in `lib/quotes/**` reads it. The quoted price comes
    from the rate card tagged with that rate type, so do not expect
    `base − discount_pct` arithmetic. The percentage is applied only when a user
    clicks **Apply markdown** in the pricing matrix
    (`components/supplier-detail-view.tsx`).

### Pricing config

22. Passenger age bands on the supplier override the global defaults from QA 04 —
    confirm the override wins.
23. `lib/suppliers/auto-child-price.ts` — child price derived from the adult
    price and the configured ratio; confirm the derived value and that a manual
    child price overrides it.
24. Commission is **not** configured on the supplier — `suppliers` has no
    commission column and the detail view never renders the word. Confirm only
    that: commission is chosen per quote build
    (`components/supplier/commission-control.tsx`, imported solely by
    `components/build-booking-dialog.tsx`), seeded from
    `app_settings.default_commission_type` / `default_commission_value`. The
    "% Markup vs Fixed Total" control itself belongs to QA 11, not here.
25. Applicable rates card reflects the rate types available for this supplier.
    There is no per-`supplier_kind` default — `rate_types` has no such column.
    The real precedence is `suppliers.base_rate_type_id` → `rate_types.is_default`
    → first active (`lib/rate-types/supplier-rate-tiers.ts`). Confirm the card
    honours exactly that.
26. Hotel default times (`lib/suppliers/hotel-default-times.ts`) prefill on a
    hotel supplier.
27. Vehicle-rental route details, if the kind exists — record what it configures.

## Probes

- `DELETE /api/suppliers/{slug}` as manager → must be blocked (`delete:suppliers`
  is admin-only). As admin, delete a supplier that is referenced by a package leg
  or a booking — must be blocked or cascade deliberately. A dangling reference is
  Sev-1.
- `PATCH /api/suppliers/{slug}` as consultant → confirm `edit:suppliers`
  (admin+manager) is enforced **at the API**, not only in the UI. This route uses
  the session client with no `requireRole`, so this is a real risk.
- `lib/supplier-save-guard.ts` — trigger whatever it guards against (a save that
  would drop child records) and confirm it holds.
- Save the supplier detail view from two tabs concurrently; confirm the second
  save does not silently discard the first (this view saves a very large nested
  object).

## Report

`qa/reports/system-qa/{date}-06-suppliers-rate-cards.md`

Extra sections:

- **QA supplier record**: slug, kind, routes, suite types, rate card windows and
  prices — prompts 07–15 depend on this being written down.
- **Rate card matrix**: window · date probed · resolved? · price · expected.
- **Overlap matrix**: overlap shape · rejected? · error surfaced to user.

## Acceptance

- One completely configured supplier exists, documented in the report.
- All three overlap shapes and both inclusive bounds tested.
- Check 20 (no rate card → missing pricing, not zero) conclusive.
- Consultant and manager write paths probed at the API.
