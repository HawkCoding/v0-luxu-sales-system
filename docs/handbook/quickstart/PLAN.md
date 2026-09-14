# Quick-Start Training Pack — build plan

Agreed with the user 2026-09-13 20:46. Execution starts **2026-09-14 01:46** (5 hours later,
after the Claude usage limit resets). Until then the session wakes hourly to confirm
prerequisites are still healthy; it does not start building early.

## Goal

Lean, simple training material for two consultants. Basics only: how to take a booking from
**New Enquiry** through the pipeline to **Closed**, and how to pick up an enquiry that is
already sitting in the list. Nothing advanced — no admin config, no reporting, no edge cases.

Two deliverables:

1. **PDF** — pictures with short text under each. Click-by-click.
2. **Videos** — 8 short silent screen recordings with large on-screen step captions and a
   highlighted click target.

## Decisions (from the user, do not re-litigate)

| Question | Answer |
|---|---|
| Environment | **Local demo database only.** Never hosted dev, never production. |
| Video shape | 3–4 short clips per run, **two runs**: one for **The Blue Train**, one for **Rovos Rail**. ~8 clips total. |
| Narration | No voice. On-screen captions only. |

Both suppliers already exist in `supabase/seed.sql`:
- `The Blue Train` — `002b438f-df83-483a-9274-f17e9fef7f35`
- `Rovos Rail` — `d6de79b1-07f9-4d5d-a122-35df6e7b93e6`

## What already exists (reuse, do not rebuild)

- `docs/handbook/` — full documentation programme, already produces
  `dist/consultant-handbook.pdf` (8 chapters, ~950 KB). **Too long for this job**, but its
  prose is the source of truth for what each step does. Mine it; do not re-derive.
- `scripts/build-handbook.mjs` + `docs/handbook/handbook.config.mjs` — Markdown → HTML →
  Chromium `page.pdf` pipeline. Add a new document entry, do not invent a new build.
- `docs/handbook/theme/print.css` — the print stylesheet.
- `tests/qa/handbook-shots.{config,setup,fixtures,spec}.ts` — Playwright screenshot capture
  against the local demo DB, with per-role storage state. `shot()` and `redact()` helpers.
- `docs/handbook/screenshots/*.png` — ~25 figures already captured (login, dashboard,
  build-booking steps 1–3, quote lines, preview/send, invoice, payment, voucher).
  **Check these first** — several may be reusable as-is.
- Demo users: `leonie@luxustravel.co.za` (consultant), `dirk@…` (manager),
  `carmen@…` (admin), all `password123`.
- `ffmpeg` is installed at `C:\Users\Hancke\tools\ffmpeg\bin\ffmpeg.exe` — use it to convert
  Playwright's `.webm` output to `.mp4`.
- Docker is running; local Supabase is the capture target.

## Prerequisites — ALREADY DONE 2026-09-14 06:50, do not re-run

```
docker info                # ok, 29.5.2
pnpm db:start              # ok
pnpm db:reset              # ok, all migrations + seed.sql + seed-prod-config.sql applied
pnpm dev                   # already running on :3000 (pre-existing session, PID 6908)
```

### IMPORTANT — `pnpm db:seed:demo` is broken, skip it

`supabase/seed-demo.sql` is stale: it inserts `bookings.package_id`, and both that column
and the whole `packages` table are gone from the current schema. It fails with
`ERROR: column "package_id" of relation "bookings" does not exist`.

**Do not try to fix it** — out of scope for this job. The base `seed.sql` applied by
`db:reset` is production-sourced and current, and is richer than the demo overlay anyway:

- 19 customers, 97 routes, 846 rate cards
- 9 bookings, one at every stage: `enquiry`(1), `quote_sent`(1), `accepted`(1),
  `deposit_requested`(1), `deposit_paid`(1), `final_paid`(1), `voucher_sent`(1), `closed`(2)
  — the single `enquiry` row is the one to use for "pick up an enquiry already in the list"
- Suppliers: `Blue Train` `002b438f-df83-483a-9274-f17e9fef7f35`,
  `Rovos Rail` `d6de79b1-07f9-4d5d-a122-35df6e7b93e6`, both `train_operator`, both active
- Users all present and active: `leonie@` consultant, `dirk@` manager, `carmen@` admin,
  plus `douwlien@` and `monade@` consultants. Password `password123`.

Note for the final report to the user: `seed-demo.sql` needs repairing in a later session.

There is no `packages` table any more — the product catalogue is `suppliers` + `routes` +
`rate_cards`, and a booking's products hang off `booking_services` / `booking_service_units`.
Any chapter prose or spec copied from the older handbook that says "package" must be checked
against the current UI wording before it goes in the guide.

## Agent 1 — Quick-Start PDF (runs first)

Produces `docs/handbook/dist/quick-start-guide.pdf`.

1. Read `docs/handbook/content/consultant/01,03,04,06,07,08*.md` for accurate step wording.
2. Write `docs/handbook/content/quickstart/01-quick-start.md` — one chapter, target **12–18
   printed pages**. Structure: numbered step, one screenshot, two or three sentences of plain
   English under it. No tables of options, no "advanced" callouts, no edge cases.
   Sections, in order:
   - Logging in and what you are looking at (dashboard + sidebar)
   - Picking up an enquiry that is already in the list
   - Creating a new enquiry from scratch
   - Building the booking (step 1 → 2 → 3)
   - Sending the quote
   - Quote accepted → deposit invoice → recording the payment
   - Final invoice → paid in full
   - Sending the voucher → closing the job
   - One-page cheat sheet of the pipeline stages and what unlocks each one
3. Register it in `docs/handbook/handbook.config.mjs` as
   `{ slug: "quick-start-guide", title: "Quick Start Guide", subtitle: "Enquiry to closed, step by step", audience: "Sales consultants", files: ["quickstart/01-quick-start.md"] }`.
4. Capture any missing figures with a new spec `tests/qa/quickstart-shots.spec.ts` reusing
   `handbook-shots.fixtures.ts`. Slug prefix `qs-`.
5. Build: `pnpm docs:build --only quick-start-guide`. Build must pass with no
   `--allow-missing-shots`.

## Agent 2 — Training videos (runs after Agent 1)

Produces `docs/handbook/dist/video/` — 8 `.mp4` files.

1. New Playwright config `tests/qa/training-video.config.ts`:
   - `use.video = { mode: "on", size: { width: 1280, height: 720 } }`
   - `launchOptions.slowMo` around 350–500 ms so actions are followable
   - viewport 1280×720, `deviceScaleFactor: 1` (keeps file size sane)
   - reuse `handbook-shots.setup.ts` for auth, or a copy of it
2. Caption overlay helper `tests/qa/training-video.fixtures.ts`:
   - `caption(page, "Step 3 — Click Generate Quote")` injects a fixed-position banner
     (large type, high contrast, bottom or top of viewport) that persists for a few seconds
   - `highlight(page, locator)` draws a thick outline / pulse ring on the element about to be
     clicked, holds ~1 s, clicks, then clears
   - Both must clean up after themselves so they never appear in a real screenshot
3. Spec `tests/qa/training-video.spec.ts`, parameterised over
   `[{ product: "blue-train", supplier: "The Blue Train" }, { product: "rovos", supplier: "Rovos Rail" }]`.
   Four clips per product, one Playwright test each (one test = one video file):
   - `01-new-enquiry` — login → new enquiry → customer → save
   - `02-build-and-send-quote` — build booking steps 1–3 → generate quote → preview → send
   - `03-invoice-and-payment` — quote accepted → deposit invoice → record payment → final invoice
   - `04-voucher-and-close` — paid in full → generate voucher → send → close
4. Rename Playwright's hashed `.webm` output to
   `dist/video/<product>-<nn>-<slug>.webm`, then `ffmpeg -i in.webm -c:v libx264 -crf 23
   -pix_fmt yuv420p out.mp4` so the clips play in anything.
5. Write `docs/handbook/dist/video/README.txt` listing the clips in watch order.

## Constraints

- Local demo DB only. If Supabase or Docker is down, **start it** — do not fall back to dev
  or production.
- Do not touch the existing consultant handbook chapters; add alongside them.
- Bump `APP_VERSION` once at the end (`pnpm app:version:bump`) since code files change.
- Commit to the current branch; do not open a PR and do not push to `main`.
- Keep `dist/` out of git (already gitignored) — the user collects the files from disk.

## Done means

- `docs/handbook/dist/quick-start-guide.pdf` exists, opens, every figure renders, ≤ 20 pages.
- `docs/handbook/dist/video/` holds 8 playable `.mp4` files, each ≥ 45 s, captions legible.
- A short summary message to the user naming both paths and anything that could not be done.
