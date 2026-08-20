# Step 4 — Consultant Handbook, Chapter 3: Enquiries and starting a booking

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/consultant/03-enquiries.md`
**Screenshot slugs:** `03-*` · new describe block `ch03 enquiries`

## Scope

From a new enquiry landing in the queue to a draft quote existing. Stops at **Start Quote**.

## Source of truth — read these

- `app/app/enquiries/page.tsx` — the queue, filter chips (`:34-40`), **New Enquiry**,
  **Open Job**, **Mark reviewed**, **Reject Import**, the audit download
- `app/app/pipeline/page.tsx` — the **Draft enquiries** tab
- `components/job-enquiry-tab.tsx` — the whole Enquiry tab
- `components/enquiry-readiness-panel.tsx`, `lib/enquiry/build-readiness.ts` — the Requested
  services panel and what it flags
- `components/enquiry-parsed-fields-editor.tsx` — journey details editing
- `lib/job-numbering.ts` — booking number format and prefix
- `lib/import/parseEmailDraft.ts` — what gets parsed out of an inbound email
- `lib/pipeline/validate-transition.ts:234-245` — the `email_import_review` gate

## Must cover

1. **Where enquiries come from** — created by hand, arriving by email, or arriving from the
   website form. One paragraph; the mechanics belong in Automation and Reporting.
2. **The Enquiries queue** — the filter chips (Needs Review, Complete, Unassigned, My
   Enquiries, Possible Duplicates), search, the Source dropdown.
3. **Creating an enquiry by hand** — **New Enquiry**, every field on the dialog.
4. **The booking number** — the `LTT-YYYY-NNNN` format, when it is assigned, and that it
   never changes for the life of the booking.
5. **Email-imported enquiries** — the **Needs review** flag, what the consultant is
   actually checking, **Mark reviewed**, and **Reject Import** for a bad parse.
   Include the WARNING that an unreviewed import blocks every forward stage move.
6. **Claiming work** — **Take** and **Release** on the booking header, and that a manager
   can reassign.
7. **The Enquiry tab, section by section** — Customer Contact (read-only, and where to fix
   it), Journey Details, Trip Details, Hotel and Additional Services.
8. **The Requested services panel** — the three sections (Booked as / Asked for, not built /
   Before the quote can go out), what **Auto-filled** vs **Confirmed** means, and that it is
   read-only — everything changes in Build Booking, not here. Note that transfers, rentals,
   tours and flights are never built automatically. Note that the needs-review banner now
   shows here for every source, not only email imports.
9. **Original email text** — where to find the source email on an imported enquiry.
10. **Start Quote** — what it creates, and that the app jumps straight to the Quotes tab
    and opens Build Booking. Hand off to Chapter 4.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `03-enquiry-queue` | The queue with filter chips visible |
| `03-new-enquiry` | The New Enquiry dialog |
| `03-enquiry-tab` | A populated Enquiry tab |
| `03-requested-services` | The Requested services panel on a booking with an auto-built service list |
| `03-needs-review` | An imported enquiry flagged for review |

## Done when

- The chapter ends exactly where Chapter 4 begins — a draft quote exists, nothing priced.
- Every filter chip label matches `app/app/enquiries/page.tsx`.
