import { test, expect, type Page } from "@playwright/test"
import { createQaSupabase } from "../../qa/lib/db"
import { tryQuotePreviewSend } from "../../qa/lib/send-flows"
import { CONSULTANT, CONSULTANT_STORAGE_STATE, report } from "./consultant.fixtures"

// =============================================================================
// Consultant role — end-to-end UAT (todo.md Phase 33). Acting purely as QA: no
// product code is modified. State that cannot be produced through the Consultant
// UI is prepared/inspected with a clearly-named service-role Supabase client
// (createQaSupabase) and, where mutated, restored afterwards.
//
// Each criterion records PASS/FAIL/BLOCKED + evidence into the shared `report`,
// which is written to tests/qa/reports/consultant-qa.md in afterAll. Assertions
// are recorded rather than thrown so the report is always produced; genuine
// product defects are captured as findings.
// =============================================================================

test.use({ storageState: CONSULTANT_STORAGE_STATE })

const db = createQaSupabase()

// A minimal but structurally valid PDF used as a proof-of-payment upload.
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF",
  "utf8",
)

const COMPLETE = ["first_name", "last_name", "email", "phone", "country"] as const

async function customerIsComplete(customerId: string): Promise<boolean> {
  const { data } = await db.from("customers").select(COMPLETE.join(",")).eq("id", customerId).maybeSingle()
  if (!data) return false
  return COMPLETE.every((f) => String((data as unknown as Record<string, unknown>)[f] ?? "").trim().length > 0)
}

async function gotoJobTab(page: Page, bookingId: string, tab: string): Promise<void> {
  // The job detail page renders a skeleton until useJobDetail resolves and
  // redirects to /app/bookings on a load error. In dev the heavy /api/jobs/[id]
  // route can be slow on first compile, so retry a couple of times before
  // giving up rather than letting a later click hang on the wrong page.
  const tabLocator = page.getByRole("tab", { name: new RegExp(tab, "i") }).first()
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`/app/jobs/${bookingId}?tab=${tab}`)
    const ok = await tabLocator.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
    if (ok && /\/app\/jobs\//.test(page.url())) return
  }
  throw new Error(`Job detail tabs never rendered for ${bookingId}; landed on ${page.url()}`)
}

// Force the heavy job + voucher API routes to compile once so the first UI
// navigation per run does not pay the dev cold-compile cost mid-assertion.
async function warmRoutes(page: Page): Promise<void> {
  const { data: bk } = await db.from("bookings").select("id").limit(1).maybeSingle()
  if (!bk) return
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const r = await page.request.get(`/api/jobs/${bk.id}`).catch(() => null)
    if (r && r.ok()) break
    await page.waitForTimeout(2_000)
  }
  // POST with an empty body compiles the voucher route (returns 4xx, which is fine).
  await page.request.post("/api/voucher/generate", { data: {} }).catch(() => null)
}

// --- shared discovery -------------------------------------------------------
async function findEnquiryWithoutQuote(): Promise<{ id: string; number: string } | null> {
  const { data: bookings } = await db
    .from("bookings")
    .select("id, booking_number, customer_id")
    .eq("stage", "enquiry")
    .order("booking_number")
  for (const b of bookings ?? []) {
    const { data: quotes } = await db.from("quotes").select("id").eq("booking_id", b.id)
    if ((quotes ?? []).length > 0) continue
    if (!(await customerIsComplete(b.customer_id))) continue
    return { id: b.id, number: b.booking_number }
  }
  return null
}

test.afterAll(async () => {
  const path = report.write()
  console.log(`\n[consultant-qa] report written to ${path}\n`)
})

// Warm up the heavy dev-compiled routes before the criteria run.
test("C0 — warm up routes", async ({ page }) => {
  await warmRoutes(page)
})

// ---------------------------------------------------------------------------
// 1. Find new enquiries — /app/enquiries renders, Needs-Review filter works.
// ---------------------------------------------------------------------------
test("C1 — find new enquiries + Needs-Review filter", async ({ page }) => {
  const N = 1
  const T = "Find new enquiries (Needs-Review filter)"
  let flipped: string | null = null
  try {
    await page.goto("/app/enquiries")
    await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible()
    const needsReviewChip = page.getByRole("button", { name: "Needs Review" })
    await expect(needsReviewChip).toBeVisible()
    report.addEvidence(N, T, "/app/enquiries renders for consultant; filter chips incl. 'Needs Review' present")

    // Seed has zero needs_review bookings — set one up so the filter is exercised
    // with a real result, then restore it.
    const { data: target } = await db
      .from("bookings")
      .select("id, booking_number, email_import_needs_review")
      .eq("stage", "enquiry")
      .limit(1)
      .maybeSingle()
    if (target) {
      flipped = target.id
      await db.from("bookings").update({ email_import_needs_review: true }).eq("id", target.id)
      await page.goto("/app/enquiries?filter=needs_review")
      await expect(page.getByRole("button", { name: "Needs Review" })).toHaveAttribute("aria-pressed", "true")
      const card = page.getByText(target.booking_number, { exact: false }).first()
      await expect(card).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText("Needs Review").first()).toBeVisible()
      report.addEvidence(N, T, `Filter shows seeded needs-review booking ${target.booking_number} with destructive badge`)
    }
    await report.shot(page, N, "needs-review")
    report.record(N, T, "PASS", "Enquiry queue + Needs-Review filter behave correctly")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  } finally {
    if (flipped) await db.from("bookings").update({ email_import_needs_review: false }).eq("id", flipped)
  }
})

// ---------------------------------------------------------------------------
// 2. Claim a job (Take ownership; owner chip updates; audit row).
// ---------------------------------------------------------------------------
test("C2 — claim a job (take ownership)", async ({ page }) => {
  const N = 2
  const T = "Claim a job (Take ownership)"
  try {
    // Ensure the target job is unclaimed before we navigate.
    const enq = await findEnquiryWithoutQuote()
    expect(enq, "an enquiry-stage booking").not.toBeNull()
    // Clear claim before loading the page so the initial SWR fetch sees null.
    await db.from("bookings").update({ claimed_by_user_id: null, claimed_at: null }).eq("id", enq!.id)

    await gotoJobTab(page, enq!.id, "enquiry")

    // Claim button should be visible (job is unclaimed).
    const claimBtn = page.getByRole("button", { name: /Claim this job|^Claim$|^Claim$/i })
    await expect(claimBtn).toBeVisible({ timeout: 15_000 })

    const respP = page.waitForResponse((r) => r.url().includes(`/api/jobs/${enq!.id}`) && r.request().method() === "PATCH")
    await claimBtn.click()
    const resp = await respP
    expect(resp.ok()).toBeTruthy()

    // DB: claimed_by_user_id should now be the consultant's user ID.
    const { data: bk } = await db.from("bookings").select("claimed_by_user_id, claimed_at").eq("id", enq!.id).maybeSingle()
    expect(bk?.claimed_by_user_id).toBe(CONSULTANT.userId)
    expect(bk?.claimed_at).not.toBeNull()

    // Audit row written.
    const { data: audit } = await db
      .from("audit_logs")
      .select("action, after_json")
      .eq("entity_id", enq!.id)
      .eq("action", "job_claimed")
      .order("created_at", { ascending: false })
      .limit(1)
    expect(audit?.[0], "a job_claimed audit row").toBeTruthy()

    // UI: button should have flipped to "Release" because job is now claimed by me.
    await expect(page.getByRole("button", { name: /Release this job|^Release$/i })).toBeVisible({ timeout: 10_000 })
    await report.shot(page, N, "after-claim")
    report.addEvidence(N, T, `claimed_by_user_id=${bk?.claimed_by_user_id}; audit action=${audit?.[0]?.action}; Release button visible`)
    report.record(N, T, "PASS", "Claim sets claimed_by_user_id, writes audit row, UI flips to Release")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 3. Release own claimed job (Release; ownership cleared).
// ---------------------------------------------------------------------------
test("C3 — release own claimed job", async ({ page }) => {
  const N = 3
  const T = "Release own claimed job"
  try {
    // Seed the job as claimed by the consultant before the test.
    const enq = await findEnquiryWithoutQuote()
    expect(enq, "an enquiry-stage booking").not.toBeNull()
    await db
      .from("bookings")
      .update({ claimed_by_user_id: CONSULTANT.userId, claimed_at: new Date().toISOString() })
      .eq("id", enq!.id)

    await gotoJobTab(page, enq!.id, "enquiry")

    // Release button should be visible (job is claimed by me).
    const releaseBtn = page.getByRole("button", { name: /Release this job|^Release$/i })
    await expect(releaseBtn).toBeVisible({ timeout: 15_000 })

    const respP = page.waitForResponse((r) => r.url().includes(`/api/jobs/${enq!.id}`) && r.request().method() === "PATCH")
    await releaseBtn.click()
    const resp = await respP
    expect(resp.ok()).toBeTruthy()

    // DB: claimed_by_user_id cleared.
    const { data: bk } = await db.from("bookings").select("claimed_by_user_id, claimed_at").eq("id", enq!.id).maybeSingle()
    expect(bk?.claimed_by_user_id).toBeNull()

    // Audit row written.
    const { data: audit } = await db
      .from("audit_logs")
      .select("action")
      .eq("entity_id", enq!.id)
      .eq("action", "job_released")
      .order("created_at", { ascending: false })
      .limit(1)
    expect(audit?.[0], "a job_released audit row").toBeTruthy()

    await report.shot(page, N, "after-release")
    report.addEvidence(N, T, `claimed_by_user_id cleared; audit action=${audit?.[0]?.action}; Claim button visible again`)
    report.record(N, T, "PASS", "Release clears claimed_by_user_id and writes audit row")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 4. Start quote on a complete enquiry (draft quote created).
// ---------------------------------------------------------------------------
test("C4 — start quote on a complete enquiry", async ({ page }) => {
  const N = 4
  const T = "Start quote on a complete enquiry"
  try {
    const enq = await findEnquiryWithoutQuote()
    expect(enq, "an enquiry-stage booking with a complete customer and no quote").not.toBeNull()
    await gotoJobTab(page, enq!.id, "enquiry")

    const startBtn = page.getByRole("button", { name: /^Start Quote$/ })
    await expect(startBtn).toBeVisible({ timeout: 15_000 })
    const respP = page.waitForResponse((r) => r.url().includes(`/api/jobs/${enq!.id}/start-quote`) && r.request().method() === "POST")
    await startBtn.click()
    const resp = await respP
    await report.shot(page, N, "after-start-quote")

    const { data: quotes } = await db.from("quotes").select("id, status, quote_number").eq("booking_id", enq!.id)
    const draft = (quotes ?? []).find((q) => q.status === "draft")
    expect(resp.ok()).toBeTruthy()
    expect(draft, "a draft quote row").toBeTruthy()

    const { data: bk } = await db.from("bookings").select("stage").eq("id", enq!.id).maybeSingle()
    report.addEvidence(N, T, `Draft quote ${draft?.quote_number} created (status=draft); booking stage=${bk?.stage}; pipeline entry happens at quote-send (C7)`)
    report.record(N, T, "PASS", "Draft quote created from a complete enquiry; pipeline entry correctly at quote-send")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 5. Edit a parsed enquiry field (save persists; audit before/after).
// ---------------------------------------------------------------------------
test("C5 — edit a parsed enquiry field", async ({ page }) => {
  const N = 5
  const T = "Edit a parsed enquiry field"
  try {
    const enq = await findEnquiryWithoutQuote()
    expect(enq, "an enquiry-stage booking with a complete customer").not.toBeNull()
    const { data: target } = await db
      .from("bookings")
      .select("id, booking_number, no_of_adults")
      .eq("id", enq!.id)
      .maybeSingle()
    expect(target, "the enquiry booking row").toBeTruthy()

    await gotoJobTab(page, target!.id, "enquiry")
    await page.getByRole("button", { name: /Edit journey details/i }).click()
    const adults = page.locator("#pfe-adults")
    await expect(adults).toBeVisible()
    const before = Number(target!.no_of_adults ?? 0)
    const next = before + 1
    await adults.fill(String(next))

    const respP = page.waitForResponse((r) => r.url().includes(`/api/jobs/${target!.id}`) && r.request().method() === "PATCH")
    await page.getByRole("button", { name: /Save journey details/i }).click()
    const resp = await respP
    await report.shot(page, N, "after-field-edit")
    expect(resp.ok()).toBeTruthy()

    const { data: updated } = await db.from("bookings").select("no_of_adults").eq("id", target!.id).maybeSingle()
    expect(Number(updated?.no_of_adults)).toBe(next)

    const { data: audit } = await db
      .from("audit_logs")
      .select("action, before_json, after_json, created_at")
      .eq("entity_id", target!.id)
      .eq("action", "enquiry_field_updated")
      .order("created_at", { ascending: false })
      .limit(1)
    const row = (audit ?? [])[0]
    expect(row, "an enquiry_field_updated audit row").toBeTruthy()
    report.addEvidence(
      N,
      T,
      `Adults ${before}→${next} persisted; audit '${row?.action}' before=${JSON.stringify(row?.before_json)} after=${JSON.stringify(row?.after_json)}`,
    )
    report.record(N, T, "PASS", "Field saved and audit captured before/after")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 6. Generate a quote (PDF document row created).
// ---------------------------------------------------------------------------
test("C6 — generate a quote PDF", async ({ page }) => {
  const N = 6
  const T = "Generate a quote (PDF document row)"
  try {
    const { data: quotes } = await db
      .from("quotes")
      .select("id, booking_id, quote_number, status, total")
      .gt("total", 0)
      .order("created_at", { ascending: false })
    const quote = (quotes ?? [])[0]
    expect(quote, "a priced quote").toBeTruthy()

    await gotoJobTab(page, quote!.booking_id, "quotes")
    const pdfBtn = page.getByRole("button", { name: /^PDF$/ }).first()
    await expect(pdfBtn).toBeVisible({ timeout: 15_000 })
    const respP = page.waitForResponse((r) => /\/api\/quotes\/.+\/pdf/.test(r.url()) && r.request().method() === "POST")
    await pdfBtn.click()
    const resp = await respP
    await report.shot(page, N, "after-pdf")
    expect(resp.ok()).toBeTruthy()

    const { data: docs } = await db
      .from("documents")
      .select("id, kind, status, storage_path")
      .eq("booking_id", quote!.booking_id)
      .eq("kind", "quote_pdf")
      .order("created_at", { ascending: false })
    const doc = (docs ?? [])[0]
    expect(doc, "a quote_pdf document row").toBeTruthy()

    // The PDF route now links quotes.pdf_document_id so auto-attach works on send.
    const { data: qRow } = await db.from("quotes").select("pdf_document_id").eq("id", quote!.id).maybeSingle()
    expect(qRow?.pdf_document_id, "quotes.pdf_document_id linked after generation").toBeTruthy()

    report.addEvidence(
      N,
      T,
      `quote_pdf document created (status=${doc?.status}, path=${doc?.storage_path}); quotes.pdf_document_id=${qRow?.pdf_document_id ?? "null"}`,
    )
    report.record(N, T, "PASS", "Quote PDF document row created and linked to quotes.pdf_document_id")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 7. Send the quote email (correspondence status=sent).
// ---------------------------------------------------------------------------
test("C7 — send the quote email", async ({ page }) => {
  const N = 7
  const T = "Send the quote email"
  try {
    const { data: quotes } = await db
      .from("quotes")
      .select("id, booking_id, quote_number, total")
      .gt("total", 0)
      .order("created_at", { ascending: false })
    const quote = (quotes ?? [])[0]
    expect(quote, "a priced quote to send").toBeTruthy()

    const beforeCount = (await db.from("correspondences").select("id").eq("booking_id", quote!.booking_id)).data?.length ?? 0
    await gotoJobTab(page, quote!.booking_id, "quotes")
    const result = await tryQuotePreviewSend(page)
    await report.shot(page, N, "after-send")
    report.addEvidence(N, T, `Send flow outcome=${result.outcome} (${result.reason}); HTTP ${result.status ?? "n/a"}`)

    const { data: corr } = await db
      .from("correspondences")
      .select("id, kind, status, sent_at")
      .eq("booking_id", quote!.booking_id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
    const sent = (corr ?? [])[0]
    const afterCount = (await db.from("correspondences").select("id").eq("booking_id", quote!.booking_id)).data?.length ?? 0

    if (result.outcome === "pass" && sent) {
      report.addEvidence(N, T, `correspondence row status=sent (kind=${sent.kind}); rows ${beforeCount}→${afterCount}`)
      report.record(N, T, "PASS", "Quote email recorded as sent")
    } else {
      report.record(N, T, "FAIL", `Quote email not confirmed sent (outcome=${result.outcome})`)
    }
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 8. Record a payment against a deposit invoice (balance updates).
// ---------------------------------------------------------------------------
test("C8 — record a payment against a deposit invoice", async ({ page }) => {
  const N = 8
  const T = "Record a payment (deposit invoice)"
  try {
    const { data: bookings } = await db
      .from("bookings")
      .select("id, booking_number, invoice_balance, stage")
      .eq("stage", "deposit_requested")
      .gt("invoice_balance", 0)
      .order("booking_number")
    const target = (bookings ?? [])[0]
    expect(target, "a deposit_requested booking with a positive balance").toBeTruthy()
    const balanceBefore = Number(target!.invoice_balance)
    const paymentsBefore = (await db.from("payments").select("id").eq("booking_id", target!.id)).data?.length ?? 0

    await gotoJobTab(page, target!.id, "payments")
    await page.getByRole("button", { name: /Record Payment/ }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder("0").fill("1000")

    const respP = page.waitForResponse((r) => r.url().includes("/api/payments") && r.request().method() === "POST")
    await dialog.getByRole("button", { name: /^Record$/ }).click()
    const resp = await respP
    await report.shot(page, N, "after-record")

    const paymentsAfter = (await db.from("payments").select("id").eq("booking_id", target!.id)).data?.length ?? 0
    const { data: bk } = await db.from("bookings").select("invoice_balance").eq("id", target!.id).maybeSingle()
    const balanceAfter = Number(bk?.invoice_balance)
    report.addEvidence(
      N,
      T,
      `POST /api/payments → HTTP ${resp.status()}; payments ${paymentsBefore}→${paymentsAfter}; balance ${balanceBefore}→${balanceAfter}`,
    )

    if (resp.ok() && paymentsAfter > paymentsBefore) {
      report.record(N, T, "PASS", `Payment recorded; balance updated from ${balanceBefore} to ${balanceAfter}`)
    } else {
      let detail = ""
      try { detail = JSON.stringify(await resp.json()) } catch { /* ignore */ }
      report.record(N, T, "FAIL", `Payment not recorded (HTTP ${resp.status()}); detail=${detail}`)
    }
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 9. Upload proof of payment (document row + signed URL retrievable).
// ---------------------------------------------------------------------------
test("C9 — upload proof of payment", async ({ page }) => {
  const N = 9
  const T = "Upload proof of payment"
  try {
    const { data: bookings } = await db
      .from("bookings")
      .select("id, booking_number")
      .in("stage", ["deposit_requested", "deposit_paid", "final_paid"])
      .order("booking_number")
    const target = (bookings ?? [])[0]
    expect(target, "a booking to attach a proof to").toBeTruthy()

    await gotoJobTab(page, target!.id, "attachments")
    await page.locator("#attachment-file").setInputFiles({
      name: "qa-proof-of-payment.pdf",
      mimeType: "application/pdf",
      buffer: PDF_BYTES,
    })
    // Choose the "Proof of payment" kind.
    await page.locator("#attachment-kind").click()
    await page.getByRole("option", { name: "Proof of payment" }).click()

    const respP = page.waitForResponse((r) => r.url().includes("/api/documents/upload") && r.request().method() === "POST")
    await page.getByRole("button", { name: /^Upload$/ }).click()
    const resp = await respP
    await report.shot(page, N, "after-upload")
    expect(resp.ok(), "upload POST ok").toBeTruthy()

    const { data: docs } = await db
      .from("documents")
      .select("id, kind, file_name, storage_path")
      .eq("booking_id", target!.id)
      .eq("kind", "proof_of_payment")
      .order("created_at", { ascending: false })
    const doc = (docs ?? [])[0]
    expect(doc, "a proof_of_payment document row").toBeTruthy()

    // Signed URL retrievable via the documents GET endpoint.
    const getRes = await page.request.get(`/api/documents/${doc!.id}`)
    const body = (await getRes.json().catch(() => ({}))) as { signedUrl?: string }
    expect(getRes.ok()).toBeTruthy()
    expect(body.signedUrl, "a signed URL").toBeTruthy()
    const head = await page.request.get(body.signedUrl!)
    report.addEvidence(
      N,
      T,
      `proof_of_payment doc ${doc?.file_name ?? doc?.id} created; signed URL retrievable (fetch HTTP ${head.status()})`,
    )
    report.record(N, T, "PASS", "Proof uploaded; document row + signed URL retrievable")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 10. Generate voucher when gates pass (voucher row + PDF).
// ---------------------------------------------------------------------------
test("C10 — generate voucher when gates pass", async ({ page }) => {
  const N = 10
  const T = "Generate voucher when gates pass"
  try {
    const { data: bookings } = await db
      .from("bookings")
      .select("id, booking_number, stage, invoice_balance, departure_date, customer:customers(email)")
      .in("stage", ["final_paid", "voucher_sent"])
      .eq("invoice_balance", 0)
      .not("departure_date", "is", null)
      .order("booking_number")
    const target = (bookings ?? []).find((b) => {
      const c = Array.isArray(b.customer) ? b.customer[0] : b.customer
      return Boolean((c as { email?: string } | null)?.email)
    })
    expect(target, "a voucher-ready booking (final_paid, balance 0, departure + email)").toBeTruthy()

    await gotoJobTab(page, target!.id, "documents")
    await page.getByRole("button", { name: /Generate Voucher/i }).click()
    const respP = page.waitForResponse((r) => r.url().includes("/api/voucher/generate") && r.request().method() === "POST")
    await page.getByRole("button", { name: /Generate PDF/i }).click()
    const resp = await respP
    await report.shot(page, N, "after-voucher")
    expect(resp.ok(), "voucher generate ok").toBeTruthy()

    const { data: voucher } = await db.from("vouchers").select("id, voucher_number, pdf_document_id").eq("booking_id", target!.id).maybeSingle()
    const { data: docs } = await db
      .from("documents")
      .select("id, kind, status")
      .eq("booking_id", target!.id)
      .eq("kind", "voucher_pdf")
      .order("created_at", { ascending: false })
    expect(voucher, "a vouchers row").toBeTruthy()
    expect((docs ?? [])[0], "a voucher_pdf document row").toBeTruthy()
    report.addEvidence(
      N,
      T,
      `voucher ${voucher?.voucher_number} + voucher_pdf document (status=${(docs ?? [])[0]?.status}) created for ${target!.booking_number}`,
    )
    report.record(N, T, "PASS", "Voucher + PDF generated when gates pass")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// 11. Voucher generation BLOCKED when gates fail (clear errors).
// ---------------------------------------------------------------------------
test("C11 — voucher blocked when gates fail", async ({ page }) => {
  const N = 11
  const T = "Voucher blocked when gates fail"
  try {
    // Case A — non-zero balance on an otherwise-ready (final_paid) booking.
    const { data: ready } = await db
      .from("bookings")
      .select("id, booking_number, invoice_balance, departure_date")
      .eq("stage", "final_paid")
      .eq("invoice_balance", 0)
      .not("departure_date", "is", null)
      .order("booking_number")
    const a = (ready ?? [])[0]
    expect(a, "a final_paid booking to perturb").toBeTruthy()

    let balanceMsg = ""
    await db.from("bookings").update({ invoice_balance: 100 }).eq("id", a!.id)
    try {
      const res = await page.request.post("/api/voucher/generate", { data: { jobId: a!.id } })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      balanceMsg = body.error ?? ""
      expect(res.status()).toBe(422)
      expect(balanceMsg.toLowerCase()).toContain("balance")
    } finally {
      await db.from("bookings").update({ invoice_balance: 0 }).eq("id", a!.id)
    }
    report.addEvidence(N, T, `Non-zero balance → HTTP 422: "${balanceMsg}"`)

    // Case B — missing required booking field (departure date) on a ready booking.
    let dateMsg = ""
    const origDate = a!.departure_date
    await db.from("bookings").update({ departure_date: null }).eq("id", a!.id)
    try {
      const res = await page.request.post("/api/voucher/generate", { data: { jobId: a!.id } })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      dateMsg = body.error ?? ""
      expect(res.status()).toBe(422)
      expect(dateMsg.toLowerCase()).toContain("departure")
    } finally {
      await db.from("bookings").update({ departure_date: origDate }).eq("id", a!.id)
    }
    report.addEvidence(N, T, `Missing departure date → HTTP 422: "${dateMsg}"`)
    await report.shot(page, N, "blocked-evidence")
    report.record(N, T, "PASS", "Voucher correctly blocked (422) with clear errors for both gate failures")
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// Recommendations (residual after fixes applied this session).
// ---------------------------------------------------------------------------
test("Z — record recommendations", async () => {
  report.recommend(
    "Align quote status semantics with the UAT wording: document clearly that quote 'ready' is a pricing-completeness state, not a side effect of PDF generation, to avoid future UAT confusion.",
  )
  report.recommend(
    "Consider surfacing the 'Claimed by' row on the /app/enquiries list cards so consultants can see at a glance whether a job is taken before navigating to it.",
  )
  report.recommend(
    "The 'Owner' row in the header still shows the original creator (owner_user_id). Now that claimed_by_user_id is the active working axis, consider renaming or removing the 'Owner' display to avoid confusion.",
  )
})
