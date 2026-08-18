# Step 7 — Consultant Handbook, Chapter 6: Invoicing and payments

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** high
**Output:** `docs/handbook/content/consultant/06-invoicing-and-payments.md`
**Screenshot slugs:** `06-*` · new describe block `ch06 invoicing`

## Scope

Money. Invoice out, payments in, balance to zero.

## Source of truth — read these

- `app/app/jobs/[id]/page.tsx:804-841` — the invoice number field
- `components/generate-deposit-invoice-dialog.tsx` — pay-in-full switch, deposit %, due date
- `components/preview-and-send-dialog.tsx` — the shared send dialog
- `components/job-payments-tab.tsx` — Record Payment
- `components/send-payment-confirmation-button.tsx`
- `components/send-payment-reminder-button.tsx`
- `lib/invoices/build-invoice-view.ts`, `lib/bookings/invoice-number.ts`
- `lib/pipeline/validate-transition.ts:287-381` — every invoice and payment gate
- `lib/pipeline/constants.ts` — the default deposit percentage

## Must cover

1. **The one-invoice model.** There is no separate final invoice. One invoice is issued and
   then **amended in place** as things change. Open the chapter with this — a consultant
   arriving from another system will look for a "final invoice" button that does not exist.
2. **The invoice number** — the consultant types it on the booking header, it is the
   client-facing number and the bank reference, and it must be filled in before the deposit
   invoice can go out.
3. **Generating the invoice** — **Generate Invoice**. The **Pay in full** switch and the
   fact that it defaults on when departure is inside 60 days. The deposit percentage field
   and where its default comes from. The due date when paying in full.
4. **Preview and send** — the invoice PDF is attached automatically. Sending moves the
   booking to Deposit Invoice Sent. WARNING callout.
5. **Changing your mind before sending** — the resume state, and **Change amount**, which
   voids the draft and reopens the form.
6. **Amend and Resend** — after a quote revision, the button changes and re-issues the same
   invoice at the new total, keeping payments already received on record. Explain what the
   client sees.
7. **Recording a payment** — date, amount in the booking currency, method (EFT, Credit
   Card, Credit Adjustment), reference, notes. Note that **Record Payment** is disabled
   until the deposit invoice has been sent, and what the tooltip says.
8. **Send payment confirmation** — what it attaches, and that sending it is what advances
   the stage: from Deposit Invoice Sent to Deposit Paid, and from Deposit Paid to Paid in
   Full. This is the mechanism, not a courtesy email.
9. **Chasing** — **Send reminder** per sent invoice, and that reminder history is recorded.
10. **Where the balance shows** — Total Received on the Payments tab, paid-versus-quoted on
    the Bookings list, the payment-status colour dot and legend on the Pipeline board.

> [!STOP]
> The global **Payments** page in the sidebar lists payments across bookings, but its
> **Add Payment** and **Import Payments** buttons are not wired up
> (`app/app/payments/page.tsx:68-95`, `:246`). Record every payment on the booking's own
> **Payments** tab. Verify this is still true before you publish — if it has been fixed,
> document the page properly instead.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `06-invoice-number` | The invoice number field on the booking header |
| `06-generate-invoice` | The Generate Invoice dialog |
| `06-preview-send-invoice` | Preview and send with the PDF attached |
| `06-record-payment` | The Record Payment dialog |
| `06-payment-confirmation` | The payment confirmation preview |
| `06-balance` | A booking showing paid versus quoted |

## Done when

- The chapter never uses the phrase "final invoice" as though it were a separate document.
- Every stage move caused by sending an email is called out where it happens.
