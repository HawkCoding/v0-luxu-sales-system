import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const syncMocks = vi.hoisted(() => ({
  syncAllEnabledInboundEmailAccounts: vi.fn(),
}))
vi.mock("@/lib/inbound-email/sync", () => ({
  syncAllEnabledInboundEmailAccounts: syncMocks.syncAllEnabledInboundEmailAccounts,
}))

import { GET } from "./route"

// ── Helpers ────────────────────────────────────────────────────────────────

const CRON_SECRET = "test-cron-secret"

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {}
  if (secret !== undefined) headers["authorization"] = `Bearer ${secret}`
  return new Request("http://localhost/api/cron/email-sync", { headers })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/cron/email-sync", () => {
  beforeEach(() => {
    syncMocks.syncAllEnabledInboundEmailAccounts.mockReset()
    vi.stubEnv("CRON_SECRET", CRON_SECRET)
  })

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(syncMocks.syncAllEnabledInboundEmailAccounts).not.toHaveBeenCalled()
  })

  it("returns 401 when authorization header has wrong secret", async () => {
    const res = await GET(makeRequest("wrong-secret"))
    expect(res.status).toBe(401)
    expect(syncMocks.syncAllEnabledInboundEmailAccounts).not.toHaveBeenCalled()
  })

  it("returns 401 when CRON_SECRET is unset, even with a plausible header", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(401)
    expect(syncMocks.syncAllEnabledInboundEmailAccounts).not.toHaveBeenCalled()
  })

  it("returns 200 with the sync summary on success", async () => {
    const summary = {
      scannedCount: 5,
      importedCount: 3,
      needsReviewCount: 1,
      duplicateCount: 1,
      skippedNotEnquiryCount: 0,
      errors: [] as string[],
    }
    syncMocks.syncAllEnabledInboundEmailAccounts.mockResolvedValue(summary)

    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; summary: typeof summary }
    expect(body.ok).toBe(true)
    expect(body.summary).toEqual(summary)
  })

  it("returns 500 when the sync throws", async () => {
    syncMocks.syncAllEnabledInboundEmailAccounts.mockRejectedValue(new Error("IMAP connection failed"))

    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("IMAP connection failed")
  })
})
