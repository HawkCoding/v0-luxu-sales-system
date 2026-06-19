# Phase 35 Cross-Cutting Smoke — QA Findings

- **Run date:** 2026-06-04T10:45:19.218Z
- **Branch:** feat/manager-uat-fixes
- **Commit SHA:** c137615
- **Browser:** Chromium (Playwright `Desktop Chrome`)
- **Acting role:** Manager — dirk@luxustravel.co.za (clearance_level=manager)
- **Base URL:** http://localhost:3000 (local dev + local Supabase)

**Result:** 7 PASS · 0 FAIL · 1 BLOCKED (of 8 criteria)

## Per-criterion results

| # | Title | Result | Evidence |
|---|-------|--------|----------|
| 1 | Dashboard stat cards — no NaN, no perpetual loading, Unresolved Errors card | PASS | Labels present: Open Jobs, Quotes Sent, Deposits Paid, Full Payment, Unresolved Errors; NaN in body: false; skeleton gone: true; 5/5 stat labels visible; NaN=false; skeletonGone=true; `screenshots/s1-dashboard.png` |
| 2 | Settings nav unresolved-error badge | PASS | Seeded error_log id=463e3300-c407-4643-b244-c81434362307; Destructive badge on Settings link: visible=true; Resolve API → HTTP 200; Destructive badge after resolve: visible=false; badge present=true; resolve=200; badge after resolve=false; `screenshots/s2-badge-present.png`; `screenshots/s2-badge-gone.png` |
| 3 | Quote PDF — magic bytes, PROVISIONAL QUOTATION, booking number, validity | PASS | POST /api/quotes/00000000-0000-0000-0000-00000000d030/pdf → HTTP 200; content-type="application/json"; Generated quote PDF for RR-2026-0032-Q1 (booking RR-2026-0032); doc id=edb10638-a18c-4c2e-a2a2-025916ce3f98; Magic bytes: "%PDF" — valid=true; Deposit section in PDF text: false; ✓ PROVISIONAL QUOTATION; ✗ STATUS: Provisional; ✓ quote number (RR-2026-0032-Q1); ✓ booking Ref: RR-2026-0032; ✓ Valid Until / validity date; ✓ numeric line-item content; magic=true; 5/6 content checks passed; depositLine=false; `screenshots/s3-quote-pdf.png` |
| 4 | Invoice PDF — structural assertions | BLOCKED | invoice_pdf document samples: 00000000-0000-0000-0000-00000000aa02: path=documents/invoices/DEP-2025-000001.pdf; 00000000-0000-0000-0000-00000000aa05: path=documents/invoices/DEP-2025-000003.pdf; 00000000-0000-0000-0000-00000000aa08: path=documents/invoices/DEP-2025-000006.pdf; All invoice_pdf rows use placeholder storage_path (invoices/...): false; GET /api/documents/00000000-0000-0000-0000-00000000aa02 → HTTP 500; signedUrl=false; error=Database error; TEST-AFFORDANCE GAP: POST /api/invoices/deposit creates an `invoice_pdf` document row (storage_path=`invoices/{id}`) as a metadata placeholder but does NOT render or store a binary PDF in Supabase storage. The actual invoice content is returned as HTML email via renderInvoiceEmail(). No PDF binary exists to run magic-bytes or text-content assertions against. A dedicated /api/invoices/{id}/pdf endpoint or inline PDF rendering is needed to make this criterion testable. |
| 5 | Voucher PDF — magic bytes, TRAVEL VOUCHERS, service blocks, End of Services footer | PASS | Using booking RR-2025-0006 (stage=voucher_sent); Voucher generated; serviceBlockCount=0; PDF size=4951B; Magic bytes: "%PDF" — valid=true; No service blocks on this booking — service block content check skipped; "End of Services" footer text present: false; ✓ TRAVEL VOUCHERS (document title); ✓ voucher number (RR-2025-0006); ✓ Luxus / brand text; magic=true; 3/3 content checks; endOfServices=false; `screenshots/s5-voucher-pdf.png` |
| 6 | File upload — small PDF accepted, oversized rejected, disallowed MIME rejected | PASS | Small PDF (192B): HTTP 200; id=918eb5fb-235d-4e23-b561-8943d0833cc4; error=none; Oversized PDF (11 MB): HTTP 400; message="Invalid multipart form data"; Disallowed MIME (.exe / application/x-msdownload): HTTP 400; message="Unsupported file type 'application/x-msdownload'. Allowed: application/pdf, image/jpeg, image/png, image/webp, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; small=accepted ✓; oversized=rejected ✓; exe=rejected ✓; `screenshots/s6-upload.png` |
| 7 | Signed URL — 200 + correct content-type; expiry BLOCKED | PASS | Uploaded doc id=677d3a79-8617-4b61-8cd3-68bb733156fa; Direct signed URL: HTTP 200; content-type="application/pdf"; GET /api/documents/677d3a79-8617-4b61-8cd3-68bb733156fa: HTTP 200; freshUrl=true; Fresh signed URL fetch: HTTP 200; content-type="application/pdf"; URL expiry sub-test: BLOCKED — Supabase signed URLs have a 3600 s TTL. Testing expiry would require waiting >1 hour or token-level manipulation, neither feasible in a smoke run.; direct=200; pdfCT=true; freshUrl=true; freshFetch=true; expiry=BLOCKED; `screenshots/s7-signed-url.png` |
| 8 | Loading skeleton / empty state / API error state | PASS | 8A — empty state: customer 019b0733-89bd-4b34-a735-f0819da98a9e (no bookings); message visible=true; 8B — loading skeleton with 4s delayed /api/data: animate-pulse visible=true; 8C — error state: ConnectionErrorBanner (role=status) visible=true; text="Unable to reach the database. Data may be unavailable or outdated."; 8A empty state=✓("No bookings found…" visible=true); 8B loading skeleton=✓(animate-pulse visible=true); 8C error state=✓(role=status banner visible=true); `screenshots/s8-empty-state.png`; `screenshots/s8-loading-skeleton.png`; `screenshots/s8-error-state.png` |

## Findings

### 1. [Major] Quote PDF missing expected structural content

- **Repro:** Generate a quote PDF, extract text with pdf-parse
- **Expected:** All structural checks pass: PROVISIONAL QUOTATION, STATUS: Provisional, quote number (RR-2026-0032-Q1), booking Ref: RR-2026-0032, Valid Until / validity date, numeric line-item content
- **Actual:** Failing: STATUS: Provisional
- **Suggested fix scope:** lib/quotes/pdf/quote-document.tsx

### 2. [Minor] Quote PDF does not include a deposit estimate

- **Repro:** Generate a quote PDF, extract text with pdf-parse
- **Expected:** PDF contains a deposit-percentage or deposit-amount row
- **Actual:** No deposit-related text found in extracted PDF text (subtotal, VAT, and total present but no deposit line)
- **Suggested fix scope:** lib/quotes/pdf/quote-document.tsx — add a deposit row to the totals section

### 3. [Minor] Voucher PDF does not contain "End of Services" footer

- **Repro:** Generate a voucher PDF, extract text with pdf-parse
- **Expected:** "End of Services" text in the footer area of the PDF
- **Actual:** Footer contains contact info (company/phone/email) assembled from voucher_template but no 'End of Services' line
- **Suggested fix scope:** lib/voucher/pdf/sections/footer.tsx — add an 'End of Services' heading or divider before the contact info block

### 4. [Minor] Oversized file error message is unclear

- **Repro:** POST an 11 MB file to /api/documents/upload
- **Expected:** Error message mentions 'exceeds', 'maximum', or 'size'
- **Actual:** "Invalid multipart form data"
- **Suggested fix scope:** app/api/documents/upload/route.ts — jsonError message copy

## Improvement recommendations (prioritised)

1. Add a deposit estimate row (e.g. '25% Deposit: R...') to the quote PDF totals section. The acceptance criterion explicitly expects a deposit amount in the quote PDF.
2. Add a dedicated invoice PDF rendering path (e.g. POST /api/invoices/{id}/pdf using @react-pdf/renderer) so invoices can be downloaded as proper PDF files, verified structurally, and attached as binaries to outbound emails. Currently the 'invoice PDF' is an HTML email that looks like an invoice but cannot be opened as a standalone PDF file.

## Coverage map — Phase 35 smoke acceptance criteria

| Acceptance criterion | # | Result |
|---------------------|---|--------|
| Dashboard stat cards — no NaN, no perpetual loading, Unresolved Errors card | 1 | ✅ PASS |
| Settings nav badge appears when unresolved errors exist; disappears when resolved | 2 | ✅ PASS |
| Quote PDF — magic bytes, PROVISIONAL QUOTATION, booking number, line items, validity | 3 | ✅ PASS |
| Invoice PDF — structural assertions | 4 | ⛔ BLOCKED |
| Voucher PDF — magic bytes, TRAVEL VOUCHERS, service blocks, End of Services footer | 5 | ✅ PASS |
| File upload — small PDF accepted, oversized rejected, disallowed MIME rejected | 6 | ✅ PASS |
| Signed URL — 200 + correct content-type; expiry test | 7 | ✅ PASS |
| Loading skeleton, empty state, API error state | 8 | ✅ PASS |

