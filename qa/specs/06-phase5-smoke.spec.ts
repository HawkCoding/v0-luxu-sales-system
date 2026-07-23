import { expect, test, type Page, type Request } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { createQaSupabase } from "../lib/db"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"

test.use({ storageState: ADMIN_STORAGE_STATE })
test.setTimeout(120_000)

// Phase 5 smoke spec covers the four items the test plan claimed but never
// verified in a real browser:
//   A — stage stepper renders with actual color tokens (the prior
//       brand-gold class was a no-op)
//   B — Gmail-style send: letting the timer elapse commits the send
//   C — Gmail-style send: clicking Undo cancels the send
//   D — pnpm db:seed:demo lands the DEMO booking
//
// All four run against the local Supabase + dev server. The Playwright
// config sets NEXT_PUBLIC_OPTIMISTIC_SEND_DELAY_MS=500 so tests B/C exercise
// the same code path with a 500ms wait window instead of 5s.

interface SeededBooking {
  bookingId: string
  bookingNumber: string
  customerId: string
}

// Each test gets its own customer with a unique email to avoid cross-test
// state contamination. The previous shared-customer approach surfaced a 404
// on /api/jobs/<id> in Test C — likely a race where Test B's cleanup hadn't
// fully committed before Test C seeded.
async function createSmokeCustomer(testLabel: string): Promise<string> {
  const supabase = createQaSupabase()
  const email = `phase5-smoke-${testLabel}+${Date.now()}@example.com`
  const { data, error } = await supabase
    .from("customers")
    .insert({
      title: "Mr",
      first_name: "Phase5",
      last_name: `Smoke-${testLabel}`,
      email,
      phone: "+27 11 555 9999",
      country: "South Africa",
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`Could not create smoke customer: ${error?.message}`)
  return data.id
}

async function allocateSmokeBookingNumber(): Promise<string> {
  const supabase = createQaSupabase()
  const prefix = "SMK-2026-"
  const { data, error } = await supabase
    .from("bookings")
    .select("booking_number")
    .ilike("booking_number", `${prefix}%`)
    .order("booking_number", { ascending: false })
    .limit(1)
  if (error) throw new Error(`Could not allocate smoke booking number: ${error.message}`)
  const lastSeq = data?.[0]?.booking_number
    ? Number(data[0].booking_number.replace(prefix, "")) || 0
    : 0
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`
}

async function seedBooking(
  customerId: string,
  stage: "enquiry" | "deposit_paid",
): Promise<SeededBooking> {
  const supabase = createQaSupabase()
  const bookingId = randomUUID()
  const bookingNumber = await allocateSmokeBookingNumber()

  const { error } = await supabase.from("bookings").insert({
    id: bookingId,
    booking_number: bookingNumber,
    customer_id: customerId,
    stage,
    purpose: "reservation",
    source: "web_form",
    departure_date: "2026-12-01",
    duration_nights: 3,
    no_of_adults: 2,
    no_of_children: 0,
    no_of_suites: 1,
    hotel_phase: "none",
    terms_accepted: true,
    deposit_paid: stage === "deposit_paid",
    invoice_balance: 0,
  })
  if (error) throw new Error(`Failed to seed smoke booking: ${error.message}`)
  return { bookingId, bookingNumber, customerId }
}

async function seedDraftQuote(bookingId: string): Promise<{ quoteId: string; quoteNumber: string }> {
  const supabase = createQaSupabase()
  const quoteId = randomUUID()
  const quoteNumber = `SMK-${Date.now().toString(36).toUpperCase()}-Q1`
  const { error } = await supabase.from("quotes").insert({
    id: quoteId,
    booking_id: bookingId,
    quote_number: quoteNumber,
    status: "draft",
    subtotal: 100000,
    total: 100000,
    validity_until: "2099-12-31",
  })
  if (error) throw new Error(`Failed to seed draft quote: ${error.message}`)
  await supabase.from("quote_line_items").insert({
    id: randomUUID(),
    quote_id: quoteId,
    description: "Smoke test line item",
    qty: 1,
    unit_price: 100000,
    total: 100000,
    sort_order: 1,
  })
  return { quoteId, quoteNumber }
}

async function cleanupSmokeFixtures(customerId: string): Promise<void> {
  const supabase = createQaSupabase()
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("customer_id", customerId)
  const bookingIds = (bookings ?? []).map((b) => b.id)
  if (bookingIds.length === 0) return
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id")
    .in("booking_id", bookingIds)
  const quoteIds = (quotes ?? []).map((q) => q.id)
  if (quoteIds.length > 0) {
    await supabase.from("quote_line_items").delete().in("quote_id", quoteIds)
  }
  await supabase.from("correspondences").delete().in("booking_id", bookingIds)
  await supabase.from("documents").delete().in("booking_id", bookingIds)
  await supabase.from("quotes").delete().in("booking_id", bookingIds)
  await supabase.from("audit_logs").delete().in("entity_id", bookingIds)
  await supabase.from("bookings").delete().in("id", bookingIds)
}

async function startSend(page: Page): Promise<void> {
  // Preview & Send button on a quote card opens the QuotePreviewSendDialog.
  // Wait for the preview to render before clicking Send.
  await page.getByRole("button", { name: /Preview & Send/i }).first().click()
  await page
    .waitForResponse(
      (resp) => resp.url().includes("/email-preview") && resp.request().method() === "POST",
      { timeout: 15_000 },
    )
    .catch(() => null)
}

// ---------------------------------------------------------------------------
// Test A — stepper renders with colors and aria-current
// ---------------------------------------------------------------------------

test("06-phase5: A — stage stepper renders with real color tokens", async ({ page, baseURL }) => {
  const report = new ReportBuilder("06-phase5-A-stepper", "Phase 5 Smoke A — Stage stepper")
  const diagnostics = attachBrowserDiagnostics(page)
  report.setEnvironment({ baseURL, surface: "/app/bookings/<id>" })

  const customerId = await createSmokeCustomer("A")
  const { bookingId, bookingNumber } = await seedBooking(customerId, "deposit_paid")

  try {
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    })

    const stepper = page.locator('nav[aria-label="Booking lifecycle progress"]')
    await expect(stepper).toBeVisible({ timeout: 10_000 })

    // Eight forward stages (no "lost" branch).
    const stepNodes = stepper.locator('[aria-current], div[title]')
    await expect(stepNodes.first()).toBeVisible()

    const currentStep = stepper.locator('[aria-current="step"]')
    await expect(currentStep).toHaveCount(1)
    await expect(currentStep).toContainText(/Deposit Paid/i)

    // Verify the active step circle has a real (non-transparent) background.
    const circle = currentStep.locator("div").first()
    const bgColor = await circle.evaluate((el) => window.getComputedStyle(el).backgroundColor)
    expect(bgColor).not.toBe("rgba(0, 0, 0, 0)")
    expect(bgColor).not.toBe("transparent")

    const screenshot = await report.screenshot(page, "stepper-deposit-paid")
    report.step("stepper renders at deposit_paid with non-transparent active circle", {
      status: "pass",
      screenshot,
      evidence: { bookingId, bookingNumber, bgColor },
    })
  } finally {
    await cleanupSmokeFixtures(customerId)
    report.step("captured browser diagnostics", {
      status:
        diagnostics.consoleErrors.length === 0 && diagnostics.failedResponses.length === 0
          ? "pass"
          : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})

// ---------------------------------------------------------------------------
// Test B — send: let it commit after delay
// ---------------------------------------------------------------------------

test("06-phase5: B — send dialog commits after delay (let-it-send)", async ({ page, baseURL }) => {
  const report = new ReportBuilder("06-phase5-B-send-commit", "Phase 5 Smoke B — let-it-send commits")
  const diagnostics = attachBrowserDiagnostics(page)
  report.setEnvironment({ baseURL, delay: process.env.NEXT_PUBLIC_OPTIMISTIC_SEND_DELAY_MS ?? "default" })

  const customerId = await createSmokeCustomer("B")
  const { bookingId, bookingNumber } = await seedBooking(customerId, "enquiry")
  const { quoteId } = await seedDraftQuote(bookingId)

  try {
    // Land on the detail page (no tab) first and confirm the booking loaded
    // before navigating to the quotes tab — mirrors the lifecycle spec.
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.goto(`/app/bookings/${bookingId}?tab=quotes`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    })

    await startSend(page)

    const correspondencePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/correspondence") && resp.request().method() === "POST",
      { timeout: 15_000 },
    )

    const sendBtn = page.getByRole("button", { name: /^Send$/ }).last()
    await sendBtn.click()

    // Dialog should close immediately (Gmail-style).
    await expect(page.getByRole("dialog").filter({ hasText: /Preview & Send Quote/i })).not.toBeVisible({
      timeout: 2_000,
    })

    // Toast with Undo action should appear.
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 3_000 })

    // Let the timer elapse and the POST fire.
    const response = await correspondencePromise
    expect(response.ok()).toBeTruthy()

    // Verify quote status flipped to "sent" in the DB.
    const supabase = createQaSupabase()
    const { data: quoteRow } = await supabase
      .from("quotes")
      .select("status")
      .eq("id", quoteId)
      .single()
    expect(quoteRow?.status).toBe("sent")

    report.step("correspondence POST fired and quote flipped to sent", {
      status: "pass",
      evidence: { quoteId, status: quoteRow?.status, responseStatus: response.status() },
    })
  } finally {
    await cleanupSmokeFixtures(customerId)
    report.step("captured browser diagnostics", {
      status:
        diagnostics.consoleErrors.length === 0 ? "pass" : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})

// ---------------------------------------------------------------------------
// Test C — send: Undo cancels the send
// ---------------------------------------------------------------------------

test("06-phase5: C — Undo in the toast cancels the send", async ({ page, baseURL }) => {
  const report = new ReportBuilder("06-phase5-C-send-undo", "Phase 5 Smoke C — Undo cancels send")
  const diagnostics = attachBrowserDiagnostics(page)
  report.setEnvironment({ baseURL })

  const customerId = await createSmokeCustomer("C")
  const { bookingId, bookingNumber } = await seedBooking(customerId, "enquiry")
  const { quoteId } = await seedDraftQuote(bookingId)

  const observedRequests: Array<{ url: string; method: string }> = []
  const requestListener = (request: Request) => {
    observedRequests.push({ url: request.url(), method: request.method() })
  }
  page.on("request", requestListener)

  try {
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.goto(`/app/bookings/${bookingId}?tab=quotes`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    })

    await startSend(page)

    const sendBtn = page.getByRole("button", { name: /^Send$/ }).last()
    await sendBtn.click()

    // Toast appears immediately with Undo action. Use force:true because
    // Sonner animates the toast entry and Playwright's stability check can
    // race the animation when the toast duration is short (500ms in tests).
    const toast = page.locator('[data-sonner-toast]').first()
    await expect(toast).toBeVisible({ timeout: 3_000 })

    // Sonner's action button is rendered inside a portal and its React
    // synthetic onClick can race Playwright's default click sequence
    // (pointerdown -> pointerup -> click) when the toast is mid-entry
    // animation. Dispatch a native click event directly via evaluate to
    // guarantee the handler runs.
    const undoBtn = toast.getByRole("button", { name: /Undo/i })
    await undoBtn.waitFor({ state: "visible", timeout: 3_000 })
    await undoBtn.evaluate((el) => (el as HTMLButtonElement).click())

    // The hook's onClick handler emits a "Send cancelled" toast. If we don't
    // see it, the click didn't dispatch to the action handler — fail with a
    // clear cause instead of a downstream assertion mismatch.
    await expect(page.getByText(/Send cancelled/i)).toBeVisible({ timeout: 3_000 })

    // Wait well past the 3s test delay so any rogue timer would have fired.
    await page.waitForTimeout(4_000)

    // Assert no /api/correspondence POST happened.
    const correspondencePosts = observedRequests.filter(
      (req) => req.url.includes("/api/correspondence") && req.method === "POST",
    )
    expect(correspondencePosts).toHaveLength(0)

    // Quote stays draft.
    const supabase = createQaSupabase()
    const { data: quoteRow } = await supabase
      .from("quotes")
      .select("status")
      .eq("id", quoteId)
      .single()
    expect(quoteRow?.status).toBe("draft")

    report.step("Undo cancels send: no correspondence POST, quote still draft", {
      status: "pass",
      evidence: { quoteId, status: quoteRow?.status, correspondencePostCount: 0 },
    })
  } finally {
    page.off("request", requestListener)
    await cleanupSmokeFixtures(customerId)
    report.step("captured browser diagnostics", {
      status: diagnostics.consoleErrors.length === 0 ? "pass" : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})

// ---------------------------------------------------------------------------
// Test D — pnpm db:seed:demo lands the DEMO booking
// ---------------------------------------------------------------------------

test("06-phase5: D — pnpm db:seed:demo lands DEMO booking idempotently", async ({ baseURL }) => {
  const report = new ReportBuilder("06-phase5-D-demo-seed", "Phase 5 Smoke D — db:seed:demo end-to-end")
  report.setEnvironment({ baseURL })

  const runSeed = (): { code: number | null; output: string } => {
    const result = spawnSync("pnpm", ["db:seed:demo"], { shell: true, encoding: "utf8" })
    return { code: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` }
  }

  // First run.
  const first = runSeed()
  expect(first.code).toBe(0)

  const supabase = createQaSupabase()
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, stage, booking_number")
    .eq("booking_number", "DEMO-2026-0001")
    .maybeSingle()
  expect(bookingError).toBeNull()
  expect(booking).not.toBeNull()
  expect(booking?.stage).toBe("accepted")

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, quote_number, status")
    .eq("quote_number", "DEMO-2026-0001-Q1")
    .maybeSingle()
  expect(quote).not.toBeNull()
  expect(quote?.status).toBe("accepted")

  // Second run — must be idempotent (seed-demo.sql guards with DELETE).
  const second = runSeed()
  expect(second.code).toBe(0)

  const { data: bookingAfter } = await supabase
    .from("bookings")
    .select("stage")
    .eq("booking_number", "DEMO-2026-0001")
    .maybeSingle()
  expect(bookingAfter?.stage).toBe("accepted")

  report.step("db:seed:demo ran twice; DEMO booking persists at accepted", {
    status: "pass",
    evidence: {
      firstRunCode: first.code,
      secondRunCode: second.code,
      bookingId: booking?.id,
      quoteStatus: quote?.status,
    },
  })
  report.write()
})
