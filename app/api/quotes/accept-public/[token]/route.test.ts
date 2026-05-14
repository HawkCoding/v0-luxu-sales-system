import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: supabaseMocks.createServiceClient,
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/pipeline/constants", () => ({
  getDefaultDepositPercentage: vi.fn(async () => 25),
  calculateDepositAmount: vi.fn((total: number, pct: number) => Math.round(total * pct) / 100),
}))

import { GET, POST } from "./route"
import { NextRequest } from "next/server"

const TOKEN_VALUE = "abc123token"
const QUOTE_ID = "00000000-0000-4000-8000-000000000ddd"
const BOOKING_ID = "00000000-0000-4000-8000-000000000eee"
const TOKEN_ID = "00000000-0000-4000-8000-000000000fff"

const tomorrow = new Date(Date.now() + 86400000).toISOString()
const yesterday = new Date(Date.now() - 86400000).toISOString()

const validTokenRow = {
  id: TOKEN_ID,
  quote_id: QUOTE_ID,
  expires_at: tomorrow,
  used_at: null,
  quote: {
    id: QUOTE_ID,
    status: "sent",
    validity_until: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    quote_number: "BT-2026-0001-Q1",
    subtotal: 1000,
    vat: 150,
    total: 1150,
    booking_id: BOOKING_ID,
    booking: {
      id: BOOKING_ID,
      booking_number: "BT-2026-0001",
      stage: "quote_sent",
      customer: { first_name: "Ada", last_name: "Lovelace" },
    },
  },
}

function buildSupabase(tokenRow: typeof validTokenRow | null, overrides: {
  usedAt?: string | null
  expiresAt?: string
  quoteStatus?: string
  quoteValidity?: string
} = {}) {
  const tokenData = tokenRow
    ? {
        ...tokenRow,
        used_at: overrides.usedAt !== undefined ? overrides.usedAt : tokenRow.used_at,
        expires_at: overrides.expiresAt ?? tokenRow.expires_at,
        quote: {
          ...tokenRow.quote,
          status: overrides.quoteStatus ?? tokenRow.quote.status,
          validity_until: overrides.quoteValidity ?? tokenRow.quote.validity_until,
        },
      }
    : null

  const tokenUpdateSpy = vi.fn().mockReturnValue({
    eq: vi.fn(async () => ({ error: null })),
  })
  const quotesUpdateSpy = vi.fn().mockReturnValue({
    eq: vi.fn(async () => ({ error: null })),
  })
  const bookingsUpdateSpy = vi.fn().mockReturnValue({
    eq: vi.fn(async () => ({ error: null })),
  })
  const auditInsertSpy = vi.fn(async () => ({ data: null, error: null }))
  const invoicesInsertSpy = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn(async () => ({ data: { id: "inv-1" }, error: null })),
    }),
  })
  const documentsInsertSpy = vi.fn(async () => ({ data: null, error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "quote_acceptance_tokens") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: tokenData, error: null })),
            })),
          })),
          update: tokenUpdateSpy,
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }
      if (table === "quotes") {
        return { update: quotesUpdateSpy }
      }
      if (table === "bookings") {
        return { update: bookingsUpdateSpy }
      }
      if (table === "invoices") {
        const eqChain: Record<string, unknown> = {}
        const inFn = vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }))
        eqChain.eq = vi.fn(() => eqChain)
        eqChain.in = inFn
        return {
          select: vi.fn(() => eqChain),
          insert: invoicesInsertSpy,
        }
      }
      if (table === "documents") {
        return { insert: documentsInsertSpy }
      }
      if (table === "audit_logs") {
        return { insert: auditInsertSpy }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  supabaseMocks.createServiceClient.mockReturnValue(supabase)
  return { tokenUpdateSpy, quotesUpdateSpy, bookingsUpdateSpy, auditInsertSpy, invoicesInsertSpy }
}

function makeRequest(method: "GET" | "POST" = "GET") {
  return new NextRequest(`https://example.com/accept-quote/${TOKEN_VALUE}`, { method })
}

function makeParams(token = TOKEN_VALUE) {
  return { params: Promise.resolve({ token }) }
}

describe("GET /api/quotes/accept-public/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 for unknown token", async () => {
    buildSupabase(null)
    const res = await GET(makeRequest("GET"), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 410 for expired token", async () => {
    buildSupabase(validTokenRow, { expiresAt: yesterday })
    const res = await GET(makeRequest("GET"), makeParams())
    expect(res.status).toBe(410)
  })

  it("returns 410 for already-used token", async () => {
    buildSupabase(validTokenRow, { usedAt: new Date(Date.now() - 3600000).toISOString() })
    const res = await GET(makeRequest("GET"), makeParams())
    expect(res.status).toBe(410)
  })

  it("returns 200 with quote data for a valid token", async () => {
    buildSupabase(validTokenRow)
    const res = await GET(makeRequest("GET"), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.quoteNumber).toBe("BT-2026-0001-Q1")
    expect(body.bookingNumber).toBe("BT-2026-0001")
    expect(body.total).toBe(1150)
  })
})

describe("POST /api/quotes/accept-public/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("accepts quote and marks token as used", async () => {
    const { tokenUpdateSpy, quotesUpdateSpy, bookingsUpdateSpy, auditInsertSpy } = buildSupabase(validTokenRow)

    const res = await POST(makeRequest("POST"), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.quoteNumber).toBe("BT-2026-0001-Q1")

    expect(tokenUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ used_at: expect.any(String) }))
    expect(quotesUpdateSpy).toHaveBeenCalledWith({ status: "accepted" })
    expect(bookingsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "accepted", accepted_at: expect.any(String) }),
    )
    expect(auditInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quote_accepted",
        entity_id: QUOTE_ID,
        meta_json: expect.objectContaining({ method: "acceptance_link" }),
      }),
    )
  })

  it("returns 410 for an expired token", async () => {
    buildSupabase(validTokenRow, { expiresAt: yesterday })
    const res = await POST(makeRequest("POST"), makeParams())
    expect(res.status).toBe(410)
  })

  it("returns 410 for an already-used token", async () => {
    buildSupabase(validTokenRow, { usedAt: new Date(Date.now() - 3600000).toISOString() })
    const res = await POST(makeRequest("POST"), makeParams())
    expect(res.status).toBe(410)
  })

  it("returns 400 when quote is not in sent status", async () => {
    buildSupabase(validTokenRow, { quoteStatus: "accepted" })
    const res = await POST(makeRequest("POST"), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 400 when quote validity has passed", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    buildSupabase(validTokenRow, { quoteValidity: pastDate })
    const res = await POST(makeRequest("POST"), makeParams())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/expired/i)
  })

  it("creates a deposit invoice draft on acceptance", async () => {
    const { invoicesInsertSpy } = buildSupabase(validTokenRow)
    const res = await POST(makeRequest("POST"), makeParams())
    expect(res.status).toBe(200)
    expect(invoicesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "deposit", status: "draft" }),
    )
  })
})
