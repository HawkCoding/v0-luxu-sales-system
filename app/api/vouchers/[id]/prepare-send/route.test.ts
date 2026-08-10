import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const composeMocks = vi.hoisted(() => ({
  composeEmail: vi.fn(),
}))

const itineraryMocks = vi.hoisted(() => ({
  ensureItineraryPdf: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: composeMocks.composeEmail,
}))

vi.mock("@/lib/itinerary/ensure-itinerary-pdf", () => ({
  ensureItineraryPdf: itineraryMocks.ensureItineraryPdf,
}))

import { POST } from "./route"

const VOUCHER_ID = "00000000-0000-4000-8000-00000000eeee"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

interface BuildOptions {
  stage?: string
  invoiceBalance?: number
  customerEmail?: string | null
  voucherStoragePath?: string | null
  itineraryStoragePath?: string | null
  routeReversed?: boolean | null
}

function buildSupabase(options: BuildOptions = {}) {
  const {
    stage = "final_paid",
    invoiceBalance = 0,
    customerEmail = "guest@example.test",
    voucherStoragePath = "vouchers/BT-2026-0001/voucher.pdf",
    itineraryStoragePath = "vouchers/BT-2026-0001/itinerary.pdf",
    routeReversed = false,
  } = options

  const voucherRow = {
    id: VOUCHER_ID,
    voucher_number: "180226-01",
    booking_id: BOOKING_ID,
    booking: {
      id: BOOKING_ID,
      booking_number: "BT-2026-0001",
      customer_invoice_number: "INV-2026-0042",
      stage,
      invoice_balance: invoiceBalance,
      departure_date: "2026-09-14",
      consultant: "CDJ",
      route_reversed: routeReversed,
      customer: { first_name: "Jane", last_name: "Smith", email: customerEmail },
      route: {
        name: "Pretoria ↔ Cape Town",
        direction_mode: "round_trip",
        origin: { name: "Pretoria" },
        destination: { name: "Cape Town" },
      },
    },
    document: voucherStoragePath ? { storage_path: voucherStoragePath } : null,
  }

  const download = vi.fn(async () => ({
    data: new Blob(["pdf-bytes"], { type: "application/pdf" }),
    error: null,
  }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "vouchers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: voucherRow, error: null })),
        }
      }
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: itineraryStoragePath
              ? { id: "doc-itin", storage_path: itineraryStoragePath, created_at: "2026-07-01T00:00:00Z" }
              : null,
            error: null,
          })),
        }
      }
      if (table === "quotes") {
        // Chainable, and `maybeSingle` yields no accepted quote — these fixtures have none, so
        // the readiness gate stays unscoped (scoping is covered by accepted-quote-scope.test.ts).
        const self: Record<string, unknown> = {}
        self.select = vi.fn(() => self)
        self.eq = vi.fn(() => self)
        self.order = vi.fn(() => self)
        self.limit = vi.fn(() => self)
        self.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
        return self
      }
      // Supplier fallback lookup for {{supplierName}} — no route supplier in these fixtures.
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }
      }
      // Suite tokens for the voucher email — no package selections in these fixtures.
      if (table === "booking_package_selections") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
        }
      }
      if (table === "booking_services") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
        }
      }
      // No leg reference rows in these fixtures — readiness check sees nothing missing.
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({ download })),
    },
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })

  return { download }
}

function routeParams(id = VOUCHER_ID) {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/vouchers/[id]/prepare-send", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    composeMocks.composeEmail.mockReset()
    composeMocks.composeEmail.mockResolvedValue({
      subject: "Your Travel Voucher — BT-2026-0001",
      bodyHtml: "<html><p>voucher</p></html>",
      bodyContentHtml: "<p>voucher</p>",
      warnings: [],
    })
    itineraryMocks.ensureItineraryPdf.mockReset()
    itineraryMocks.ensureItineraryPdf.mockResolvedValue({
      documentId: "doc-itin-generated",
      bookingId: BOOKING_ID,
      itineraryId: "itin-generated",
      storagePath: "vouchers/BT-2026-0001/itinerary.pdf",
      regenerated: true,
    })
  })

  it("returns the composed email with voucher AND itinerary attachments", async () => {
    const { download } = buildSupabase()

    const res = await POST(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.email.subject).toContain("Travel Voucher")
    expect(body.email.to).toBe("guest@example.test")
    expect(body.attachments).toHaveLength(2)
    expect(body.attachments[0].filename).toBe("voucher-INV-2026-0042.pdf")
    expect(body.attachments[1].filename).toBe("itinerary-INV-2026-0042.pdf")
    expect(download).toHaveBeenCalledTimes(2)
    expect(composeMocks.composeEmail).toHaveBeenCalledWith(
      expect.anything(),
      "voucher_email",
      expect.objectContaining({
        tokens: expect.objectContaining({
          voucherNumber: "180226-01",
          jobNumber: "BT-2026-0001",
          direction: "Pretoria → Cape Town",
        }),
      }),
    )
  })

  it("reverses the directed route name when the booking travels the other way", async () => {
    buildSupabase({ routeReversed: true })

    await POST(new Request("http://localhost"), routeParams())

    expect(composeMocks.composeEmail).toHaveBeenCalledWith(
      expect.anything(),
      "voucher_email",
      expect.objectContaining({
        tokens: expect.objectContaining({ direction: "Cape Town → Pretoria" }),
      }),
    )
  })

  it("silently generates the itinerary PDF and proceeds when none exists yet", async () => {
    const { download } = buildSupabase({ itineraryStoragePath: null })

    const res = await POST(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(itineraryMocks.ensureItineraryPdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingId: BOOKING_ID }),
    )
    expect(body.attachments).toHaveLength(2)
    expect(download).toHaveBeenCalledTimes(2)
  })

  it("blocks the send when the itinerary PDF cannot be generated", async () => {
    buildSupabase({ itineraryStoragePath: null })
    itineraryMocks.ensureItineraryPdf.mockRejectedValue(new Error("render failed"))

    const res = await POST(new Request("http://localhost"), routeParams())

    expect(res.status).toBe(500)
  })

  it("blocks when voucher readiness fails (unpaid balance)", async () => {
    buildSupabase({ invoiceBalance: 500 })

    const res = await POST(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Voucher is not ready to send")
  })

  it("blocks when the voucher PDF has not been generated", async () => {
    buildSupabase({ voucherStoragePath: null })

    const res = await POST(new Request("http://localhost"), routeParams())
    expect(res.status).toBe(400)
  })

  it("rejects an invalid voucher id", async () => {
    buildSupabase()
    const res = await POST(new Request("http://localhost"), routeParams("not-a-uuid"))
    expect(res.status).toBe(400)
  })
})
