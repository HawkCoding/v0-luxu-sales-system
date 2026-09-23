import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import {
  TRAINING_DEPARTURE,
  TRAINING_PRODUCTS,
  beat,
  caption,
  clearOverlays,
  createTrainingBooking,
  deleteEnquiryFixture,
  deleteTrainingBooking,
  highlight,
  highlightClick,
  type QaSupabase,
  type TrainingProduct,
} from "./training-video.fixtures"

// Silent training clips for the Quick Start Guide.
//
// Run with: playwright test --config tests/qa/training-video.config.ts
//
// Eight clips — four per product — because Playwright writes one video file per
// test. They teach the same steps, in the same order, in the same words as
// docs/handbook/content/quickstart/01-quick-start.md.
//
// Nothing here is faked. Every clip drives the real UI and every email is really
// sent (the local environment runs in email test mode). Clips 2–4 share one
// fixture booking per product which is created at `enquiry` and left at
// `voucher_sent`; deleting that booking in afterAll removes the quote, the
// services, the invoice, the payments, the voucher, the documents and the
// correspondence with it — every table referencing bookings.id cascades. Clip 1
// creates its booking through the UI and deletes that plus the customer the
// draft form made.
//
// Runs against the local demo database only.

/**
 * Playwright names each test's output directory after the test, then truncates
 * and hashes it when the path gets long — so the rename step cannot work back
 * from the folder name. Every test records where its video actually landed.
 */
const MANIFEST_PATH = resolve(process.cwd(), "docs/handbook/dist/video/.raw/manifest.jsonl")

test.afterEach(async ({}, testInfo) => {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
  appendFileSync(
    MANIFEST_PATH,
    `${JSON.stringify({
      title: testInfo.title,
      status: testInfo.status,
      durationMs: testInfo.duration,
      outputDir: testInfo.outputDir,
    })}\n`,
    "utf8",
  )
})

const CONSULTANT_EMAIL = "leonie@luxustravel.co.za"
const CONSULTANT_PASSWORD = "password123"

/** Signed-in state for clips 2–4 comes from the config; clip 1 starts signed out. */
const SIGNED_OUT = { cookies: [], origins: [] }

/** Fixture booking per product, created once and shared by clips 2, 3 and 4. */
const bookingIds = new Map<string, string>()

function bookingIdFor(product: TrainingProduct): string {
  const id = bookingIds.get(product.product)
  if (!id) throw new Error(`No training booking was created for ${product.product}.`)
  return id
}

// ---------------------------------------------------------------------------
// Shared steps
// ---------------------------------------------------------------------------

/** Sonner renders every toast with this attribute; the text is the assertion. */
function toast(page: import("@playwright/test").Page, text: RegExp) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text }).first()
}

async function expectToast(
  page: import("@playwright/test").Page,
  text: RegExp,
  timeout = 90_000,
): Promise<void> {
  await expect(toast(page, text)).toBeVisible({ timeout })
}

/**
 * Wait for the booking to actually reach `stage` in the database.
 *
 * Asserted against the row rather than the badge: a stage move rides on an
 * optimistic five-second send timer and a follow-up PATCH, so a clip that films
 * a stage that never moved has to fail here rather than roll on silently.
 */
async function waitForStage(
  supabase: QaSupabase,
  bookingId: string,
  stage: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let seen = "unknown"
  while (Date.now() < deadline) {
    const { data } = await supabase.from("bookings").select("stage").eq("id", bookingId).maybeSingle()
    seen = data?.stage ?? "missing"
    if (seen === stage) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Booking ${bookingId} never reached stage "${stage}" (last seen "${seen}").`)
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/**
 * Pick a date in the react-day-picker popover by its year, month and day.
 *
 * Day buttons are named for the whole date ("Tuesday, 15 June 2027"), not the
 * number, so the number alone matches nothing.
 */
async function pickDate(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  iso: string,
): Promise<void> {
  const [year, month, day] = iso.split("-")
  await trigger.click()
  const popover = page.locator("[data-slot=calendar]").last()
  await expect(popover).toBeVisible()
  await popover.getByRole("combobox", { name: /year/i }).selectOption(String(Number(year)))
  await popover.getByRole("combobox", { name: /month/i }).selectOption(String(Number(month) - 1))
  const dayName = new RegExp(`\\b0?${Number(day)} ${MONTH_NAMES[Number(month) - 1]} ${year}$`)
  await popover.getByRole("button", { name: dayName }).first().click()
}

/** The booking's one invoice, read back so the clip can type the real figures. */
async function invoiceAmount(supabase: QaSupabase, bookingId: string): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .select("amount")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    throw new Error(`No invoice on booking ${bookingId} (${error?.message ?? "no row"}).`)
  }
  return Number(data.amount)
}

async function outstandingBalance(supabase: QaSupabase, bookingId: string): Promise<number> {
  const { data: quotes } = await supabase
    .from("quotes")
    .select("total, status, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
  const quoteTotal = Number(quotes?.[0]?.total ?? 0)

  const { data: payments } = await supabase.from("payments").select("amount").eq("booking_id", bookingId)
  const paid = (payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  const balance = Math.round((quoteTotal - paid) * 100) / 100
  if (!(balance > 0)) {
    throw new Error(`Expected an outstanding balance on ${bookingId}, got ${balance}.`)
  }
  return balance
}

// ---------------------------------------------------------------------------
// The clips
// ---------------------------------------------------------------------------

for (const product of TRAINING_PRODUCTS) {
  const draftEmail = `training.${product.product}@example.com`

  // -------------------------------------------------------------------------
  // Clip 1 — signed out, so it gets its own storage state.
  // -------------------------------------------------------------------------
  test.describe(`${product.product} clip 1`, () => {
    test.use({ storageState: SIGNED_OUT })

    test(`${product.product}-01-new-enquiry`, async ({ page }) => {
      loadQaEnv()
      const supabase = createQaSupabase()
      let createdBookingId: string | null = null

      try {
        await page.goto("/login")
        await expect(page.getByRole("button", { name: /sign in with email/i })).toBeVisible()
        await caption(page, "Step 1 — Sign in with your email address and password")

        await page.getByLabel("Email").fill(CONSULTANT_EMAIL)
        await page.getByLabel("Password").fill(CONSULTANT_PASSWORD)
        await highlightClick(page, page.getByRole("button", { name: /sign in with email/i }))
        await page.waitForURL(/\/app(?:\/|$)/)

        await expect(page.getByText("Open Jobs").first()).toBeVisible()
        await caption(
          page,
          "This is the dashboard. The sidebar on the left is the same on every screen.",
          3200,
        )

        await caption(page, "Step 2 — Click Enquiries in the sidebar")
        await highlightClick(page, page.getByRole("link", { name: /^Enquiries/ }).first())
        await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible()
        await beat(page)

        await caption(page, "Step 3 — Click New Enquiry to start one from scratch")
        await highlightClick(page, page.getByRole("button", { name: /new enquiry/i }))

        const newEnquiry = page.getByRole("dialog")
        await expect(newEnquiry.getByRole("heading", { name: "New Enquiry" })).toBeVisible()
        await caption(page, "Step 4 — Choose Manual Entry and say how the enquiry reached us")
        await newEnquiry.getByRole("tab", { name: /manual entry/i }).click()
        await expect(newEnquiry.getByText("How did this enquiry reach us?")).toBeVisible()
        await newEnquiry.locator("#manual-enquiry-source").click()
        await page.getByRole("option", { name: "Phone call" }).click()
        await highlightClick(page, newEnquiry.getByRole("button", { name: /start manual enquiry/i }))

        const draft = page.getByRole("dialog").filter({ hasText: "Review Imported Draft" })
        await expect(draft).toBeVisible({ timeout: 60_000 })
        await caption(page, "Step 5 — Fill in the customer. Starred fields are required.", 2600)

        // Labels in this form are not bound to their inputs, so the fields are
        // reached by placeholder — the same approach quickstart-shots.spec.ts uses.
        await draft.getByPlaceholder("Mr, Ms, Mrs...").fill("Mrs")
        await draft.getByPlaceholder("Country").fill("South Africa")
        await draft.getByPlaceholder("Enter first name").fill("Hannah")
        await draft.getByPlaceholder("Enter surname").fill("Meyer")
        await draft.getByPlaceholder("email@example.com").fill(draftEmail)
        await draft.getByPlaceholder("+27 XX XXX XXXX").fill("+27 82 555 0114")

        await caption(page, `Step 6 — Pick the supplier: ${product.supplier}`)
        await draft.getByRole("combobox").filter({ hasText: "Select supplier" }).first().click()
        await page.getByRole("option", { name: product.supplier, exact: true }).click()

        await caption(page, "Step 7 — Route, departure date, adults and suites")
        await draft.getByPlaceholder("e.g., Pretoria to Cape Town").fill(product.routeText)
        await pickDate(page, draft.getByRole("button", { name: /^Select date$/ }).first(), TRAINING_DEPARTURE)
        await draft.getByPlaceholder("Number of adults").fill("2")
        await draft.getByPlaceholder("Number of suites").fill("1")

        await caption(page, "Step 8 — Save & Open saves it and opens the new booking")
        const save = draft.getByRole("button", { name: /^Save & Open$/ })
        await expect(save).toBeEnabled()
        await highlightClick(page, save)

        await page.waitForURL(/\/app\/(?:bookings|jobs)\/[0-9a-f-]{36}/, { timeout: 90_000 })
        createdBookingId = page.url().match(/([0-9a-f-]{36})/)?.[1] ?? null
        expect(createdBookingId).not.toBeNull()

        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 })
        await caption(page, "Saving gives the booking its number and opens it", 2600)

        // Saving lands on Quotes with an empty draft quote already made; the
        // Enquiry tab is where the consultant reads what still has to be built.
        await caption(page, "Open the Enquiry tab and read the services panel first")
        await highlightClick(page, page.getByRole("tab", { name: "Enquiry" }))
        await expect(page.getByText("Requested services", { exact: true })).toBeVisible({
          timeout: 60_000,
        })
        await caption(page, "It tells you what is built, and what is still missing", 3600)
      } finally {
        await clearOverlays(page)
        await deleteEnquiryFixture(supabase, {
          bookingId: createdBookingId,
          customerEmail: draftEmail,
        })
      }
    })
  })

  // -------------------------------------------------------------------------
  // Clips 2–4 run in order against one booking and leave it at Voucher Sent.
  // -------------------------------------------------------------------------
  test.describe.serial(`${product.product} pipeline`, () => {
    test.beforeAll(async () => {
      loadQaEnv()
      const supabase = createQaSupabase()
      bookingIds.set(product.product, await createTrainingBooking(supabase, product))
    })

    test.afterAll(async () => {
      loadQaEnv()
      const supabase = createQaSupabase()
      const id = bookingIds.get(product.product)
      if (id) {
        await deleteTrainingBooking(supabase, id)
        bookingIds.delete(product.product)
      }
    })

    test(`${product.product}-02-build-and-send-quote`, async ({ page }) => {
      loadQaEnv()
      const supabase = createQaSupabase()
      const bookingId = bookingIdFor(product)

      try {
        await page.goto(`/app/bookings/${bookingId}?tab=enquiry`)
        await expect(page.getByText("Requested services", { exact: true })).toBeVisible({
          timeout: 90_000,
        })
        await caption(page, "Step 1 — Start Quote creates the draft quote to build into")
        await highlightClick(page, page.getByRole("button", { name: /^Start Quote$/ }))
        await expectToast(page, /draft quote created/i, 60_000)

        // Start Quote opens Build Booking itself; later, Edit Quote on the
        // Quotes tab reopens the same dialog.
        const build = page.getByRole("dialog")
        await expect(build.getByText("Build this booking's services")).toBeVisible({ timeout: 60_000 })
        await caption(
          page,
          "Build Booking opens on its own. Later you reopen it with Edit Quote.",
          3000,
        )

        await caption(page, "Step 2 — Pick the supplier, then click Add service")
        await build.getByRole("combobox").filter({ hasText: "Select supplier" }).click()
        await page.getByRole("option", { name: product.supplier, exact: true }).click()
        await highlightClick(page, build.getByRole("button", { name: "Add service" }))
        await expect(build.getByText(product.supplier).first()).toBeVisible()
        await caption(page, "Add every service the customer is buying, then click Next", 2600)
        await highlightClick(page, build.getByRole("button", { name: "Next" }))

        await expect(build.getByText("Configure services")).toBeVisible({ timeout: 90_000 })
        await caption(page, "Step 4 — Set the route and the suite type")
        await build.getByLabel(/^Route$/).click()
        await page.getByRole("option", { name: product.route, exact: true }).click()
        await build.getByLabel(/suite type/i).first().click()
        await page.getByRole("option", { name: product.suiteType, exact: true }).click()

        await caption(page, "Step 5 — Commission is required. Next stays disabled until it is set.", 2800)
        const commission = build.locator("div").filter({
          has: page.getByRole("radiogroup", { name: "Commission shape" }),
        })
        await highlightClick(page, page.getByRole("radio", { name: "% Markup" }))
        const commissionValue = page
          .getByRole("radiogroup", { name: "Commission shape" })
          .locator("xpath=following::input[1]")
        await commissionValue.fill("10")
        await expect(commission.first()).toBeVisible()

        const next = build.getByRole("button", { name: "Next" })
        await expect(next).toBeEnabled({ timeout: 30_000 })
        await highlightClick(page, next)

        await caption(page, "Step 6 — Step 3 shows every line before anything is saved", 2800)
        const apply = build.getByRole("button", { name: /^(Apply to quote|Replace & apply)$/ })
        await expect(apply).toBeEnabled({ timeout: 90_000 })
        await highlightClick(page, apply)
        await expectToast(page, /applied to quote/i, 60_000)

        await expect(page.getByText("Quote 1").first()).toBeVisible({ timeout: 60_000 })
        await caption(page, "Step 7 — The quote is priced. Check the lines and the total.", 3000)

        await caption(page, "Step 8 — Preview & Send. The quote PDF is attached for you.")
        await highlightClick(page, page.getByRole("button", { name: /preview & send/i }).first())

        const preview = page.getByRole("dialog").filter({ hasText: "Preview & Send Quote" })
        await expect(preview).toBeVisible({ timeout: 60_000 })
        await expect(preview.getByText("Email body (this send only)")).toBeVisible({ timeout: 90_000 })
        await caption(page, "Edits here apply to this one email only", 2400)

        const send = preview.getByRole("button", { name: /^Send$/ })
        await expect(send).toBeEnabled({ timeout: 60_000 })
        await highlightClick(page, send)
        await caption(page, "Sending the quote is what moves the booking to Quote Sent", 3000)
        await waitForStage(supabase, bookingId, "quote_sent")
        await caption(page, "Done — the booking is now at Quote Sent", 2600)
      } finally {
        await clearOverlays(page)
      }
    })

    test(`${product.product}-03-invoice-and-payment`, async ({ page }) => {
      loadQaEnv()
      const supabase = createQaSupabase()
      const bookingId = bookingIdFor(product)

      try {
        await page.goto(`/app/bookings/${bookingId}?tab=reservation`)
        await expect(page.getByText("Reservation form received", { exact: true })).toBeVisible({
          timeout: 90_000,
        })
        await caption(page, "Step 1 — The client accepts: tick Reservation form received")
        await highlightClick(page, page.locator("#reservation-form-received"))

        const ack = page.getByRole("dialog").filter({ hasText: "Reservation received" })
        await expect(ack).toBeVisible({ timeout: 90_000 })
        await caption(page, "The acknowledgement email opens straight away — review it and Send")
        await highlightClick(page, ack.getByRole("button", { name: /^Send( with attachment)?$/ }))
        await waitForStage(supabase, bookingId, "accepted")

        await caption(page, "Step 2 — Every guest needs a name, surname and ID or passport number", 3000)
        // The tab opens with one row already on it, so this tops the roster up to
        // the two adults the booking is priced for rather than adding two more.
        const addGuest = page.getByRole("button", { name: /add guest/i })
        const firstNames = page.getByPlaceholder("First name *")
        await highlight(page, addGuest)
        for (let guard = 0; (await firstNames.count()) < 2 && guard < 4; guard += 1) {
          await addGuest.click()
        }
        await expect(firstNames).toHaveCount(2, { timeout: 30_000 })

        await page.getByPlaceholder("Title").nth(0).fill("Mr")
        await page.getByPlaceholder("First name *").nth(0).fill("Johan")
        await page.getByPlaceholder("Surname *").nth(0).fill("van der Merwe")
        await page.getByPlaceholder("ID / Passport number *").nth(0).fill("8501015800089")
        await page.getByPlaceholder("Title").nth(1).fill("Mrs")
        await page.getByPlaceholder("First name *").nth(1).fill("Anel")
        await page.getByPlaceholder("Surname *").nth(1).fill("van der Merwe")
        await page.getByPlaceholder("ID / Passport number *").nth(1).fill("8703125800083")

        await caption(page, "Without those three fields the invoice will not generate")
        await highlightClick(page, page.getByRole("button", { name: /^Save guests$/ }))
        await expectToast(page, /guests saved/i, 60_000)

        await caption(page, "Step 3 — Type the invoice number. You choose it, not the system.", 3000)
        const invoiceNumberField = page.locator("#booking-invoice-number")
        await highlight(page, invoiceNumberField)
        await invoiceNumberField.fill(product.invoiceNumber)
        await invoiceNumberField.blur()
        await beat(page, 1500)

        await caption(page, "Step 4 — Generate Invoice, at the foot of the booking")
        const generateInvoice = page.getByRole("button", { name: /^generate invoice$/i })
        await highlightClick(page, generateInvoice)

        const generate = page.getByRole("dialog").filter({ hasText: "Generate invoice" })
        await expect(generate.getByLabel("Deposit percentage")).toBeVisible({ timeout: 60_000 })
        await caption(page, "Check the deposit percentage — 25% unless it has been changed", 2800)
        await highlightClick(page, generate.getByRole("button", { name: "Generate", exact: true }))

        // The invoice PDF is rendered server-side before the preview opens.
        const invoicePreview = page.getByRole("dialog").filter({ hasText: /Preview and send/ })
        await expect(invoicePreview).toBeVisible({ timeout: 180_000 })
        await caption(page, "Step 5 — The invoice PDF is already attached. Send with attachment.")
        await highlightClick(page, invoicePreview.getByRole("button", { name: /send with attachment/i }))
        await waitForStage(supabase, bookingId, "deposit_requested")
        await caption(page, "That send moves the booking to Deposit Invoice Sent", 2800)

        const deposit = await invoiceAmount(supabase, bookingId)

        await caption(page, "Step 6 — When the money lands, open Payments and Record Payment")
        await highlightClick(page, page.getByRole("tab", { name: /^Payments/ }))
        await expect(page.getByText("Total Received")).toBeVisible({ timeout: 60_000 })
        await highlightClick(page, page.getByRole("button", { name: /record payment/i }))

        const record = page.getByRole("dialog").filter({ hasText: "Record Payment" })
        await expect(record).toBeVisible({ timeout: 60_000 })
        await caption(page, "Set the date the money landed, the amount, the method and the reference", 3000)
        await record.locator('input[type="number"]').fill(String(deposit))
        // Amount is the only number field; Reference is the first plain text one.
        await record
          .locator("input:not([type=number])")
          .first()
          .fill(`EFT-DEP-${product.invoiceNumber.slice(-4)}`)
        await highlightClick(page, record.getByRole("button", { name: "Record", exact: true }))
        await expectToast(page, /payment recorded/i, 60_000)

        await caption(page, "Step 7 — Recording it does not move the stage. Sending the confirmation does.", 3400)
        await highlightClick(page, page.getByRole("button", { name: /send payment confirmation/i }))

        const confirmation = page.getByRole("dialog").filter({ hasText: "Payment received" })
        await expect(confirmation).toBeVisible({ timeout: 180_000 })
        await caption(page, "The same invoice is re-attached, amended with what has been received")
        await highlightClick(
          page,
          confirmation.getByRole("button", { name: /^Send( with attachment)?$/ }),
        )
        await waitForStage(supabase, bookingId, "deposit_paid")
        await caption(page, "Done — the booking is now at Deposit Paid", 2600)
      } finally {
        await clearOverlays(page)
      }
    })

    test(`${product.product}-04-voucher-and-close`, async ({ page }) => {
      loadQaEnv()
      const supabase = createQaSupabase()
      const bookingId = bookingIdFor(product)

      try {
        const balance = await outstandingBalance(supabase, bookingId)

        await page.goto(`/app/bookings/${bookingId}?tab=payments`)
        await expect(page.getByText("Total Received")).toBeVisible({ timeout: 90_000 })
        await caption(page, "Step 1 — There is no second invoice. Record the balance the same way.", 3400)
        await highlightClick(page, page.getByRole("button", { name: /record payment/i }))

        const record = page.getByRole("dialog").filter({ hasText: "Record Payment" })
        await expect(record).toBeVisible({ timeout: 60_000 })
        await record.locator('input[type="number"]').fill(String(balance))
        await record
          .locator("input:not([type=number])")
          .first()
          .fill(`EFT-BAL-${product.invoiceNumber.slice(-4)}`)
        await highlightClick(page, record.getByRole("button", { name: "Record", exact: true }))
        await expectToast(page, /payment recorded/i, 60_000)

        await caption(page, "Step 2 — Send the payment confirmation again. That is what moves the stage.", 3400)
        await highlightClick(page, page.getByRole("button", { name: /send payment confirmation/i }))

        const confirmation = page.getByRole("dialog").filter({ hasText: "Payment received" })
        await expect(confirmation).toBeVisible({ timeout: 180_000 })
        await highlightClick(
          page,
          confirmation.getByRole("button", { name: /^Send( with attachment)?$/ }),
        )

        // Once the balance clears the move happens on its own. It only stops for a
        // confirmation when the gate cannot verify the figures itself, so the modal
        // is handled if it appears rather than waited on.
        await caption(page, "That second confirmation is what clears the balance", 3000)
        const confirmMove = page.getByRole("button", { name: /confirm and move/i })
        const needsConfirming = await confirmMove
          .waitFor({ state: "visible", timeout: 25_000 })
          .then(() => true)
          .catch(() => false)
        if (needsConfirming) {
          await caption(page, "Paid in Full asks for one deliberate confirmation")
          await highlightClick(page, confirmMove)
        }
        await waitForStage(supabase, bookingId, "final_paid")
        await caption(page, "The booking is now at Paid in Full", 2600)

        await caption(page, "Step 3 — Voucher Details: every leg needs the supplier's reference")
        await page.goto(`/app/bookings/${bookingId}?tab=references`)
        const reference = page.getByLabel("Reference number").first()
        await expect(reference).toBeVisible({ timeout: 90_000 })
        await highlight(page, reference)
        await reference.fill(product.supplierReference)
        await page.getByLabel("Contact name").first().fill("Sipho")
        await highlightClick(page, page.getByRole("button", { name: /^Save$/ }).first())
        await expect(page.getByText("All legs have reference numbers")).toBeVisible({ timeout: 60_000 })
        await caption(page, "A leg with no reference number blocks the voucher outright", 3000)

        await caption(page, "Step 4 — Documents tab, then Preview & Send Voucher")
        await page.goto(`/app/bookings/${bookingId}?tab=documents`)
        await highlightClick(page, page.getByRole("button", { name: /preview & send voucher/i }))

        // One click rebuilds the voucher PDF from the latest booking details,
        // prepares the email, and opens the send-preview dialog automatically.
        const sendVoucher = page.getByRole("dialog").filter({ hasText: "Send travel voucher" })
        await expect(sendVoucher).toBeVisible({ timeout: 180_000 })
        await caption(page, "Read any amber warnings above the preview — they do not stop you sending", 2600)
        await caption(page, "The client gets the voucher and a client itinerary in one email")
        await highlightClick(page, sendVoucher.getByRole("button", { name: /send with attachment/i }))
        await waitForStage(supabase, bookingId, "voucher_sent")

        await caption(page, "Sending the voucher moves the booking to Voucher Sent and marks it Won", 3400)
        await caption(
          page,
          "Closed is automatic — the system closes the booking seven days after the trip ends",
          4000,
        )
      } finally {
        await clearOverlays(page)
      }
    })
  })
}
