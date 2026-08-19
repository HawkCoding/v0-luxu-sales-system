import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
  createServiceClient: supabaseMocks.createServiceClient,
}))

import { logError } from "@/lib/error-log"
import { GET } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

const SAMPLE_LOG = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  severity: "Critical",
  source: "quote-pdf",
  message: "Quote PDF could not be rendered",
  details: { quoteId: "q1" },
  resolved: false,
  resolved_by: null,
  resolved_at: null,
  created_at: "2026-05-27T10:00:00Z",
}

// ── logError helper ────────────────────────────────────────────────────────────

function makeServiceClient(insertError: unknown = null) {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: insertError })),
    })),
  }
}

describe("logError()", () => {
  beforeEach(() => {
    supabaseMocks.createServiceClient.mockReset()
  })

  it("inserts a row with the correct fields", async () => {
    const serviceClient = makeServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(serviceClient)

    await logError({ severity: "Critical", source: "test", message: "Something broke", details: { x: 1 } })

    expect(serviceClient.from).toHaveBeenCalledWith("error_logs")
    const insertCall = serviceClient.from.mock.results[0].value.insert
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "Critical", source: "test", message: "Something broke", details: { x: 1 } }),
    )
  })

  it("does not throw when the insert fails", async () => {
    supabaseMocks.createServiceClient.mockReturnValue(makeServiceClient({ message: "db error" }))
    await expect(logError({ severity: "Warning", source: "test", message: "fail" })).resolves.toBeUndefined()
  })

  it("does not throw when createServiceClient throws", async () => {
    supabaseMocks.createServiceClient.mockImplementation(() => { throw new Error("no client") })
    await expect(logError({ severity: "Info", source: "test", message: "fail" })).resolves.toBeUndefined()
  })
})

// ── GET /api/error-logs ────────────────────────────────────────────────────────

function createSessionSupabase({
  user = { id: USER_ID } as { id: string } | null,
  role = "manager",
  logs = [SAMPLE_LOG],
  count = 1,
  countError = null as { message: string } | null,
  listError = null as { message: string } | null,
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
        const headQuery = {
          eq: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: (v: unknown) => unknown) => resolve({ count, error: countError })),
        }

        const listQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn(async () => ({ data: logs, error: listError })),
        }

        return {
          select: vi.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) return headQuery
            return listQuery
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/error-logs")
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe("GET /api/error-logs", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSessionSupabase({ user: null }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it("allows consultant role to view error logs", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSessionSupabase({ role: "consultant" }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
  })

  it("returns 403 for readonly role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSessionSupabase({ role: "readonly" }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it("returns the list of error logs for manager", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSessionSupabase({ role: "manager" }))
    const res = await GET(makeGetRequest({ resolved: "false" }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toHaveProperty("errorLogs")
    expect(Array.isArray(body.errorLogs)).toBe(true)
  })

  it("returns count when count=true is passed", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSessionSupabase({ count: 3 }))
    const res = await GET(makeGetRequest({ resolved: "false", count: "true" }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ count: 3 })
  })

  it("returns 400 for invalid severity param", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSessionSupabase())
    const res = await GET(makeGetRequest({ severity: "FATAL" }))
    expect(res.status).toBe(400)
  })
})
