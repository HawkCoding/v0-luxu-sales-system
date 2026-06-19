# Consultant Role — End-to-End QA Findings (Phase 33 UAT)

- **Run date:** 2026-06-02T09:29:05.445Z
- **Branch:** wip/pre-demo-local-v2
- **Commit SHA:** 22e36e4
- **Browser:** Chromium (Playwright `Desktop Chrome`)
- **Acting role:** Consultant — leonie@luxustravel.co.za (clearance_level=consultant)
- **Base URL:** http://localhost:3000 (local dev + local Supabase)

**Result:** 11 PASS · 0 FAIL · 0 BLOCKED (of 11 criteria)

## Per-criterion results

| # | Title | Result | Evidence |
|---|-------|--------|----------|
| 1 | Find new enquiries (Needs-Review filter) | PASS | /app/enquiries renders for consultant; filter chips incl. 'Needs Review' present; Filter shows seeded needs-review booking RR-2026-0033 with destructive badge; Enquiry queue + Needs-Review filter behave correctly; `screenshots/c1-needs-review.png` |
| 2 | Claim a job (Take ownership) | PASS | claimed_by_user_id=00000000-0000-0000-0000-0000000000a2; audit action=job_claimed; Release button visible; Claim sets claimed_by_user_id, writes audit row, UI flips to Release; `screenshots/c2-after-claim.png` |
| 3 | Release own claimed job | PASS | claimed_by_user_id cleared; audit action=job_released; Claim button visible again; Release clears claimed_by_user_id and writes audit row; `screenshots/c3-after-release.png` |
| 4 | Start quote on a complete enquiry | PASS | Draft quote RR-2026-0033-Q1 created (status=draft); booking stage=enquiry; pipeline entry happens at quote-send (C7); Draft quote created from a complete enquiry; pipeline entry correctly at quote-send; `screenshots/c4-after-start-quote.png` |
| 5 | Edit a parsed enquiry field | PASS | Adults 2→3 persisted; audit 'enquiry_field_updated' before={"noOfAdults":2,"noOfSuites":1,"noOfChildren":0,"departureDate":"2026-08-15"} after={"noOfAdults":3,"noOfSuites":1,"noOfChildren":0,"departureDate":"2026-08-15"}; Field saved and audit captured before/after; `screenshots/c5-after-field-edit.png` |
| 6 | Generate a quote (PDF document row) | PASS | quote_pdf document created (status=generated, path=quotes/RR-2026-0032-Q1/quote-RR-2026-0032-Q1.pdf); quotes.pdf_document_id=edb10638-a18c-4c2e-a2a2-025916ce3f98; Quote PDF document row created and linked to quotes.pdf_document_id; `screenshots/c6-after-pdf.png` |
| 7 | Send the quote email | PASS | Send flow outcome=pass (Quote sent via QuotePreviewSendDialog); HTTP 200; correspondence row status=sent (kind=quote); rows 0→2; Quote email recorded as sent; `screenshots/c7-after-send.png` |
| 8 | Record a payment (deposit invoice) | PASS | POST /api/payments → HTTP 200; payments 0→1; balance 189750→188750; Payment recorded; balance updated from 189750 to 188750; `screenshots/c8-after-record.png` |
| 9 | Upload proof of payment | PASS | proof_of_payment doc qa-proof-of-payment.pdf created; signed URL retrievable (fetch HTTP 200); Proof uploaded; document row + signed URL retrievable; `screenshots/c9-after-upload.png` |
| 10 | Generate voucher when gates pass | PASS | voucher RR-2025-0006 + voucher_pdf document (status=generated) created for RR-2025-0006; Voucher + PDF generated when gates pass; `screenshots/c10-after-voucher.png` |
| 11 | Voucher blocked when gates fail | PASS | Non-zero balance → HTTP 422: "The invoice balance must be zero before generating a voucher."; Missing departure date → HTTP 422: "A departure date is required before generating a voucher."; Voucher correctly blocked (422) with clear errors for both gate failures; `screenshots/c11-blocked-evidence.png` |

## Findings

_No findings recorded._
## Improvement recommendations (prioritised)

1. Align quote status semantics with the UAT wording: document clearly that quote 'ready' is a pricing-completeness state, not a side effect of PDF generation, to avoid future UAT confusion.
2. Consider surfacing the 'Claimed by' row on the /app/enquiries list cards so consultants can see at a glance whether a job is taken before navigating to it.
3. The 'Owner' row in the header still shows the original creator (owner_user_id). Now that claimed_by_user_id is the active working axis, consider renaming or removing the 'Owner' display to avoid confusion.

## Coverage map — todo.md Phase 33 Consultant UAT

| todo.md bullet | Criterion | Demonstrably passing? |
|----------------|-----------|------------------------|
| Can find new enquiries | 1 | ✅ Yes |
| Can claim jobs | 2 | ✅ Yes |
| Can release own claimed jobs | 3 | ✅ Yes |
| Can start quote | 4 | ✅ Yes |
| Can edit missing fields | 5 | ✅ Yes |
| Can generate quote | 6 | ✅ Yes |
| Can send quote email | 7 | ✅ Yes |
| Can record payment | 8 | ✅ Yes |
| Can upload proof of payment | 9 | ✅ Yes |
| Can generate voucher when gates pass | 10 | ✅ Yes |
| Cannot generate voucher when gates fail | 11 | ✅ Yes |

