# Step 5 — Consultant Handbook, Chapter 4: Quoting

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** high
**Output:** `docs/handbook/content/consultant/04-quoting.md`
**Screenshot slugs:** `04-*` · new describe block `ch04 quoting`

This is the highest-value chapter in the whole set and the one most likely to be wrong if
rushed. Budget the session for it.

## Scope

From a draft quote to a quote in the client's inbox — and to a revised version after they
ask for a change.

## Source of truth — read these

- `components/build-booking-dialog.tsx` — all three steps
- `components/packages/transport-leg-editor.tsx`, `components/packages/suite-leg-editor.tsx`
- `components/quotes/fx-rate-banner.tsx` — the FX rate and manual override
- `components/quotes/commission-bonus-field.tsx`
- `components/job-quotes-tab.tsx` — every per-quote action and every line badge
- `components/create-quote-dialog.tsx` — including the quote-validity variant
- `components/revise-quote-dialog.tsx` — the versioning mechanism
- `components/quotes/convert-quote-currency-dialog.tsx`
- `components/quote-preview-send-dialog.tsx` — the two-pane send
- `lib/quotes/pricing-engine.ts`, `lib/quotes/quote-number.ts`, `lib/quotes/validity.ts`,
  `lib/quotes/revision-reset.ts`

## Must cover

1. **Creating a quote** — from the Enquiry tab's **Start Quote**, or **Create New Quote** on
   the Quotes tab. The **Valid until** date, and the 14-day default.
2. **Build Booking, step 1 — choose services.** Supplier category, supplier, **Add
   service**, reordering, removing.
3. **Build Booking, step 2 — configure services.** Per-leg editors, dates, routes, suites,
   passenger units. The FX rate banner: where the rate comes from, when to refresh it, and
   what overriding it means for the quote. The **Commission** control, which is required.
   **Confirm services** for auto-filled fields. The traveller-count mismatch reconciler and
   both ways out of it.
4. **Build Booking, step 3 — confirm.** What **Apply to quote** and **Replace and apply**
   each do, and that extra lines are preserved.
5. **Reading the quote** — line items, the Extra / Complimentary / Missing pricing badges,
   internal-only notes, the commission and rounding line, the total.
6. **Editing lines by hand** — removing a line, and when the quote is locked instead.
7. **The quote PDF** — generating it and where it is stored.
8. **Preview and Send** — the two-pane dialog, editable subject, the attachment picker, the
   signature picker, and the fact that **body edits apply to this send only** while the
   default wording lives on the Templates page. The Undo window after sending.
   WARNING callout: sending moves the booking to Quote Sent.
9. **Quote versioning — Revise.** What the dialog shows before you commit, what a revision
   resets, which invoices it voids or reopens, the extra confirmation when the booking is
   already past Paid in Full, and the banner that then tracks the remaining steps.
   This section needs to be exact; it is the most destructive routine action in the system.
10. **Changing the quote currency** — and when it forces a revision first.
11. **Cancelling a quote** — and what statuses allow it.

> [!WARNING]
> An `accepted` quote cannot be edited. The only route is **Revise**. Say this once,
> prominently, near the top of the chapter.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `04-quotes-tab` | The Quotes tab with a priced quote |
| `04-build-step-1` | Build Booking, choose services |
| `04-build-step-2` | Build Booking, configure services |
| `04-fx-banner` | The FX rate banner |
| `04-build-step-3` | Build Booking, confirm replacement |
| `04-quote-lines` | Line items with badges |
| `04-preview-send` | The two-pane Preview and Send dialog |
| `04-revise` | The Revise dialog showing what will reset |

## Done when

- A reader who has never used the system can build and send a quote using only this chapter.
- The Revise section survives being checked line by line against `revise-quote-dialog.tsx`
  and `lib/quotes/revision-reset.ts`.
