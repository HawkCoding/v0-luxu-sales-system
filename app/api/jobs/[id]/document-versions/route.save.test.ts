import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn(), requireUser: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole, requireUser: authMocks.requireUser }))
const versionMocks = vi.hoisted(() => ({ recordIssuedDocument: vi.fn() }))
vi.mock("@/lib/documents/document-versions", () => ({ recordIssuedDocument: versionMocks.recordIssuedDocument }))
const quotePdfMocks = vi.hoisted(() => ({ ensureQuotePdf: vi.fn() }))
vi.mock("@/lib/quotes/ensure-quote-pdf", () => ({
  ensureQuotePdf: quotePdfMocks.ensureQuotePdf,
  QUOTE_BUCKET: "quotes",
}))
const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))
vi.mock("@/lib/documents/content-fingerprint", () => ({ computeContentFingerprint: vi.fn() }))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const QUOTE_ID = "00000000-0000-4000-8000-00000000bbbb"

function call(body: unknown, id = BOOKING_ID) {
  return POST(
    new Request(`http://localhost/api/jobs/${id}/document-versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

interface Options {
  alreadySent?: boolean
  quote?: { id: string; booking_id: string; status: string } | null
  /** Sent emails on the booking, when no kept copy was emailed. */
  emailedRows?: unknown[]
}

function mockAuth(options: Options = {}) {
  const download = vi.fn(async () => ({ data: new Blob(["quote-pdf-bytes"]), error: null }))
  const sentLookup = vi.fn()
  const quoteUpdateEq = vi.fn(async () => ({ error: null }))
  const quoteUpdate = vi.fn((_values: Record<string, unknown>) => ({ eq: vi.fn(() => ({ eq: quoteUpdateEq })) }))
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "document_versions") {
        const chain: Record<string, unknown> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn((...args: unknown[]) => {
          sentLookup(...args)
          return chain
        })
        chain.limit = vi.fn(() => chain)
        chain.maybeSingle = vi.fn(async () => ({
          data: options.alreadySent === false ? null : { id: "ver-sent" },
          error: null,
        }))
        return chain
      }
      if (table === "correspondences") {
        // Emails sent on the booking, for a document emailed before copies were kept.
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: options.emailedRows ?? [], error: null })),
              })),
            })),
          })),
        }
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })),
            })),
          })),
        }
      }
      if (table === "quotes") {
        return {
          update: quoteUpdate,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  options.quote === undefined
                    ? { id: QUOTE_ID, booking_id: BOOKING_ID, status: "accepted" }
                    : options.quote,
                error: null,
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    storage: { from: vi.fn(() => ({ download })) },
  }
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: { supabase, user: { id: "u1" }, profile: { actorName: "Jane Doe" } },
  })
  return { download, sentLookup, quoteUpdate }
}

const invoiceAttachment = { filename: "Invoice-244453.pdf", contentBase64: "JVBERg==", contentType: "application/pdf" }

describe("POST /api/jobs/[id]/document-versions (save without sending)", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    versionMocks.recordIssuedDocument.mockReset()
    versionMocks.recordIssuedDocument.mockResolvedValue("ver-new")
    quotePdfMocks.ensureQuotePdf.mockReset()
    quotePdfMocks.ensureQuotePdf.mockResolvedValue({
      storagePath: "quotes/LTT-26-0039-Q2/Quote-26-0039.pdf",
      attachmentFilename: "Quote-26-0039.pdf",
    })
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    expect((await call({ kind: "invoice", attachments: [invoiceAttachment] })).status).toBe(401)
  })

  it("rejects an unknown document kind", async () => {
    mockAuth()
    expect((await call({ kind: "reservation_received", attachments: [invoiceAttachment] })).status).toBe(400)
  })

  it("refuses to save the first copy of a document: that one has to be emailed", async () => {
    mockAuth({ alreadySent: false })
    const res = await call({ kind: "invoice", attachments: [invoiceAttachment] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/first invoice has to be emailed/i)
    expect(versionMocks.recordIssuedDocument).not.toHaveBeenCalled()
  })

  it("allows saving when the invoice was emailed before copies were kept", async () => {
    mockAuth({
      alreadySent: false,
      emailedRows: [{ id: "cor-old", kind: "invoice", subject: "Invoice", sent_at: "2026-09-01T08:00:00.000Z", recipients: [] }],
    })
    const res = await call({ kind: "invoice", attachments: [invoiceAttachment] })
    expect(res.status).toBe(200)
    expect(versionMocks.recordIssuedDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "invoice", issueKind: "saved" }),
    )
  })

  it("keeps the prepared invoice as a saved copy and audits it, with no email or stage move", async () => {
    mockAuth()
    const res = await call({ kind: "invoice", attachments: [invoiceAttachment] })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ versionId: "ver-new" })
    expect(versionMocks.recordIssuedDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: BOOKING_ID,
        kind: "invoice",
        issueKind: "saved",
        issuedBy: "u1",
        attachments: [expect.objectContaining({ filename: "Invoice-244453.pdf" })],
      }),
    )
    expect(versionMocks.recordIssuedDocument.mock.calls[0][1]).not.toHaveProperty("correspondenceId")
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "document_saved_without_sending", entityId: BOOKING_ID }),
    )
  })

  it("requires the prepared document for an invoice or voucher", async () => {
    mockAuth()
    expect((await call({ kind: "voucher" })).status).toBe(400)
    expect(versionMocks.recordIssuedDocument).not.toHaveBeenCalled()
  })

  it("renders and keeps the current quote itself", async () => {
    const { download } = mockAuth()
    const res = await call({ kind: "quote", quoteId: QUOTE_ID })

    expect(res.status).toBe(200)
    expect(quotePdfMocks.ensureQuotePdf).toHaveBeenCalledWith(
      expect.anything(),
      QUOTE_ID,
      expect.objectContaining({ force: true }),
    )
    expect(download).toHaveBeenCalledWith("LTT-26-0039-Q2/Quote-26-0039.pdf")
    expect(versionMocks.recordIssuedDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "quote",
        quoteId: QUOTE_ID,
        issueKind: "saved",
        attachments: [
          expect.objectContaining({
            filename: "Quote-26-0039.pdf",
            contentBase64: Buffer.from("quote-pdf-bytes").toString("base64"),
          }),
        ],
      }),
    )
  })

  it.each(["draft", "ready"])("marks a %s quote sent when it is saved without sending", async (status) => {
    const { quoteUpdate } = mockAuth({ quote: { id: QUOTE_ID, booking_id: BOOKING_ID, status } })
    const res = await call({ kind: "quote", quoteId: QUOTE_ID })

    expect(res.status).toBe(200)
    // last_sent_at is not written: nothing was emailed.
    expect(quoteUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }))
    expect(quoteUpdate.mock.calls[0][0]).not.toHaveProperty("last_sent_at")
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "quote_saved_without_sending", entityId: QUOTE_ID }),
    )
  })

  it.each(["sent", "accepted", "expired", "pricing_incomplete"])(
    "leaves a %s quote's status alone when it is saved without sending",
    async (status) => {
      const { quoteUpdate } = mockAuth({ quote: { id: QUOTE_ID, booking_id: BOOKING_ID, status } })
      const res = await call({ kind: "quote", quoteId: QUOTE_ID })

      expect(res.status).toBe(200)
      expect(quoteUpdate).not.toHaveBeenCalled()
    },
  )

  it("needs a quote id for a quote, and refuses another booking's or a replaced quote", async () => {
    mockAuth()
    expect((await call({ kind: "quote" })).status).toBe(400)

    mockAuth({ quote: { id: QUOTE_ID, booking_id: "00000000-0000-4000-8000-00000000cccc", status: "accepted" } })
    expect((await call({ kind: "quote", quoteId: QUOTE_ID })).status).toBe(404)

    mockAuth({ quote: { id: QUOTE_ID, booking_id: BOOKING_ID, status: "superseded" } })
    expect((await call({ kind: "quote", quoteId: QUOTE_ID })).status).toBe(409)
    expect(quotePdfMocks.ensureQuotePdf).not.toHaveBeenCalled()
  })

  it("reports a failure, and audits nothing, when the copy could not be kept", async () => {
    mockAuth()
    versionMocks.recordIssuedDocument.mockResolvedValue(null)
    const res = await call({ kind: "invoice", attachments: [invoiceAttachment] })
    expect(res.status).toBe(500)
    expect(auditMocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
