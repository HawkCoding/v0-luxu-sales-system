# Step 12 — Screenshot capture pass

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** PNGs in `docs/handbook/screenshots/`. No prose.

## Scope

Fill every screenshot marker written in Steps 2–11, and prove no figure leaks real data.

## Preparation

```
pnpm db:start          # Docker must be running
pnpm db:reset          # migrations + seed
pnpm db:seed:demo      # presentable demo data
pnpm dev               # or let the Playwright config start it
```

> [!STOP]
> Never capture against the hosted development or production database. Every figure in this
> document set comes from the local demo data.

## Do this

1. `pnpm docs:build --allow-missing-shots` and collect the reported missing slugs. That
   list is the work.
2. Work through `tests/qa/handbook-shots.spec.ts` describe block by describe block, adding
   any capture that is still missing. Follow the conventions in
   `tests/qa/handbook-shots.fixtures.ts`: viewport captures by default, `{ full: true }`
   only where the whole page genuinely has to be seen at once, and the correct role for
   each figure.
3. `pnpm docs:shots` and fix every failure. A failing capture usually means the selector
   moved, not that the app is broken — check before reporting a bug.
4. `pnpm docs:build` must now pass with no missing screenshots.
5. Review the orphan warning. An unreferenced PNG means either a marker was removed or a
   slug was mistyped. Resolve both directions; do not just delete the file.

## Review every image before finishing

- No real customer names, email addresses or phone numbers.
- Account number, branch code and tax registration number redacted on the Banking Details
  and Company Information figures — use `redact()` from `handbook-shots.fixtures.ts`.
- No password, token or key visible anywhere, including in a browser autofill dropdown.
- No error toast, empty state or loading skeleton where the figure is supposed to show a
  working screen.
- Light theme throughout — the config pins it, but check.
- Text is legible at print size. If it is not, the capture is too wide or the page is too
  long; tighten it rather than shipping something the reader has to squint at.

## Done when

- `pnpm docs:build` reports "all present" with zero orphans.
- Every PDF opens with no figure spilling past a page edge.
