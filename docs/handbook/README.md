# Luxus Travel and Tours — documentation programme

Markdown source for the seven client-facing documents, and the build that turns them into
branded PDFs.

```
docs/handbook/
  _preamble.md          shared contract — read before every session
  handbook.config.mjs   which chapters make up which document
  prompts/              one prompt per work session, run in order
  content/              the chapters themselves
  screenshots/          PNGs referenced by [[shot:…]] markers
  theme/print.css       the print stylesheet
  dist/                 build output (gitignored)
```

## Building

```
pnpm docs:build                              # every document
pnpm docs:build --only consultant-handbook   # one document
pnpm docs:build --html                       # HTML only, no Chromium pass
pnpm docs:build --allow-missing-shots        # while a chapter is in progress
pnpm docs:shots                              # capture screenshots
```

Markdown → HTML (marked) → headless Chromium (`page.pdf`) → `dist/*.pdf`. The build runs
twice per document: the first pass lays the pages out so real page numbers can be read back
with `pdf-parse`, the second reprints with the table of contents filled in.

The build **fails** if a `[[shot:…]]` marker has no matching PNG, and **warns** if a PNG is
never referenced.

## Working through the programme

One prompt per session, `/clear` between them, in the order the files are numbered. Each
prompt is self-contained: it names the source files to read, what the chapter must cover,
which screenshots to capture, and what "done" means. Context never accumulates across
steps, which is the point — the set can be written over several days without the sessions
getting slower or more expensive.

| Prompt | Produces |
|---|---|
| `01-technical-handover.md` | Technical Handover Sheet |
| `02`–`09` | Consultant Handbook, chapters 1–8 |
| `10a`–`10e` | Administrator Guide, chapters 1–5 |
| `11-automation-and-reporting.md` | Automation and Reporting |
| `12-screenshot-pass.md` | Every figure captured |
| `13-assembly-and-review.md` | Troubleshooting, Quick Reference, final build |

## Screenshot prerequisites

Docker running, then:

```
pnpm db:start
pnpm db:reset
pnpm db:seed:demo
pnpm docs:shots
```

Captures come from the local demo database only — never from hosted development or
production.
