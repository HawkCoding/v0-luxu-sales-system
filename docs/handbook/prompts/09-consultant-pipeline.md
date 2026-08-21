# Step 9 — Consultant Handbook, Chapter 8: Pipeline, stage gates and the lost path

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** high
**Output:** `docs/handbook/content/consultant/08-pipeline-and-gates.md`
**Screenshot slugs:** `08-*` · new describe block `ch08 pipeline`

## Scope

The stage machine, every gate that can stop a move, and the lost or cancelled branch.
This chapter is the reference the whole handbook points back to.

## Source of truth — read these

- `lib/types.ts` — `PIPELINE_STAGES`, the legacy aliases, the Kanban column subset
- `lib/pipeline/validate-transition.ts` — every gate, in full. Read all of it.
- `lib/pipeline/apply-transition.ts` — what a successful move changes
- `lib/pipeline/pending-send-action.ts` — when the app opens a send dialog instead
- `components/stage-transition-modal.tsx` — the modal, its badges, deep links, auto-fixes
  and the manager override
- `app/app/pipeline/page.tsx` — the board, drag and drop, the per-card move select
- `components/booking-stage-stepper.tsx`
- `app/app/jobs/[id]/page.tsx:1269-1342` — the Set Outcome dialog

## Must cover

1. **The nine stages** — in order, with what each one means commercially. Note that the
   Kanban board shows six of them and why.
2. **Moving a booking** — dragging on the board, the per-card **Move to** select, and the
   **Back** and **Next** buttons on the booking.
3. **Backward moves are never blocked.** Say it plainly; it is the safety valve.
4. **The gate table.** One row per gate: what triggers it, what it says, and exactly what to
   do about it. Cover all of them — customer complete, import review, quote sent, quote
   sent or accepted, reservation form received, invoice number, invoice document, invoice
   emailed, deposit received, final invoice, final invoice emailed, final payment
   confirmation, voucher document, voucher emailed, cancellation reason, refund capture.
   This table is the single most useful page in the handbook. Get every message right.
5. **Reading the modal** — the "Needs action" / "Confirmation" / "Not sent yet" badges, the
   **Go to … tab** deep links, the inline send buttons, and **Fix and continue** for the
   gates the system can resolve itself.
6. **When the modal does not appear** — if the only thing outstanding is an unsent document,
   the app opens the send dialog directly. Explain this so it does not feel like a glitch.
7. **Override gates** — that any role including consultants can use it, that it starts
   collapsed, that it requires a reason, and that it is recorded against the actor's name.
8. **What a successful move changes** — timestamps, the quote flipping to accepted, deposit
   paid being set, balance zeroing, outcome being set to Won at Voucher Sent.
9. **The lost and cancelled branch** — the Outcome pill, the Set Outcome dialog, the
   required reason, **Cancel Booking**, and refund capture (status, and when refunded also
   amount, reference and date).

## Screenshots to capture

| Slug | Shows |
|---|---|
| `08-pipeline-board` | The Kanban board with cards across columns |
| `08-stage-stepper` | The stage stepper on a booking |
| `08-gate-modal` | The "One more step first" modal with a real blocker |
| `08-fix-and-continue` | A modal offering Fix and continue |
| `08-override` | The manager override reason box |
| `08-set-outcome` | The Set Outcome dialog with a reason chosen |
| `08-refund-capture` | Refund capture on a lost booking |

## Done when

- Every gate in `validate-transition.ts` appears in the table. Count them and check.
- Each gate row tells the reader which tab to go to and what to do there.
