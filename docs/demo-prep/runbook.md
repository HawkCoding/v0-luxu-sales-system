# Luxus Sales System — Demo Runbook

**Target length:** 12–15 minutes.
**Audience:** prospective client.
**Environment:** localhost (`pnpm dev` on this laptop) + local Supabase.

---

## Before the demo (T-30 min)

1. Make sure **Docker Desktop** is running (the Supabase containers must be up).
   Sanity check: `docker ps` should list `supabase_db_luxus-sales-system` (healthy).
2. Reset the demo data so the pipeline looks fresh:
   ```
   pnpm db:reset
   ```
   Expect: `Finished supabase db reset on branch main.` — and 18 customers / 37 bookings / 32 quotes.
3. Start the dev server (skip if already running on :3000):
   ```
   pnpm dev
   ```
   First page compile takes ~10 s; warm it up by visiting `/login` once.
4. Confirm the amber **"Demo mode — emails not sent"** banner shows at the top of any `/app/*` page. If it doesn't, check that `RESEND_API_KEY` is unset in `.env.local`.
5. Open one terminal alongside the browser. You'll use it for the live email trigger in step 4.

---

## The runbook

### 1. Login (Manager view)
- URL: `http://localhost:3000/login`
- Click **"Quick login"** → signs in as `carmen@luxustravel.co.za` (manager).
- Optional opener: "This is the operator's daily view — everything below comes from real seeded data."

### 2. Dashboard tour (~1 min)
- Highlight: upcoming follow-ups, headline numbers, the version chip in the sidebar (`v2.89`).

### 3. Pipeline Kanban (~2 min)
- Navigate **Pipeline** in the sidebar.
- 37 bookings spread across 9 stages: enquiry → quote_sent → accepted → deposit_requested → deposit_paid → final_paid → voucher_sent → closed (+ lost).
- Drag a card one stage forward to show the stage-gate validation in action. If it refuses, that's the gate doing its job — say so on stage.

### 4. **The big moment: email auto-creates an enquiry**
- In the side terminal, run:
  ```
  Invoke-RestMethod -Uri http://localhost:3000/api/dev/replay-inbound-email -Method POST
  ```
- This replays the fixture at `supabase/seeds/inbound-email-fixtures/new-enquiry.json` through the same pipeline live IMAP would use.
- Watch the **Enquiries** sidebar counter increment. Refresh Pipeline; a new card appears in **enquiry**.
- Open the new enquiry — show how the email body was parsed into structured fields.
- **Backup plan:** if this misbehaves, click into any of the 5 existing `enquiry` cards instead and walk the same flow from there.

### 5. Build a quote (~2 min)
- From the enquiry, click **Start quote** / **Quotes** tab.
- Add 2 line items (adult + child prices). Save.
- Click **Send quote** — preview opens, banner reminds you it won't actually email.

### 6. Accept the quote
- Use the stage transition button to move to **accepted**. If a gate complains, accept the auto-fix.

### 7. Deposit invoice (~2 min)
- Open **Invoice** tab → **Generate deposit invoice**.
- Show the configurable 25% default (per-job override is in the dialog).
- PDF renders and opens — that's the visible payoff.

### 8. Record deposit payment
- Add payment with proof. Show `deposit_paid` flipping and stage auto-advancing.

### 9. Final invoice → final payment → balance R0
- Same flow as deposit. Confirm `invoice_balance = 0` in the booking header.

### 10. **Generate voucher** (the closing payoff, ~2 min)
- Voucher tab → **Generate voucher**.
- PDF opens. Walk the client through the layout (suite details, schedule, service blocks).

### 11. Audit / close
- Audit tab — show full change log.
- Close booking. Done.

---

## Known rough edges (be ready to talk past)

- **Test suite is red.** Don't run `pnpm test` on stage. Tests reference older schema shapes that the local pre-demo migrations evolved past. Out of scope for this demo, will be fixed before launch.
- **No live IMAP fetch.** We trigger one fixture via `/api/dev/replay-inbound-email`. The live IMAP path exists in `lib/inbound-email/sync.ts` and would replace the trigger in production.
- **Quote "Download PDF"** isn't built — quotes ship as rendered email previews. Stay on the preview screen; don't click PDF.
- **Inbound Email settings tab** (Admin → Settings) is wired but not pretty. Don't open it on stage.
- **Suppliers / Packages screens** are walked past briefly; we don't create them live.

---

## If something hangs mid-demo

- Hard refresh (Ctrl+Shift+R) the page first. SWR will re-fetch.
- If still stuck, switch user to the seeded `final_paid` booking (any "Marco Rossi" or "Henrik Johansson" card in the **final_paid** column) and jump straight to step 10 (voucher). You still land the payoff.

---

## After the demo

- Stop dev server: Ctrl+C in the `pnpm dev` window.
- Stop Supabase if you want: `npx supabase stop`.
- This branch (`wip/pre-demo-local-v2`) is **not for merging**. It contains demo seeding shortcuts and a catch-up schema migration. The actual feature work is captured in commit `4e0be11`+ — split into proper feature PRs after the demo.
