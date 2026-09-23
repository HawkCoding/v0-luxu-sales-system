import { expect, test, type Locator, type Page } from "@playwright/test"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import type { Json } from "../../lib/supabase/types"
import { HANDBOOK_USERS, SHOT_VIEWPORT, shot } from "./handbook-shots.fixtures"

// Quick Start Guide figure capture.
//
// Run with: playwright test --config tests/qa/quickstart-shots.config.ts
//
// Every figure in the quick-start chapter is captured here, including screens the
// consultant handbook also documents. The handbook's own PNGs were taken against
// an older build with different branding and a different sidebar, and a guide that
// mixes the two reads as though the app changed halfway through. Slugs are
// prefixed `qs-` so this set and the handbook's never collide, and the handbook's
// figures are left exactly as they are.
//
// Runs against the local demo database only.

// Seeded bookings this suite drives:
//   9002 / LTT-2026-0033 — the single booking at stage `enquiry`, which is the
//                          one the guide tells a consultant to pick up. It has no
//                          quote, so the quote figures seed one and remove it.
//   9013 / LTT-2026-0025 — accepted with an accepted quote and no invoice, the only
//                          state Generate Invoice appears in.
//   9018 / LTT-2026-0021 — deposit_requested, invoice sent, nothing paid: where the
//                          payment figures run.
//   9024 / LTT-2025-0009 — final_paid with a zero balance and no voucher yet, the
//                          only seeded booking eligible for the whole voucher flow.
const QS_ENQUIRY_BOOKING = "00000000-0000-0000-0000-000000009002"
const QS_ACCEPTED_BOOKING = "00000000-0000-0000-0000-000000009013"
const QS_INVOICED_BOOKING = "00000000-0000-0000-0000-000000009018"
const QS_PAID_BOOKING = "00000000-0000-0000-0000-000000009024"
const QS_TRAIN_SUPPLIER = "002b438f-df83-483a-9274-f17e9fef7f35" // Blue Train

/**
 * The seed never populates booking_services — legs are normally created by Build
 * Booking — so the voucher figures add one leg of their own and remove it again.
 */
async function withBookingServiceLeg(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
  overrides: { supplierReference?: string | null; supplierContactName?: string | null } = {},
): Promise<() => Promise<void>> {
  const { data, error } = await supabase
    .from("booking_services")
    .insert({
      booking_id: bookingId,
      supplier_id: QS_TRAIN_SUPPLIER,
      label: "Blue Train — Pretoria to Cape Town",
      selected: true,
      sort_order: 1,
      supplier_reference: overrides.supplierReference ?? null,
      supplier_contact_name: overrides.supplierContactName ?? null,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`Could not seed the quick-start voucher leg (${error?.message ?? "no row"}).`)
  }

  return async () => {
    await supabase.from("booking_services").delete().eq("id", data.id)
  }
}

interface SeedQuoteLine {
  description: string
  qty: number
  unitPrice: number
  snapshot?: Json
}

/** A clean, fully priced quote, so the quote figures show a finished example. */
const QS_QUOTE_LINES: SeedQuoteLine[] = [
  {
    description: "Blue Train — Pretoria → Cape Town, Deluxe Suite",
    qty: 2,
    unitPrice: 35150,
    snapshot: { source: "pricing_engine", pricingMode: "rate_card", unit: "per person" },
  },
  {
    description: "The President Hotel — Bed and Breakfast, 2 nights",
    qty: 2,
    unitPrice: 4800,
    snapshot: { source: "pricing_engine", pricingMode: "rate_card", unit: "per night" },
  },
  {
    description: "Ulysses Tours & Transfers — Station > Hotel",
    qty: 1,
    unitPrice: 1450,
    snapshot: { source: "pricing_engine", pricingMode: "rate_card" },
  },
  {
    description: "Commission",
    qty: 1,
    unitPrice: 8135,
    snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      commission: { type: "percent", value: 10, amount: 8135, source: "line", bonus: 0 },
    },
  },
]

/** Inserts a provisional quote with line items and returns a cleanup that removes it. */
async function seedQuote(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
  quoteNumber: string,
): Promise<() => Promise<void>> {
  const total = QS_QUOTE_LINES.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      quote_number: quoteNumber,
      status: "draft",
      currency: "ZAR",
      subtotal: total,
      total,
      commission_bonus: 0,
    })
    .select("id")
    .single()
  if (error || !quote) {
    throw new Error(`Could not seed the quick-start quote fixture (${error?.message ?? "no row"}).`)
  }

  const { error: lineError } = await supabase.from("quote_line_items").insert(
    QS_QUOTE_LINES.map((line, index) => ({
      quote_id: quote.id,
      description: line.description,
      qty: line.qty,
      unit_price: line.unitPrice,
      total: line.unitPrice * line.qty,
      sort_order: index,
      pricing_snapshot: line.snapshot ?? null,
    })),
  )
  if (lineError) {
    await supabase.from("quotes").delete().eq("id", quote.id)
    throw new Error(`Could not seed the quick-start quote line items (${lineError.message}).`)
  }

  return async () => {
    await supabase.from("quotes").delete().eq("id", quote.id)
  }
}

/**
 * The consultant-typed invoice number gates every invoice action and the seed
 * leaves it null. Sets one and returns a cleanup restoring the original value.
 */
async function withInvoiceNumber(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
  value: string,
): Promise<() => Promise<void>> {
  const { data, error } = await supabase
    .from("bookings")
    .select("customer_invoice_number")
    .eq("id", bookingId)
    .maybeSingle()
  if (error || !data) {
    throw new Error(`Cannot read the booking's invoice number (${error?.message ?? "none found"}).`)
  }
  const original = data.customer_invoice_number

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ customer_invoice_number: value })
    .eq("id", bookingId)
  if (updateError) {
    throw new Error(`Could not set the quick-start invoice number (${updateError.message}).`)
  }

  return async () => {
    await supabase.from("bookings").update({ customer_invoice_number: original }).eq("id", bookingId)
  }
}

/**
 * The seeded departure sits inside 2 months, which switches "Pay in full" on and
 * hides the deposit percentage. Moves it out so the dialog shows the deposit form
 * the guide describes, and restores it afterwards.
 */
async function withDepartureDate(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
  value: string,
): Promise<() => Promise<void>> {
  const { data, error } = await supabase
    .from("bookings")
    .select("departure_date")
    .eq("id", bookingId)
    .maybeSingle()
  if (error || !data) {
    throw new Error(`Cannot read the booking's departure date (${error?.message ?? "none found"}).`)
  }
  const original = data.departure_date

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ departure_date: value })
    .eq("id", bookingId)
  if (updateError) {
    throw new Error(`Could not move the quick-start departure date (${updateError.message}).`)
  }

  return async () => {
    await supabase.from("bookings").update({ departure_date: original }).eq("id", bookingId)
  }
}

/**
 * An invoice cannot be generated until every traveller has a name and an
 * ID/passport number. Seeds a roster when the booking has none, and removes only
 * what it inserted.
 */
async function ensureTravellers(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
): Promise<() => Promise<void>> {
  const { data: existing, error } = await supabase
    .from("travellers")
    .select("id")
    .eq("booking_id", bookingId)
  if (error) {
    throw new Error(`Could not read the traveller roster (${error.message}).`)
  }
  if (existing && existing.length > 0) return async () => {}

  const { error: insertError } = await supabase.from("travellers").insert([
    {
      booking_id: bookingId,
      prefix: "Mr",
      first_name: "Johan",
      last_name: "van der Merwe",
      id_passport: "8501015800089",
      date_of_birth: "1985-01-01",
      residence: "South Africa",
      is_child: false,
      is_primary: true,
    },
    {
      booking_id: bookingId,
      prefix: "Mrs",
      first_name: "Anél",
      last_name: "van der Merwe",
      id_passport: "8703125800083",
      date_of_birth: "1987-03-12",
      residence: "South Africa",
      is_child: false,
      is_primary: false,
    },
  ])
  if (insertError) {
    throw new Error(`Could not seed the quick-start traveller roster (${insertError.message}).`)
  }

  return async () => {
    await supabase.from("travellers").delete().eq("booking_id", bookingId)
  }
}

// ---------------------------------------------------------------------------
// Finding your way around
// ---------------------------------------------------------------------------

test.describe("quickstart shell", () => {
  test("qs login", async ({ browser }) => {
    // Signed out on purpose — this is the first thing a new consultant sees.
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto("/login")
    await expect(page.getByRole("button", { name: /sign in with email/i })).toBeVisible({ timeout: 60_000 })
    await shot(page, "qs-login")
    await context.close()
  })

  test("qs dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app")
    await expect(page.getByText("Open Jobs").first()).toBeVisible({ timeout: 60_000 })
    await shot(page, "qs-dashboard")
    await context.close()
  })


  test("qs pipeline board", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/pipeline")
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("region", { name: "Voucher Sent stage column" })).toBeVisible()
    await shot(page, "qs-pipeline-board")
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Picking up an enquiry, and creating one
// ---------------------------------------------------------------------------

test.describe("quickstart enquiries", () => {
  test("qs enquiries list", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/enquiries")
    await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible({ timeout: 60_000 })
    await shot(page, "qs-enquiries-list")
    await context.close()
  })

  test("qs enquiry tab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${QS_ENQUIRY_BOOKING}?tab=enquiry`)
    await expect(page.getByText("Journey Details")).toBeVisible({ timeout: 60_000 })
    await shot(page, "qs-enquiry-tab")
    await context.close()
  })

  test("qs enquiry details", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${QS_ENQUIRY_BOOKING}?tab=enquiry`)
    await expect(page.getByText("Journey Details")).toBeVisible({ timeout: 60_000 })
    // The Requested services panel sits above these cards and fills the first
    // screen on its own, so this figure scrolls past it to the trip detail.
    await page.getByText("Journey Details").evaluate((element) => element.scrollIntoView({ block: "start" }))
    await shot(page, "qs-enquiry-details")
    await context.close()
  })

  test("qs new enquiry dialog", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/enquiries")
    await page.getByRole("button", { name: /new enquiry/i }).click({ timeout: 60_000 })
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: "New Enquiry" })).toBeVisible()
    await dialog.getByRole("tab", { name: /manual entry/i }).click()
    await expect(dialog.getByText("How did this enquiry reach us?")).toBeVisible()
    await shot(page, "qs-new-enquiry")
    await context.close()
  })

  test("qs enquiry draft form", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/enquiries")
    await page.getByRole("button", { name: /new enquiry/i }).click({ timeout: 60_000 })

    const dialog = page.getByRole("dialog")
    await dialog.getByRole("tab", { name: /manual entry/i }).click()
    await dialog.locator("#manual-enquiry-source").click()
    await page.getByRole("option", { name: "Phone call" }).click()
    await dialog.getByRole("button", { name: /start manual enquiry/i }).click()

    const draft = page.getByRole("dialog").filter({ hasText: "Review Imported Draft" })
    await expect(draft).toBeVisible({ timeout: 30_000 })

    // Labels in this form are not bound to their inputs, so the fields are
    // reached by placeholder. Filled in so the figure shows a worked example
    // rather than an empty form.
    await draft.getByPlaceholder("Mr, Ms, Mrs...").fill("Mrs")
    await draft.getByPlaceholder("Country").fill("South Africa")
    await draft.getByPlaceholder("Enter first name").fill("Hannah")
    await draft.getByPlaceholder("Enter surname").fill("Meyer")
    await draft.getByPlaceholder("email@example.com").fill("hannah.meyer@example.com")
    await draft.getByPlaceholder("+27 XX XXX XXXX").fill("+27 82 555 0114")
    await shot(page, "qs-enquiry-draft")

    // Nothing is saved — the draft dialog is abandoned.
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Building the booking and sending the quote
// ---------------------------------------------------------------------------

/**
 * The three Build Booking figures tell one story: the same train, transfer and
 * hotel in every capture, matching the lines on the seeded quote. Added in travel
 * order so the transfer's "After" anchor resolves to the train, not the hotel.
 */
async function addQuickStartServices(page: Page, dialog: Locator): Promise<void> {
  const services: { category: string; supplier: string }[] = [
    { category: "Train", supplier: "Blue Train" },
    { category: "Transfers", supplier: "Ulysses Tours & Transfers" },
    { category: "Hotel", supplier: "The President Hotel" },
  ]
  for (const service of services) {
    // Radix select triggers expose no accessible name, so they are matched on
    // position (category is the first) and on the placeholder text they render.
    await dialog.getByRole("combobox").first().click()
    await page.getByRole("option", { name: service.category, exact: true }).click()
    await dialog.getByRole("combobox").filter({ hasText: "Select supplier" }).click()
    await page.getByRole("option", { name: service.supplier, exact: true }).click()
    await dialog.getByRole("button", { name: "Add service" }).click()
    await expect(dialog.getByText(service.supplier, { exact: true }).first()).toBeVisible()
  }
}

/** Fills every field step 3 needs to price all three services. */
async function configureQuickStartServices(page: Page, dialog: Locator): Promise<void> {
  // Train — route and suite type. The traveller split opens on the booking's 2 adults.
  const routeTriggers = dialog.locator('[id^="route-"]')
  await routeTriggers.nth(0).click()
  await page.getByRole("option", { name: "Pretoria ↔ Cape Town" }).click()
  const suiteTriggers = dialog.locator('[id^="suite-type-"]')
  await suiteTriggers.nth(0).click()
  await page.getByRole("option", { name: "Deluxe", exact: true }).click()

  // Transfer — station to hotel on the day the train arrives, in a standard car.
  await dialog.getByRole("combobox").filter({ hasText: "Quick-fill from a route" }).click()
  await page.getByRole("option", { name: "CPT – STA HTL CBD" }).click()
  await dialog
    .locator("div")
    .filter({ has: page.getByText("Pickup date/time", { exact: true }) })
    .last()
    .getByRole("button", { name: /^After / })
    .click()
  await dialog.locator('[id^="vehicle-category-"]').first().click()
  await page.getByRole("option", { name: "Standard - Mazda" }).click()

  // Hotel — check in the day the train arrives, breakfast, one room for both.
  await dialog
    .locator("div")
    .filter({ has: page.getByText("Stay dates", { exact: true }) })
    .last()
    .getByRole("button", { name: /^After / })
    .click()
  if ((await routeTriggers.count()) > 1 && !(await routeTriggers.nth(1).textContent())?.includes("Breakfast")) {
    await routeTriggers.nth(1).click()
    await page.getByRole("option", { name: "Breakfast" }).click()
  }
  await suiteTriggers.nth(1).click()
  await page.getByRole("option", { name: "Classic Room", exact: true }).click()
}

const QS_BOOKING_TRIP_COLUMNS =
  "departure_date, trip_start_date, trip_end_date, package_travel_date, no_of_adults, no_of_children"

/**
 * Pricing a build writes the derived trip dates back to the booking. Snapshots
 * them and returns a cleanup that puts them back.
 */
async function withBookingTripSnapshot(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
): Promise<() => Promise<void>> {
  const { data, error } = await supabase
    .from("bookings")
    .select(QS_BOOKING_TRIP_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle()
  if (error || !data) {
    throw new Error(`Cannot snapshot the booking's trip fields (${error?.message ?? "none found"}).`)
  }
  return async () => {
    await supabase.from("bookings").update(data).eq("id", bookingId)
  }
}

test.describe("quickstart quoting", () => {
  test("qs build booking step 1", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeQuote = await seedQuote(supabase, QS_ENQUIRY_BOOKING, "LTT-2026-0033-Q1")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_ENQUIRY_BOOKING}?tab=quotes`)
      await page.getByRole("button", { name: /edit quote/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Build this booking's services")).toBeVisible({ timeout: 30_000 })
      await addQuickStartServices(page, dialog)
      await shot(page, "qs-build-step-1")

      // Closed without pressing Next, so nothing is written to the booking.
      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      await removeQuote()
    }
  })

  test("qs build booking steps 2 and 3", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreTrip = await withBookingTripSnapshot(supabase, QS_ENQUIRY_BOOKING)
    const removeQuote = await seedQuote(supabase, QS_ENQUIRY_BOOKING, "LTT-2026-0033-Q1")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_ENQUIRY_BOOKING}?tab=quotes`)
      await page.getByRole("button", { name: /edit quote/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Build this booking's services")).toBeVisible({ timeout: 30_000 })
      await addQuickStartServices(page, dialog)
      await dialog.getByRole("button", { name: "Next" }).click()

      await expect(dialog.getByText("Configure services")).toBeVisible({ timeout: 60_000 })
      await configureQuickStartServices(page, dialog)

      // Three service panels do not fit in one 900px screen, and the dialog scrolls
      // inside itself, so a full-page capture would still crop it. The viewport is
      // stretched to the dialog's height for this one figure instead.
      await dialog.evaluate((element) => element.scrollTo({ top: 0 }))
      const contentHeight = await dialog.evaluate((element) => element.scrollHeight)
      await page.setViewportSize({ width: SHOT_VIEWPORT.width, height: Math.ceil(contentHeight / 0.92) + 24 })
      await shot(page, "qs-build-step-2", { settle: 1200 })
      await page.setViewportSize(SHOT_VIEWPORT)

      await dialog.getByRole("button", { name: "Next" }).click()
      await expect(dialog.getByText("Confirm replacement")).toBeVisible({ timeout: 60_000 })
      await expect(dialog.getByText(/not priced below/)).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: "Replace & apply" })).toBeEnabled()
      await shot(page, "qs-build-step-3")

      // Closed without applying: the seeded quote's lines stay as they were.
      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      // Pressing Next in step 1 persists the booking's services — remove them.
      await supabase.from("booking_services").delete().eq("booking_id", QS_ENQUIRY_BOOKING)
      await removeQuote()
      await restoreTrip()
    }
  })

  test("qs quote card", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeQuote = await seedQuote(supabase, QS_ENQUIRY_BOOKING, "LTT-2026-0033-Q1")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_ENQUIRY_BOOKING}?tab=quotes`)
      const cardTitle = page.getByText("Quote 1")
      await expect(cardTitle).toBeVisible({ timeout: 60_000 })
      // Frames the quote card rather than the booking header above it.
      await cardTitle.evaluate((element) => element.scrollIntoView({ block: "start" }))
      await shot(page, "qs-quote-card")
      await context.close()
    } finally {
      await removeQuote()
    }
  })

  test("qs preview and send quote", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeQuote = await seedQuote(supabase, QS_ENQUIRY_BOOKING, "LTT-2026-0033-Q1")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_ENQUIRY_BOOKING}?tab=quotes`)
      await page.getByRole("button", { name: /preview & send/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Preview & Send Quote")).toBeVisible({ timeout: 30_000 })
      // Waits for the server-rendered preview rather than capturing the spinner.
      await expect(dialog.getByText("Email body (this send only)")).toBeVisible({ timeout: 60_000 })
      await shot(page, "qs-preview-send-quote")

      // Nothing is sent — the dialog is closed on Cancel.
      await dialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      await removeQuote()
    }
  })

  test("qs reservation form received", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${QS_ACCEPTED_BOOKING}?tab=reservation`)
    await expect(page.getByText("Reservation form received", { exact: true })).toBeVisible({ timeout: 60_000 })
    // Captured unscrolled: the tick box sits just under the tab strip and the
    // guide's step is "tick this", so the page top is the right frame.
    await shot(page, "qs-form-received")
    await context.close()
  })

  test("qs guest roster", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${QS_ACCEPTED_BOOKING}?tab=reservation`)
    const guestsCard = page.getByText("Guests", { exact: true })
    await expect(guestsCard).toBeVisible({ timeout: 60_000 })
    await guestsCard.evaluate((element) => element.scrollIntoView({ block: "start" }))
    await shot(page, "qs-guest-roster")
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Invoicing and payments
// ---------------------------------------------------------------------------

test.describe("quickstart invoicing", () => {
  test("qs invoice number", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, QS_INVOICED_BOOKING, "INV-2026-0021")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_INVOICED_BOOKING}`)
      await expect(page.locator("#booking-invoice-number")).toHaveValue("INV-2026-0021", { timeout: 60_000 })
      await shot(page, "qs-invoice-number")
      await context.close()
    } finally {
      await restoreNumber()
    }
  })

  test("qs generate invoice", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, QS_ACCEPTED_BOOKING, "INV-2026-0025")
    const restoreDeparture = await withDepartureDate(supabase, QS_ACCEPTED_BOOKING, "2027-06-01")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_ACCEPTED_BOOKING}`)
      await page.getByRole("button", { name: /^generate invoice$/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Generate invoice")).toBeVisible({ timeout: 30_000 })
      await expect(dialog.getByLabel("Deposit percentage")).toBeVisible()
      await shot(page, "qs-generate-invoice")

      // Closed without generating — no invoice row is written.
      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      await restoreDeparture()
      await restoreNumber()
    }
  })

  test("qs preview and send invoice", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, QS_ACCEPTED_BOOKING, "INV-2026-0025")
    const restoreDeparture = await withDepartureDate(supabase, QS_ACCEPTED_BOOKING, "2027-06-01")
    const removeTravellers = await ensureTravellers(supabase, QS_ACCEPTED_BOOKING)

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_ACCEPTED_BOOKING}`)
      await page.getByRole("button", { name: /^generate invoice$/i }).click({ timeout: 60_000 })

      const generateDialog = page.getByRole("dialog")
      await expect(generateDialog.getByText("Generate invoice")).toBeVisible({ timeout: 30_000 })
      await generateDialog.getByRole("button", { name: "Generate", exact: true }).click()

      // The invoice PDF is rendered server-side before the preview opens, so this
      // step is slow by design — waiting on the rendered dialog, not a spinner.
      const previewDialog = page.getByRole("dialog")
      await expect(previewDialog.getByText("Preview and send deposit invoice")).toBeVisible({ timeout: 120_000 })
      await expect(previewDialog.getByRole("button", { name: /send with attachment/i })).toBeVisible()
      await shot(page, "qs-preview-send-invoice")

      // Nothing is sent; the draft invoice and its PDF are removed below.
      await previewDialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      await supabase.from("documents").delete().eq("booking_id", QS_ACCEPTED_BOOKING).eq("kind", "invoice_pdf")
      await supabase.from("invoices").delete().eq("booking_id", QS_ACCEPTED_BOOKING)
      await removeTravellers()
      await restoreDeparture()
      await restoreNumber()
    }
  })

  test("qs record payment", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${QS_INVOICED_BOOKING}?tab=payments`)
    await expect(page.getByText("Total Received")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("button", { name: /record payment/i }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Record Payment")).toBeVisible({ timeout: 30_000 })
    await shot(page, "qs-record-payment")

    await page.keyboard.press("Escape")
    await context.close()
  })

  test("qs payment confirmation", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, QS_INVOICED_BOOKING, "INV-2026-0021")

    // The button is hidden until a payment exists — 9018 is seeded with none.
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        booking_id: QS_INVOICED_BOOKING,
        amount: 38100,
        method: "EFT",
        reference: "EFT-DEP-0021",
        notes: "Deposit 25%",
        received_at: "2026-03-30T10:00:00Z",
      })
      .select("id")
      .single()

    try {
      if (paymentError || !payment) {
        throw new Error(`Could not seed the quick-start payment (${paymentError?.message ?? "no row"}).`)
      }

      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_INVOICED_BOOKING}?tab=payments`)
      await page.getByRole("button", { name: /send payment confirmation/i }).click({ timeout: 60_000 })

      // The amended invoice PDF is re-rendered before the preview opens.
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Payment received", { exact: true })).toBeVisible({ timeout: 120_000 })
      await shot(page, "qs-payment-confirmation")

      // Never sent — sending is what would move the booking to Deposit Paid.
      await dialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      // Opening the confirmation re-renders the invoice PDF and files a fresh
      // document row against the booking; drop anything newer than the seed.
      await supabase
        .from("documents")
        .delete()
        .eq("booking_id", QS_INVOICED_BOOKING)
        .eq("kind", "invoice_pdf")
        .gt("created_at", "2026-06-01T00:00:00Z")
      if (payment) await supabase.from("payments").delete().eq("id", payment.id)
      await restoreNumber()
    }
  })

  test("qs balance", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/bookings")
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible({ timeout: 60_000 })
    // Framed on a booking with a deposit against it, so the received-of-quoted
    // pair actually shows two different figures.
    const paidRow = page.getByText("LTT-2026-0015", { exact: true })
    await expect(paidRow).toBeVisible()
    await paidRow.evaluate((element) => element.scrollIntoView({ block: "center" }))
    await shot(page, "qs-balance")
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Voucher and closing
// ---------------------------------------------------------------------------

test.describe("quickstart vouchers", () => {
  test("qs voucher details", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, QS_PAID_BOOKING, {
      supplierReference: "BT-CT-20492",
      supplierContactName: "Sipho",
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_PAID_BOOKING}?tab=references`)
      await expect(page.getByText("All legs have reference numbers")).toBeVisible({ timeout: 60_000 })
      await shot(page, "qs-voucher-details")
      await context.close()
    } finally {
      await removeLeg()
    }
  })

  test("qs generate voucher", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, QS_PAID_BOOKING, {
      supplierReference: "BT-CT-20492",
      supplierContactName: "Sipho",
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_PAID_BOOKING}?tab=documents`)
      await page.getByRole("button", { name: /preview & send voucher/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog").filter({ hasText: "Send travel voucher" })
      // Captured while the voucher PDF and email are still being prepared — the
      // dialog goes straight from this state into the nested send-preview dialog,
      // so this is the only moment this outer dialog is on screen by itself.
      await expect(dialog.getByText(/preparing voucher/i)).toBeVisible({ timeout: 30_000 })
      await shot(page, "qs-generate-voucher")

      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      await removeLeg()
    }
  })

  test("qs send voucher", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, QS_PAID_BOOKING, {
      supplierReference: "BT-CT-20492",
      supplierContactName: "Sipho",
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${QS_PAID_BOOKING}?tab=documents`)
      // A single click rebuilds the voucher PDF from the latest booking details,
      // prepares the email, then opens the send-preview dialog automatically.
      await page.getByRole("button", { name: /preview & send voucher/i }).click({ timeout: 60_000 })

      const previewDialog = page.getByRole("dialog").filter({ hasText: "Send travel voucher" })
      await expect(previewDialog).toBeVisible({ timeout: 60_000 })
      await expect(previewDialog.getByRole("button", { name: /send with attachment/i })).toBeVisible()
      await shot(page, "qs-send-voucher")

      // Never sent — sending is what would move the booking to Voucher Sent.
      await previewDialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      await supabase.from("documents").delete().eq("booking_id", QS_PAID_BOOKING).eq("kind", "voucher_pdf")
      await supabase.from("documents").delete().eq("booking_id", QS_PAID_BOOKING).eq("kind", "itinerary_pdf")
      await supabase.from("vouchers").delete().eq("booking_id", QS_PAID_BOOKING)
      await supabase.from("itineraries").delete().eq("booking_id", QS_PAID_BOOKING)
      await removeLeg()
    }
  })
})
