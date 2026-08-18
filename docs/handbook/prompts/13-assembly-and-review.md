# Step 13 — Assembly, remaining documents and final review

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** high
**Output:** `docs/handbook/content/troubleshooting.md`,
`docs/handbook/content/quick-reference.md`, and the built PDFs in `docs/handbook/dist/`.

## Scope

Write the two documents that can only be written once everything else exists, then build
and review the whole set.

## Part 1 — Troubleshooting and FAQ

Do not invent problems. Build this from what Steps 2–11 actually surfaced: every gate that
blocks a stage move, every "this is disabled until…" tooltip, every readiness warning, and
every place the documentation had to say "this is not built yet".

Structure it as symptom → cause → fix, phrased the way a consultant would say it:

- "The system will not let me move this booking forward."
- "I cannot see the Generate Travel Voucher button."
- "Record Payment is greyed out."
- "The client says the quote total is wrong."
- "The voucher shows the old flight time."
- "I sent the quote to the wrong address."
- "A customer appears twice."
- "I cannot see Settings / Reporting / Templates."
- "The invoice number field will not save."
- "My session logged me out and I lost what I was typing."

Close with a short "when to escalate" section: what to gather before reporting a problem —
booking number, what you clicked, what the message said, and the time.

## Part 2 — Quick Reference Card

Two pages, no more. Designed to be printed and kept at the desk.

- Page 1: the nine stages down the page, and for each one — what has to be true before you
  can leave it, and the one action that moves it forward.
- Page 2: a compact gate table (blocker → where to fix it), and a short glossary of the
  terms that are specific to this system.

No screenshots. No prose paragraphs. It is a card, not a chapter.

## Part 3 — Build and review

1. `pnpm docs:build` — all seven PDFs, zero missing screenshots, zero orphans.
2. Open every PDF and check: cover, table of contents page numbers, no heading stranded at
   the foot of a page, no figure crossing a page break, no table split awkwardly.
3. **Consistency sweep.** One term per concept across all documents. Decide and enforce:
   booking versus job, stage versus status, consultant versus salesperson, voucher versus
   travel voucher. Fix every deviation. The codebase itself is inconsistent here — the
   documents must not be.
4. **Contradiction sweep.** Anything Chapter 6 says about invoices must match what
   Chapter 8 says about the invoice gates.
5. **Secrets sweep.** Search the built Markdown for `http`, `://`, `password`,
   `@luxustravel.co.za` and `KEY`. Anything found that is not a deliberate service name
   comes out.
6. Mark `docs/demo-prep/runbook.md` as superseded with a one-line note at its top, so it
   stops contradicting the handbook.

## Done when

- Seven PDFs exist in `docs/handbook/dist/`.
- The consistency and secrets sweeps are both clean.
- You can hand the Consultant Handbook to someone who has never seen the system and they
  can complete a booking with it.
