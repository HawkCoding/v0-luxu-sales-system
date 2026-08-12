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

vi.mock("@/lib/reports/booking-query", () => ({
  loadReportInputRows: vi.fn(() =>
    Promise.resolve({ rows: { bookings: [], payments: [] }, error: null }),
  ),
}))

function makeParams(report: string) {
  return { params: Promise.resolve({ report }) }
}

function makeRequest(report: string) {
  return new Request(`http://localhost/api/reports/${report}`)
}

function profileChain(clearanceLevel: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: clearanceLevel ? { clearance_level: clearanceLevel } : null, error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/reports/[report]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") })

    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    expect(res.status).toBe(401)
  })

  // Revenue, pipeline value and outstanding balance are manager-level figures:
  // "view:reporting" excludes consultant and readonly.
  it.each(["consultant", "readonly"])("returns 403 for %s role", async (role) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    mockFrom.mockReturnValue(profileChain(role))

    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    expect(res.status).toBe(403)
  })

  it("returns 403 when the profile is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    mockFrom.mockReturnValue(profileChain(null))

    const res = await GET(makeRequest("outstanding-payments"), makeParams("outstanding-payments"))
    expect(res.status).toBe(403)
  })

  it.each(["admin", "manager"])("returns report data for %s role", async (role) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    mockFrom.mockReturnValue(profileChain(role))

    const res = await GET(makeRequest("sales-per-salesperson"), makeParams("sales-per-salesperson"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [] })
  })

  it("returns 404 for an unknown report after passing the role gate", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    mockFrom.mockReturnValue(profileChain("admin"))

    const res = await GET(makeRequest("not-a-report"), makeParams("not-a-report"))
    expect(res.status).toBe(404)
  })
})
