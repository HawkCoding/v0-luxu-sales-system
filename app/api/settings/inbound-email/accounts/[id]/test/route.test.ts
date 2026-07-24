import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const settingsMocks = vi.hoisted(() => ({
  requireAdminSettingsAccess: vi.fn(),
}))
const syncMocks = vi.hoisted(() => ({
  testInboundEmailConnection: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  requireAdminSettingsAccess: settingsMocks.requireAdminSettingsAccess,
}))

vi.mock("@/lib/inbound-email/sync", () => ({
  testInboundEmailConnection: syncMocks.testInboundEmailConnection,
}))

import { POST } from "./route"

const ACCOUNT_ID = "00000000-0000-4000-8000-00000000aaaa"

const ACCOUNT_ROW = {
  id: ACCOUNT_ID,
  email: "bookings@luxus.test",
  host: "imap.luxus.test",
  port: 993,
  tls_mode: "ssl_tls",
  username: "bookings@luxus.test",
  password_encrypted: "enc:abc",
  enabled: true,
  inbox_folder: "INBOX",
  processed_folder: "Processed",
  needs_review_folder: "Needs Review",
  first_sync_completed: true,
  last_seen_uid: 10,
  last_uidvalidity: 1,
  last_synced_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
}

function buildSupabase({ account = ACCOUNT_ROW as unknown, error = null as unknown } = {}) {
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: account, error })),
        })),
      })),
    })),
  }
  return supabase
}

function request() {
  return new Request(`http://localhost/api/settings/inbound-email/accounts/${ACCOUNT_ID}/test`, {
    method: "POST",
  })
}

function context() {
  return { params: Promise.resolve({ id: ACCOUNT_ID }) }
}

describe("POST /api/settings/inbound-email/accounts/[id]/test", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 when the caller is not an admin", async () => {
    settingsMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(request(), context())
    expect(res.status).toBe(403)
    expect(syncMocks.testInboundEmailConnection).not.toHaveBeenCalled()
  })

  it("returns 404 when the account does not exist", async () => {
    settingsMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: true,
      value: { supabase: buildSupabase({ account: null, error: { message: "not found" } }) },
    })
    const res = await POST(request(), context())
    expect(res.status).toBe(404)
    expect(syncMocks.testInboundEmailConnection).not.toHaveBeenCalled()
  })

  it("returns 200 with mailbox count when the connection succeeds", async () => {
    settingsMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: true,
      value: { supabase: buildSupabase() },
    })
    syncMocks.testInboundEmailConnection.mockResolvedValue({ ok: true, mailboxCount: 4 })

    const res = await POST(request(), context())

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; mailboxCount?: number }
    expect(body).toEqual({ ok: true, mailboxCount: 4 })
    expect(syncMocks.testInboundEmailConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: ACCOUNT_ID, host: "imap.luxus.test" }),
    )
  })

  it("returns 400 with the connection error when it fails", async () => {
    settingsMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: true,
      value: { supabase: buildSupabase() },
    })
    syncMocks.testInboundEmailConnection.mockResolvedValue({
      ok: false,
      error: "Authentication failed",
    })

    const res = await POST(request(), context())

    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body).toEqual({ ok: false, error: "Authentication failed" })
  })
})
