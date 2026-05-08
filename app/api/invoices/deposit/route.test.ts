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

import { POST } from "./route"

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

function buildAuth() {
  const quoteStatusEq = vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { id: "quote-1", total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" },
          error: null,
        })),
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

  return { quoteStatusEq }
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
})
