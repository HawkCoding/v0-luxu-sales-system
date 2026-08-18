# Handbook session preamble

**Read this before every documentation session.** It carries the decisions so no
session has to rediscover them. Then read your own prompt file in `prompts/` and do only
that step.

---

## What we are producing

Seven PDFs for **Luxus Travel and Tours**, built from Markdown in `docs/handbook/content/`.

| Document | Audience |
|---|---|
| Technical Handover Sheet | Incoming developer |
| Consultant Handbook (8 chapters) | Sales consultants |
| Administrator Guide (5 chapters) | Managers and administrators |
| Automation and Reporting | Managers and administrators |
| Troubleshooting and FAQ | Everyone |
| Quick Reference Card | Sales consultants |
| Combined Edition | Handover record |

The manifest lives in `handbook.config.mjs`. Do not rename or move content files without
updating it.

---

## The rules

### 1. Write from the running app, never from the repo's existing docs

The repo's older documents are stale and will mislead you. `docs/demo-prep/runbook.md`
still claims the quote PDF is not built — it is. `NOTES.md`, `plan.md` and the four agent
briefs (`CLAUDE.md`, `AGENTS.md`, `codex.md`, `.github/copilot-instructions.md`) describe
intent, not current behaviour.

Every button name, field label, tab name and dialog title you write down must be one you
have seen in the running app or read directly out of the current component source. If you
cannot confirm it, do not write it.

### 2. Reading level: assumes travel-industry experience

The reader knows what a quote, a voucher, a deposit, an itinerary and a rate card are.
Do not explain the trade. Explain **how this system does it** — what the button is called,
what it changes, what it will refuse to do and why.

Never explain browsers, tabs, dropdowns or clicking.

### 3. Never include secrets

No passwords, no API keys, no environment variable *values*, no login URLs, no database
connection strings, no customer email addresses that belong to real people. Environment
variable **names** are fine in the technical sheet. Seeded demo logins
(`…@luxustravel.co.za` / `password123`) must never appear in a delivered document.

### 4. Describe what exists, flag what does not

Where a screen is half-built, say so plainly in a callout rather than documenting a
feature that will not work. Known example: the global `/app/payments` page has a
non-functional **Add Payment** and **Import Payments** (`app/app/payments/page.tsx:68-95`,
`:246`) — payments are recorded on the booking's own Payments tab.

### 5. Tone

Direct, second person, present tense. "Click **Generate Invoice**." Not "the user should
then proceed to click". No marketing language. No apologies for the software.

### 6. Fixed vocabulary

The codebase is inconsistent about these; the documents are not. Use the left column
everywhere, including in figure captions.

| Use this | Not this | Note |
|---|---|---|
| **booking** | job | The UI mostly says Booking already. `job` survives in URLs and code only. Where a screen genuinely reads "Open Job", quote the button name in bold and call the thing itself a booking. |
| **booking number** | job number, reference | The `LTT-…` number. |
| **stage** | status, step | Reserve "status" for a quote status or an invoice status, which are different things. |
| **consultant** | salesperson, agent, user | "User" only when talking about accounts and access. |
| **travel voucher** on first use, then **voucher** | — | |
| **Luxus Travel and Tours** | Luxus, LTT, the client | The company. Some system strings render it with an ampersand; do not change what a screenshot shows, but write the words in prose. |

If you find yourself needing a term that is not here, pick one, use it consistently, and
add it to this table in the same session.

### 7. Redact company and banking detail in figures

Screenshots of the Company Information and Banking Details screens must have the account
number, branch code and tax registration number obscured. Use the `redact()` helper in
`tests/qa/handbook-shots.fixtures.ts` — it blacks out the elements you name before the
capture. The reader still sees where the fields are and what they do.

---

## Format conventions

### Headings
- `#` = one chapter. Exactly one per file, first line of the file. It starts a new page.
- `##` = a section within the chapter. Appears in the table of contents.
- `###` = a procedure or sub-topic. Not in the table of contents.

### UI references
Bold for anything the reader clicks or types into: **Generate Invoice**, the **Quotes**
tab, the **Valid until** field. Backticks only for literal system values a reader would
recognise on screen (`LTT-2026-0001-Q1`, `deposit_paid`) — never for file paths in the
consultant or admin documents.

### Procedures
Numbered lists. One action per step. Start each step with the verb.

```markdown
1. Open the booking and select the **Quotes** tab.
2. Click **Edit Quote**.
3. Choose a supplier category, then a supplier, and click **Add service**.
```

### Callouts
Four kinds, GitHub-style:

```markdown
> [!NOTE]
> Renders as a neutral grey note.

> [!TIP]
> Same styling as Note. Use for time-savers.

> [!WARNING]
> Amber. Use for anything that costs money, sends an email, or moves a stage.

> [!STOP]
> Red. Use for actions that cannot be undone, or things that are not built yet.
```

### Screenshots
Insert a marker where the figure belongs:

```markdown
[[shot:04-build-booking-step-1|The first step of Build Booking, with two services added]]
```

The slug is `NN-topic` in kebab-case — `NN` is the chapter number, or `aNN` for an
Administrator Guide chapter. The caption after `|` is optional but strongly preferred;
it becomes "Figure N — …" under the image.

Add the matching capture to `tests/qa/handbook-shots.spec.ts` in the same session you
write the marker. The build **fails** on a marker with no image and **warns** on an image
no marker uses.

### Tables
Use them for reference material — gate lists, role matrices, field meanings. Do not use
them for procedures.

---

## Working commands

```
pnpm docs:build                          # all documents (fails on missing screenshots)
pnpm docs:build --only consultant-handbook
pnpm docs:build --html                   # HTML only, no Chromium pass — fast iteration
pnpm docs:build --allow-missing-shots    # while a chapter is still being drafted
pnpm docs:shots                          # capture screenshots
```

Screenshot prerequisites: Docker running, local Supabase up (`pnpm db:start`),
`pnpm db:reset` then `pnpm db:seed:demo` for presentable data, and `pnpm dev` on port 3000
(the Playwright config starts it if it is not already running).

---

## Finishing a session

1. `pnpm docs:build --only <your document> --allow-missing-shots` must succeed.
2. Re-read your chapter once against the running app — every label, in order.
3. Do not bump `APP_VERSION` for a prose-only session; it applies to app code changes.
4. Stop. Do not start the next step in the same session — a fresh context per step is the
   whole point of splitting the work this way.
