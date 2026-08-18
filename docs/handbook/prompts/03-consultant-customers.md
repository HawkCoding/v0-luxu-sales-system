# Step 3 — Consultant Handbook, Chapter 2: Customers

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/consultant/02-customers.md`
**Screenshot slugs:** `02-*` · new describe block `ch02 customers`

## Scope

The customer record: creating it, correcting it, and why it gates the whole pipeline.

## Source of truth — read these

- `app/app/customers/page.tsx` — list, search, filters, pagination, the detail modal
- `app/app/customers/[id]/page.tsx` and `components/customer-detail-view.tsx` — the record
- `components/create-customer-dialog.tsx` — every field, required vs optional
- `lib/pipeline/validate-transition.ts:159-176` — the `customer_complete` gate
- `components/job-enquiry-tab.tsx:1018-1056` — the read-only missing-fields panel
- `app/app/jobs/[id]/page.tsx:926-929`, `:1344-1381` — changing the customer on a booking

## Must cover

1. **Finding a customer** — the list, the search box, the Consultant / Supplier /
   Created-date filters, and the global search in the header.
2. **Creating a customer** — the required fields (first name, last name, email) and the
   optional ones, including the expandable section: province, date of birth, ID or passport
   number, VIP status, preferences, communication preferences.
3. **What "complete" means** — first name, last name, email, phone **and country** must all
   be present or **no booking for that customer can move forward a single stage**. This is
   the most common reason a consultant gets stuck; give it a WARNING callout and say it
   early.
4. **Editing a record** — **Edit**, then **Save changes** or **Cancel**.
5. **Duplicate email** — what the conflict message looks like and the "open that customer"
   route out of it.
6. **Someone else edited it first** — the concurrent-edit conflict and what to do.
7. **Linked accounts** — what they are for and how to add, edit and remove one.
8. **The rest of the record** — activity summary, bookings list, notes.
9. **Starting a booking from a customer** — the **New booking** button.
10. **Fixing the wrong customer on a booking** — the **Change customer** flow, and the fact
    that it only appears for email-sourced enquiries.

> [!NOTE]
> Bulk CSV import is an administrator function. Mention in one line that it exists and
> point at the Administrator Guide. Do not document it here.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `02-customer-list` | The list with filters visible |
| `02-new-customer` | The New Customer dialog, expanded section open |
| `02-customer-record` | A populated customer record |
| `02-missing-fields` | The Enquiry tab's missing-contact-details panel |
| `02-blocked-by-customer` | The stage-move modal blocked on `customer_complete` |

The last one is the money shot for this chapter — a real blocked move, not a mock-up.

## Done when

- Field names in your prose match `create-customer-dialog.tsx` exactly.
- A reader can go from "the system will not let me move this booking" to a fixed customer
  record using only this chapter.
