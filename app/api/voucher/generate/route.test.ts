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

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: vi.fn(async () => ({
    subject: "Your Travel Voucher — BT-2026-0001",
    bodyHtml: "<html><p>voucher</p></html>",
    bodyContentHtml: "<p>voucher</p>",
    warnings: [],
  })),
}))

const buildBlocksMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/voucher/build-service-blocks", () => ({
  buildVoucherServiceBlocks: buildBlocksMock,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))
vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
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

function createSelectResult(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data, error: null })),
        order: vi.fn(async () => ({ data, error: null })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data, error: null })),
        })),
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      })),
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      })),
    })),
  }
}

interface BookingOpts {
  stage: string
  invoiceBalance: number | null
  existingDocumentId?: string
  existingVoucherId?: string
  blocks?: Array<{
    serviceType: "train" | "hotel" | "transfer" | "tour" | "airline" | "additional_service"
    title: string
    displayOrder: number
  }>
}

function buildAuth({ stage, invoiceBalance, existingDocumentId, existingVoucherId, blocks }: BookingOpts) {
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

  const voucherWrite = {
    data: {
      id: existingVoucherId ?? "voucher-1",
      sent_at: null,
      generated_at: "2026-05-18T00:00:00.000Z",
    },
    error: null,
  }

  const insertedBlocks: unknown[] = []
  let deleteBlocksCalled = false

  buildBlocksMock.mockResolvedValue({
    blocks: (blocks ?? [
      {
        serviceType: "train",
        title: "Train",
        displayOrder: 0,
        supplierReference: "BT-2026-0001",
        contactDetails: { name: "Blue Train" },
        serviceData: { route: "Pretoria to Cape Town" },
      },
    ]).map((b) => ({
      contactDetails: {},
      serviceData: {},
      supplierReference: null,
      ...b,
    })),
  })

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

      if (table === "quotes") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "booking_suites") return createSelectResult([{ suite_type_name: "Luxury" }])
      if (table === "travellers") return createSelectResult([])
      if (table === "booking_reservation_details") return createSelectResult(null)
      if (table === "voucher_template") return createSelectResult(null)

      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

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

      if (table === "vouchers") {
        const existingVoucher = existingVoucherId ? { id: existingVoucherId } : null
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: existingVoucher, error: null })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => voucherWrite),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => voucherWrite),
              })),
            })),
          })),
        }
      }

      if (table === "voucher_service_blocks") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => {
              deleteBlocksCalled = true
              return { error: null }
            }),
          })),
          insert: vi.fn(async (rows: unknown[]) => {
            insertedBlocks.push(...rows)
            return { error: null }
          }),
        }
      }

      // Suite tokens for the voucher email — no package selections in these fixtures.
      if (table === "booking_package_selections") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
        }
      }
      // Build Booking's per-booking equivalent — no booking_services in these fixtures either.
      if (table === "booking_services") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
        }
      }
      // No leg reference rows in these fixtures — readiness check sees nothing missing.
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
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

  return {
    insertedBlocks,
    get deleteBlocksCalled() {
      return deleteBlocksCalled
    },
  }
}

describe("POST /api/voucher/generate", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    vi.mocked(renderVoucherPdf).mockClear()
    vi.mocked(renderVoucherPdf).mockResolvedValue(Buffer.from("pdf"))
    auditMocks.writeAuditLog.mockClear()
    buildBlocksMock.mockReset()
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

  it("logs voucher_regenerated when a voucher row already exists", async () => {
    buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      existingDocumentId: "existing-doc-1",
      existingVoucherId: "existing-voucher-1",
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "voucher_regenerated" }),
    )
  })

  it("logs voucher_generated when no voucher row exists yet", async () => {
    buildAuth({ stage: "final_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "voucher_generated" }),
    )
  })

  it("inserts service blocks in display_order", async () => {
    const built = buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      blocks: [
        { serviceType: "hotel", title: "Hotel", displayOrder: 1 },
        { serviceType: "train", title: "Train", displayOrder: 0 },
        { serviceType: "additional_service", title: "Extras", displayOrder: 2 },
      ],
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(built.deleteBlocksCalled).toBe(true)
    expect(built.insertedBlocks).toHaveLength(3)
    const orders = (built.insertedBlocks as Array<{ display_order: number; service_type: string }>).map(
      (b) => `${b.display_order}:${b.service_type}`,
    )
    expect(orders).toEqual(["1:hotel", "0:train", "2:additional_service"])
  })

  it("does not write a vouchers row when PDF rendering fails", async () => {
    const built = buildAuth({ stage: "final_paid", invoiceBalance: 0 })
    vi.mocked(renderVoucherPdf).mockRejectedValueOnce(new Error("pdf boom"))

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(500)
    expect(built.insertedBlocks).toHaveLength(0)
    expect(built.deleteBlocksCalled).toBe(false)
    expect(auditMocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
