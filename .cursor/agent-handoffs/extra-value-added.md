# Extra Value-Added — Future Opportunity Roadmap

> **Status:** Forward-looking ideas, NOT scoped for the current release. Revisit once the
> core application is fully fleshed out. Source: analyst gap review (2026-06-01).
> Point any agent here when planning post-launch enhancements.

---

## ⭐ TOP NOTES — read this first

**Pick-me-first quick wins (low effort, reuse data/workers we already have):**

1. **Google review automation** — extend the existing post-trip thank-you worker
   (`lib/email/email-templates/thank-you.ts` + `pipeline-auto-close` cron) to send a
   review request with a Google review deep-link N days after trip end; log sent/clicked
   in `correspondences`. *Lowest effort, highest brand/referral ROI. Do this one first.*
2. **Customer LTV + repeat/referral panel** — derive from `bookings`/`payments` instead
   of the manually-kept travel-date fields. Pure read/aggregation.
3. **Pipeline velocity / dwell-time report** — `pipeline_history` already logs every
   transition; surface avg days-in-stage + conversion-by-stage.
4. **Commission ledger view** — config already lives on suppliers/routes/quote snapshots;
   aggregate into a payable-per-consultant report.
5. **Ops alerts (Slack/Teams/email)** — "quote accepted", "payment overdue", "new
   enquiry" via webhook; trivial given existing cron + correspondence plumbing.
6. **iCal / .ics trip export** on booking + voucher — pure generation, no dependency.

**The user's three named asks, ranked ROI-per-effort:**
🥇 Google review automation → 🥈 WhatsApp → 🥉 Online payments.
**Mobile:** recommend **PWA-first** (reuses Next.js + push infra) over a 2nd codebase.

**Suggested overall sequence:** reviews → WhatsApp → payments → PWA → AI assist.
Portal / public-API / forecasting / supplier-layer are deliberate later platform bets.

---

## What's already strong (don't re-pitch)

Mature **quote-to-voucher booking engine** for luxury rail:
- Validated stage-gated pipeline (`lib/pipeline/validate-transition.ts`), Kanban, multi-consultant.
- Versioned quotes (Q1/Q2…), 14-day validity, acceptance tokens, PDF + templated email.
- Deposit/final invoice split, payment recording w/ proof, auto balance recalc, refunds.
- Auto vouchers (HTML template + PDF) gated on `invoice_balance = 0`.
- Multi-leg packages, 6 supplier kinds, rate cards + commission config.
- **Inbound email intake** (IMAP → parsed enquiries w/ dedupe/review) — ahead of most SME travel CRMs.
- 5 cron workers: email sync, payment reminders, quote follow-ups, pipeline auto-close (+thank-you), daily backup.
- Audit log on 13 tables, error log, backup/restore, role-based RLS.
- 5 reports + dashboard KPIs, all CSV-exportable.

The transactional core is solid. **The holes are around the transaction: payments, customer intelligence, multi-channel comms, mobility, and post-trip lifecycle.**

---

## The 8 holes (current state → gap)

1. **Money is recorded, never collected** — manual payment entry only; no gateway/pay-links, no card capture, no reconciliation, no installments (only deposit + final). Biggest revenue-flow leak.
2. **Email-only communication** — `correspondences` has placeholder SMS/phone columns but nothing wired. No WhatsApp/SMS/push. Clients and consultants live on WhatsApp.
3. **Customers are contacts, not relationships** — no LTV, no repeat-rate/churn (travel dates manually maintained, not derived), no segmentation/RFM, no campaign attribution (source is a flat enum, no `campaign_id`), no unified comms timeline.
4. **No mobile / on-the-go** — web-only responsive; no installable app, offline, or push.
5. **Post-trip stops at the thank-you email** — no reviews, NPS/feedback, win-back, or referral capture. The most valuable luxury asset (repeat + referral) is untracked.
6. **Reporting is descriptive, not decision-grade** — 5 CSV reports; no forecasting, no velocity (data exists in `pipeline_history`, unused), no commission *ledger* (config exists, payouts don't), no email engagement, no supplier performance.
7. **No external automation surface** — no webhooks/public API/Slack/Teams/Zapier/n8n hooks.
8. **AI entirely absent** — no reply drafting, no richer inbound extraction, no customer summarization. Table-stakes in 2026.

---

## Marketplace comparison

| Capability | Luxus today | Travefy / Tourwriter / WeTravel | HubSpot / Pipedrive |
|---|---|---|---|
| Quote → voucher pipeline | **Strong, niche-tuned** | Generic, weaker pipeline | Strong pipeline, no travel domain |
| Online payment collection | ✗ manual | ✓ | ✓ via integrations |
| WhatsApp / SMS | ✗ | partial | ✓ |
| Mobile app | ✗ | ✓ | ✓ |
| Review automation | ✗ | rare | rare |
| Forecasting / velocity | ✗ | ✗ | ✓ |
| AI assist | ✗ | emerging | ✓ |
| Inbound email auto-intake | **✓ (rare!)** | rare | partial |
| Luxury-rail domain depth | **✓ best-in-class** | ✗ | ✗ |

**Market white-space (nobody does this well):** a luxury-travel-specific CRM combining
(a) domain-deep pipeline, (b) WhatsApp-first client comms, (c) automated review/referral
harvesting, (d) supplier coordination — in one tool. Luxus already owns (a) and the
inbound-email edge. The differentiated play is bolting (b)+(c) on, not chasing generic CRM parity.

---

## Full roadmap — small → big

### Tier 0 — Quick wins (days each, data already captured)
See the ⭐ list at top: LTV panel, velocity report, ops alerts, .ics export, commission ledger.

### Tier 1 — High-value integrations (the named asks)
- **Google review automation** ⭐ — extend thank-you worker + `pipeline-auto-close` cron; review deep-link N days post-trip; track in `correspondences`. Optionally pull ratings via Google Business Profile API.
- **WhatsApp** ⭐ — Twilio / Meta Cloud API behind `correspondences.channel` (columns already exist). Phase 1: outbound quote/voucher/reminder + delivery status. Phase 2: inbound replies threaded onto the booking (mirror `lib/inbound-email/`).
- **Online payments** ⭐ — Stripe or SA-local (PayFast / Ozow / Paystack — confirm market). Pay-link on deposit/final invoices; webhook → auto-create `payments` row + advance stage gate.

### Tier 2 — Mobile & AI
- **Mobile app** — **PWA-first** (installable, push via existing infra, offline read) over current Next.js UI; only go React Native/Expo for app-store presence or camera scanning (passport / proof-of-payment).
- **AI assist (Claude)** — (1) draft enquiry/quote-email replies from booking context; (2) richer inbound-email field extraction to shrink the "needs review" queue; (3) summarize a customer/booking. Fits existing API-route + Zod pattern.

### Tier 3 — Platform bets
- **Public API + webhooks + n8n/Zapier** — turn Luxus into an automation hub.
- **Customer-facing portal** — clients view/accept quotes, pay, download vouchers, manage travellers (acceptance tokens are the seed).
- **Forecasting & marketing attribution** — add `campaign_id` to source; pipeline-value forecasting + source-ROI.
- **Supplier coordination layer** — availability/capacity, supplier confirmations, payout reconciliation (today all manual/email).

---

## Verification notes (per item, when built)
- **Review automation:** trigger `pipeline-auto-close` cron locally against a booking with a past trip end date; assert a review-request `correspondences` row + correct Google deep-link in the rendered email.
- **WhatsApp:** send via provider sandbox; assert `correspondences` row with `channel='whatsapp'` and a delivery-status callback updates it.
- **Payments:** gateway test mode + webhook simulator; assert a `payments` row is created and the deposit/final stage gate unblocks.
