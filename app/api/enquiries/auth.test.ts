import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

// The role gate runs before the body is parsed and before the service client is
// touched, so an invalid body is enough to prove a caller passed the gate (400)
// without exercising the whole intake pipeline.

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockIsAuthorizedWebhookRequest = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
  createServiceClient: vi.fn(() => {
    throw new Error("service client must not be reached before the role gate passes")
  }),
}))

vi.mock("@/lib/api/webhook-secret", () => ({
  isAuthorizedWebhookRequest: (...args: unknown[]) => mockIsAuthorizedWebhookRequest(...args),
}))

function profileChain(clearanceLevel: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: clearanceLevel ? { clearance_level: clearanceLevel } : null, error: null }),
  }
}

// Missing every required field, so a caller past the gate stops at Zod.
function makeRequest(body: unknown = {}) {
  return new Request("http://localhost/api/enquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthorizedWebhookRequest.mockReturnValue(false)
})

describe("POST /api/enquiries role gate", () => {
  it("returns 401 with neither a session nor the webhook secret", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns 403 for a readonly session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockFrom.mockReturnValue(profileChain("readonly"))

    const res = await POST(makeRequest({ email: "qa@example.com", name: "QA", surname: "Tester" }))
    expect(res.status).toBe(403)
  })

  it("returns 403 when the session has no profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockFrom.mockReturnValue(profileChain(null))

    const res = await POST(makeRequest({ email: "qa@example.com" }))
    expect(res.status).toBe(403)
  })

  it.each(["admin", "manager", "consultant"])("lets a %s session past the gate", async (role) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockFrom.mockReturnValue(profileChain(role))

    const res = await POST(makeRequest({ email: 42 }))
    expect(res.status).toBe(400)
  })

  it("lets the webhook caller past the gate without a session or a profile lookup", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIsAuthorizedWebhookRequest.mockReturnValue(true)

    const res = await POST(makeRequest({ email: 42 }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
