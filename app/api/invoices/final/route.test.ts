import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/invoices/render-invoice-email", () => ({
  renderInvoiceEmail: vi.fn(async () => "<p>final invoice</p>"),
}))

import { PATCH, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const INVOICE_ID = "00000000-0000-4000-8000-00000000bbbb"
const QUOTE_ID = "00000000-0000-4000-8000-00000000cccc"

interface MockOptions {
  quote?: { id: string; total: number; status: string; created_at: string } | null
  payments?: Array<{ amount: number }>
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/invoices/final", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function patchJson(body: unknown) {
  return new Request("http://localhost/api/invoices/final", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function buildAuth({
  quote = { id: QUOTE_ID, total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" },
  payments = [{ amount: 250 }],
}: MockOptions = {}) {
  const invoiceInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          id: INVOICE_ID,
          booking_id: BOOKING_ID,
          quote_id: QUOTE_ID,
          kind: "final",
          status: "draft",
          invoice_number: "BT-2026-0001-FIN1",
          deposit_percentage: null,
          amount: 750,
          currency: "ZAR",
          due_date: "2026-05-20",
          sent_at: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
        error: null,
      })),
    })),
  }))
  const invoiceUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: INVOICE_ID, status: "sent", sent_at: "2026-05-13T00:00:00.000Z" },
            error: null,
          })),
        })),
      })),
    })),
  }))
  const auditInsert = vi.fn(async () => ({ error: null }))
  const documentInsert = vi.fn(async () => ({ error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  booking_number: "BT-2026-0001",
                  customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" },
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: INVOICE_ID,
                    booking_id: BOOKING_ID,
                    status: "draft",
                    invoice_number: "BT-2026-0001-FIN1",
                  },
                  error: null,
                })),
                in: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
          insert: invoiceInsert,
          update: invoiceUpdate,
        }
      }

      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: quote, error: null })),
                  })),
                })),
              })),
            })),
          })),
        }
      }

      if (table === "payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: payments, error: null })),
          })),
        }
      }

      if (table === "documents") return { insert: documentInsert }
      if (table === "audit_logs") return { insert: auditInsert }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "user@example.test" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })

  return { invoiceInsert, invoiceUpdate, documentInsert, auditInsert }
}

describe("POST /api/invoices/final", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(401)
  })

  it("creates a draft final invoice for the calculated remaining balance", async () => {
    const { invoiceInsert, documentInsert } = buildAuth()

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.balance).toMatchObject({ quoteTotal: 1000, totalPaid: 250, calculatedBalance: 750 })
    expect(body.invoice).toMatchObject({ kind: "final", status: "draft", amount: 750 })
    expect(invoiceInsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "final", amount: 750, quote_id: QUOTE_ID }),
    )
    expect(documentInsert).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: BOOKING_ID, kind: "invoice_pdf" }),
    )
  })

  it("returns 422 when there is no accepted priced quote", async () => {
    buildAuth({ quote: null })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({
      error: "A priced quote is required before generating a final invoice",
    })
  })
})

describe("PATCH /api/invoices/final", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("marks a final invoice as sent", async () => {
    const { invoiceUpdate, auditInsert } = buildAuth()

    const res = await PATCH(patchJson({ invoiceId: INVOICE_ID, status: "sent" }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ id: INVOICE_ID, status: "sent" })
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", sent_at: expect.any(String) }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "final_invoice_sent", entity_id: BOOKING_ID }),
    )
  })
})
