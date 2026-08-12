import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireUser: vi.fn() }))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
  requireRole: vi.fn(),
}))

vi.mock("@/lib/role-utils", () => ({ extractRoleFromJwt: vi.fn(() => null) }))

vi.mock("@/lib/pipeline/constants", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDefaultDepositPercentage: vi.fn(async () => 25),
}))

import { GET } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

// Owned by someone else, so the removed consultant owner-check would have 403'd.
const BOOKING = {
  id: BOOKING_ID,
  booking_number: "LTT-2025-0003",
  customer_id: "00000000-0000-4000-8000-000000000099",
  stage: "quote_sent",
  purpose: null,
  source: "enquiry_form",
  consultant: "Carmen",
  owner_user_id: OTHER_USER_ID,
  assigned_salesperson_id: OTHER_USER_ID,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deposit_paid: false,
  invoice_balance: 0,
  no_of_adults: 2,
  no_of_children: 0,
  no_of_suites: 1,
}

/** Resolves every terminal call, so the GET fan-out completes on empty tables. */
function permissiveChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null })
      }
      if (prop === "single" || prop === "maybeSingle") {
        return vi.fn(async () => ({ data: null, error: null }))
      }
      return vi.fn(() => proxy)
    },
  }
  const proxy = new Proxy(chain, handler)
  return proxy
}

function bookingChain() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: BOOKING, error: null })) })),
    })),
  }
}

function authFor(role: string) {
  return {
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => (table === "bookings" ? bookingChain() : permissiveChain())),
      },
      user: { id: USER_ID, email: "x@example.com" },
      profile: {
        clearanceLevel: role,
        isActive: true,
        name: "X",
        surname: "Y",
        email: "x@example.com",
        actorName: "X Y",
      },
    },
  }
}

beforeEach(() => {
  authMocks.requireUser.mockReset()
})

// "view:jobs" is granted to all four roles, so reading a booking is scoped by
// neither role nor ownership; every write path keeps its own gate.
describe("GET /api/jobs/[id] access", () => {
  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await GET(new Request(`http://localhost/api/jobs/${BOOKING_ID}`), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    expect(res.status).toBe(401)
  })

  it.each(["admin", "manager", "consultant", "readonly"])(
    "returns the booking for %s, including bookings they do not own",
    async (role) => {
      authMocks.requireUser.mockResolvedValue(authFor(role))

      const res = await GET(new Request(`http://localhost/api/jobs/${BOOKING_ID}`), {
        params: Promise.resolve({ id: BOOKING_ID }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.job).toMatchObject({ id: BOOKING_ID, jobNumber: "LTT-2025-0003" })
    },
  )
})
