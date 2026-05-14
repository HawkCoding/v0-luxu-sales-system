import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

vi.mock("@/lib/quotes/quote-number", () => ({
  reviseQuoteNumber: vi.fn(() => "BT-2026-0001-Q2"),
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const QUOTE_ID = "00000000-0000-4000-8000-00000000aaaa"
const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"
const REVISED_QUOTE_ID = "00000000-0000-4000-8000-00000000cccc"

function makeParams(id = QUOTE_ID) {
  return { params: Promise.resolve({ id }) }
}

const sentQuote = {
  id: QUOTE_ID,
  booking_id: BOOKING_ID,
  itinerary_id: null,
  status: "sent",
  validity_until: "2026-06-01",
  subtotal: 1000,
  vat: 150,
  total: 1150,
  no_package_match: false,
  quote_number: "BT-2026-0001-Q1",
  booking: { booking_number: "BT-2026-0001" },
}

const revisedQuoteRow = {
  id: REVISED_QUOTE_ID,
  booking_id: BOOKING_ID,
  status: "draft",
  quote_number: "BT-2026-0001-Q2",
  parent_quote_id: QUOTE_ID,
}

interface CreateSupabaseOptions {
  user?: { id: string; email: string } | null
  quoteData?: typeof sentQuote | null
  quoteError?: unknown
  lineItemsData?: unknown[]
  lineItemsError?: unknown
  insertResult?: { data: unknown; error: unknown }
  lineItemInsertError?: unknown
  auditError?: unknown
}

function createSupabaseMock({
  user = { id: USER_ID, email: "user@example.com" },
  quoteData = sentQuote,
  quoteError = null,
  lineItemsData = [{ description: "Item 1", qty: 1, unit_price: 1000, total: 1000, sort_order: 0 }],
  lineItemsError = null,
  insertResult = { data: revisedQuoteRow, error: null },
  lineItemInsertError = null,
  auditError = null,
}: CreateSupabaseOptions = {}) {
  const auditInsert = vi.fn(async () => ({ error: auditError }))
  const lineItemInsert = vi.fn(async () => ({ error: lineItemInsertError }))
  const quotesUpdate = vi.fn().mockReturnValue({ eq: vi.fn(async () => ({ error: null })) })

  return {
    auditInsert,
    lineItemInsert,
    quotesUpdate,
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user },
          error: user ? null : { message: "Unauthorized" },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "quotes") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: quoteData, error: quoteError })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => insertResult),
              })),
            })),
            update: quotesUpdate,
          }
        }
        if (table === "quote_line_items") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: lineItemsData, error: lineItemsError })),
              })),
            })),
            insert: lineItemInsert,
          }
        }
        if (table === "audit_logs") {
          return { insert: auditInsert }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    },
  }
}

describe("POST /api/quotes/[id]/revise", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = createSupabaseMock({ user: null })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it("returns 404 when quote is not found", async () => {
    const { supabase } = createSupabaseMock({ quoteData: null, quoteError: { code: "PGRST116" } })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 400 when quote status is draft (cannot revise)", async () => {
    const { supabase } = createSupabaseMock({
      quoteData: { ...sentQuote, status: "draft" },
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/revised/i)
  })

  it("allows revising an expired quote", async () => {
    const { supabase } = createSupabaseMock({
      quoteData: { ...sentQuote, status: "expired" },
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
  })

  it("marks the parent quote as superseded on success", async () => {
    const { supabase, quotesUpdate } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)

    expect(quotesUpdate).toHaveBeenCalledWith({ status: "superseded" })
  })

  it("logs quote_version_created audit entry on the parent", async () => {
    const { supabase, auditInsert } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    await POST(new Request("http://localhost"), makeParams())

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quote_version_created",
        entity_id: QUOTE_ID,
        after_json: expect.objectContaining({ status: "superseded" }),
      }),
    )
  })

  it("returns 500 with generic message on insert failure (no DB error details leaked)", async () => {
    const { supabase } = createSupabaseMock({
      insertResult: { data: null, error: { message: "duplicate key violates constraint", code: "23505" } },
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("Failed to revise quote")
    expect(JSON.stringify(body)).not.toContain("duplicate key")
  })

  it("returns 200 with revised quote shape on success", async () => {
    const { supabase } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(REVISED_QUOTE_ID)
    expect(body.bookingId).toBe(BOOKING_ID)
    expect(body.status).toBe("draft")
    expect(body.quoteNumber).toBe("BT-2026-0001-Q2")
    expect(body.parentQuoteId).toBe(QUOTE_ID)
  })
})
