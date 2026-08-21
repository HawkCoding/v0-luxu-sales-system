import { expect, test } from "@playwright/test"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import type { Json } from "../../lib/supabase/types"
import { HANDBOOK_USERS, shot } from "./handbook-shots.fixtures"

// Handbook figure capture.
//
// Run with: pnpm docs:shots
// Prereqs:  local Supabase up, `pnpm db:reset` && `pnpm db:seed:demo`, then this
//           config starts (or reuses) `pnpm dev` on :3000.
//
// One `test.describe` per handbook chapter. Slugs are `NN-topic`, where NN is the
// chapter number, and must match the [[shot:NN-topic]] markers in the Markdown.
// scripts/build-handbook.mjs fails on a marker with no image and warns on an
// image no marker references, so the two stay honest with each other.
//
// Chapters land here as the prose is written — Steps 2-11 of the documentation
// programme each add their own describe block below.

// ---------------------------------------------------------------------------
// Chapter 1 — Getting started (consultant)
// ---------------------------------------------------------------------------

test.describe("ch01 getting started", () => {
  test("01 login screen", async ({ browser }) => {
    // Signed out on purpose — this is the first thing a new consultant sees.
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto("/login")
    await expect(page.getByRole("button", { name: /sign in with email/i })).toBeVisible()
    await shot(page, "01-login")
    await context.close()
  })

  test("01 dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app")
    await expect(page.getByText("Open Jobs").first()).toBeVisible({ timeout: 60_000 })
    await shot(page, "01-dashboard")
    await context.close()
  })

  test("01 forgot password", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto("/login")
    await page.getByRole("button", { name: /forgot password/i }).click()
    await expect(page.getByLabel("Email address")).toBeVisible()
    await shot(page, "01-forgot-password")
    await context.close()
  })

  test("01 sidebar", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app")
    await expect(page.getByText("Open Jobs").first()).toBeVisible({ timeout: 60_000 })
    await shot(page, "01-sidebar")
    await context.close()
  })

  test("01 follow-ups", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .limit(1)
      .maybeSingle()
    if (bookingError || !booking) {
      throw new Error(`Cannot find a seeded booking for the follow-ups shot (${bookingError?.message ?? "none found"}).`)
    }

    const { data: scheduled, error: insertError } = await supabase
      .from("correspondences")
      .insert({
        booking_id: booking.id,
        channel: "email",
        kind: "quote",
        subject: "Following up on your quote",
        status: "scheduled",
        scheduled_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        recipients: ["demo@example.com"],
      })
      .select("id")
      .single()
    if (insertError || !scheduled) {
      throw new Error(`Could not seed a scheduled follow-up (${insertError?.message}).`)
    }

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto("/app")
      await expect(page.getByText("Upcoming Follow-ups")).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText("Following up on your quote")).toBeVisible()
      await page.getByText("Upcoming Follow-ups").scrollIntoViewIfNeeded()
      await shot(page, "01-follow-ups")
      await context.close()
    } finally {
      await supabase.from("correspondences").delete().eq("id", scheduled.id)
    }
  })
})

// ---------------------------------------------------------------------------
// Chapter 2 — Customers (consultant)
// ---------------------------------------------------------------------------

test.describe("ch02 customers", () => {
  test("02 customer list", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/customers")
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible({ timeout: 60_000 })
    await shot(page, "02-customer-list")
    await context.close()
  })

  test("02 new customer", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/customers")
    await page.getByRole("button", { name: /new customer/i }).click()
    await expect(page.getByRole("heading", { name: "New Customer" })).toBeVisible()
    await page.getByRole("button", { name: /advanced \(optional\)/i }).click()
    await expect(page.getByLabel("VIP status")).toBeVisible()
    await shot(page, "02-new-customer")
    await context.close()
  })

  test("02 customer record", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: customer, error } = await supabase
      .from("customers")
      .select("id")
      .not("phone", "is", null)
      .not("country", "is", null)
      .limit(1)
      .maybeSingle()
    if (error || !customer) {
      throw new Error(`Cannot find a seeded, complete customer for the record shot (${error?.message ?? "none found"}).`)
    }

    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/customers/${customer.id}`)
    await expect(page.getByText("Customer information")).toBeVisible({ timeout: 60_000 })
    await shot(page, "02-customer-record")
    await context.close()
  })

  test("02 missing fields and blocked stage move", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, customer_id")
      .eq("stage", "enquiry")
      .limit(1)
      .maybeSingle()
    if (bookingError || !booking) {
      throw new Error(`Cannot find a seeded enquiry-stage booking (${bookingError?.message ?? "none found"}).`)
    }

    const { data: originalCustomer, error: customerError } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", booking.customer_id)
      .single()
    if (customerError || !originalCustomer) {
      throw new Error(`Cannot read the booking's customer (${customerError?.message ?? "none found"}).`)
    }

    // Blank the phone so the customer_complete gate fails for real, rather
    // than mocking the blocked state.
    const { error: updateError } = await supabase
      .from("customers")
      .update({ phone: null })
      .eq("id", booking.customer_id)
    if (updateError) {
      throw new Error(`Could not blank the customer phone (${updateError.message}).`)
    }

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()

      await page.goto(`/app/bookings/${booking.id}?tab=enquiry`)
      await expect(page.getByText("Customer Contact")).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText(/missing phone/i)).toBeVisible()
      await page.getByText("Customer Contact").scrollIntoViewIfNeeded()
      await shot(page, "02-missing-fields")

      const nextButton = page.getByRole("button", { name: /^next/i })
      await nextButton.click()
      await expect(page.getByText("Customer record is missing phone.")).toBeVisible({ timeout: 15_000 })
      await shot(page, "02-blocked-by-customer")

      await context.close()
    } finally {
      await supabase.from("customers").update({ phone: originalCustomer.phone }).eq("id", booking.customer_id)
    }
  })
})

// ---------------------------------------------------------------------------
// Chapter 3 — Enquiries and starting a booking (consultant)
// ---------------------------------------------------------------------------

test.describe("ch03 enquiries", () => {
  test("03 enquiry queue", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/enquiries")
    await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible({ timeout: 60_000 })
    await shot(page, "03-enquiry-queue")
    await context.close()
  })

  test("03 new enquiry", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/enquiries")
    await page.getByRole("button", { name: /new enquiry/i }).click()
    await expect(page.getByRole("heading", { name: "New Enquiry" })).toBeVisible()
    await shot(page, "03-new-enquiry")
    await context.close()
  })

  test("03 enquiry tab", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("stage", "enquiry")
      .limit(1)
      .maybeSingle()
    if (error || !booking) {
      throw new Error(`Cannot find a seeded enquiry-stage booking (${error?.message ?? "none found"}).`)
    }

    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${booking.id}?tab=enquiry`)
    await expect(page.getByText("Journey Details")).toBeVisible({ timeout: 60_000 })
    await shot(page, "03-enquiry-tab")
    await context.close()
  })

  test("03 requested services", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("stage", "enquiry")
      .limit(1)
      .maybeSingle()
    if (error || !booking) {
      throw new Error(`Cannot find a seeded enquiry-stage booking (${error?.message ?? "none found"}).`)
    }

    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${booking.id}?tab=enquiry`)
    await expect(page.getByText("Requested services")).toBeVisible({ timeout: 60_000 })
    await page.getByText("Requested services").scrollIntoViewIfNeeded()
    await shot(page, "03-requested-services")
    await context.close()
  })

  test("03 needs review", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("source", "email")
      .eq("email_import_needs_review", true)
      .limit(1)
      .maybeSingle()
    if (error || !booking) {
      throw new Error(`Cannot find a seeded needs-review email import (${error?.message ?? "none found"}).`)
    }

    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/enquiries?filter=needs_review")
    await expect(page.getByText("Needs Review").first()).toBeVisible({ timeout: 60_000 })
    await shot(page, "03-needs-review")
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Chapter 4 — Quoting (consultant)
// ---------------------------------------------------------------------------

// Two seeded bookings carry the chapter's figures:
//   9002 / LTT-2026-0033 — enquiry stage, no quotes. Every draft-quote fixture
//                          below is created on it and removed again afterwards.
//   9013 / LTT-2026-0025 — accepted stage with an accepted quote and no payments,
//                          which is what the Revise dialog is captured against.
const CH04_DRAFT_BOOKING = "00000000-0000-0000-0000-000000009002"
const CH04_ACCEPTED_BOOKING = "00000000-0000-0000-0000-000000009013"

interface SeedQuoteLine {
  description: string
  qty: number
  unitPrice: number
  /** Partial pricing snapshot — only the fields the quote table's badges and notes read. */
  snapshot?: Json
}

interface SeedQuoteOptions {
  bookingId: string
  quoteNumber: string
  lines: SeedQuoteLine[]
  commissionBonus?: number
}

/**
 * Inserts a provisional quote with line items and returns a cleanup that removes it.
 * Line items cascade off the quote, so deleting the quote is enough.
 */
async function seedQuote(
  supabase: ReturnType<typeof createQaSupabase>,
  { bookingId, quoteNumber, lines, commissionBonus = 0 }: SeedQuoteOptions,
): Promise<{ quoteId: string; cleanup: () => Promise<void> }> {
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      quote_number: quoteNumber,
      status: "draft",
      currency: "ZAR",
      subtotal: total,
      total,
      commission_bonus: commissionBonus,
    })
    .select("id")
    .single()
  if (error || !quote) {
    throw new Error(`Could not seed the handbook quote fixture (${error?.message ?? "no row"}).`)
  }

  const { error: lineError } = await supabase.from("quote_line_items").insert(
    lines.map((line, index) => ({
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
    throw new Error(`Could not seed the handbook quote line items (${lineError.message}).`)
  }

  return {
    quoteId: quote.id,
    cleanup: async () => {
      await supabase.from("quotes").delete().eq("id", quote.id)
    },
  }
}

/** A clean, fully priced quote — nothing outstanding, no badges to explain. */
const PRICED_QUOTE_LINES: SeedQuoteLine[] = [
  {
    description: "The Blue Train — Pretoria → Cape Town, Deluxe Suite",
    qty: 2,
    unitPrice: 35150,
    snapshot: { source: "pricing_engine", pricingMode: "rate_card", unit: "per person" },
  },
  {
    description: "Apogee Boutique Hotel and Spa — Bed and Breakfast, 2 nights",
    qty: 2,
    unitPrice: 4800,
    snapshot: { source: "pricing_engine", pricingMode: "rate_card", unit: "per night" },
  },
  {
    description: "Ulysses Tours & Transfers — GT Station > Hotel",
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

/**
 * The same quote with one of everything the chapter describes: a converted line, a
 * room price override, a complimentary night, an unpriced line (TBD + the card's
 * "Missing pricing" badge), an Extra line, and a commission line carrying rounding.
 */
const BADGED_QUOTE_LINES: SeedQuoteLine[] = [
  {
    description: "Rovos Rail — Copper Trail, Deluxe Suite",
    qty: 2,
    unitPrice: 300840,
    snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      unit: "per person",
      sourceCurrency: "USD",
      sourceUnitPrice: 17440,
      fxRate: 17.25,
      fxRateAsOf: "2026-08-17",
    },
  },
  {
    description: "The President Hotel — Sea Facing Room, 2 nights",
    qty: 2,
    unitPrice: 3600,
    snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      unit: "per night",
      manualRoomPrice: 3600,
      manualRoomPriceBase: 4000,
      manualRoomPriceSetByName: "Leonie Kruger",
      manualRoomPriceSetAt: "2026-08-14",
    },
  },
  {
    description: "The President Hotel — Sea Facing Room, extra night",
    qty: 1,
    unitPrice: 0,
    snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      unit: "per night",
      manualRoomPrice: 0,
      manualRoomPriceBase: 4000,
      manualRoomPriceSetByName: "Leonie Kruger",
      manualRoomPriceSetAt: "2026-08-14",
    },
  },
  {
    description: "Ulysses Tours & Transfers — CT Hotel > Airport",
    qty: 1,
    unitPrice: 0,
    snapshot: { source: "pricing_engine", pricingMode: "manual", serviceType: "transfer" },
  },
  {
    description: "Table Mountain cable car, 2 guests",
    qty: 1,
    unitPrice: 1160,
    snapshot: { source: "pricing_engine", pricingMode: "rate_card", isExtra: true },
  },
  {
    description: "Commission",
    qty: 1,
    unitPrice: 61600,
    snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      commission: { type: "percent", value: 10, amount: 61000, source: "line", bonus: 600 },
    },
  },
]

test.describe("ch04 quoting", () => {
  test("04 quotes tab", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { cleanup } = await seedQuote(supabase, {
      bookingId: CH04_DRAFT_BOOKING,
      quoteNumber: "LTT-2026-0033-Q1",
      lines: PRICED_QUOTE_LINES,
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH04_DRAFT_BOOKING}?tab=quotes`)
      await expect(page.getByRole("button", { name: /preview & send/i })).toBeVisible({ timeout: 60_000 })
      const cardTitle = page.getByText("Quote 1")
      await expect(cardTitle).toBeVisible()
      // Frames the quote card rather than the booking header above it.
      await cardTitle.evaluate((element) => element.scrollIntoView({ block: "start" }))
      await shot(page, "04-quotes-tab")
      await context.close()
    } finally {
      await cleanup()
    }
  })

  test("04 quote lines", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { cleanup } = await seedQuote(supabase, {
      bookingId: CH04_DRAFT_BOOKING,
      quoteNumber: "LTT-2026-0033-Q1",
      lines: BADGED_QUOTE_LINES,
      commissionBonus: 600,
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH04_DRAFT_BOOKING}?tab=quotes`)
      await expect(page.getByText("Missing pricing")).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText("Extra").first()).toBeVisible()
      await expect(page.getByText("Complimentary night")).toBeVisible()
      // Every badge and note sits inside the card, so frame the card itself.
      await page.getByText("Quote 1").evaluate((element) => element.scrollIntoView({ block: "start" }))
      await shot(page, "04-quote-lines")
      await context.close()
    } finally {
      await cleanup()
    }
  })

  test("04 build booking, choosing services", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { cleanup } = await seedQuote(supabase, {
      bookingId: CH04_DRAFT_BOOKING,
      quoteNumber: "LTT-2026-0033-Q1",
      lines: PRICED_QUOTE_LINES,
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH04_DRAFT_BOOKING}?tab=quotes`)
      await page.getByRole("button", { name: /edit quote/i }).click()

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Build this booking's services")).toBeVisible({ timeout: 30_000 })

      // Radix select triggers expose no accessible name, so they are matched on the
      // placeholder text they render instead.
      // Category is already on Train; pick the train operator and add it.
      await dialog.getByRole("combobox").filter({ hasText: "Select supplier" }).click()
      await page.getByRole("option", { name: "Rovos Rail" }).click()
      await dialog.getByRole("button", { name: "Add service" }).click()

      // Then a hotel, so the figure shows a list rather than a single row.
      await dialog.getByRole("combobox").first().click()
      await page.getByRole("option", { name: "Hotel", exact: true }).click()
      await dialog.getByRole("combobox").filter({ hasText: "Select supplier" }).click()
      await page.getByRole("option", { name: "Apogee Boutique Hotel and Spa" }).click()
      await dialog.getByRole("button", { name: "Add service" }).click()

      await expect(dialog.getByText("Apogee Boutique Hotel and Spa")).toBeVisible()
      await shot(page, "04-build-step-1")

      // Closed without pressing Next, so nothing is written to the booking.
      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      await cleanup()
    }
  })

  test("04 build booking, configure through confirm", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { cleanup } = await seedQuote(supabase, {
      bookingId: CH04_DRAFT_BOOKING,
      quoteNumber: "LTT-2026-0033-Q1",
      lines: PRICED_QUOTE_LINES,
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH04_DRAFT_BOOKING}?tab=quotes`)
      await page.getByRole("button", { name: /edit quote/i }).click()

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Build this booking's services")).toBeVisible({ timeout: 30_000 })

      // Rovos Rail prices off USD rate cards, which is what puts the exchange-rate
      // strip on screen for the 04-fx-banner figure.
      await dialog.getByRole("combobox").filter({ hasText: "Select supplier" }).click()
      await page.getByRole("option", { name: "Rovos Rail" }).click()
      await dialog.getByRole("button", { name: "Add service" }).click()
      await dialog.getByRole("button", { name: "Next" }).click()

      await expect(dialog.getByText("Configure services")).toBeVisible({ timeout: 60_000 })

      await dialog.getByRole("combobox").filter({ hasText: "Select route" }).click()
      await page.getByRole("option", { name: "Copper Trail" }).click()
      // The seeded suite unit opens on "Not set" rather than the placeholder.
      await dialog.getByRole("combobox").filter({ hasText: "Not set" }).click()
      await page.getByRole("option", { name: "Deluxe Suite" }).click()

      // The strip renders above and below the service panels; the top one is in
      // frame for the step figure, the bottom one for the banner's own figure.
      const fxRate = dialog.getByLabel("USD to ZAR exchange rate")
      await expect(fxRate.first()).toBeVisible({ timeout: 30_000 })
      await shot(page, "04-build-step-2")

      await fxRate.last().scrollIntoViewIfNeeded()
      await shot(page, "04-fx-banner")

      // Commission pre-fills from the house default, so Next is already enabled.
      await expect(dialog.getByText("Set", { exact: true })).toBeVisible()
      await dialog.getByRole("button", { name: "Next" }).click()

      await expect(dialog.getByText("Confirm replacement")).toBeVisible({ timeout: 60_000 })
      await shot(page, "04-build-step-3")

      // Closed without applying: the quote fixture's lines stay as seeded.
      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      // Pressing Next in step 1 persists the booking's services — remove them again.
      await supabase.from("booking_services").delete().eq("booking_id", CH04_DRAFT_BOOKING)
      await cleanup()
    }
  })

  test("04 preview and send", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { cleanup } = await seedQuote(supabase, {
      bookingId: CH04_DRAFT_BOOKING,
      quoteNumber: "LTT-2026-0033-Q1",
      lines: PRICED_QUOTE_LINES,
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH04_DRAFT_BOOKING}?tab=quotes`)
      await page.getByRole("button", { name: /preview & send/i }).click()

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Preview & Send Quote")).toBeVisible({ timeout: 30_000 })
      // Waits for the server-rendered preview rather than capturing the spinner.
      await expect(dialog.getByText("Email body (this send only)")).toBeVisible({ timeout: 60_000 })
      await shot(page, "04-preview-send")

      // Nothing is sent — the dialog is closed on Cancel.
      await dialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      await cleanup()
    }
  })

  test("04 revise", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, status")
      .eq("booking_id", CH04_ACCEPTED_BOOKING)
      .eq("status", "accepted")
      .limit(1)
      .maybeSingle()
    if (error || !quote) {
      throw new Error(`Cannot find the seeded accepted quote for the revise shot (${error?.message ?? "none found"}).`)
    }

    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH04_ACCEPTED_BOOKING}?tab=quotes`)
    await page.getByRole("button", { name: "Revise" }).click()

    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByRole("heading", { name: /^Revise / })).toBeVisible({ timeout: 30_000 })
    // The plan is fetched on open; capture it filled in, not mid-load.
    await expect(dialog.getByText(/Booking (moves back|stays)/)).toBeVisible({ timeout: 30_000 })
    await shot(page, "04-revise")

    // Never confirmed — a revision would rewind the seeded booking.
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Chapter 5 — Reservation, guests and schedule changes (consultant)
// ---------------------------------------------------------------------------

// 9013 / LTT-2026-0025 — accepted stage, reservation form already received, so the
// Reservation tab shows a populated roster rather than the empty first-visit state.
const CH05_ACCEPTED_BOOKING = "00000000-0000-0000-0000-000000009013"

test.describe("ch05 reservation", () => {
  test("05 reservation tab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH05_ACCEPTED_BOOKING}?tab=reservation`)
    await expect(page.getByText("Guests", { exact: true })).toBeVisible({ timeout: 60_000 })
    await shot(page, "05-reservation-tab")
    await context.close()
  })

  test("05 form received card", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH05_ACCEPTED_BOOKING}?tab=reservation`)
    const card = page.getByText("Reservation form received", { exact: true })
    await expect(card).toBeVisible({ timeout: 60_000 })
    await card.evaluate((element) => element.scrollIntoView({ block: "start" }))
    await shot(page, "05-form-received")
    await context.close()
  })

  test("05 guest roster", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const { data: existing, error } = await supabase
      .from("travellers")
      .select("id")
      .eq("booking_id", CH05_ACCEPTED_BOOKING)
    if (error) {
      throw new Error(`Could not read the seeded traveller roster (${error.message}).`)
    }

    const seeded = existing && existing.length === 0
    if (seeded) {
      const { error: insertError } = await supabase.from("travellers").insert([
        {
          booking_id: CH05_ACCEPTED_BOOKING,
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
          booking_id: CH05_ACCEPTED_BOOKING,
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
        throw new Error(`Could not seed the handbook guest roster (${insertError.message}).`)
      }
    }

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH05_ACCEPTED_BOOKING}?tab=reservation`)
      // Guest names sit inside <Input> fields, not text nodes — matched on the input's value.
      await expect(page.locator('input[value="van der Merwe"]').first()).toBeVisible({ timeout: 60_000 })
      const guestsCard = page.getByText("Guests", { exact: true })
      await guestsCard.evaluate((element) => element.scrollIntoView({ block: "start" }))
      await shot(page, "05-guest-roster")
      await context.close()
    } finally {
      if (seeded) {
        await supabase.from("travellers").delete().eq("booking_id", CH05_ACCEPTED_BOOKING)
      }
    }
  })

  test("05 transfer times", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH05_ACCEPTED_BOOKING}?tab=times`)
    // "Transfer Times" also names the tab trigger — scope to the card title.
    await expect(page.locator('[data-slot="card-title"]', { hasText: "Transfer Times" })).toBeVisible({
      timeout: 60_000,
    })
    await shot(page, "05-transfer-times")
    await context.close()
  })

  test("05 stale voucher", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()

    const { data: consultant, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", HANDBOOK_USERS.consultant.email)
      .single()
    if (profileError || !consultant) {
      throw new Error(`Cannot find the consultant profile for the stale-voucher shot (${profileError?.message ?? "none found"}).`)
    }

    const { data: airline, error: airlineError } = await supabase
      .from("suppliers")
      .select("id")
      .eq("kind", "airline")
      .limit(1)
      .single()
    if (airlineError || !airline) {
      throw new Error(`Cannot find a seeded airline supplier (${airlineError?.message ?? "none found"}).`)
    }

    // A voucher "generated" yesterday. The flight leg is inserted after this point, so its
    // updated_at is naturally later — exactly the condition loadVoucherFreshness (in
    // movement-times/route.ts) treats as stale.
    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .insert({
        booking_id: CH05_ACCEPTED_BOOKING,
        voucher_number: "LTT-2026-0025-V1-QA",
        created_by: consultant.user_id,
        generated_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      })
      .select("id")
      .single()
    if (voucherError || !voucher) {
      throw new Error(`Could not seed a generated voucher (${voucherError?.message ?? "no row"}).`)
    }

    const { data: leg, error: legError } = await supabase
      .from("booking_services")
      .insert({
        booking_id: CH05_ACCEPTED_BOOKING,
        supplier_id: airline.id,
        label: "FlySafair — Cape Town to Johannesburg",
        service_date: "2026-04-05",
        departure_time: "09:15",
        arrival_date: "2026-04-05",
        arrival_time: "11:05",
        flight_number: "FA212",
        departure_airport_code: "CPT",
        arrival_airport_code: "JNB",
      })
      .select("id")
      .single()

    try {
      if (legError || !leg) {
        throw new Error(`Could not seed the handbook flight leg (${legError?.message ?? "no row"}).`)
      }

      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH05_ACCEPTED_BOOKING}?tab=times`)
      await expect(page.getByText(/does not include these times/i)).toBeVisible({ timeout: 60_000 })
      await shot(page, "05-stale-voucher")
      await context.close()
    } finally {
      if (leg) await supabase.from("booking_services").delete().eq("id", leg.id)
      await supabase.from("vouchers").delete().eq("id", voucher.id)
    }
  })
})

// ---------------------------------------------------------------------------
// Chapter 6 — Invoicing and payments (consultant)
// ---------------------------------------------------------------------------

// Two seeded bookings carry the chapter's figures:
//   9013 / LTT-2026-0025 — accepted stage with one accepted quote and no invoice,
//                          which is the only state Generate Invoice appears in.
//   9018 / LTT-2026-0021 — deposit_requested with the deposit invoice already sent
//                          and nothing paid, which is where the payment figures run.
const CH06_ACCEPTED_BOOKING = "00000000-0000-0000-0000-000000009013"
const CH06_INVOICED_BOOKING = "00000000-0000-0000-0000-000000009018"

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
    throw new Error(`Could not set the handbook invoice number (${updateError.message}).`)
  }

  return async () => {
    await supabase
      .from("bookings")
      .update({ customer_invoice_number: original })
      .eq("id", bookingId)
  }
}

/**
 * The seeded departure sits inside 60 days, which switches "Pay in full" on and
 * hides the deposit percentage. Moves it out so the dialog shows the deposit
 * form the chapter describes, and restores it afterwards.
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
    throw new Error(`Could not move the handbook departure date (${updateError.message}).`)
  }

  return async () => {
    await supabase.from("bookings").update({ departure_date: original }).eq("id", bookingId)
  }
}

/**
 * An invoice cannot be generated until every traveller has a name and an
 * ID/passport number. Seeds a roster when the booking has none, and removes
 * only what it inserted.
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
    throw new Error(`Could not seed the handbook traveller roster (${insertError.message}).`)
  }

  return async () => {
    await supabase.from("travellers").delete().eq("booking_id", bookingId)
  }
}

test.describe("ch06 invoicing", () => {
  test("06 invoice number", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, CH06_INVOICED_BOOKING, "INV-2026-0021")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH06_INVOICED_BOOKING}`)
      await expect(page.locator("#booking-invoice-number")).toHaveValue("INV-2026-0021", {
        timeout: 60_000,
      })
      await shot(page, "06-invoice-number")
      await context.close()
    } finally {
      await restoreNumber()
    }
  })

  test("06 generate invoice", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, CH06_ACCEPTED_BOOKING, "INV-2026-0025")
    const restoreDeparture = await withDepartureDate(supabase, CH06_ACCEPTED_BOOKING, "2027-06-01")

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH06_ACCEPTED_BOOKING}`)
      await page.getByRole("button", { name: /^generate invoice$/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog")
      // Title-cased on the trigger, sentence case in the dialog — this matches the dialog.
      await expect(dialog.getByText("Generate invoice")).toBeVisible({ timeout: 30_000 })
      await expect(dialog.getByLabel("Deposit percentage")).toBeVisible()
      await shot(page, "06-generate-invoice")

      // Closed without generating — no invoice row is written.
      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      await restoreDeparture()
      await restoreNumber()
    }
  })

  test("06 preview and send the invoice", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, CH06_ACCEPTED_BOOKING, "INV-2026-0025")
    const restoreDeparture = await withDepartureDate(supabase, CH06_ACCEPTED_BOOKING, "2027-06-01")
    const removeTravellers = await ensureTravellers(supabase, CH06_ACCEPTED_BOOKING)

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH06_ACCEPTED_BOOKING}`)
      await page.getByRole("button", { name: /^generate invoice$/i }).click({ timeout: 60_000 })

      const generateDialog = page.getByRole("dialog")
      await expect(generateDialog.getByText("Generate invoice")).toBeVisible({ timeout: 30_000 })
      await generateDialog.getByRole("button", { name: "Generate", exact: true }).click()

      // The invoice PDF is rendered server-side before the preview opens, so this
      // step is slow by design — waiting on the rendered dialog, not a spinner.
      const previewDialog = page.getByRole("dialog")
      await expect(previewDialog.getByText("Preview and send deposit invoice")).toBeVisible({
        timeout: 120_000,
      })
      // "Send with attachment" only renders once the PDF is on the email.
      await expect(previewDialog.getByRole("button", { name: /send with attachment/i })).toBeVisible()
      await shot(page, "06-preview-send-invoice")

      // Nothing is sent; the draft invoice and its PDF are removed below.
      await previewDialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      await supabase
        .from("documents")
        .delete()
        .eq("booking_id", CH06_ACCEPTED_BOOKING)
        .eq("kind", "invoice_pdf")
      await supabase.from("invoices").delete().eq("booking_id", CH06_ACCEPTED_BOOKING)
      await removeTravellers()
      await restoreDeparture()
      await restoreNumber()
    }
  })

  test("06 record payment", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH06_INVOICED_BOOKING}?tab=payments`)
    await expect(page.getByText("Total Received")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("button", { name: /record payment/i }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Record Payment")).toBeVisible({ timeout: 30_000 })
    await shot(page, "06-record-payment")

    await page.keyboard.press("Escape")
    await context.close()
  })

  test("06 payment confirmation", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const restoreNumber = await withInvoiceNumber(supabase, CH06_INVOICED_BOOKING, "INV-2026-0021")

    // The button is hidden until a payment exists — 9018 is seeded with none.
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        booking_id: CH06_INVOICED_BOOKING,
        amount: 38100,
        method: "EFT",
        reference: "EFT-HAR-DEP-001",
        notes: "Deposit 25% — Blue Train Cape Town Explorer",
        received_at: "2026-03-30T10:00:00Z",
      })
      .select("id")
      .single()

    try {
      if (paymentError || !payment) {
        throw new Error(`Could not seed the handbook payment (${paymentError?.message ?? "no row"}).`)
      }

      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH06_INVOICED_BOOKING}?tab=payments`)
      await page.getByRole("button", { name: /send payment confirmation/i }).click({ timeout: 60_000 })

      // The amended invoice PDF is re-rendered before the preview opens.
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Payment received", { exact: true })).toBeVisible({
        timeout: 120_000,
      })
      await shot(page, "06-payment-confirmation")

      // Never sent — sending is what would move the booking to Deposit Paid.
      await dialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      if (payment) await supabase.from("payments").delete().eq("id", payment.id)
      await restoreNumber()
    }
  })

  test("06 balance", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/bookings")
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible({ timeout: 60_000 })
    // The first rows are all unpaid; framed on a booking with a deposit against it
    // so the received-of-quoted pair actually shows two different figures.
    const paidRow = page.getByText("LTT-2026-0015", { exact: true })
    await expect(paidRow).toBeVisible()
    await paidRow.evaluate((element) => element.scrollIntoView({ block: "center" }))
    await shot(page, "06-balance")
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Chapter 7 — Vouchers, documents and closing (consultant)
// ---------------------------------------------------------------------------

// LTT-2025-0009 (Beaumont) — final_paid, invoice_balance 0, no voucher generated yet:
// the one booking seeded eligible for the whole voucher flow without also carrying a
// voucher already. Nothing seeds booking_services rows, so each test adds its own leg.
const CH07_ELIGIBLE_BOOKING = "00000000-0000-0000-0000-000000009024"
// LTT-2025-0007 (Johansson) — voucher_sent, seeded with quote/invoice/voucher PDFs already
// on record, for the read-only Documents tab and library shots.
const CH07_SENT_BOOKING = "00000000-0000-0000-0000-000000009029"
const CH07_TRAIN_SUPPLIER = "002b438f-df83-483a-9274-f17e9fef7f35" // The Blue Train

/**
 * The seed never populates booking_services (legs are normally created by Build
 * Booking), so the voucher chapter's shots add one leg of their own and remove it
 * afterwards.
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
      supplier_id: CH07_TRAIN_SUPPLIER,
      label: "Blue Train — Pretoria to Cape Town",
      selected: true,
      sort_order: 1,
      supplier_reference: overrides.supplierReference ?? null,
      supplier_contact_name: overrides.supplierContactName ?? null,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`Could not seed the handbook voucher leg (${error?.message ?? "no row"}).`)
  }

  return async () => {
    await supabase.from("booking_services").delete().eq("id", data.id)
  }
}

test.describe("ch07 vouchers", () => {
  test("07 voucher details", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, CH07_ELIGIBLE_BOOKING, {
      supplierReference: "BT-CT-20492",
      supplierContactName: "Sipho",
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH07_ELIGIBLE_BOOKING}?tab=references`)
      await expect(page.getByText("All legs have reference numbers")).toBeVisible({ timeout: 60_000 })
      await shot(page, "07-voucher-details")
      await context.close()
    } finally {
      await removeLeg()
    }
  })

  test("07 missing reference", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, CH07_ELIGIBLE_BOOKING)

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH07_ELIGIBLE_BOOKING}?tab=references`)
      await expect(page.getByText(/legs? (is|are) missing a reference number/i)).toBeVisible({
        timeout: 60_000,
      })
      await shot(page, "07-missing-reference")
      await context.close()
    } finally {
      await removeLeg()
    }
  })

  test("07 generate voucher", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, CH07_ELIGIBLE_BOOKING, {
      supplierReference: "BT-CT-20492",
      supplierContactName: "Sipho",
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH07_ELIGIBLE_BOOKING}?tab=documents`)
      await page.getByRole("button", { name: /^generate voucher$/i }).click({ timeout: 60_000 })

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("Generate travel voucher")).toBeVisible({ timeout: 30_000 })
      await dialog.getByRole("button", { name: /^generate pdf$/i }).click()

      // Rendered server-side before the preview iframe appears.
      await expect(dialog.getByRole("button", { name: /^regenerate pdf$/i })).toBeVisible({
        timeout: 60_000,
      })
      await shot(page, "07-generate-voucher")

      await page.keyboard.press("Escape")
      await context.close()
    } finally {
      await supabase.from("documents").delete().eq("booking_id", CH07_ELIGIBLE_BOOKING).eq("kind", "voucher_pdf")
      await supabase.from("vouchers").delete().eq("booking_id", CH07_ELIGIBLE_BOOKING)
      await removeLeg()
    }
  })

  test("07 send voucher", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const removeLeg = await withBookingServiceLeg(supabase, CH07_ELIGIBLE_BOOKING, {
      supplierReference: "BT-CT-20492",
      supplierContactName: "Sipho",
    })

    try {
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto(`/app/bookings/${CH07_ELIGIBLE_BOOKING}?tab=documents`)
      await page.getByRole("button", { name: /^generate voucher$/i }).click({ timeout: 60_000 })

      const generateDialog = page.getByRole("dialog")
      await expect(generateDialog.getByText("Generate travel voucher")).toBeVisible({ timeout: 30_000 })
      await generateDialog.getByRole("button", { name: /^generate pdf$/i }).click()
      await expect(generateDialog.getByRole("button", { name: /^regenerate pdf$/i })).toBeVisible({
        timeout: 60_000,
      })

      // Builds the itinerary silently and prepares both attachments before opening.
      await generateDialog.getByRole("button", { name: /preview & send voucher/i }).click()
      const previewDialog = page.getByRole("dialog").filter({ hasText: "Send travel voucher" })
      await expect(previewDialog).toBeVisible({ timeout: 60_000 })
      await expect(previewDialog.getByRole("button", { name: /send with attachment/i })).toBeVisible()
      await shot(page, "07-send-voucher")

      // Nothing is sent; the draft voucher, its PDF and the itinerary are removed below.
      await previewDialog.getByRole("button", { name: "Cancel" }).click()
      await context.close()
    } finally {
      await supabase.from("documents").delete().eq("booking_id", CH07_ELIGIBLE_BOOKING).eq("kind", "voucher_pdf")
      await supabase.from("documents").delete().eq("booking_id", CH07_ELIGIBLE_BOOKING).eq("kind", "itinerary_pdf")
      await supabase.from("vouchers").delete().eq("booking_id", CH07_ELIGIBLE_BOOKING)
      await supabase.from("itineraries").delete().eq("booking_id", CH07_ELIGIBLE_BOOKING)
      await removeLeg()
    }
  })

  test("07 documents tab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH07_SENT_BOOKING}?tab=documents`)
    await expect(page.getByText("Booking Worksheet")).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("Voucher Pdf")).toBeVisible()
    await shot(page, "07-documents-tab")
    await context.close()
  })

  test("07 documents library", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/documents")
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 60_000 })
    await page.getByRole("combobox").filter({ hasText: "Document Type" }).click()
    await page.getByRole("option", { name: "Voucher PDF" }).click()
    await expect(page.getByText("LTT-2025-0007")).toBeVisible()
    await shot(page, "07-documents-library")
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Chapter 8 — Pipeline, stage gates and the lost path (consultant)
// ---------------------------------------------------------------------------

// Three seeded bookings cover the chapter:
//   9018 / LTT-2026-0021 — deposit_requested with the invoice sent and nothing paid.
//                          Moving it to Deposit Paid raises exactly one blocking gate,
//                          which is the cleanest "One more step first" figure there is.
//   9013 / LTT-2026-0025 — accepted with no invoice, so a move to Deposit Invoice Sent
//                          raises the auto-fixable invoice gate on its own.
//   9024 / LTT-2025-0009 — final_paid, so Cancel Booking shows the refund block.
const CH08_UNPAID_BOOKING = "00000000-0000-0000-0000-000000009018"
const CH08_ACCEPTED_BOOKING = "00000000-0000-0000-0000-000000009013"
const CH08_PAID_BOOKING = "00000000-0000-0000-0000-000000009024"

/**
 * The board labels a card — and its "Move to" select — with the consultant-entered
 * invoice number when there is one, falling back to the booking number. The gate
 * figures drive that select by its accessible name, so read the same value the
 * board will render rather than assuming which of the two it is.
 */
async function boardReference(
  supabase: ReturnType<typeof createQaSupabase>,
  bookingId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("bookings")
    .select("booking_number, customer_invoice_number")
    .eq("id", bookingId)
    .maybeSingle()
  if (error || !data) {
    throw new Error(`Cannot read the booking's board reference (${error?.message ?? "none found"}).`)
  }
  return data.customer_invoice_number?.trim() || data.booking_number
}

test.describe("ch08 pipeline", () => {
  test("08 pipeline board", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/pipeline")
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("region", { name: "Deposit Invoice Sent stage column" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Voucher Sent stage column" })).toBeVisible()
    await shot(page, "08-pipeline-board")
    await context.close()
  })

  test("08 stage stepper", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH08_UNPAID_BOOKING}`)
    await expect(page.getByRole("navigation", { name: "Booking lifecycle progress" })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole("button", { name: /^next/i })).toBeVisible()
    await shot(page, "08-stage-stepper")
    await context.close()
  })

  test("08 gate modal", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const reference = await boardReference(supabase, CH08_UNPAID_BOOKING)

    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto("/app/pipeline")
    // The per-card "Move to" select, not a drag: it always shows the modal, where a
    // drag can route a pending-send gate off to the booking screen instead.
    const moveSelect = page.getByRole("combobox", { name: `Move ${reference} to stage` })
    await moveSelect.click({ timeout: 60_000 })
    await page.getByRole("option", { name: "Deposit Paid" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("One more step first")).toBeVisible({ timeout: 30_000 })
    await expect(
      dialog.getByText("A payment must be recorded before the deposit can be marked received."),
    ).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Go to Payments tab" })).toBeVisible()
    await shot(page, "08-gate-modal")

    // Nothing was moved — the gate blocked it and this dismisses the dialog.
    await dialog.getByRole("button", { name: "Cancel move" }).click()
    await context.close()
  })

  test("08 fix and continue", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    // Without an invoice number the move raises two gates and the modal reads
    // "A few steps first"; with one, the auto-fixable invoice gate stands alone.
    const restoreNumber = await withInvoiceNumber(supabase, CH08_ACCEPTED_BOOKING, "INV-2026-0025")

    try {
      const reference = await boardReference(supabase, CH08_ACCEPTED_BOOKING)
      const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
      const page = await context.newPage()
      await page.goto("/app/pipeline")
      const moveSelect = page.getByRole("combobox", { name: `Move ${reference} to stage` })
      await moveSelect.click({ timeout: 60_000 })
      await page.getByRole("option", { name: "Deposit Invoice Sent" }).click()

      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("A deposit invoice is required before requesting the deposit.")).toBeVisible({
        timeout: 30_000,
      })
      await expect(dialog.getByTestId("autofix-invoice_document")).toBeVisible()
      await shot(page, "08-fix-and-continue")

      // Confirm is never clicked, so no invoice or draft email is created.
      await dialog.getByRole("button", { name: "Cancel move" }).click()
      await context.close()
    } finally {
      await restoreNumber()
    }
  })

  test("08 manager override", async ({ browser }) => {
    loadQaEnv()
    const supabase = createQaSupabase()
    const reference = await boardReference(supabase, CH08_UNPAID_BOOKING)

    // Any role can reach the override panel now — it starts collapsed, so the
    // shot expands it first rather than needing a manager session.
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.manager.storageState })
    const page = await context.newPage()
    await page.goto("/app/pipeline")
    const moveSelect = page.getByRole("combobox", { name: `Move ${reference} to stage` })
    await moveSelect.click({ timeout: 60_000 })
    await page.getByRole("option", { name: "Deposit Paid" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Override gates")).toBeVisible({ timeout: 30_000 })
    await dialog.getByText("Override gates").click()
    await dialog
      .getByPlaceholder("Reason for forcing this stage move...")
      .fill("Client paid by EFT on 14 August; proof of payment received, capture to follow.")
    await expect(dialog.getByRole("button", { name: "Force move" })).toBeEnabled()
    await shot(page, "08-override")

    // Force move is deliberately not clicked; the booking stays where it is.
    await dialog.getByRole("button", { name: "Cancel move" }).click()
    await context.close()
  })

  test("08 set outcome", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH08_ACCEPTED_BOOKING}`)
    await page.getByRole("button", { name: /^Outcome: .*Click to change\.$/ }).click({ timeout: 60_000 })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Set Outcome")).toBeVisible({ timeout: 30_000 })
    await dialog.locator("#outcome-select").click()
    await page.getByRole("option", { name: "Lost" }).click()
    await dialog.locator("#outcome-reason").click()
    await page.getByRole("option", { name: "Price too high" }).click()
    await shot(page, "08-set-outcome")

    // Save is never clicked, so the booking's outcome is untouched.
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await context.close()
  })

  test("08 refund capture", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.consultant.storageState })
    const page = await context.newPage()
    await page.goto(`/app/bookings/${CH08_PAID_BOOKING}`)
    await page.getByRole("button", { name: /^Cancel Booking$/ }).click({ timeout: 60_000 })

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Cancelled bookings are moved to Lost")).toBeVisible({ timeout: 30_000 })
    await dialog.locator("#cancel-reason").click()
    await page.getByRole("option", { name: "Customer cancelled" }).click()
    // Refund capture only renders from deposit_paid onward, which is why this
    // figure runs against a paid booking.
    await dialog.getByLabel("Refunded", { exact: true }).check()
    await expect(dialog.getByLabel("Refund reference")).toBeVisible()
    await dialog.getByLabel("Refund reference").fill("EFT reversal 4471")
    await shot(page, "08-refund-capture")

    // The confirm button is never clicked, so the booking is not cancelled.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// Administrator guide — chapter 2, company setup
// ---------------------------------------------------------------------------

test.describe("admin company setup", () => {
  test("a02 settings landing", async ({ browser }) => {
    const context = await browser.newContext({ storageState: HANDBOOK_USERS.admin.storageState })
    const page = await context.newPage()
    await page.goto("/app/settings")
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 60_000 })
    await shot(page, "a02-settings-landing")
    await context.close()
  })
})
