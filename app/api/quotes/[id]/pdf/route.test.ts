import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const pdfMocks = vi.hoisted(() => ({
  renderQuotePdf: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/quotes/render-quote-pdf", () => ({
  renderQuotePdf: pdfMocks.renderQuotePdf,
}))

import { POST } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-00000000eeee"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const DOCUMENT_ID = "00000000-0000-4000-8000-00000000dddd"

function buildAuth() {
  const storageUpload = vi.fn(async () => ({ error: null }))
  const storageSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example.com/quote.pdf" },
  }))
  const documentUpsert = vi.fn()
  const quoteUpdate = vi.fn(async () => ({ error: null }))
  const auditInsert = vi.fn(async () => ({ error: null }))
  let documentUpsertCount = 0

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: QUOTE_ID,
                  booking_id: BOOKING_ID,
                  quote_number: "BT-2026-0001-Q1",
                  status: "ready",
                  validity_until: "2026-06-01",
                  subtotal: 1000,
                  vat: 150,
                  total: 1150,
                  created_at: "2026-05-01T00:00:00.000Z",
                  booking: {
                    id: BOOKING_ID,
                    booking_number: "BT-2026-0001",
                    customer: { first_name: "Jane", last_name: "Doe" },
                  },
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [{ description: "Suite", supplier_description: null, qty: 1, unit_price: 1000, total: 1000, sort_order: 0 }],
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "documents") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
          insert: vi.fn((payload: unknown) => {
            documentUpsertCount += 1
            documentUpsert(payload)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: DOCUMENT_ID,
                    booking_id: BOOKING_ID,
                    kind: "quote_pdf",
                    status: "generated",
                    storage_path: "quotes/BT-2026-0001-Q1/quote-BT-2026-0001-Q1.pdf",
                    created_at: "2026-05-01T00:00:00.000Z",
                  },
                  error: null,
                })),
              })),
            }
          }),
        }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        createSignedUrl: storageSignedUrl,
      })),
    },
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Jane Doe", name: "Jane", surname: "Doe", email: "u@example.com" },
    },
  })

  return { storageUpload, storageSignedUrl, documentUpsert, quoteUpdate, auditInsert }
}

describe("POST /api/quotes/[id]/pdf", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    pdfMocks.renderQuotePdf.mockReset()
    pdfMocks.renderQuotePdf.mockResolvedValue(Buffer.from("fake-pdf"))
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: QUOTE_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("generates PDF, uploads to storage, creates document record, links pdf_document_id to quote", async () => {
    const { storageUpload, documentUpsert, auditInsert } = buildAuth()

    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: QUOTE_ID }),
    })

    expect(res.status).toBe(200)
    expect(pdfMocks.renderQuotePdf).toHaveBeenCalledOnce()
    expect(storageUpload).toHaveBeenCalledWith(
      expect.stringContaining("BT-2026-0001-Q1"),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf" }),
    )
    expect(documentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "quote_pdf", status: "generated" }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quote_pdf_generated", entity_id: QUOTE_ID }),
    )

    const body = await res.json()
    expect(body.document.id).toBe(DOCUMENT_ID)
    expect(body.url).toBe("https://storage.example.com/quote.pdf")
  })

  it("returns 500 when PDF render fails and does not upload to storage", async () => {
    const { storageUpload } = buildAuth()
    pdfMocks.renderQuotePdf.mockRejectedValue(new Error("render engine crash"))

    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: QUOTE_ID }),
    })

    expect(res.status).toBe(500)
    expect(storageUpload).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.error).toMatch(/could not be rendered/i)
  })
})
