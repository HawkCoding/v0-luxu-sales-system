import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const accessMocks = vi.hoisted(() => ({
  requireSettingsWrite: vi.fn(),
}))
vi.mock("@/lib/settings-access", () => ({
  requireSettingsWrite: accessMocks.requireSettingsWrite,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => {}),
}))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

const errorLogMocks = vi.hoisted(() => ({
  logError: vi.fn(async () => {}),
}))
vi.mock("@/lib/error-log", () => ({ logError: errorLogMocks.logError }))

const serviceMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: serviceMocks.createServiceClient,
  createSessionClient: vi.fn(),
}))

// Backups are feature-flagged off in production; force-enable so the route logic stays covered.
vi.mock("@/lib/feature-flags", () => ({ BACKUPS_ENABLED: true }))

import { POST } from "./route"

// ── Helpers ────────────────────────────────────────────────────────────────

const ADMIN_ID = "aaaa0000-0000-4000-8000-000000000001"
const BACKUP_ID = "bbbb0000-0000-4000-8000-000000000002"
const BACKUP_RECORD = {
  id: BACKUP_ID,
  storage_path: "2026/01/01/backup-123.json",
  created_at: "2026-01-01T04:00:00.000Z",
  size_bytes: 1024,
}
const SNAPSHOT = { _meta: [{ created_at: "2026-01-01T04:00:00.000Z", version: 1 }], customers: [] }

function makeSessionClient(overrides: { record?: object | null; fetchError?: object | null } = {}) {
  const record = "record" in overrides ? overrides.record : BACKUP_RECORD
  const fetchError = overrides.fetchError ?? null
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: record, error: fetchError })),
        })),
      })),
    })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: ADMIN_ID } }, error: null })) },
  }
}

function makeServiceClient(overrides: {
  downloadError?: object | null
  blobText?: string
  rpcError?: object | null
} = {}) {
  const downloadError = overrides.downloadError ?? null
  const blobText = overrides.blobText ?? JSON.stringify(SNAPSHOT)
  const rpcError = overrides.rpcError ?? null

  return {
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: downloadError ? null : { text: async () => blobText },
          error: downloadError,
        })),
      })),
    },
    rpc: vi.fn(async () => ({ error: rpcError })),
  }
}

function setAdminAuth(sessionClient: ReturnType<typeof makeSessionClient>) {
  accessMocks.requireSettingsWrite.mockResolvedValue({
    ok: true,
    value: {
      supabase: sessionClient,
      userId: ADMIN_ID,
      actorName: "Admin User",
      role: "admin",
    },
  })
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/backups/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/backups/restore", () => {
  beforeEach(() => {
    accessMocks.requireSettingsWrite.mockReset()
    auditMocks.writeAuditLog.mockReset()
    errorLogMocks.logError.mockReset()
    serviceMocks.createServiceClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    accessMocks.requireSettingsWrite.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    })
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: BACKUP_ID }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when Manager (not Admin) calls restore", async () => {
    accessMocks.requireSettingsWrite.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    })
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: BACKUP_ID }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when confirm is missing", async () => {
    setAdminAuth(makeSessionClient())
    serviceMocks.createServiceClient.mockReturnValue(makeServiceClient())
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirmBackupId: BACKUP_ID }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when confirmBackupId does not match backupId", async () => {
    setAdminAuth(makeSessionClient())
    serviceMocks.createServiceClient.mockReturnValue(makeServiceClient())
    const differentId = "cccc0000-0000-4000-8000-000000000003"
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: differentId }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/confirmation/i)
  })

  it("returns 404 when backup record not found", async () => {
    setAdminAuth(makeSessionClient({ record: null, fetchError: { message: "Not found" } }))
    serviceMocks.createServiceClient.mockReturnValue(makeServiceClient())
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: BACKUP_ID }))
    expect(res.status).toBe(404)
  })

  it("returns 500 and logs Critical when storage download fails", async () => {
    setAdminAuth(makeSessionClient())
    serviceMocks.createServiceClient.mockReturnValue(
      makeServiceClient({ downloadError: { message: "storage error" } }),
    )
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: BACKUP_ID }))
    expect(res.status).toBe(500)
    expect(errorLogMocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "Critical", source: "backup-restore" }),
    )
  })

  it("returns 500 and logs Critical when RPC restore fails", async () => {
    setAdminAuth(makeSessionClient())
    serviceMocks.createServiceClient.mockReturnValue(
      makeServiceClient({ rpcError: { message: "RPC error" } }),
    )
    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: BACKUP_ID }))
    expect(res.status).toBe(500)
    expect(errorLogMocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "Critical", source: "backup-restore" }),
    )
  })

  it("returns 200, writes audit log, and emits backup_restored on success", async () => {
    const sessionClient = makeSessionClient()
    setAdminAuth(sessionClient)
    serviceMocks.createServiceClient.mockReturnValue(makeServiceClient())

    const res = await POST(makeRequest({ backupId: BACKUP_ID, confirm: true, confirmBackupId: BACKUP_ID }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; backupCreatedAt: string }
    expect(body.ok).toBe(true)
    expect(body.backupCreatedAt).toBe(BACKUP_RECORD.created_at)

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      sessionClient,
      expect.objectContaining({
        action: "backup_restored",
        entityType: "Backup",
        entityId: BACKUP_ID,
      }),
    )
    expect(errorLogMocks.logError).not.toHaveBeenCalled()
  })
})
