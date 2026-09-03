import { beforeEach, describe, expect, it, vi } from "vitest"

const settingsMocks = vi.hoisted(() => ({
  getQuoteFollowUpSettings: vi.fn(),
  getEmailBrandingSettings: vi.fn(),
}))

const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}))

const logErrorMocks = vi.hoisted(() => ({
  logError: vi.fn(),
}))

const templateMocks = vi.hoisted(() => ({
  getTemplate: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getQuoteFollowUpSettings: settingsMocks.getQuoteFollowUpSettings,
  getEmailBrandingSettings: settingsMocks.getEmailBrandingSettings,
  getDocumentBrandForEmail: vi.fn(async () => ({
    brand: {
      heading: "SA RAIL",
      subheading: "THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
      logoUrl: null,
    },
    position: "bottom",
  })),
}))

vi.mock("@/lib/email/transport", () => ({
  sendEmail: emailMocks.sendEmail,
}))

vi.mock("@/lib/error-log", () => ({
  logError: logErrorMocks.logError,
}))

vi.mock("@/lib/templates/get-template", () => ({
  getTemplate: templateMocks.getTemplate,
}))

import { runQuoteFollowUpWorker } from "./follow-up-worker"

const QUOTE_ID = "00000000-0000-4000-8000-000000000aaa"
const BOOKING_ID = "00000000-0000-4000-8000-000000000bbb"
const FOLLOW_UP_ID = "00000000-0000-4000-8000-000000000ccc"
const CUSTOMER_EMAIL = "guest@example.com"
const SALESPERSON_ID = "00000000-0000-4000-8000-000000000ddd"

function daysBefore(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function makeSupabase({
  sentQuotes = [] as unknown[],
  existingFollowUps = [] as unknown[],
  bookingData = null as unknown,
  credentialData = null as unknown,
  profileData = null as unknown,
  followUpInsertError = null as unknown,
  correspondenceInsertError = null as unknown,
  lineItemRows = [] as unknown[],
  supplierRows = [] as unknown[],
} = {}) {
  const followUpUpdateFn = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  const followUpInsertSingle = vi.fn(async () =>
    followUpInsertError
      ? { data: null, error: followUpInsertError }
      : { data: { id: FOLLOW_UP_ID }, error: null },
  )
  const followUpInsertChain = { select: vi.fn(() => ({ single: followUpInsertSingle })) }
  const followUpInsert = vi.fn(() => followUpInsertChain)

  const correspondenceInsert = vi.fn(async () => ({ error: correspondenceInsertError }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }
      if (table === "quotes") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn(async () => ({ data: sentQuotes, error: null })),
        }
      }
      if (table === "quote_follow_ups") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: existingFollowUps, error: null })),
          })),
          insert: followUpInsert,
          update: followUpUpdateFn,
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn().mockReturnThis(),
          // Ordered by sort_order now — the primary-supplier fallbacks are "first leg in array
          // order", so the read can't be left to Postgres.
          eq: vi.fn().mockReturnThis(),
          order: vi.fn(async () => ({ data: lineItemRows, error: null })),
        }
      }
      if (table === "suppliers") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn(async () => ({ data: supplierRows, error: null })),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: bookingData, error: bookingData ? null : { message: "not found" } })),
        }
      }
      if (table === "salesperson_credentials") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: credentialData, error: null })),
        }
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: profileData, error: null })),
        }
      }
      if (table === "correspondences") {
        return { insert: correspondenceInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { supabase, followUpUpdateFn, followUpInsert, correspondenceInsert }
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    booking_number: "RR-2026-0001",
    stage: "quote_sent",
    outcome: "open",
    assigned_salesperson_id: SALESPERSON_ID,
    customers: { first_name: "Jane", last_name: "Smith", email: CUSTOMER_EMAIL },
    ...overrides,
  }
}

describe("runQuoteFollowUpWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsMocks.getQuoteFollowUpSettings.mockResolvedValue({
      enabled: true,
      cadence: [3, 7],
    })
    settingsMocks.getEmailBrandingSettings.mockResolvedValue({
      footerTagline: "Test tagline",
      email_font_family: "Arial, sans-serif",
      email_font_size: "16px",
    })
    templateMocks.getTemplate.mockResolvedValue({
      key: "follow_up",
      subject: "Following up on your enquiry — {{jobNumber}}",
      bodyHtml: "<p>Dear {{customerName}}, quote {{jobNumber}} was sent on {{lastSentDate}}.</p>",
    })
    emailMocks.sendEmail.mockResolvedValue({ success: true, provider: "mailpit", providerMessageId: "msg1", error: null })
    logErrorMocks.logError.mockResolvedValue(undefined)
  })

  it("returns zeros when follow-ups are globally disabled", async () => {
    settingsMocks.getQuoteFollowUpSettings.mockResolvedValue({ enabled: false, cadence: [3, 7] })
    const { supabase } = makeSupabase()
    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0, failed: 0 })
  })

  it("returns zeros when there are no sent quotes", async () => {
    const { supabase } = makeSupabase({ sentQuotes: [] })
    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0, failed: 0 })
  })

  it("sends follow-up for a quote 5 days old (day-3 due, day-7 not yet)", async () => {
    const { supabase, followUpInsert, correspondenceInsert } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking(),
    })

    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result.sent).toBe(1)
    expect(followUpInsert).toHaveBeenCalledTimes(1)
    expect(correspondenceInsert).toHaveBeenCalledTimes(1)
    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1)
  })

  it("skips already-sent cadence days", async () => {
    const sentDate = new Date()
    sentDate.setDate(sentDate.getDate() - 5)
    // day-3 follow-up already sent
    const day3Date = new Date(sentDate)
    day3Date.setDate(day3Date.getDate() + 3)

    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: sentDate.toISOString(), follow_ups_disabled: false }],
      existingFollowUps: [{ scheduled_for: day3Date.toISOString().slice(0, 10), status: "sent" }],
      bookingData: makeBooking(),
    })

    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
  })

  it("skips booking that has progressed beyond quote_sent", async () => {
    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking({ stage: "deposit_paid" }),
    })

    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result.sent).toBe(0)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("skips booking at deposit_requested stage (regression: legacy stage-name bug)", async () => {
    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking({ stage: "deposit_requested" }),
    })

    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result.sent).toBe(0)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("renders subject and body from the follow_up template", async () => {
    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking(),
    })

    await runQuoteFollowUpWorker(supabase as never)
    expect(templateMocks.getTemplate).toHaveBeenCalledWith(expect.anything(), "follow_up")
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Following up on your enquiry — RR-2026-0001",
        html: expect.stringContaining("Dear Jane Smith, quote RR-2026-0001"),
      }),
    )
    // Full branded wrapper with the editable-content slot markers and the
    // footer brand block (the tagline was replaced by the brand heading).
    const html = emailMocks.sendEmail.mock.calls[0][0].html as string
    expect(html).toContain("<!--LUXUS_CONTENT_START-->")
    expect(html).toContain("SA RAIL")
  })

  it("skips booking with cancelled outcome", async () => {
    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking({ outcome: "cancelled" }),
    })

    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result.sent).toBe(0)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("sets status=failed and logs error when email send fails", async () => {
    emailMocks.sendEmail.mockResolvedValue({ success: false, provider: "mailpit", providerMessageId: null, error: "SMTP error" })

    const { supabase, followUpUpdateFn } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking(),
    })

    const result = await runQuoteFollowUpWorker(supabase as never)
    expect(result.failed).toBeGreaterThan(0)
    expect(followUpUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    )
    expect(logErrorMocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "Warning" }),
    )
  })

  it("creates a correspondence record on successful send", async () => {
    const { supabase, correspondenceInsert } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking(),
    })

    await runQuoteFollowUpWorker(supabase as never)
    expect(correspondenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "quote_follow_up", status: "sent" }),
    )
  })

  it("uses the booking's primary supplier's variant when the quote is priced on it", async () => {
    const SUPPLIER_ID = "00000000-0000-4000-8000-000000000eee"
    templateMocks.getTemplate.mockImplementation(async (_supabase: unknown, key: string, supplierId?: string) => {
      if (key === "follow_up" && supplierId === SUPPLIER_ID) {
        return {
          key: "follow_up",
          subject: "Shalati follow-up — {{jobNumber}}",
          bodyHtml: "<p>Dear {{customerName}}, Kruger Shalati quote {{jobNumber}}.</p>",
        }
      }
      return {
        key: "follow_up",
        subject: "Following up on your enquiry — {{jobNumber}}",
        bodyHtml: "<p>Dear {{customerName}}, quote {{jobNumber}} was sent on {{lastSentDate}}.</p>",
      }
    })

    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking({ primary_supplier_id: SUPPLIER_ID }),
      lineItemRows: [{ pricing_snapshot: { supplierId: SUPPLIER_ID, supplierKind: "hotel_property" } }],
      supplierRows: [{ id: SUPPLIER_ID, name: "Kruger Shalati", long_journey_min_days: null, sells_standalone: true }],
    })

    await runQuoteFollowUpWorker(supabase as never)

    expect(templateMocks.getTemplate).toHaveBeenCalledWith(expect.anything(), "follow_up", SUPPLIER_ID)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Shalati follow-up — RR-2026-0001" }),
    )
  })

  it("falls back to the shared template when the quote has no eligible primary supplier", async () => {
    const { supabase } = makeSupabase({
      sentQuotes: [{ id: QUOTE_ID, booking_id: BOOKING_ID, last_sent_at: daysBefore(5), follow_ups_disabled: false }],
      bookingData: makeBooking(),
      lineItemRows: [],
    })

    await runQuoteFollowUpWorker(supabase as never)

    expect(templateMocks.getTemplate).toHaveBeenCalledTimes(1)
    expect(templateMocks.getTemplate).toHaveBeenCalledWith(expect.anything(), "follow_up")
  })
})
