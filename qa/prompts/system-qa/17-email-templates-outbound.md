# QA 17 — Email Templates, Signatures & Outbound Correspondence

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Templates drive every email the system sends. This pass verifies template
editing, token rendering, signatures, attachments, the preview-and-send flow, the
sender resolution chain, and the correspondence log — including the correctness
of what a customer actually receives.

Locally, mail goes to Mailpit (or the configured fallback). Read the sent
messages there rather than trusting the UI's "sent" badge.

## Prerequisites

QA 11–14 (all four send flows exercised at least once: quote, deposit invoice,
payment confirmation, voucher). Run as admin/manager — `view:templates` is
admin+manager.

## Surfaces under test

- [app/app/templates/page.tsx](../../../app/app/templates/page.tsx) — tabs `emails`, `guest-docs`, `billing-docs`, `branding`
- [components/email-appearance-settings-editor.tsx](../../../components/email-appearance-settings-editor.tsx), [components/email-attachment-library-editor.tsx](../../../components/email-attachment-library-editor.tsx)
- [app/app/settings/email-signatures/page.tsx](../../../app/app/settings/email-signatures/page.tsx) — tabs `brands`, `defaults`; [components/signature-brand-editor.tsx](../../../components/signature-brand-editor.tsx), [components/email-signature-settings-editor.tsx](../../../components/email-signature-settings-editor.tsx)
- [app/api/templates/route.ts](../../../app/api/templates/route.ts), [app/api/templates/[id]/route.ts](../../../app/api/templates/[id]/route.ts), [app/api/templates/preview/route.ts](../../../app/api/templates/preview/route.ts)
- [app/api/correspondence/route.ts](../../../app/api/correspondence/route.ts) — the outbound hub; [app/api/correspondence/[id]/route.ts](../../../app/api/correspondence/[id]/route.ts)
- [lib/templates/registry.ts](../../../lib/templates/registry.ts), [compose-email.ts](../../../lib/templates/compose-email.ts), [render.ts](../../../lib/templates/render.ts), [get-template.ts](../../../lib/templates/get-template.ts), [resolve-shared-tokens.ts](../../../lib/templates/resolve-shared-tokens.ts)
- Blocks: `lib/templates/{guest-info-block,suite-description,signature-slot,content-slot}.ts`
- [lib/email/resolve-sender.ts](../../../lib/email/resolve-sender.ts), [transport.ts](../../../lib/email/transport.ts), [smtp-transport.ts](../../../lib/email/smtp-transport.ts), [signature.ts](../../../lib/email/signature.ts), [render-signature.ts](../../../lib/email/render-signature.ts), [signature-brands.ts](../../../lib/email/signature-brands.ts)
- [components/preview-and-send-dialog.tsx](../../../components/preview-and-send-dialog.tsx), [components/job-correspondence-tab.tsx](../../../components/job-correspondence-tab.tsx), [app/app/correspondence/page.tsx](../../../app/app/correspondence/page.tsx)
- Salesperson SMTP: `app/api/settings/salesperson-credentials/*`, [components/salesperson-credentials-settings.tsx](../../../components/salesperson-credentials-settings.tsx)

## Checks

### The ten system templates

`lib/templates/registry.ts` defines: `quote_email`, `follow_up`,
`reservation_received`, `deposit_request`, `full_payment_request`,
`payment_received`, `final_invoice`, `payment_reminder`, `voucher_email`,
`thank_you`.

1. For **each** of the ten: open its editor, render `POST /api/templates/preview`
   with the registry's sample tokens, and confirm **every token resolves**. A
   visible `{{token}}` in a preview is Sev-2 — list each one individually.
2. Edit a template's body and subject, save, reload, persisted, and the preview
   reflects the edit.
3. **System templates are protected from deletion** — `DELETE /api/templates/{id}`
   on a system template must be refused.
4. Create a custom template, use it, then delete it — deletion works for custom
   templates.
5. Shared token blocks: `guest-info-block`, `suite-description`,
   `signature-slot`, `content-slot`. Confirm each renders inside a template and
   that `resolve-shared-tokens.ts` fills them from real booking data, not sample
   data, when sending for real.
6. A template referencing a token that does not exist → renders as empty or
   raises a clear error; never emits the literal token to a customer.

### Appearance & signatures

7. Email Appearance editor — change colours/spacing/header, then send a real
   email and confirm the received HTML reflects it.
8. Signature **brands** tab: create a brand, upload a badge and a banner
   (`/api/settings/signature-brands/[id]/badges`, `/banner`), assign it, and
   confirm it renders in a sent email. Brand editor extras are `role === "admin"`
   — confirm manager sees the reduced form.
9. Signature **defaults** tab: shared defaults apply when a user has no brand.
10. `POST /api/email-signature/render` returns the HTML signature; compare it
    against what actually arrives in the sent message.
11. Delete a signature brand that is in use → blocked or gracefully degraded, no
    broken images in already-sent mail.

### Attachment library

12. `/api/settings/email-attachments` — add a reusable attachment, edit it,
    delete it. Attach one to a real send and confirm it arrives.
13. Attach a library file plus a generated PDF (quote) in one send — both arrive,
    both open.

### Sender resolution

14. `lib/email/resolve-sender.ts` chain: **salesperson SMTP credential → profile
    email → fail**. Construct all three:
    - a consultant with configured SMTP credentials → sends as them,
    - a consultant with none → falls back to the profile email,
    - a consultant with neither → the send **fails cleanly** rather than sending
      from an arbitrary address. Sending as the wrong identity is Sev-1.
15. `POST /api/settings/salesperson-credentials/test` with good and bad
    credentials → clear result, no password echoed back.
16. Confirm the stored SMTP password is encrypted at rest (read the row).
17. `isFallbackSendingUnavailable()` — confirm the production fail-fast logic
    exists and that locally the Mailpit/Resend fallback is what is being used.
    Record which transport actually handled each test send.

### Preview & send

18. The Preview & Send dialog: `preview` ↔ `edit` round-trip. Edit the body in
    the edit tab, return to preview, confirm the edit is shown, then send and
    confirm the **edited** version is what arrives. An edit lost on send is
    Sev-1 — this is the whole point of an editable preview.
19. Send each of the four client-facing flows via
    `qa/lib/send-flows.ts`: `tryQuotePreviewSend`,
    `tryGenerateAndSendDepositInvoice`, `trySendPaymentConfirmation`,
    `tryGenerateAndSendVoucher`. For each, open the received message and check
    subject, greeting, body, signature, attachments.
20. Send to a customer with a missing email → blocked before composing, with a
    clear message.
21. `POST /api/correspondence` with `moveStage` — confirm a send can drive a
    stage transition through validate + applyTransition, and that a **failed
    send does not move the stage**. A stage advanced on a failed send is Sev-1.

### Scheduled queue & log

22. Dashboard scheduled-email queue (`app/app/page.tsx`): a prepared email (e.g.
    the reservation acknowledgement from QA 10) appears. **Send** it from the
    queue → it goes and leaves the queue.
23. **Cancel** a queued email → it does not send and is marked cancelled.
24. `GET/PATCH /api/correspondence/{id}` — load a scheduled draft, edit it, then
    send; the edit is what arrives.
25. `/app/correspondence` log shows sent, failed and scheduled with accurate
    statuses. Force a failure (bad SMTP credential) and confirm it appears as
    **failed** with a usable reason — a failure silently logged as sent is Sev-1.
26. The booking's Emails Sent tab shows the same records, scoped to that booking.
27. Correspondence kinds are set correctly (`invoice`, `voucher`,
    `payment_received`, …) — QA 12's gates depend on the kind and subject
    matching, so a mislabelled kind silently breaks a stage gate.

## Probes

- Send the same email twice rapidly → two messages or one? A duplicate customer
  email is Sev-2.
- A template body containing HTML injection (`<script>`) → escaped, not executed
  in the preview.
- A very long body and a body with emoji/accents → encoding correct in the
  received message.
- `POST /api/templates` as consultant → 403.
- Send with the customer's email set to an invalid address → clean failure
  recorded, not a silent drop.

## Report

`qa/reports/system-qa/{date}-17-email-templates-outbound.md`

Extra sections:

- **Template matrix**: the ten system keys × (preview renders? · all tokens
  resolved? · unresolved tokens listed · real send checked?).
- **Received-message checklist** for each of the four client flows: subject,
  from address, signature present, attachments present and openable.
- **Sender resolution table**: scenario · resolved sender · transport used ·
  outcome.

## Acceptance

- All ten system templates previewed with the token results recorded.
- Checks 14, 18, 21 and 25 conclusive — these are the ones where a customer gets
  the wrong thing or the system lies about having sent it.
- Every test send verified by reading the actual received message, not the UI.
