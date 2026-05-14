import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/voucher/render-pdf", () => ({
  renderVoucherPdf: vi.fn(async () => Buffer.from("pdf")),
}))

vi.mock("@/lib/voucher/render-voucher-email", () => ({
  renderVoucherEmail: vi.fn(async () => "<p>voucher</p>"),
}))

import { POST } from "./route"
import { renderVoucherPdf } from "@/lib/voucher/render-pdf"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function postJson(body: unknown) {
  return new Request("http://localhost/api/voucher/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

interface BookingOpts {
  stage: string
  invoiceBalance: number | null
  existingDocumentId?: string
}

function createSelectResult(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data, error: null })),
        order: vi.fn(async () => ({ data, error: null })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data, error: null })),
        })),
      })),
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      })),
    })),
  }
}

function buildAuth({ stage, invoiceBalance, existingDocumentId }: BookingOpts) {
  const documentWrite = {
    data: {
      id: existingDocumentId ?? "document-1",
      booking_id: BOOKING_ID,
      kind: "voucher_pdf",
      status: "generated",
      storage_path: "vouchers/BT-2026-0001/voucher-BT-2026-0001.pdf",
      created_at: "2026-05-08T00:00:00.000Z",
    },
    error: null,
  }

  const auditInsertMock = vi.fn(async () => ({ error: null }))

  const supabase = {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return createSelectResult({
          id: BOOKING_ID,
          booking_number: "BT-2026-0001",
          stage,
          invoice_balance: invoiceBalance,
          consultant: "LB",
          departure_date: "2026-06-01",
          no_of_suites: 1,
          no_of_adults: 2,
          no_of_children: 0,
          additional_services_details: null,
          customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.test", phone: "123", title: "Ms" },
          route: { name: "Pretoria to Cape Town", supplier: { name: "Blue Train" } },
        })
      }

      if (table === "booking_suites") return createSelectResult([{ suite_type_name: "Luxury" }])
      if (table === "travellers") return createSelectResult([])
      if (table === "voucher_template") return createSelectResult(null)
      if (table === "audit_logs") return { insert: auditInsertMock }

      if (table === "documents") {
        const existingDoc = existingDocumentId ? { id: existingDocumentId } : null
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: existingDoc, error: null })),
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => documentWrite),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => documentWrite),
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "user-1", email: "user@example.test" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })

  return { auditInsertMock }
}

describe("POST /api/voucher/generate", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    vi.mocked(renderVoucherPdf).mockClear()
  })

  it("rejects voucher generation when the invoice balance is not zero", async () => {
    buildAuth({ stage: "final_paid", invoiceBalance: 100 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: "The invoice balance must be zero before generating a voucher." })
    expect(renderVoucherPdf).not.toHaveBeenCalled()
  })

  it("rejects voucher generation while the booking is only deposit paid", async () => {
    buildAuth({ stage: "deposit_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: "The booking must be in Paid in Full, Voucher Sent, or Closed stage." })
    expect(renderVoucherPdf).not.toHaveBeenCalled()
  })

  it("allows voucher generation for paid-in-full bookings", async () => {
    buildAuth({ stage: "final_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(renderVoucherPdf).toHaveBeenCalled()
  })

  it("logs voucher_pdf_regenerated when a document already exists", async () => {
    const { auditInsertMock } = buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      existingDocumentId: "existing-doc-1",
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "voucher_pdf_regenerated" }),
    )
  })

  it("logs voucher_pdf_generated when no document exists yet", async () => {
    const { auditInsertMock } = buildAuth({ stage: "final_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "voucher_pdf_generated" }),
    )
  })
})
