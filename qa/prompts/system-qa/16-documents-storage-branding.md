# QA 16 — Documents, Storage & PDF Branding

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Everything the customer receives is a stored PDF served by a signed URL. This
pass verifies the document library, upload/download/delete, access control on
storage, and that the branding and wording settings genuinely reach every one of
the five rendered document types.

## Prerequisites

QA 11–14 (quote, invoice, voucher, itinerary and worksheet PDFs all exist on the
QA booking). QA 04 (branding and banking settings known).

## Surfaces under test

- [app/app/documents/page.tsx](../../../app/app/documents/page.tsx) — the library with type/supplier/consultant/date filters
- [components/job-documents-tab.tsx](../../../components/job-documents-tab.tsx), [components/job-attachments-tab.tsx](../../../components/job-attachments-tab.tsx)
- [app/api/documents/upload/route.ts](../../../app/api/documents/upload/route.ts), [app/api/documents/[id]/route.ts](../../../app/api/documents/[id]/route.ts) — signed-URL GET, DELETE `[A/M]`
- [app/api/pdf-preview/[type]/route.ts](../../../app/api/pdf-preview/[type]/route.ts) — `voucher|itinerary|quote|invoice|worksheet` from sample data
- [components/voucher-template-editor.tsx](../../../components/voucher-template-editor.tsx), [app/api/voucher-template/route.ts](../../../app/api/voucher-template/route.ts), [app/api/voucher-template/upload/route.ts](../../../app/api/voucher-template/upload/route.ts)
- [components/brand-block-settings-editor.tsx](../../../components/brand-block-settings-editor.tsx), [components/document-text-settings-editor.tsx](../../../components/document-text-settings-editor.tsx)
- [lib/pdf/brand-logo.ts](../../../lib/pdf/brand-logo.ts), [lib/pdf/document-fonts.ts](../../../lib/pdf/document-fonts.ts)
- [lib/settings-access.ts](../../../lib/settings-access.ts) — `getDocumentBrandSettings`, `getDocumentTextSettings`, `resolveDocumentBrand`, `getBankingSettings`
- Buckets: `quotes`, `invoices`, `vouchers` (also holds itinerary and worksheet)

## Checks

### Library & filters

1. `/app/documents` lists every document generated in QA 11–14. Confirm each
   document type is present: `quote_pdf`, `invoice_pdf`, `voucher_pdf`,
   itinerary, `summary_pdf`.
2. Every filter — type, supplier, consultant, date range — individually and
   combined. Row counts match the DB.
3. Empty state when a filter matches nothing.
4. Download from the library: the signed URL resolves and the file opens.
   Confirm the URL expires (retry after expiry) — a permanently public URL to a
   customer document is Sev-1.

### Booking tabs

5. Documents tab on the QA booking lists the same documents with the right
   kinds and statuses (note `voucher_pdf` should be `sent` after QA 14).
6. Attachments tab: upload a PDF, an image, and a non-document file type.
   Confirm the accepted types and that a rejected type fails cleanly.
7. Upload a very large file → size limit enforced with a readable message, not a
   timeout or a 413 with no explanation.
8. Upload a file with a hostile name (`../../etc/passwd`, a name with spaces and
   unicode) → stored safely, `storage_path` correctly bucket-prefixed, no path
   traversal. This one is a Sev-1 if it escapes the bucket prefix.
9. Download an uploaded attachment.
10. Delete a document as admin → gone from the list and from storage. Verify the
    storage object is actually removed, not just the DB row — orphaned objects
    are Sev-3, but a DB row deleted while the file remains downloadable via a
    still-valid signed URL is Sev-2.
11. `DELETE /api/documents/{id}` as consultant → 403 (`delete:documents` is
    admin+manager).

### Storage access control

12. Take a signed URL for the QA booking's voucher and attempt to use it while
    logged in as a **different consultant** who cannot see that booking. Record
    what happens — signed URLs bypass RLS by design, so the finding is about
    whether the URL is ever handed to someone who should not have it.
13. Attempt `GET /api/documents/{id}` for a document on a booking the user cannot
    see → 403/404, and the error must not leak the filename or the booking.
14. Confirm every `storage_path` in the `documents` table is bucket-prefixed
    consistently. A mixed convention is what breaks downloads later — check every
    row, not one.

### PDF preview (sample data)

15. `GET /api/pdf-preview/{type}` for all five types: `voucher`, `itinerary`,
    `quote`, `invoice`, `worksheet`. Each renders from sample data without a real
    booking. Screenshot each.
16. Confirm the preview reflects the **current** settings, so it is usable as a
    design tool — change a branding value and re-preview.
17. `[A/M]` gated — consultant blocked.

### Branding & wording reach every document

For each change below: apply it, then regenerate **all five** document types and
confirm the change appears in each one where it should — and does not appear
where it should not.

18. **Brand block** (`brand-block-settings-editor.tsx`, admin-only tab) — logo,
    colours, footer. Regenerate all five.
19. **Document text settings** (`document-text-settings-editor.tsx`) — Quote &
    Invoice wording. Confirm it reaches the quote and invoice, and does *not*
    bleed into the voucher.
20. **Voucher & itinerary wording** (Templates → Guest Docs) — reaches the
    voucher and itinerary only.
21. **Voucher template editor** — colours, section visibility, section order,
    footer. Toggle a section off and confirm it disappears from the rendered
    voucher. Reorder sections and confirm the order changes.
22. **Voucher logo/banner upload** (`/api/voucher-template/upload`) — upload,
    appears on the voucher, delete, falls back cleanly with no broken image.
23. **Banking settings** reach the invoice only (`banking-details-block.ts`), not
    the voucher or the quote.
24. **Company logo** from QA 04 reaches the PDF brand block via
    `lib/pdf/brand-logo.ts`. Delete the logo and confirm every PDF still renders
    — a missing logo must degrade, not crash the render. A 500 on invoice
    generation because a logo was deleted is Sev-1.
25. `lib/pdf/document-fonts.ts` — confirm fonts embed. Render a document
    containing accented characters, an em dash, and a currency symbol; confirm no
    tofu boxes or dropped glyphs.

### Restore

26. Restore every branding and wording setting you changed, and confirm the
    restore. Record the originals in a table before you begin.

## Probes

- Regenerate a document while another regeneration of the same document is in
  flight → one file or two, and does the `documents` row point at the right one?
- Render a quote with 60+ line items and a voucher with 15 legs → page breaks
  hold, no content clipped, no row split across pages (expected behaviour is
  specified in `lib/voucher/pdf/page-breaks.test.ts`).
- Render with an empty optional section (no transport, no hotel) → the section is
  omitted cleanly rather than rendering an empty heading.
- `POST /api/documents/upload` unauthenticated → 401.

## Report

`qa/reports/system-qa/{date}-16-documents-storage-branding.md`

Extra sections:

- **Original branding values** captured before changes, plus restore confirmation.
- **Document type × setting matrix**: five document types down, branding/wording
  settings across, marking where each setting appears. Blank cells where a
  setting *should* appear are the findings.
- **Storage audit**: every `documents` row's `storage_path`, bucket, and whether
  the object exists.
- Screenshots of all five `pdf-preview` renders.

## Acceptance

- All five document types rendered and inspected.
- The setting × document matrix complete.
- Check 8 (hostile filename) and check 24 (missing logo) conclusive.
- All branding settings restored.
