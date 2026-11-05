import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireUser: authMocks.requireUser }))
const fingerprintMocks = vi.hoisted(() => ({ computeContentFingerprint: vi.fn() }))
vi.mock("@/lib/documents/content-fingerprint", () => ({
  computeContentFingerprint: fingerprintMocks.computeContentFingerprint,
}))

import { GET } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function call(id = BOOKING_ID) {
  return GET(new Request(`http://localhost/api/jobs/${id}/document-versions`), {
    params: Promise.resolve({ id }),
  })
}

interface Options {
  versionRows?: unknown[] | null
  versionError?: { message: string } | null
  sendRows?: unknown[]
  sendError?: { message: string } | null
}

function mockAuth(options: Options = {}) {
  const sendsIn = vi.fn()
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "document_versions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: options.versionRows ?? [], error: options.versionError ?? null })),
            })),
          })),
        }
      }
      if (table === "correspondences") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((...args: unknown[]) => {
              sendsIn(...args)
              return {
                eq: vi.fn(() => ({
                  order: vi.fn(async () => ({ data: options.sendRows ?? [], error: options.sendError ?? null })),
                })),
              }
            }),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
  authMocks.requireUser.mockResolvedValue({ ok: true, value: { supabase, user: { id: "u1" } } })
  return { supabase, sendsIn }
}

const quoteRow = {
  id: "ver-q1",
  doc_type: "quote",
  version_no: 1,
  file_name: "Quote-26-0039.pdf",
  size_bytes: 90_000,
  issued_at: "2026-11-01T10:00:00.000Z",
  issue_kind: "sent",
  quote: { quote_number: "LTT-26-0039-Q1" },
}

describe("GET /api/jobs/[id]/document-versions", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    fingerprintMocks.computeContentFingerprint.mockReset()
    fingerprintMocks.computeContentFingerprint.mockResolvedValue("fp-1")
  })

  it("flags only the latest copy of a document when the booking no longer matches its fingerprint", async () => {
    mockAuth({
      versionRows: [
        { ...quoteRow, id: "ver-q2", version_no: 2, quote_id: "quote-1", invoice_id: null, content_fingerprint: "fp-old" },
        { ...quoteRow, id: "ver-q1", version_no: 1, quote_id: "quote-1", invoice_id: null, content_fingerprint: "fp-older" },
        {
          ...quoteRow,
          id: "ver-i1",
          doc_type: "invoice",
          version_no: 1,
          quote: null,
          quote_id: null,
          invoice_id: "inv-1",
          content_fingerprint: "fp-1",
        },
      ],
    })

    const body = (await (await call()).json()) as { versions: Array<{ id: string; contentChanged: boolean | null }> }
    const changed = Object.fromEntries(body.versions.map((v) => [v.id, v.contentChanged]))

    // Changed: quote 2 was sent against fp-old and the booking now reads fp-1.
    expect(changed["ver-q2"]).toBe(true)
    // An earlier copy is superseded by definition, so it is not compared.
    expect(changed["ver-q1"]).toBeNull()
    // Unchanged: the invoice fingerprint still matches.
    expect(changed["ver-i1"]).toBe(false)
    expect(fingerprintMocks.computeContentFingerprint).toHaveBeenCalledTimes(2)
    expect(fingerprintMocks.computeContentFingerprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ docType: "invoice", invoiceId: "inv-1" }),
    )
  })

  it("reports unknown, never changed, for a copy with no fingerprint or when the comparison fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    fingerprintMocks.computeContentFingerprint.mockRejectedValue(new Error("travellers: boom"))
    mockAuth({
      versionRows: [
        { ...quoteRow, id: "ver-q1", quote_id: "quote-1", invoice_id: null, content_fingerprint: "fp-old" },
        {
          ...quoteRow,
          id: "ver-v1",
          doc_type: "voucher",
          quote: null,
          quote_id: null,
          invoice_id: null,
          content_fingerprint: null,
        },
      ],
    })

    const body = (await (await call()).json()) as { versions: Array<{ id: string; contentChanged: boolean | null }> }
    expect(body.versions.map((v) => v.contentChanged)).toEqual([null, null])
    // The copy with no fingerprint is not even compared.
    expect(fingerprintMocks.computeContentFingerprint).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    expect((await call()).status).toBe(401)
  })

  it("rejects a malformed booking id before touching the database", async () => {
    const { supabase } = mockAuth()
    expect((await call("not-a-uuid")).status).toBe(400)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("returns an empty list, and no email lookup, when nothing has been issued", async () => {
    const { sendsIn } = mockAuth({ versionRows: [] })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ versions: [] })
    expect(sendsIn).not.toHaveBeenCalled()
  })

  it("maps each copy with the emails that carried it", async () => {
    const { sendsIn } = mockAuth({
      versionRows: [quoteRow, { ...quoteRow, id: "ver-i1", doc_type: "invoice", file_name: "Invoice-1.pdf", quote: null }],
      sendRows: [
        {
          id: "cor-2",
          document_version_id: "ver-q1",
          subject: "Your quote",
          sent_at: "2026-11-03T09:00:00.000Z",
          recipients: ["ada@example.test"],
        },
        { id: "cor-1", document_version_id: "ver-q1", subject: "Your quote", sent_at: "2026-11-01T10:00:00.000Z", recipients: null },
      ],
    })

    const res = await call()
    const body = (await res.json()) as { versions: Array<Record<string, unknown>> }

    expect(sendsIn).toHaveBeenCalledWith("document_version_id", ["ver-q1", "ver-i1"])
    expect(body.versions).toHaveLength(2)
    expect(body.versions[0]).toMatchObject({
      id: "ver-q1",
      docType: "quote",
      versionNo: 1,
      quoteNumber: "LTT-26-0039-Q1",
      issueKind: "sent",
      sends: [
        { correspondenceId: "cor-2", recipients: ["ada@example.test"] },
        { correspondenceId: "cor-1", recipients: [] },
      ],
    })
    expect(body.versions[1]).toMatchObject({ id: "ver-i1", docType: "invoice", quoteNumber: null, sends: [] })
  })

  it("does not leak database details when the lookup fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    mockAuth({ versionRows: null, versionError: { message: 'relation "document_versions" secret detail' } })
    const res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("secret detail")
    error.mockRestore()
  })
})
