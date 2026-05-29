import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
  createServiceClient: vi.fn(),
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const LOG_ID = "aaaaaaaa-0000-4000-8000-000000000001"

const RESOLVED_LOG = {
  id: LOG_ID,
  severity: "Critical",
  source: "quote-pdf",
  message: "Quote PDF could not be rendered",
  resolved: true,
  resolved_by: USER_ID,
  resolved_at: "2026-05-27T10:00:00Z",
  created_at: "2026-05-27T09:00:00Z",
}

function createSupabase({
  user = { id: USER_ID } as { id: string } | null,
  role = "manager",
  existingLog = { id: LOG_ID, resolved: false } as { id: string; resolved: boolean } | null,
  updateError = null as { message: string } | null,
} = {}) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: user ? { clearance_level: role, name: "A", surname: "B", email: "a@b.com" } : null,
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "error_logs") {
        const selectChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: existingLog, error: null })),
        }

        const updateChain = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({
            data: updateError ? null : RESOLVED_LOG,
            error: updateError,
          })),
        }

        return {
          select: vi.fn(() => selectChain),
          update: vi.fn(() => updateChain),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function makePostRequest(id: string) {
  return {
    req: new Request(`http://localhost/api/error-logs/${id}/resolve`, { method: "POST" }),
    params: Promise.resolve({ id }),
  }
}

describe("POST /api/error-logs/[id]/resolve", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ user: null }))
    const { req, params } = makePostRequest(LOG_ID)
    const res = await POST(req, { params })
    expect(res.status).toBe(401)
  })

  it("returns 403 for consultant role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "consultant" }))
    const { req, params } = makePostRequest(LOG_ID)
    const res = await POST(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 403 for readonly role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "readonly" }))
    const { req, params } = makePostRequest(LOG_ID)
    const res = await POST(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 404 when log does not exist", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ existingLog: null }))
    const { req, params } = makePostRequest(LOG_ID)
    const res = await POST(req, { params })
    expect(res.status).toBe(404)
  })

  it("resolves the error log and returns 200 for manager", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "manager" }))
    const { req, params } = makePostRequest(LOG_ID)
    const res = await POST(req, { params })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.errorLog).toMatchObject({ resolved: true, resolved_by: USER_ID })
  })

  it("resolves the error log and returns 200 for admin", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "admin" }))
    const { req, params } = makePostRequest(LOG_ID)
    const res = await POST(req, { params })
    expect(res.status).toBe(200)
  })
})
