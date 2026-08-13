import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => {}) }))

vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

import { POST } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-000000000002"

interface QuoteFixture {
  status?: string
  currency?: string
  commission_bonus?: number
}

interface Captured {
  rpc?: Record<string, unknown>
  quoteUpdate?: Record<string, unknown>
}

/** Two ZAR lines that a 17.25 rate should turn into R x 17.25 each. */
const LINES = [
  {
    description: "Luxury Suite (2 pax)",
    supplier_description: null,
    qty: 2,
    unit_price: 1000,
    total: 2000,
    sort_order: 0,
    pricing_snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      baseUnitPrice: 1000,
      markupPct: 0,
      singleSupplementPct: null,
      serviceType: null,
      travelDate: "2026-09-01",
      passengerKind: "adult",
      packageId: "",
      packageName: "",
      legId: null,
      legLabel: null,
      supplierId: null,
      supplierName: null,
      supplierKind: null,
      routeId: null,
      routeName: null,
      suiteTypeId: null,
      suiteTypeName: null,
      rateCardId: null,
    },
  },
  {
    description: "Commission",
    supplier_description: null,
    qty: 1,
    unit_price: 500,
    total: 500,
    sort_order: 1,
    pricing_snapshot: null,
  },
]

function buildSupabase(quote: QuoteFixture, captured: Captured) {
  return {
    from: (table: string) => {
      if (table === "quotes") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: QUOTE_ID,
                  booking_id: BOOKING_ID,
                  currency: quote.currency ?? "ZAR",
                  status: quote.status ?? "draft",
                  subtotal: 2500,
                  total: 2500,
                  commission_bonus: quote.commission_bonus ?? 0,
                },
                error: null,
              }),
            }),
          }),
          update: (row: Record<string, unknown>) => {
            captured.quoteUpdate = row
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      if (table === "quote_line_items") {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: LINES, error: null }) }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      captured.rpc = args
      return { error: null }
    },
  }
}

function authorise(quote: QuoteFixture, captured: Captured) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: buildSupabase(quote, captured),
      user: { id: "user-1" },
      profile: { actorName: "Test User", clearanceLevel: "consultant" },
    },
  })
}

async function post(body: unknown) {
  return POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: QUOTE_ID }),
  })
}

describe("POST /api/quotes/[id]/currency", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("converts every line on a draft quote and recomputes the totals", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    const response = await post({ currency: "USD", rate: 17.25, asOf: "2026-08-13" })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.currency).toBe("USD")

    const lines = captured.rpc?.p_line_items as Record<string, unknown>[]
    expect(lines[0].unit_price).toBe(17250)
    // Recomputed from the converted unit price, so qty x unitPrice = total still holds exactly.
    expect(lines[0].total).toBe(34500)
    expect(lines[1].unit_price).toBe(8625)
    expect(captured.rpc?.p_total).toBe(43125)
    expect(payload.total).toBe(43125)
  })

  it("re-stamps the FX chain against the supplier's original currency", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    await post({ currency: "USD", rate: 2, asOf: "2026-08-13" })

    const lines = captured.rpc?.p_line_items as { pricing_snapshot: Record<string, unknown> }[]
    // baseUnitPrice follows the line into the new currency.
    expect(lines[0].pricing_snapshot.baseUnitPrice).toBe(2000)
  })

  it("converts the manual commission top-up alongside the lines", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", commission_bonus: 100 }, captured)

    await post({ currency: "USD", rate: 2 })

    expect(captured.quoteUpdate?.commission_bonus).toBe(200)
    expect(captured.quoteUpdate?.currency).toBe("USD")
  })

  it("also converts a quote that is still pricing_incomplete", async () => {
    const captured: Captured = {}
    authorise({ status: "pricing_incomplete" }, captured)

    const response = await post({ currency: "USD", rate: 17.25 })
    expect(response.status).toBe(200)
  })

  it("refuses a sent quote and points at Revise", async () => {
    const captured: Captured = {}
    authorise({ status: "sent" }, captured)

    const response = await post({ currency: "USD", rate: 17.25 })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe("REQUIRES_REVISION")
    expect(payload.error).toMatch(/Revise/)
    // Nothing may be written when the conversion is refused.
    expect(captured.rpc).toBeUndefined()
    expect(captured.quoteUpdate).toBeUndefined()
  })

  it("refuses an accepted quote", async () => {
    const captured: Captured = {}
    authorise({ status: "accepted" }, captured)

    const response = await post({ currency: "USD", rate: 17.25 })
    expect(response.status).toBe(409)
    expect(captured.rpc).toBeUndefined()
  })

  it("rejects converting a quote to the currency it is already in", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", currency: "USD" }, captured)

    const response = await post({ currency: "USD", rate: 1 })
    expect(response.status).toBe(400)
    expect(captured.rpc).toBeUndefined()
  })

  it("rejects an unsupported currency", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    const response = await post({ currency: "AUD", rate: 10 })
    expect(response.status).toBe(400)
  })

  it("rejects a non-positive or absurd rate", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    expect((await post({ currency: "USD", rate: 0 })).status).toBe(400)
    expect((await post({ currency: "USD", rate: -1 })).status).toBe(400)
    // A mistyped decimal point must not silently re-price a booking by orders of magnitude.
    expect((await post({ currency: "USD", rate: 99_999 })).status).toBe(400)
  })

  it("writes an audit entry naming both currencies", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    await post({ currency: "USD", rate: 17.25 })

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "quote_currency_changed",
        before: expect.objectContaining({ currency: "ZAR" }),
        after: expect.objectContaining({ currency: "USD", rate: 17.25 }),
      }),
    )
  })
})
