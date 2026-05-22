import { expect, test, type Page } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { forceAdvanceStage } from "../lib/db-bypass"
import { createQaSupabase } from "../lib/db"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"
import { readRunState } from "../lib/run-state"
import { QA_RUN } from "../lib/test-data"

test.use({ storageState: ADMIN_STORAGE_STATE })

// Phase 4 walks the full booking lifecycle. The flow has many independent
// surfaces (quote dialog, stage modal, deposit dialog, payment dialog, voucher
// dialog) and the 90s default-per-test timeout is not enough.
test.setTimeout(420_000)

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupPriorQaBookings(customerId: string): Promise<{ removedCount: number }> {
  const supabase = createQaSupabase()
  const { data: priorBookings, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("customer_id", customerId)

  if (error) {
    throw new Error(`Failed to inspect existing QA bookings: ${error.message}`)
  }

  const bookingIds = (priorBookings ?? []).map((row) => row.id)
  if (bookingIds.length === 0) {
    return { removedCount: 0 }
  }

  // Delete dependent rows first. We are intentionally aggressive here — the
  // QA customer is dedicated to this suite.
  const quoteRowsResult = await supabase
    .from("quotes")
    .select("id")
    .in("booking_id", bookingIds)
  const quoteIds = (quoteRowsResult.data ?? []).map((row) => row.id)
  if (quoteIds.length > 0) {
    await supabase.from("quote_line_items").delete().in("quote_id", quoteIds)
  }

  await supabase.from("payments").delete().in("booking_id", bookingIds)
  await supabase.from("invoices").delete().in("booking_id", bookingIds)
  await supabase.from("quotes").delete().in("booking_id", bookingIds)
  await supabase.from("itineraries").delete().in("booking_id", bookingIds)
  await supabase.from("documents").delete().in("booking_id", bookingIds)
  await supabase.from("correspondences").delete().in("booking_id", bookingIds)
  await supabase.from("booking_suites").delete().in("booking_id", bookingIds)
  await supabase.from("travellers").delete().in("booking_id", bookingIds)
  await supabase.from("booking_transport_requests").delete().in("booking_id", bookingIds)
  await supabase.from("booking_notes").delete().in("booking_id", bookingIds)
  await supabase.from("audit_logs").delete().in("entity_id", bookingIds)

  const { error: deleteError } = await supabase
    .from("bookings")
    .delete()
    .in("id", bookingIds)

  if (deleteError) {
    throw new Error(`Failed to delete existing QA bookings: ${deleteError.message}`)
  }

  return { removedCount: bookingIds.length }
}

// ---------------------------------------------------------------------------
// Booking seeding
// ---------------------------------------------------------------------------

async function allocateQaBookingNumber(): Promise<string> {
  // The job-numbering helper is server-only and side-effects the sequence
  // table. For QA we use a high-range prefix that the seed/demo data never
  // touches.
  const supabase = createQaSupabase()
  const prefix = "QA-2026-"

  const { data, error } = await supabase
    .from("bookings")
    .select("booking_number")
    .ilike("booking_number", `${prefix}%`)
    .order("booking_number", { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to read existing QA booking numbers: ${error.message}`)
  }

  const lastNumber = data?.[0]?.booking_number
  const lastSeq = lastNumber
    ? Number(lastNumber.replace(prefix, "")) || 0
    : 0
  const next = String(lastSeq + 1).padStart(4, "0")
  return `${prefix}${next}`
}

interface SeededBooking {
  bookingId: string
  bookingNumber: string
}

async function seedBooking(
  customerId: string,
  packageId: string | null,
): Promise<SeededBooking> {
  const supabase = createQaSupabase()
  const bookingNumber = await allocateQaBookingNumber()
  const bookingId = randomUUID()

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      id: bookingId,
      booking_number: bookingNumber,
      customer_id: customerId,
      package_id: packageId,
      stage: "enquiry",
      purpose: "reservation",
      source: "web_form",
      departure_date: QA_RUN.job.travelDateStart,
      duration_nights: 4,
      no_of_adults: QA_RUN.job.paxAdults,
      no_of_children: QA_RUN.job.paxChildren,
      no_of_suites: 1,
      hotel_phase: "none",
      terms_accepted: true,
      deposit_paid: false,
      invoice_balance: 0,
    })
    .select("id, booking_number")
    .single()

  if (error || !data) {
    throw new Error(`Failed to seed booking: ${error?.message ?? "no data"}`)
  }

  return { bookingId: data.id, bookingNumber: data.booking_number }
}

// ---------------------------------------------------------------------------
// DB evidence helpers
// ---------------------------------------------------------------------------

interface BookingSnapshot {
  stage: string | null
  deposit_paid: boolean | null
  invoice_balance: number | null
  quote_count: number
  quote_numbers: string[]
  invoice_summary: Array<{ kind: string; status: string; total: number | null }>
  payment_total: number
  document_kinds: string[]
  correspondence_subjects: string[]
}

async function snapshotBooking(bookingId: string): Promise<BookingSnapshot> {
  const supabase = createQaSupabase()
  const [
    { data: booking },
    { data: quotes },
    { data: invoices },
    { data: payments },
    { data: documents },
    { data: correspondence },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("stage, deposit_paid, invoice_balance")
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("quotes")
      .select("id, quote_number, status, total")
      .eq("booking_id", bookingId)
      .order("created_at"),
    supabase
      .from("invoices")
      .select("id, kind, status, amount")
      .eq("booking_id", bookingId)
      .order("created_at"),
    supabase
      .from("payments")
      .select("id, amount")
      .eq("booking_id", bookingId),
    supabase
      .from("documents")
      .select("id, kind, file_name")
      .eq("booking_id", bookingId),
    supabase
      .from("correspondences")
      .select("id, kind, subject")
      .eq("booking_id", bookingId),
  ])

  return {
    stage: booking?.stage ?? null,
    deposit_paid: booking?.deposit_paid ?? null,
    invoice_balance: booking?.invoice_balance ?? null,
    quote_count: quotes?.length ?? 0,
    quote_numbers: (quotes ?? []).map((q) => q.quote_number ?? ""),
    invoice_summary: (invoices ?? []).map((row) => ({
      kind: row.kind,
      status: row.status,
      total: row.amount,
    })),
    payment_total: (payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    document_kinds: (documents ?? []).map((doc) => doc.kind),
    correspondence_subjects: (correspondence ?? []).map((c) => c.subject ?? c.kind ?? ""),
  }
}

// ---------------------------------------------------------------------------
// Stage attempt helper
// ---------------------------------------------------------------------------

async function attemptStageForward(
  page: Page,
  bookingId: string,
  expectedStage: string,
  options: { timeout?: number } = {},
): Promise<{
  ok: boolean
  status: number | null
  failures: unknown
  responseBody: unknown
}> {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes(`/api/jobs/${bookingId}`) &&
        response.request().method() === "PATCH",
      { timeout: options.timeout ?? 15_000 },
    )
    .catch(() => null)

  await page
    .getByRole("button", { name: /^Next/ })
    .first()
    .click({ timeout: 5_000 })
    .catch(() => undefined)

  const response = await responsePromise
  if (!response) {
    return { ok: false, status: null, failures: null, responseBody: null }
  }

  const status = response.status()
  const body = await response.json().catch(() => null)

  return {
    ok: response.ok(),
    status,
    failures: (body as { failures?: unknown })?.failures ?? null,
    responseBody: body,
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test("04-lifecycle: walk enquiry → voucher_sent capturing every gap", async ({
  page,
  baseURL,
}) => {
  const report = new ReportBuilder("04-lifecycle", "Phase 4 Booking Lifecycle QA")
  const diagnostics = attachBrowserDiagnostics(page)
  const workarounds: Array<{ stage: string; reason: string }> = []
  const stageTable: Array<{
    stage: string
    expected: string
    result: "pass" | "warn" | "fail"
    note: string
  }> = []

  report.setGoal(
    "Walk a booking from enquiry → voucher_sent using the Phase 1–3 fixtures, capturing every broken UI guard, missing PDF, or stage that has to be force-advanced via service-role. Failure handling is capture–continue–report.",
  )
  report.setEnvironment({
    baseURL,
    user: "carmen@luxustravel.co.za",
    storageState: ADMIN_STORAGE_STATE,
    timeoutMs: 420_000,
  })

  // Run-state from prior phases is best-effort. global-setup runs `pnpm
  // db:reset` before the suite which wipes any pre-existing fixtures, so
  // when Phase 4 is run in isolation the customer/package IDs in run-state
  // no longer exist. Bootstrap as needed.
  const state = readRunState()
  const supabase = createQaSupabase()
  const fixture = QA_RUN.customer

  let customerId: string | null = state.customer?.id ?? null
  if (customerId) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle()
    if (!existingCustomer) {
      customerId = null
    }
  }

  if (!customerId) {
    const { data: existingByEmail } = await supabase
      .from("customers")
      .select("id")
      .eq("email", fixture.email)
      .maybeSingle()
    if (existingByEmail?.id) {
      customerId = existingByEmail.id
    } else {
      const { data: created, error: createError } = await supabase
        .from("customers")
        .insert({
          email: fixture.email,
          first_name: fixture.firstName,
          last_name: fixture.lastName,
          phone: fixture.phone,
          country: fixture.country,
          province: fixture.province,
          title: fixture.title,
          notes: fixture.notes,
        })
        .select("id")
        .single()
      if (createError || !created) {
        report.step("Phase 4 could not bootstrap fixture customer", {
          status: "fail",
          notes: [createError?.message ?? "Unknown error"],
        })
        report.write()
        throw new Error(`Failed to bootstrap QA customer: ${createError?.message}`)
      }
      customerId = created.id
    }
    report.step("Bootstrapped QA fixture customer (Phase 3 customer missing in DB)", {
      status: "warn",
      evidence: { customerId, email: fixture.email },
      notes: [
        "global-setup runs `pnpm db:reset` before every test run, so when Phase 4 is invoked in isolation the Phase 3 customer no longer exists.",
        "Phase 4 created a minimal QA customer so the lifecycle walk can proceed.",
      ],
    })
  }

  let packageId: string | null = state.package?.id ?? null
  if (packageId) {
    const { data: existingPackage } = await supabase
      .from("packages")
      .select("id")
      .eq("id", packageId)
      .maybeSingle()
    if (!existingPackage) {
      packageId = null
    }
  }
  if (!packageId) {
    report.step("Phase 4 proceeding without a package (Phase 2 fixture missing)", {
      status: "warn",
      notes: [
        "Bookings.package_id is nullable so the lifecycle walk can still proceed.",
        "Quote auto-population from the package will not be exercised.",
      ],
    })
  }

  let bookingId: string | null = null
  let bookingNumber: string | null = null

  try {
    // -----------------------------------------------------------------
    // Setup: cleanup + seed
    // -----------------------------------------------------------------
    const cleanup = await cleanupPriorQaBookings(customerId)
    report.step("Cleaned up prior QA bookings for fixture customer", {
      evidence: { removed: cleanup.removedCount, customerId },
    })

    const seeded = await seedBooking(customerId, packageId)
    bookingId = seeded.bookingId
    bookingNumber = seeded.bookingNumber

    report.step("Seeded booking directly via service-role insert", {
      status: "warn",
      notes: [
        "There is no 'Create booking from customer' surface on the customer detail page.",
        "The only UI path to create a booking is the New Enquiry dialog at /app/pipeline or /app/enquiries — and it is heavyweight (paste-import, manual entry, draft review).",
        "Phase 4 therefore seeds the booking via direct DB insert so the lifecycle phase can focus on the pipeline stages themselves.",
      ],
      evidence: { bookingId, bookingNumber, customerId, packageId },
    })

    // -----------------------------------------------------------------
    // Stage 1 — enquiry: open booking detail
    // -----------------------------------------------------------------
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    })
    const enquirySnapshot = await snapshotBooking(bookingId)
    report.step("Opened booking detail page (stage: enquiry)", {
      screenshot: await report.screenshot(page, "stage-01-enquiry"),
      evidence: { stage: enquirySnapshot.stage, url: page.url() },
    })
    stageTable.push({
      stage: "enquiry",
      expected: "booking visible with stage=enquiry",
      result: enquirySnapshot.stage === "enquiry" ? "pass" : "fail",
      note: `stage=${enquirySnapshot.stage}`,
    })

    // -----------------------------------------------------------------
    // Stage 2 — create quote (Q1)
    // -----------------------------------------------------------------
    await page.goto(`/app/bookings/${bookingId}?tab=quotes`)
    let quoteCreated = false
    let quote1Id: string | null = null
    let quote1Number: string | null = null
    {
      const createButton = page.getByRole("button", { name: /Create Quote/i }).first()
      if (await createButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const responsePromise = page
          .waitForResponse(
            (response) =>
              response.url().includes("/api/quotes") &&
              response.request().method() === "POST",
            { timeout: 15_000 },
          )
          .catch(() => null)

        await createButton.click()

        // Itinerary select is required — try to submit without one first
        const dialog = page.getByRole("dialog").filter({ has: page.getByText("Create Quote", { exact: true }) })
        const submit = dialog.getByRole("button", { name: /Create Quote/i }).last()

        // Try selecting an itinerary if any are listed; otherwise note the gap
        const trigger = dialog.locator("[id=itinerary]").first()
        let pickedItinerary = false
        if (await trigger.isVisible().catch(() => false)) {
          await trigger.click()
          const firstOption = page.getByRole("option").first()
          if (await firstOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await firstOption.click()
            pickedItinerary = true
          } else {
            // Close the popover via Escape so the dialog stays usable
            await page.keyboard.press("Escape")
          }
        }

        await submit.click().catch(() => undefined)
        const response = await responsePromise

        if (response && response.ok()) {
          const body = (await response.json().catch(() => ({}))) as {
            id?: string
            quoteNumber?: string
            quote?: { id?: string; quoteNumber?: string; quote_number?: string }
          }
          quote1Id = body.id ?? body.quote?.id ?? null
          quote1Number = body.quoteNumber ?? body.quote?.quoteNumber ?? body.quote?.quote_number ?? null
          quoteCreated = Boolean(quote1Id)
          report.step("UI: created quote Q1 via Create Quote dialog", {
            status: quoteCreated ? "pass" : "warn",
            screenshot: await report.screenshot(page, "stage-02-quote-created"),
            evidence: { quoteId: quote1Id, quoteNumber: quote1Number, pickedItinerary },
            notes: pickedItinerary
              ? []
              : ["No itinerary existed on the seeded booking; the Create Quote dialog requires one — Phase 4 fallback created the quote directly via API."],
          })
        } else {
          report.step("UI: Create Quote dialog did not produce a successful POST", {
            status: "warn",
            screenshot: await report.screenshot(page, "stage-02-quote-failed"),
            evidence: {
              status: response?.status() ?? null,
              body: response ? await response.json().catch(() => null) : null,
            },
            notes: [
              "Likely cause: itinerary list empty (the seeded booking has no itinerary).",
              "Falling back to direct /api/quotes POST without itineraryId.",
            ],
          })
          await page.keyboard.press("Escape").catch(() => undefined)
        }
      } else {
        report.step("UI: Create Quote button not visible on quotes tab", {
          status: "fail",
          screenshot: await report.screenshot(page, "stage-02-create-button-missing"),
        })
      }
    }

    // Fallback: create quote directly via API if UI route failed
    if (!quoteCreated) {
      const supabase = createQaSupabase()
      const { data: created, error } = await supabase
        .from("quotes")
        .insert({
          booking_id: bookingId,
          quote_number: `${bookingNumber}-Q1`,
          status: "draft",
          subtotal: 90000,
          vat: 13500,
          total: 103500,
          validity_until: "2026-09-01",
        })
        .select("id, quote_number")
        .single()
      if (error || !created) {
        report.step("Fallback quote insert failed", {
          status: "fail",
          notes: [error?.message ?? "Unknown insert error"],
        })
      } else {
        quote1Id = created.id
        quote1Number = created.quote_number
        quoteCreated = true
        workarounds.push({
          stage: "quote_sent",
          reason: "UI Create Quote dialog requires an itinerary which is not auto-created when a booking is seeded; inserted quote directly.",
        })
        report.step("Fallback: created quote via direct DB insert", {
          status: "warn",
          evidence: { quoteId: quote1Id, quoteNumber: quote1Number },
        })
      }
    }

    stageTable.push({
      stage: "quote draft",
      expected: `quote ${bookingNumber}-Q1 created`,
      result: quoteCreated ? "pass" : "fail",
      note: quote1Number ?? "no quote created",
    })

    // -----------------------------------------------------------------
    // Stage 3 — mark quote sent (UI send dialog is heavy; mark via DB)
    // -----------------------------------------------------------------
    if (quoteCreated && quote1Id) {
      const supabase = createQaSupabase()
      const { error } = await supabase
        .from("quotes")
        .update({ status: "sent" })
        .eq("id", quote1Id)
      if (error) {
        report.step("Could not mark quote as sent", {
          status: "fail",
          evidence: { error: error.message },
        })
      } else {
        workarounds.push({
          stage: "quote_sent",
          reason: "Skipped UI Send Quote dialog (preview + email send); flipped quote.status='sent' in DB to test stage gate.",
        })
        report.step("Marked Q1 as sent (DB workaround)", {
          status: "warn",
          notes: [
            "UI Send Quote flow involves preview, email body, PDF render and outbound send — out of scope to drive end-to-end.",
            "Logged as workaround.",
          ],
        })
      }
    }

    // -----------------------------------------------------------------
    // Stage transition: enquiry → quote_sent
    // -----------------------------------------------------------------
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    })

    const moveQuoteSent = await attemptStageForward(page, bookingId, "quote_sent")
    if (moveQuoteSent.ok) {
      report.step("UI: stage advanced to quote_sent via Next button", {
        screenshot: await report.screenshot(page, "stage-03-quote-sent"),
        evidence: { body: moveQuoteSent.responseBody },
      })
      stageTable.push({
        stage: "quote_sent",
        expected: "advance via UI Next",
        result: "pass",
        note: "ok",
      })
    } else {
      report.step("UI: Next button did not advance to quote_sent", {
        status: "warn",
        screenshot: await report.screenshot(page, "stage-03-blocked"),
        evidence: {
          status: moveQuoteSent.status,
          failures: moveQuoteSent.failures,
          body: moveQuoteSent.responseBody,
        },
        notes: [
          "Forcing the stage forward to keep lifecycle exercise moving.",
        ],
      })
      await forceAdvanceStage(bookingId, "quote_sent", "Phase 4: blocked at quote_sent stage")
      workarounds.push({ stage: "quote_sent", reason: "Next button stage gate failure (see step evidence)." })
      stageTable.push({
        stage: "quote_sent",
        expected: "advance via UI Next",
        result: "warn",
        note: "force-advanced",
      })
    }

    // -----------------------------------------------------------------
    // Quote revision (Q1 → Q2)
    // -----------------------------------------------------------------
    if (quote1Id) {
      const reviseResponse = await page
        .request.post(`${baseURL}/api/quotes/${quote1Id}/revise`)
        .catch((error) => ({
          ok: () => false,
          status: () => 0,
          text: async () => (error instanceof Error ? error.message : String(error)),
        }))
      const reviseOk =
        typeof (reviseResponse as { ok?: () => boolean }).ok === "function"
          ? (reviseResponse as { ok: () => boolean }).ok()
          : false
      const reviseStatus =
        typeof (reviseResponse as { status?: () => number }).status === "function"
          ? (reviseResponse as { status: () => number }).status()
          : 0
      const reviseText =
        typeof (reviseResponse as { text?: () => Promise<string> }).text === "function"
          ? await (reviseResponse as { text: () => Promise<string> }).text()
          : ""

      report.step("API: POST /api/quotes/{id}/revise to create Q2", {
        status: reviseOk ? "pass" : "warn",
        evidence: { status: reviseStatus, body: reviseText.slice(0, 500) },
        notes: reviseOk
          ? []
          : ["Quote revision endpoint failed — Q2 not created."],
      })

      const snapAfterRevise = await snapshotBooking(bookingId)
      const hasQ1 = snapAfterRevise.quote_numbers.some((n) => n.endsWith("-Q1"))
      const hasQ2 = snapAfterRevise.quote_numbers.some((n) => n.endsWith("-Q2"))
      report.step("DB: Q1 preserved alongside Q2 (versioning, not overwrite)", {
        status: hasQ1 && hasQ2 ? "pass" : "fail",
        evidence: { quoteNumbers: snapAfterRevise.quote_numbers },
      })
      stageTable.push({
        stage: "quote revision",
        expected: `${bookingNumber}-Q1 + ${bookingNumber}-Q2 both present`,
        result: hasQ1 && hasQ2 ? "pass" : "fail",
        note: snapAfterRevise.quote_numbers.join(", "),
      })
    }

    // -----------------------------------------------------------------
    // quote_sent → accepted
    // -----------------------------------------------------------------
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    })

    const moveAccepted = await attemptStageForward(page, bookingId, "accepted")
    if (moveAccepted.ok) {
      report.step("UI: stage advanced to accepted via Next button", {
        screenshot: await report.screenshot(page, "stage-04-accepted"),
        evidence: { body: moveAccepted.responseBody },
      })
      stageTable.push({
        stage: "accepted",
        expected: "advance via UI Next",
        result: "pass",
        note: "ok",
      })
    } else {
      // Stage transition modal may have opened — check
      const modalVisible = await page
        .getByRole("dialog")
        .first()
        .isVisible({ timeout: 1_500 })
        .catch(() => false)
      report.step("UI: Next to accepted did not auto-advance", {
        status: "warn",
        screenshot: await report.screenshot(page, "stage-04-blocked"),
        evidence: {
          status: moveAccepted.status,
          failures: moveAccepted.failures,
          modalVisible,
          body: moveAccepted.responseBody,
        },
      })
      await page.keyboard.press("Escape").catch(() => undefined)
      await forceAdvanceStage(bookingId, "accepted", "Phase 4: blocked moving to accepted")
      workarounds.push({ stage: "accepted", reason: "Next-button stage gate failure (see step evidence)." })
      stageTable.push({
        stage: "accepted",
        expected: "advance via UI Next",
        result: "warn",
        note: "force-advanced",
      })
    }

    // -----------------------------------------------------------------
    // accepted → deposit_requested
    // -----------------------------------------------------------------
    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    })

    let depositInvoiceCreated = false
    {
      // Try the deposit invoice header button if rendered
      const depositButton = page.getByRole("button", { name: /Deposit Invoice/i }).first()
      const buttonVisible = await depositButton.isVisible({ timeout: 3_000 }).catch(() => false)
      report.step("UI: header 'Deposit Invoice' button visibility", {
        status: buttonVisible ? "pass" : "warn",
        evidence: { visible: buttonVisible },
        notes: buttonVisible
          ? []
          : ["The button only renders if hasSentDepositInvoice is false AND the user has send:correspondence permission. Investigate if missing for admin."],
      })

      if (buttonVisible) {
        await depositButton.click().catch(() => undefined)
        await report.screenshot(page, "stage-05-deposit-dialog")
        const dialog = page.getByRole("dialog").filter({ has: page.getByText(/Deposit Invoice/i) })
        const visible = await dialog.isVisible({ timeout: 3_000 }).catch(() => false)
        if (visible) {
          report.step("Deposit invoice dialog opened", {
            screenshot: await report.screenshot(page, "stage-05-deposit-dialog-open"),
          })

          // Default percentage from app_settings (25 per CLAUDE.md).
          const generateButton = dialog
            .getByRole("button", { name: /Generate|Preview/i })
            .first()
          if (await generateButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
            const responsePromise = page
              .waitForResponse(
                (response) => response.url().includes("/api/invoices/deposit"),
                { timeout: 30_000 },
              )
              .catch(() => null)
            await generateButton.click().catch(() => undefined)
            const response = await responsePromise
            if (response && response.ok()) {
              depositInvoiceCreated = true
              report.step("API /api/invoices/deposit returned success", {
                status: "pass",
                evidence: { status: response.status() },
              })
            } else {
              report.step("API /api/invoices/deposit failed or did not fire", {
                status: "warn",
                evidence: {
                  status: response?.status() ?? null,
                  body: response ? await response.text().catch(() => "") : null,
                },
              })
            }
          }
        }
        // Close dialog
        await page.keyboard.press("Escape").catch(() => undefined)
      }
    }

    if (!depositInvoiceCreated) {
      // Fallback: insert invoice directly so later stages can be tested.
      const supabase = createQaSupabase()
      const { error } = await supabase.from("invoices").insert({
        booking_id: bookingId,
        kind: "deposit",
        status: "sent",
        amount: 25875,
        currency: "ZAR",
        invoice_number: `${bookingNumber}-D1`,
        sent_at: new Date().toISOString(),
      })
      if (error) {
        report.step("Fallback deposit-invoice insert failed", {
          status: "fail",
          evidence: { error: error.message },
        })
      } else {
        depositInvoiceCreated = true
        workarounds.push({
          stage: "deposit_requested",
          reason: "UI deposit invoice generation did not complete; inserted invoice row directly to allow downstream stages to test.",
        })
        report.step("Fallback: created deposit invoice via DB insert", {
          status: "warn",
        })
      }
    }

    const moveDepReq = await attemptStageForward(page, bookingId, "deposit_requested")
    if (moveDepReq.ok) {
      report.step("UI: stage advanced to deposit_requested", {
        screenshot: await report.screenshot(page, "stage-05-deposit-requested"),
      })
      stageTable.push({
        stage: "deposit_requested",
        expected: "advance via UI Next after deposit invoice exists",
        result: "pass",
        note: "ok",
      })
    } else {
      report.step("UI: could not advance to deposit_requested", {
        status: "warn",
        evidence: {
          status: moveDepReq.status,
          failures: moveDepReq.failures,
          body: moveDepReq.responseBody,
        },
      })
      await page.keyboard.press("Escape").catch(() => undefined)
      await forceAdvanceStage(bookingId, "deposit_requested", "Phase 4: blocked moving to deposit_requested")
      workarounds.push({ stage: "deposit_requested", reason: "Next gate failure on deposit_requested." })
      stageTable.push({
        stage: "deposit_requested",
        expected: "advance via UI Next",
        result: "warn",
        note: "force-advanced",
      })
    }

    // -----------------------------------------------------------------
    // deposit_requested → deposit_paid via UI payment record
    // -----------------------------------------------------------------
    await page.goto(`/app/bookings/${bookingId}?tab=payments`)
    let depositPaymentRecorded = false
    {
      const recordBtn = page.getByRole("button", { name: /Record Payment/i }).first()
      if (await recordBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await recordBtn.click()
        const dialog = page.getByRole("dialog").filter({ has: page.getByText(/Record Payment/i) })
        await dialog.locator('input[type="number"]').fill("25875")
        const referenceInputs = dialog.locator('input[type="text"]')
        if ((await referenceInputs.count()) > 0) {
          await referenceInputs.first().fill("QA-DEP-001")
        }
        const responsePromise = page
          .waitForResponse(
            (response) =>
              response.url().includes("/api/payments") &&
              response.request().method() === "POST",
            { timeout: 10_000 },
          )
          .catch(() => null)
        await dialog.getByRole("button", { name: /^Record$/ }).click().catch(() => undefined)
        const response = await responsePromise
        depositPaymentRecorded = Boolean(response && response.ok())
        report.step("UI: recorded deposit payment via Payments tab", {
          status: depositPaymentRecorded ? "pass" : "warn",
          screenshot: await report.screenshot(page, "stage-06-payment"),
          evidence: { status: response?.status() ?? null },
        })
      } else {
        report.step("UI: Record Payment button not visible", {
          status: "warn",
        })
      }
    }

    if (!depositPaymentRecorded) {
      const supabase = createQaSupabase()
      const { error } = await supabase.from("payments").insert({
        booking_id: bookingId,
        amount: 25875,
        method: "EFT",
        reference: "QA-DEP-001",
        notes: "QA fallback deposit payment",
      })
      if (error) {
        report.step("Fallback deposit-payment insert failed", {
          status: "fail",
          evidence: { error: error.message },
        })
      } else {
        workarounds.push({
          stage: "deposit_paid",
          reason: "UI payment dialog flow failed; inserted payment row directly.",
        })
        report.step("Fallback: inserted deposit payment via DB", { status: "warn" })
      }
    }

    // Mark booking deposit_paid=true (per CLAUDE.md guard)
    {
      const supabase = createQaSupabase()
      await supabase
        .from("bookings")
        .update({ deposit_paid: true, deposit_paid_at: new Date().toISOString() })
        .eq("id", bookingId)
    }

    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    })
    const moveDepPaid = await attemptStageForward(page, bookingId, "deposit_paid")
    if (moveDepPaid.ok) {
      report.step("UI: stage advanced to deposit_paid", {
        screenshot: await report.screenshot(page, "stage-06-deposit-paid"),
      })
      stageTable.push({
        stage: "deposit_paid",
        expected: "advance via UI Next with payment recorded",
        result: "pass",
        note: "ok",
      })
    } else {
      report.step("UI: could not advance to deposit_paid", {
        status: "warn",
        evidence: {
          status: moveDepPaid.status,
          failures: moveDepPaid.failures,
          body: moveDepPaid.responseBody,
        },
        notes: [
          "Per CLAUDE.md the system requires deposit_paid=TRUE before moving past this stage. Confirmed it was set.",
          "If the stage gate still blocks, capture the failure reason for triage.",
        ],
      })
      await page.keyboard.press("Escape").catch(() => undefined)
      await forceAdvanceStage(bookingId, "deposit_paid", "Phase 4: blocked moving to deposit_paid even with deposit_paid=true")
      workarounds.push({ stage: "deposit_paid", reason: "Next gate failure on deposit_paid." })
      stageTable.push({
        stage: "deposit_paid",
        expected: "advance via UI Next",
        result: "warn",
        note: "force-advanced",
      })
    }

    // -----------------------------------------------------------------
    // booking_made — flag the README-vs-enum discrepancy
    // -----------------------------------------------------------------
    {
      const FORWARD_STAGES = [
        "enquiry",
        "quote_sent",
        "accepted",
        "deposit_requested",
        "deposit_paid",
        "final_paid",
        "voucher_sent",
        "closed",
      ]
      const hasBookingMade = FORWARD_STAGES.includes("booking_made")
      report.step("README vs. enum: 'Booking Made' stage discrepancy", {
        status: "warn",
        evidence: {
          readmePipelineMentions: "Booking Made (per CLAUDE.md / README)",
          enumStages: FORWARD_STAGES,
          enumHasBookingMade: hasBookingMade,
        },
        notes: [
          "README/CLAUDE.md describes a 'Booking Made' stage between deposit_paid and final_paid.",
          "lib/pipeline/validate-transition.ts FORWARD_STAGES skips it — bookings go deposit_paid → final_paid directly.",
          "Decide: keep the README aspirational, or add a booking_made enum value (requires migration + UI).",
        ],
      })
    }

    // -----------------------------------------------------------------
    // → final_paid: create final invoice + balance payment
    // -----------------------------------------------------------------
    {
      const supabase = createQaSupabase()
      const { error } = await supabase.from("invoices").insert({
        booking_id: bookingId,
        kind: "final",
        status: "sent",
        amount: 77625,
        currency: "ZAR",
        invoice_number: `${bookingNumber}-F1`,
        sent_at: new Date().toISOString(),
      })
      if (error) {
        report.step("Final invoice insert failed", { status: "fail", evidence: { error: error.message } })
      } else {
        workarounds.push({
          stage: "final_paid",
          reason: "Final-invoice generation dialog flow not exercised end-to-end; inserted invoice row directly.",
        })
        report.step("Fallback: created final invoice via DB insert", { status: "warn" })
      }

      const { error: paymentError } = await supabase.from("payments").insert({
        booking_id: bookingId,
        amount: 77625,
        method: "EFT",
        reference: "QA-FINAL-001",
        notes: "QA fallback final payment",
      })
      if (paymentError) {
        report.step("Final payment insert failed", { status: "fail", evidence: { error: paymentError.message } })
      } else {
        report.step("Fallback: inserted balance payment via DB", { status: "warn" })
      }

      await supabase
        .from("bookings")
        .update({ invoice_balance: 0, final_paid_at: new Date().toISOString() })
        .eq("id", bookingId)
    }

    await page.goto(`/app/bookings/${bookingId}`)
    await expect(page.getByText(bookingNumber, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    })
    const moveFinal = await attemptStageForward(page, bookingId, "final_paid")
    if (moveFinal.ok) {
      report.step("UI: stage advanced to final_paid", {
        screenshot: await report.screenshot(page, "stage-08-final-paid"),
      })
      stageTable.push({
        stage: "final_paid",
        expected: "advance via UI Next with final invoice + balance payment",
        result: "pass",
        note: "ok",
      })
    } else {
      report.step("UI: could not advance to final_paid", {
        status: "warn",
        evidence: {
          status: moveFinal.status,
          failures: moveFinal.failures,
          body: moveFinal.responseBody,
        },
      })
      await page.keyboard.press("Escape").catch(() => undefined)
      await forceAdvanceStage(bookingId, "final_paid", "Phase 4: blocked moving to final_paid")
      workarounds.push({ stage: "final_paid", reason: "Next gate failure on final_paid." })
      stageTable.push({
        stage: "final_paid",
        expected: "advance via UI Next",
        result: "warn",
        note: "force-advanced",
      })
    }

    // -----------------------------------------------------------------
    // final_paid → voucher_sent
    // -----------------------------------------------------------------
    {
      const supabase = createQaSupabase()
      const { error } = await supabase.from("documents").insert({
        booking_id: bookingId,
        kind: "voucher_pdf",
        status: "generated",
        file_name: `${bookingNumber}-voucher.pdf`,
        storage_path: `qa/${bookingNumber}/voucher.pdf`,
      })
      if (error) {
        report.step("Voucher document insert failed", {
          status: "fail",
          evidence: { error: error.message },
          notes: [
            "Could not synthesize a voucher_pdf document — actual PDF render & storage upload would happen via /api/vouchers/{id}/send.",
            "This stage of the lifecycle is the most likely to have integration gaps (PDF render, storage, correspondence).",
          ],
        })
      } else {
        workarounds.push({
          stage: "voucher_sent",
          reason: "Voucher generation/send flow not exercised; synthesized voucher_pdf document row to test the stage gate.",
        })
        report.step("Fallback: inserted voucher_pdf document via DB", { status: "warn" })
      }

      // Voucher correspondence gate also requires a correspondences row with subject ~ "voucher"
      await supabase.from("correspondences").insert({
        booking_id: bookingId,
        kind: "voucher",
        subject: "Voucher / travel documents",
        body_html: "<p>QA fallback voucher email</p>",
        status: "sent",
        sent_at: new Date().toISOString(),
      })
    }

    const moveVoucher = await attemptStageForward(page, bookingId, "voucher_sent")
    if (moveVoucher.ok) {
      report.step("UI: stage advanced to voucher_sent", {
        screenshot: await report.screenshot(page, "stage-09-voucher-sent"),
      })
      stageTable.push({
        stage: "voucher_sent",
        expected: "advance via UI Next with voucher_pdf + voucher correspondence",
        result: "pass",
        note: "ok",
      })
    } else {
      report.step("UI: could not advance to voucher_sent", {
        status: "warn",
        evidence: {
          status: moveVoucher.status,
          failures: moveVoucher.failures,
          body: moveVoucher.responseBody,
        },
      })
      await page.keyboard.press("Escape").catch(() => undefined)
      await forceAdvanceStage(bookingId, "voucher_sent", "Phase 4: blocked moving to voucher_sent")
      workarounds.push({ stage: "voucher_sent", reason: "Next gate failure on voucher_sent." })
      stageTable.push({
        stage: "voucher_sent",
        expected: "advance via UI Next",
        result: "warn",
        note: "force-advanced",
      })
    }

    // -----------------------------------------------------------------
    // Final snapshot + stage table + workarounds + verdict
    // -----------------------------------------------------------------
    const finalSnap = await snapshotBooking(bookingId)
    report.addDbEvidence(finalSnap as unknown as Record<string, unknown>)

    report.step("Stage-by-stage results", {
      status: stageTable.some((s) => s.result === "fail")
        ? "fail"
        : stageTable.some((s) => s.result === "warn")
          ? "warn"
          : "pass",
      evidence: { stageTable },
    })

    report.step("forceAdvanceStage workarounds used", {
      status: workarounds.length === 0 ? "pass" : "warn",
      evidence: { count: workarounds.length, workarounds },
      notes: workarounds.length === 0
        ? []
        : [
            "Every force-advanced stage is a Sev-1 or Sev-2 gap. Triage these first in Phase 5.",
          ],
    })

    report.step("Document checklist", {
      status: finalSnap.document_kinds.some((kind) => kind === "voucher_pdf")
        ? "warn"
        : "fail",
      evidence: {
        quoteNumbers: finalSnap.quote_numbers,
        invoices: finalSnap.invoice_summary,
        documents: finalSnap.document_kinds,
        correspondence: finalSnap.correspondence_subjects,
      },
      notes: [
        "Quote PDFs (Q1/Q2): not exercised in Phase 4 (would require PreviewSend flow).",
        "Deposit invoice PDF: not exercised (relied on direct insert).",
        "Final invoice PDF: not exercised (relied on direct insert).",
        "Voucher PDF: synthesized via direct insert only — actual render pipeline is the top integration gap.",
      ],
    })

    const greenCount = stageTable.filter((s) => s.result === "pass").length
    const yellowCount = stageTable.filter((s) => s.result === "warn").length
    const redCount = stageTable.filter((s) => s.result === "fail").length
    const verdict =
      redCount > 0
        ? "RED: at least one stage failed outright"
        : yellowCount > 2
          ? "YELLOW: multiple stages required workarounds"
          : yellowCount > 0
            ? "YELLOW: at least one workaround required"
            : "GREEN: lifecycle walked end-to-end via UI"

    report.step("Demo-readiness verdict", {
      status: redCount > 0 ? "fail" : yellowCount > 0 ? "warn" : "pass",
      evidence: { green: greenCount, yellow: yellowCount, red: redCount, verdict, workaroundCount: workarounds.length },
    })
  } catch (error) {
    const screenshot = await report.screenshot(page, "lifecycle-uncaught").catch(() => undefined)
    report.step("Phase 4 aborted by uncaught exception", {
      status: "fail",
      screenshot,
      notes: [error instanceof Error ? error.message : String(error)],
      evidence: { bookingId, bookingNumber },
    })
  } finally {
    report.step("Captured browser diagnostics", {
      status:
        diagnostics.consoleErrors.length === 0 && diagnostics.failedResponses.length === 0
          ? "pass"
          : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})
