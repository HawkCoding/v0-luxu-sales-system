import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "./route"

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}))

function makeParams(report: string) {
  return { params: Promise.resolve({ report }) }
}

function makeRequest(report: string) {
  return new Request(`http://localhost/api/reports/${report}/export`)
}

function mockChain(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/reports/[report]/export", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") })
    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const profileChain = mockChain({ clearance_level: "readonly" })
    const bookingsChain = mockChain([])
    const paymentsChain = mockChain([])
    paymentsChain.single = vi.fn().mockResolvedValue({ data: [], error: null })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return profileChain
      if (callCount === 2) return bookingsChain
      return paymentsChain
    })

    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    expect(res.status).toBe(403)
  })

  it("returns CSV for consultant role (reporting is open to every active role)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })

    const profileChain = mockChain({ clearance_level: "consultant" })

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain
      if (table === "bookings") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it("returns CSV for manager role without checking setting", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })

    const profileChain = mockChain({ clearance_level: "manager" })
    const bookingsChain = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn(),
    }

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      callCount++
      if (table === "profiles") return profileChain
      if (table === "bookings") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    // Manager should get through the auth gate
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it("returns CSV for admin role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return mockChain({ clearance_level: "admin" })
      if (table === "bookings") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const res = await GET(makeRequest("enquiries-by-source"), makeParams("enquiries-by-source"))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it("returns 404 for unknown report name", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    mockFrom.mockReturnValue(mockChain({ clearance_level: "admin" }))

    const res = await GET(makeRequest("unknown-report"), makeParams("unknown-report"))
    expect(res.status).toBe(404)
  })
})
