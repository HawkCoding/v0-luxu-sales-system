# Step 10d — Administrator Guide, Chapter 4: Templates and branding

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/admin/04-templates-and-branding.md`
**Screenshot slugs:** `a04-*` · new describe block `admin templates`

## Scope

Everything that controls how the business looks to a client: email wording, signatures,
and the design of the quote, invoice and voucher documents.

## Source of truth — read these

- `app/app/templates/page.tsx` — the four tabs
- `lib/templates/registry.ts` — every template key and every merge token
- `components/voucher-template-editor.tsx`, `app/api/voucher-template/route.ts`
- `app/api/settings/document-brand/route.ts`, `/document-text/route.ts`,
  `/brand-logo/route.ts`, `/app-logo/route.ts`, `/email-appearance/route.ts`
- `app/app/settings/email-signatures/page.tsx`,
  `app/api/settings/signature-brands/route.ts`
- `app/api/settings/email-attachments/route.ts`
- `lib/pdf/brand-block.tsx`, `lib/pdf/document-fonts.ts`

## Must cover

1. **Email templates** — the full list of templates by their user-facing names, when each
   one is sent, and who sends it (a person, or the system).
2. **Merge tokens** — a reference table of every available token and what it resolves to.
   Take this from `lib/templates/registry.ts`, not from memory.
3. **Editing and previewing a template** — and the crucial point that a consultant can edit
   the body at send time for that send only; the template is the default, not a lock.
4. **Email appearance** — colours, layout, logo.
5. **The attachment library** — adding a standard attachment and how a consultant picks it.
6. **Email signatures and signature brands** — per-person signatures, brand badges and
   banners, and defaults.
7. **Voucher design** — the voucher template editor: header text, product line, accent
   colour, section background, font, section order, hidden sections, footer details.
   Note that the layout follows the client's approved reference in
   `docs/voucher-reference/`.
8. **Quote and invoice wording** — the editable text blocks and where each appears.
9. **Branding** — the application logo and the document logo, and that they are different.
10. **Previewing a document before it goes to a client** — the PDF preview for each of the
    five document types, and that it uses sample data.

> [!TIP]
> Always preview after changing anything on this page. A template change affects every
> booking from that point on.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `a04-templates-emails` | The Emails tab with a template open |
| `a04-tokens` | The merge-token reference in the editor |
| `a04-voucher-design` | The voucher design editor |
| `a04-branding` | The Branding tab |
| `a04-pdf-preview` | A PDF preview of the voucher |

## Done when

- The token table matches `lib/templates/registry.ts` exactly.
- Every tab on the Templates page is covered.
