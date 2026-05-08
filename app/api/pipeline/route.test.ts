import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
  requireRole: vi.fn(),
}))

vi.mock("@/lib/pipeline/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pipeline/constants")>("@/lib/pipeline/constants")
  return {
    ...actual,
    getDefaultDepositPercentage: vi.fn(async () => 25),
  }
})

import { GET } from "./route"

function buildSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: [
                {
                  id: "b1",
                  booking_number: "BT-2026-0001",
                  customer_id: "c1",
                  stage: "quote_sent",
                  consultant: "LB",
                  purpose: "quote",
                  source: "email",
                  departure_date: "2026-08-01",
                  duration_nights: 3,
                  created_at: "2026-05-01T00:00:00.000Z",
                  updated_at: "2026-05-02T00:00:00.000Z",
                  route: { name: "Pretoria → Cape Town" },
                },
              ],
              error: null,
            })),
          })),
        }
      }
      if (table === "customers") {
        return {
          select: vi.fn(async () => ({
            data: [{ id: "c1", first_name: "Jane", last_name: "Smith" }],
            error: null,
          })),
        }
      }
      if (table === "payments") {
        return { select: vi.fn(async () => ({ data: [], error: null })) }
      }
      if (table === "quotes") {
        return { select: vi.fn(async () => ({ data: [{ booking_id: "b1", total: 1000 }], error: null })) }
      }
      if (table === "correspondences") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe("GET /api/pipeline", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns enriched bookings when authenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: true,
      value: {
        supabase: buildSupabase(),
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "Doe", email: "u@example.com" },
      },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<Record<string, unknown>>
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: "b1", bookingNumber: "BT-2026-0001", customerName: "Jane Smith" })
  })
})
