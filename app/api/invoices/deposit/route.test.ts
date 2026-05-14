import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/invoices/render-invoice-email", () => ({
  renderInvoiceEmail: vi.fn(async () => "<p>invoice</p>"),
}))

import { PATCH, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function postJson(body: unknown) {
  return new Request("http://localhost/api/invoices/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createQuery<T>(result: T) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => result),
        maybeSingle: vi.fn(async () => result),
        in: vi.fn(() => ({
          maybeSingle: vi.fn(async () => result),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => result),
          })),
        })),
      })),
    })),
  }
}

interface BuildAuthOptions {
  quoteData?: { id: string; total: number; status: string; created_at: string } | null
}

function buildAuth({
  quoteData = { id: "quote-1", total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" },
}: BuildAuthOptions = {}) {
  const quoteStatusEq = vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: quoteData, error: null })),
      })),
    })),
  }))

  const invoiceInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          id: "invoice-1",
          booking_id: BOOKING_ID,
          quote_id: "quote-1",
          kind: "deposit",
          status: "draft",
          invoice_number: "BT-2026-0001-DEP1",
          deposit_percentage: 25,
          amount: 250,
          currency: "ZAR",
          due_date: "2026-05-15",
          created_at: "2026-05-08T00:00:00.000Z",
        },
        error: null,
      })),
    })),
  }))

  const documentInsert = vi.fn(async () => ({ error: null }))
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return createQuery({
          data: {
            id: BOOKING_ID,
            booking_number: "BT-2026-0001",
            customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" },
          },
          error: null,
        })
      }

      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
          insert: invoiceInsert,
        }
      }

      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: quoteStatusEq })),
          })),
        }
      }

      if (table === "documents") return { insert: documentInsert }

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

  return { quoteStatusEq, invoiceInsert, documentInsert }
}

describe("POST /api/invoices/deposit", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("uses only accepted quotes for deposit invoice generation", async () => {
    const { quoteStatusEq } = buildAuth()

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(200)
    expect(quoteStatusEq).toHaveBeenCalledWith("status", "accepted")
  })

  it("creates a draft deposit invoice and invoice document", async () => {
    const { invoiceInsert, documentInsert } = buildAuth()

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoice).toMatchObject({ kind: "deposit", status: "draft", amount: 250 })
    expect(invoiceInsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "deposit", status: "draft", deposit_percentage: 25, amount: 250 }),
    )
    expect(documentInsert).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: BOOKING_ID, kind: "invoice_pdf" }),
    )
  })

  it("returns 422 when no accepted priced quote exists", async () => {
    buildAuth({ quoteData: null })

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({
      error: "A priced quote is required before generating a deposit invoice",
    })
  })
})

describe("PATCH /api/invoices/deposit", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("marks a deposit invoice as sent", async () => {
    const auditInsert = vi.fn(async () => ({ error: null }))
    const invoiceUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "invoice-1", status: "sent", sent_at: "2026-05-13T00:00:00.000Z" },
              error: null,
            })),
          })),
        })),
      })),
    }))

    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: {
          from: vi.fn((table: string) => {
            if (table === "invoices") {
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      single: vi.fn(async () => ({
                        data: {
                          id: "invoice-1",
                          booking_id: BOOKING_ID,
                          status: "draft",
                          invoice_number: "BT-2026-0001-DEP1",
                        },
                        error: null,
                      })),
                    })),
                  })),
                })),
                update: invoiceUpdate,
              }
            }
            if (table === "audit_logs") return { insert: auditInsert }
            throw new Error(`Unexpected table ${table}`)
          }),
        },
        user: { id: USER_ID, email: "user@example.test" },
        profile: { clearanceLevel: "consultant", actorName: "Jane" },
      },
    })

    const res = await PATCH(postJson({ invoiceId: "00000000-0000-4000-8000-00000000bbbb", status: "sent" }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ id: "invoice-1", status: "sent" })
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", sent_at: expect.any(String) }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deposit_invoice_sent", entity_id: BOOKING_ID }),
    )
  })
})
