import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const ROUTE_ID = "00000000-0000-4000-8000-000000000111"

interface MockOptions {
  user?: { id: string } | null
  role?: string | null
  existingCustomers?: Array<{ id: string; email: string }>
  historicalBookings?: Array<{ customer_id: string; extracted_json: unknown }>
}

function mockSupabase({
  user = { id: USER_ID },
  role = "manager",
  existingCustomers = [],
  historicalBookings = [],
}: MockOptions = {}) {
  const customerIn = vi.fn(async (_column: string, emails: string[]) => ({
    data: existingCustomers.filter((customer) => emails.includes(customer.email)),
    error: null,
  }))
  const bookingEqStage = vi.fn(async () => ({ data: historicalBookings, error: null }))
  const bookingEqRoute = vi.fn(() => ({ eq: bookingEqStage }))
  const bookingIn = vi.fn(() => ({ eq: bookingEqRoute }))

  supabaseMocks.createSessionClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : { message: "Unauthorized" },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: role ? { clearance_level: role } : null,
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({ in: customerIn })),
        }
      }

      if (table === "bookings") {
        return {
          select: vi.fn(() => ({ in: bookingIn })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  })

  return { customerIn, bookingIn }
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/customers/import/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/customers/import/check", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    mockSupabase({ user: null })

    const res = await POST(postJson({ emails: ["ada@example.test"] }))

    expect(res.status).toBe(401)
  })

  it("returns 403 for non-manager roles", async () => {
    mockSupabase({ role: "consultant" })

    const res = await POST(postJson({ emails: ["ada@example.test"] }))

    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid payloads", async () => {
    mockSupabase()

    const res = await POST(postJson({ emails: [] }))

    expect(res.status).toBe(400)
  })

  it("detects duplicate customer emails", async () => {
    mockSupabase({
      existingCustomers: [{ id: "customer-1", email: "ada@example.test" }],
    })

    const res = await POST(
      postJson({ emails: ["ADA@example.test", "new@example.test"] }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      existing: [{ email: "ada@example.test", hasRouteBooking: false }],
    })
  })

  it("marks route historical bookings as duplicates", async () => {
    const { bookingIn } = mockSupabase({
      existingCustomers: [{ id: "customer-1", email: "ada@example.test" }],
      historicalBookings: [
        {
          customer_id: "customer-1",
          extracted_json: { historical_import: { imported_via: "supplier_csv" } },
        },
      ],
    })

    const res = await POST(
      postJson({ emails: ["ada@example.test"], routeId: ROUTE_ID }),
    )

    expect(res.status).toBe(200)
    expect(bookingIn).toHaveBeenCalledWith("customer_id", ["customer-1"])
    await expect(res.json()).resolves.toEqual({
      existing: [{ email: "ada@example.test", hasRouteBooking: true }],
    })
  })
})
