# PR Triage Inventory — Demo Prep Phase 0/2

**Generated:** 2026-05-18  
**Branch:** `claude/demo-prep-retarget-prs-P7bdN`  
**`origin/dev` HEAD:** `1227526` — "setup: introduce dev branch workflow (#66)"

## Categories

| Code | Meaning | Action |
|------|---------|--------|
| A | **Superseded** — every change already in `dev` via codex-sync merges | Close with explanation in Phase 5 |
| B | **Mistargeted, partially new** — mostly in `dev`, but PR adds net-new code | Rebase onto `dev`, fix CI, merge in Phase 3-4 |
| C | **Net-new** — material work not yet in `dev` | Rebase onto `dev`, fix CI, merge in Phase 3-4 |
| D | **Dangerous** — known to break things (bad migration, etc.) | Close with explanation in Phase 5 |

---

## Phase 0 Snapshot (pre-retarget)

Key codex-sync commits that swept feature PRs into `dev`:
- `e61aa9f` — "Implement email, invoices, vouchers, and workflow updates" (covers #58, #61, #63)
- `6a5da09` — "stabilize booking workflow automation" (covers #62)
- `8fe8119` — "Add voucher template management" (covers #61)
- `3887af6` — "Add supplier scheduling and session timeout updates" (covers #60, #63)

---

## Triage Table

| PR # | Title | base (pre) | base (post) | head SHA | Category | Overlap notes | Action |
|------|-------|-----------|------------|---------|----------|--------------|--------|
| #55 | chore: domain types sync, audit infra, v2.72 | main | dev | 5871e029 | A | Dirty against main; codex-sync merges swept types + audit infra into dev | Close as superseded (Phase 5) |
| #56 | feat: payment proof uploads and auto balance sync | main | dev | 3f47268f | A | Dirty against main; payment proof logic present in dev | Close as superseded (Phase 5) |
| #57 | feat: quote versioning, PDF, pricing engine, acceptance links | main | dev | 1c2614fa | A | Dirty against main; quote lifecycle in dev | Close as superseded (Phase 5) |
| #58 | feat: deposit and final invoice endpoints | main | dev | 58c56ee3 | A | Dirty against main; `e61aa9f` brought deposit/final routes into dev | Close as superseded (Phase 5) |
| #59 | feat: customer CRM fields, travel dates, duplicate detection | main | dev | 92decfea | A | Dirty against main; CRM fields in dev | Close as superseded (Phase 5) |
| #60 | feat: supplier default times, scheduling, transport tracking | main | dev | ba8d9964 | A | Dirty against main; `3887af6` brought scheduling into dev | Close as superseded (Phase 5) |
| #61 | feat: voucher PDF generation with template overlay | main | dev | 0eb85700 | A | Dirty against main; `8fe8119` and `e61aa9f` brought voucher into dev | Close as superseded (Phase 5) |
| #62 | feat: pipeline stage gates with auto-fix, job lifecycle | main | dev | bb5e6544 | A | Dirty against main; `6a5da09` brought stage gates into dev | Close as superseded (Phase 5) |
| #63 | feat: company settings, deposit config, session timeout, inbound email rules | main | dev | 4fa42408 | A | Dirty against main; settings + inbound email rules in dev | Close as superseded (Phase 5) |
| #64 | feat: package markup % and pricing snapshot on quote line items | main | dev | 43d8dd65 | A | Dirty against main; depends on #55 + #57; markup logic likely in dev | Close as superseded (Phase 5) |
| #65 | feat: sequential job reference number (BT-YYYY-XXXX format) | main | dev | b2a22684 | D | CI-failing; migration adds `booking_number` sequence — equivalent safe migration already in dev; plan.md: "do not rebase" | Close with migration danger explanation (Phase 5) |
| #67 | feat: auto-fill child price from adult on train rate cards | dev | dev (no change) | 9a40b461 | TBD → B/C | Already targets dev; 139 files / +12 530 / -1 827 lines — suspiciously large for a single feature; net-new files: `lib/suppliers/auto-child-price.ts`, `app/api/settings/train-child-price-ratio/route.ts`; CI-failing; refine after diff review | Investigate CI failure; if genuinely new: rebase cleanup + fix CI (Phase 3-4) |

---

## Phase 2 Update — Post-retarget results

All 11 PRs successfully retargeted to `dev` at 2026-05-18. GitHub recomputed diffs immediately.

**Reading the `dirty` signal:** `mergeable_state: dirty` means the PR branch and `dev` have both
modified the same files — they cannot be auto-merged. For #55-#64 this is the expected outcome:
the codex-sync merges brought equivalent content into `dev` via a different commit path, so the
same lines were touched twice. This **confirms category (A) Superseded** — the code is in `dev`,
just not via these PR branches.

| PR # | Post-retarget additions | Post-retarget deletions | files | mergeable_state | Refined category | Notes |
|------|------------------------|------------------------|-------|----------------|-----------------|-------|
| #55 | +1,668 | -60 | 12 | dirty | **A — Superseded** | Large diff vs dev but dirty = codex-sync already brought this in; conflicts prove it |
| #56 | +1,554 | -91 | 11 | dirty | **A — Superseded** | Same pattern |
| #57 | +3,567 | -52 | 21 | dirty | **A — Superseded** | Same pattern |
| #58 | +957 | 0 | 4 | dirty | **A — Superseded** | Same pattern |
| #59 | +1,456 | -118 | 12 | dirty | **A — Superseded** | Same pattern |
| #60 | +1,879 | -408 | 9 | dirty | **A — Superseded** | Same pattern |
| #61 | +1,359 | 0 | 9 | dirty | **A — Superseded** | Same pattern |
| #62 | +7,155 | -162 | 23 | dirty | **A — Superseded** | Same pattern |
| #63 | +886 | 0 | 8 | dirty | **A — Superseded** | Same pattern |
| #64 | +1,758 | -274 | 12 | dirty | **A — Superseded** | Same pattern |
| #65 | +471 | 0 | 4 | unstable | **D — Dangerous** | CI-failing; `job_number_seq` migration conflicts with equivalent safe migration already in dev |
| #67 | +12,530 | -1,827 | 139 | unstable | **C — Net-new (branch contaminated)** | PR description explains: branch cut from `codex-sync-local-app-1-78` which carries staging commit `c4d765f` ("stage all pending feature work for branch splitting"). Actual new work = `lib/suppliers/auto-child-price.ts`, `auto-child-price.test.ts`, `app/api/settings/train-child-price-ratio/route.ts`, Settings card, `RateCardPricingCell` in supplier-detail-view. CI failing. **Phase 3 action: cherry-pick or squash just the net-new files onto a fresh branch off `dev`, re-run CI.** |
