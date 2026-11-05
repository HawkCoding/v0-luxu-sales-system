import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))
const fingerprintMocks = vi.hoisted(() => ({ computeContentFingerprint: vi.fn() }))
vi.mock("@/lib/documents/content-fingerprint", () => ({
  computeContentFingerprint: fingerprintMocks.computeContentFingerprint,
}))
const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const VERSION_ID = "00000000-0000-4000-8000-00000000bbbb"

function call(body: unknown, id = BOOKING_ID) {
  return POST(
    new Request(`http://localhost/api/jobs/${id}/document-versions/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

function mockAuth(version: Record<string, unknown> | null, insertError: { message: string } | null = null) {
  const insert = vi.fn(async () => ({ error: insertError }))
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "document_versions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: version, error: null })) })),
          })),
        }
      }
      if (table === "document_version_acknowledgements") return { insert }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: { supabase, user: { id: "u1" }, profile: { actorName: "Jane Doe" } },
  })
  return { insert }
}

const versionRow = { id: VERSION_ID, booking_id: BOOKING_ID, doc_type: "invoice", quote_id: null, invoice_id: "inv-1" }

describe("POST /api/jobs/[id]/document-versions/acknowledge", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
    fingerprintMocks.computeContentFingerprint.mockReset()
    fingerprintMocks.computeContentFingerprint.mockResolvedValue("fp-now")
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    expect((await call({ versionId: VERSION_ID })).status).toBe(401)
  })

  it("rejects a body without a valid version id", async () => {
    mockAuth(versionRow)
    expect((await call({ versionId: "nope" })).status).toBe(400)
  })

  it("returns 404 for a copy that belongs to another booking", async () => {
    mockAuth({ ...versionRow, booking_id: "00000000-0000-4000-8000-00000000cccc" })
    expect((await call({ versionId: VERSION_ID })).status).toBe(404)
  })

  it("records the booking as it is now against the copy, and audits it", async () => {
    const { insert } = mockAuth(versionRow)

    const res = await call({ versionId: VERSION_ID })

    expect(res.status).toBe(200)
    expect(fingerprintMocks.computeContentFingerprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingId: BOOKING_ID, docType: "invoice", invoiceId: "inv-1" }),
    )
    expect(insert).toHaveBeenCalledWith({
      document_version_id: VERSION_ID,
      booking_id: BOOKING_ID,
      fingerprint: "fp-now",
      acknowledged_by: "u1",
    })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "document_change_acknowledged", entityId: BOOKING_ID }),
    )
  })

  it("fails without recording anything when the booking cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    fingerprintMocks.computeContentFingerprint.mockRejectedValue(new Error("travellers: boom"))
    const { insert } = mockAuth(versionRow)

    const res = await call({ versionId: VERSION_ID })

    expect(res.status).toBe(500)
    expect(insert).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
