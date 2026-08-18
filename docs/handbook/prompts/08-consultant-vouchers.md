# Step 8 — Consultant Handbook, Chapter 7: Vouchers, documents and closing

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/consultant/07-vouchers-and-closing.md`
**Screenshot slugs:** `07-*` · new describe block `ch07 vouchers`

## Scope

The last stretch: supplier references, the travel voucher, the client itinerary, the
internal worksheet, and closing the booking.

## Source of truth — read these

- `components/job-references-tab.tsx` — per-leg supplier references, the blocking rule
- `components/generate-voucher-dialog.tsx` — readiness warnings, generate and regenerate
- `components/send-voucher-button.tsx`
- `components/job-documents-tab.tsx` — the worksheet, the voucher card and its stage gate
- `components/job-attachments-tab.tsx`
- `app/app/documents/page.tsx` — the global document library
- `lib/voucher/`, `lib/itinerary/ensure-itinerary-pdf.ts`, `lib/worksheet/`
- `lib/pipeline/apply-transition.ts:282-328` — what sending the voucher changes

## Must cover

1. **Voucher Details first.** Every leg needs a supplier reference number before a voucher
   can be generated. Also on this tab: the contact name and a special note that prints on
   the voucher. Lead the chapter with this — it is the prerequisite everyone hits.
2. **When the voucher becomes available** — the card only appears once the booking is at
   Paid in Full or later. Explain why in one line rather than making it feel arbitrary.
3. **Generating the voucher** — the readiness warnings and what each one means,
   **Generate PDF** and **Regenerate PDF**.
4. **The itinerary** — generated automatically if it does not exist, and sent with the
   voucher. The client receives both.
5. **Sending the voucher** — the editable preview, both attachments, and that sending moves
   the booking to Voucher Sent **and sets the outcome to Won**.
6. **The worksheet** — what it is for, that it is internal, and that it never goes to a
   client. STOP callout.
7. **The Documents tab and the Documents library** — finding and downloading any generated
   PDF, and the type filter on the library page.
8. **Attachments** — uploading, downloading and deleting files on a booking, and how they
   differ from generated documents.
9. **Closing the booking** — what Closed means and what stops changing after it.

> [!WARNING]
> If travel times changed after the voucher was generated, regenerate it before sending.
> Cross-reference Chapter 5.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `07-voucher-details` | The Voucher Details tab with references filled in |
| `07-missing-reference` | Voucher generation blocked by a missing reference |
| `07-generate-voucher` | The Generate voucher dialog with the PDF preview |
| `07-send-voucher` | Preview and send with voucher plus itinerary attached |
| `07-documents-tab` | The Documents tab listing generated PDFs |
| `07-documents-library` | The global Documents page with the type filter |

## Done when

- A reader knows exactly what to do when **Generate Travel Voucher** is not there.
- The chapter never suggests emailing the worksheet to a client.
