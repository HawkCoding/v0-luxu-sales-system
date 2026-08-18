# Step 10e — Administrator Guide, Chapter 5: Importing data

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/admin/05-data-import.md`
**Screenshot slugs:** `a05-*` · new describe block `admin import`

## Scope

Bringing existing customers and historical bookings into the system without creating a mess.

## Source of truth — read these

- `app/app/settings/customer-import/page.tsx`
- `components/customer-import-dialog.tsx` — parsing, review, chunked import, retry
- `components/import-conflict-resolution-modal.tsx`
- `app/api/customers/import/route.ts`, `app/api/customers/import/check/route.ts`
- `app/api/customers/detect-match/route.ts`

## Must cover

1. **What the import does and does not do** — customers plus historical bookings; it does
   not create quotes, invoices or payments.
2. **Preparing the file** — the exact expected columns, which are required, accepted date
   formats, and what happens to a column the system does not recognise. Take this from the
   parser, not from a guess.
3. **Running the import** — pasting or uploading, the review table, removing rows before
   committing.
4. **Duplicate detection** — how a match is decided and the options in the conflict modal.
5. **Chunked import and retries** — why a large file imports in batches, and what to do when
   one batch fails.
6. **Checking the result** — where to verify the imported customers and bookings landed.

> [!WARNING]
> Import into a test environment first if the file is large or its provenance is uncertain.
> There is no bulk undo.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `a05-import-page` | The customer import page |
| `a05-review-table` | The parsed review table |
| `a05-conflict` | The duplicate-conflict modal |

## Done when

- The column list is copied from the parser and a reader could build a valid file from it
  alone.
