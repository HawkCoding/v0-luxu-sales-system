import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const backupMocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
}))
vi.mock("@/lib/backup/create-backup", () => ({ createBackup: backupMocks.createBackup }))

const errorLogMocks = vi.hoisted(() => ({
  logError: vi.fn(async () => {}),
}))
vi.mock("@/lib/error-log", () => ({ logError: errorLogMocks.logError }))

// Backups are feature-flagged off in production; force-enable so the route logic stays covered.
vi.mock("@/lib/feature-flags", () => ({ BACKUPS_ENABLED: true }))

import { GET } from "./route"

// ── Helpers ────────────────────────────────────────────────────────────────

const CRON_SECRET = "test-cron-secret"

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {}
  if (secret !== undefined) headers["authorization"] = `Bearer ${secret}`
  return new Request("http://localhost/api/cron/backup", { headers })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/cron/backup", () => {
  beforeEach(() => {
    backupMocks.createBackup.mockReset()
    errorLogMocks.logError.mockReset()
    vi.stubEnv("CRON_SECRET", CRON_SECRET)
  })

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns 401 when authorization header has wrong secret", async () => {
    const res = await GET(makeRequest("wrong-secret"))
    expect(res.status).toBe(401)
  })

  it("returns 200 and calls createBackup on success", async () => {
    backupMocks.createBackup.mockResolvedValue({ path: "2026/01/01/backup-123.json", sizeBytes: 1024 })
    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; result: { path: string; sizeBytes: number } }
    expect(body.ok).toBe(true)
    expect(body.result.path).toBe("2026/01/01/backup-123.json")
    expect(backupMocks.createBackup).toHaveBeenCalledOnce()
  })

  it("returns 500 and logs Critical error when createBackup throws", async () => {
    backupMocks.createBackup.mockRejectedValue(new Error("Storage unavailable"))
    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(500)
    expect(errorLogMocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "Critical", source: "backup" }),
    )
  })
})
