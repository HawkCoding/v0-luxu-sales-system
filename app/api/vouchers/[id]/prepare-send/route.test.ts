import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const composeMocks = vi.hoisted(() => ({
  composeEmail: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: composeMocks.composeEmail,
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
}

function buildSupabase(options: BuildOptions = {}) {
  const {
    stage = "final_paid",
    invoiceBalance = 0,
    customerEmail = "guest@example.test",
    voucherStoragePath = "vouchers/BT-2026-0001/voucher.pdf",
    itineraryStoragePath = "vouchers/BT-2026-0001/itinerary.pdf",
  } = options

  const voucherRow = {
    id: VOUCHER_ID,
    voucher_number: "180226-01",
    booking_id: BOOKING_ID,
    booking: {
      id: BOOKING_ID,
      booking_number: "BT-2026-0001",
      stage,
      invoice_balance: invoiceBalance,
      departure_date: "2026-09-14",
      consultant: "CDJ",
      customer: { first_name: "Jane", last_name: "Smith", email: customerEmail },
      route: { name: "Pretoria → Cape Town" },
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
  })

  it("returns the composed email with voucher AND itinerary attachments", async () => {
    const { download } = buildSupabase()

    const res = await POST(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.email.subject).toContain("Travel Voucher")
    expect(body.email.to).toBe("guest@example.test")
    expect(body.attachments).toHaveLength(2)
    expect(body.attachments[0].filename).toBe("voucher-BT-2026-0001.pdf")
    expect(body.attachments[1].filename).toBe("itinerary-BT-2026-0001.pdf")
    expect(download).toHaveBeenCalledTimes(2)
    expect(composeMocks.composeEmail).toHaveBeenCalledWith(
      expect.anything(),
      "voucher_email",
      expect.objectContaining({
        tokens: expect.objectContaining({ voucherNumber: "180226-01", jobNumber: "BT-2026-0001" }),
      }),
    )
  })

  it("returns a structured missingItinerary error when no itinerary PDF exists", async () => {
    buildSupabase({ itineraryStoragePath: null })

    const res = await POST(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.details).toMatchObject({ missingItinerary: true })
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
