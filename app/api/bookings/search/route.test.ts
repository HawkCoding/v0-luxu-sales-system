import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireAnyRole: authMocks.requireAnyRole,
}))

import { GET } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"

function buildAuth({
  bookings = [
    {
      id: BOOKING_ID,
      booking_number: "LTT-2026-0001",
      departure_date: "2026-07-18",
      customer: { title: "Mr", first_name: "John", last_name: "Smith" },
    },
  ],
  customers = [] as { id: string }[],
}: { bookings?: unknown[]; customers?: { id: string }[] } = {}) {
  const bookingsOr = vi.fn(async () => ({ data: bookings, error: null }))
  const customersOr = vi.fn(async () => ({ data: customers, error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({ limit: vi.fn(() => ({ then: (resolve: (v: unknown) => void) => resolve({ data: customers, error: null }) })) })),
          })),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                or: bookingsOr,
                then: (resolve: (v: unknown) => void) => resolve({ data: bookings, error: null }),
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    supabase,
    bookingsOr,
    customersOr,
    context: {
      ok: true as const,
      value: {
        supabase,
        user: { id: "u1", email: "x@example.com" },
        profile: { clearanceLevel: "manager", actorName: "Admin User", name: "Admin", surname: "User", email: "x@example.com" },
      },
    },
  }
}

function buildRequest(query = "") {
  return new Request(`http://localhost/api/bookings/search${query ? `?q=${encodeURIComponent(query)}` : ""}`)
}

describe("GET /api/bookings/search", () => {
  beforeEach(() => {
    authMocks.requireAnyRole.mockReset()
  })

  it("returns 401/403 when the role gate rejects", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(buildRequest())
    expect(res.status).toBe(401)
  })

  it("returns recent bookings when no query is given", async () => {
    const built = buildAuth()
    authMocks.requireAnyRole.mockResolvedValue(built.context)
    const res = await GET(buildRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bookings).toEqual([
      { id: BOOKING_ID, bookingNumber: "LTT-2026-0001", customerName: "Mr Smith", departureDate: "18-07-2026" },
    ])
  })

  it("returns 400 for an overlong query", async () => {
    authMocks.requireAnyRole.mockResolvedValue(buildAuth().context)
    const res = await GET(buildRequest("x".repeat(200)))
    expect(res.status).toBe(400)
  })
})
