import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: mocks.createSessionClient,
}))
vi.mock("@/lib/error-log", () => ({
  logError: mocks.logError,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function mockUser(user: { id: string } | null) {
  mocks.createSessionClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  })
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/client-perf", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

const validReport = { path: "/api/jobs", method: "GET", status: 200, durationMs: 4200, inFlight: 3 }

describe("POST /api/client-perf", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockUser(null)
    const res = await post(validReport)
    expect(res.status).toBe(401)
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid body", async () => {
    mockUser({ id: USER_ID })
    const res = await post({ path: "/api/jobs" })
    expect(res.status).toBe(400)
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it("returns 400 for malformed JSON", async () => {
    mockUser({ id: USER_ID })
    const res = await post("not json")
    expect(res.status).toBe(400)
  })

  it("stores a resolved Info row for a valid report", async () => {
    mockUser({ id: USER_ID })
    const res = await post(validReport)
    expect(res.status).toBe(200)
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "Info",
        source: "perf:slow-request",
        resolved: true,
        details: expect.objectContaining({ userId: USER_ID, durationMs: 4200, path: "/api/jobs" }),
      }),
    )
  })
})
