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

const scopeMocks = vi.hoisted(() => ({
  resolveAcceptedQuoteScope: vi.fn(),
  findMissingQuotedLegs: vi.fn(),
}))
vi.mock("@/lib/quotes/accepted-quote-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quotes/accepted-quote-scope")>()
  return {
    ...actual,
    resolveAcceptedQuoteScope: scopeMocks.resolveAcceptedQuoteScope,
    findMissingQuotedLegs: scopeMocks.findMissingQuotedLegs,
  }
})

const legReferenceMocks = vi.hoisted(() => ({
  loadLegReferenceRows: vi.fn(),
}))
vi.mock("@/lib/voucher/leg-references", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voucher/leg-references")>()
  return { ...actual, loadLegReferenceRows: legReferenceMocks.loadLegReferenceRows }
})

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
  customerInvoiceNumber?: string | null
  existingDocumentId?: string
  /** Status already on the existing voucher_pdf row — a regeneration must not downgrade `sent`. */
  existingDocumentStatus?: string
  existingVoucherId?: string
  /** Passenger counts the booking is priced from, for the roster-vs-pax warning. */
  noOfAdults?: number
  noOfChildren?: number
  /** Guest roster rows, for the roster-vs-pax warning. */
  travellers?: Array<{ prefix: string | null; first_name: string; last_name: string }>
  blocks?: Array<{
    serviceType: "train" | "hotel" | "transfer" | "tour" | "airline" | "additional_service"
    title: string
    displayOrder: number
    serviceData?: Record<string, unknown>
  }>
}

function buildAuth({
  stage,
  invoiceBalance,
  customerInvoiceNumber = null,
  existingDocumentId,
  existingDocumentStatus = "generated",
  existingVoucherId,
  noOfAdults = 2,
  noOfChildren = 0,
  travellers = [],
  blocks,
}: BookingOpts) {
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
  const documentWrites: Array<Record<string, unknown>> = []
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
          customer_invoice_number: customerInvoiceNumber,
          stage,
          invoice_balance: invoiceBalance,
          consultant: "LB",
          departure_date: "2026-06-01",
          no_of_suites: 1,
          no_of_adults: noOfAdults,
          no_of_children: noOfChildren,
          additional_services_details: null,
          customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.test", phone: "123", title: "Ms" },
          route: { name: "Pretoria to Cape Town", supplier: { name: "Blue Train" } },
        })
      }

      if (table === "quotes") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "booking_suites") return createSelectResult([{ suite_type_name: "Luxury" }])
      if (table === "travellers") return createSelectResult(travellers)
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
        const existingDoc = existingDocumentId
          ? { id: existingDocumentId, status: existingDocumentStatus }
          : null
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
          insert: vi.fn((payload: Record<string, unknown>) => {
            documentWrites.push(payload)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => documentWrite),
              })),
            }
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            documentWrites.push(payload)
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => documentWrite),
                })),
              })),
            }
          }),
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
    documentWrites,
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
    scopeMocks.resolveAcceptedQuoteScope.mockReset()
    scopeMocks.findMissingQuotedLegs.mockReset()
    legReferenceMocks.loadLegReferenceRows.mockReset()
    // Default: an accepted quote pricing one leg, and a builder that still has it.
    scopeMocks.resolveAcceptedQuoteScope.mockResolvedValue({
      quoteId: "quote-1",
      quoteNumber: "BT-2026-0001-Q1",
      legIds: new Set(["leg-train"]),
      legLabels: new Map([["leg-train", "Rovos Rail"]]),
      hasAcceptedQuote: true,
    })
    scopeMocks.findMissingQuotedLegs.mockResolvedValue([])
    legReferenceMocks.loadLegReferenceRows.mockResolvedValue([
      {
        key: "service:leg-train",
        kind: "service",
        id: "leg-train",
        label: "Rovos Rail",
        supplierName: "Rovos Rail",
        supplierReference: "242541",
        supplierContactName: "Carla",
        voucherFootnote: null,
        excursions: [],
      },
    ])
  })

  it("warns when a leg's units exist but every guest count on them is zero", async () => {
    buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      blocks: [
        {
          serviceType: "hotel",
          title: "DaVinci Hotel & Suites",
          displayOrder: 0,
          // A room row was created but nobody was ever counted into it. The summed object exists,
          // so the old `Boolean(...)` check treated this as a captured breakdown and stayed silent
          // while the voucher printed "Adults 0" to the guest.
          serviceData: { guestBreakdown: { adults: 0, children: 0, infants: 0 } },
        },
      ],
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))
    const body = (await res.json()) as { readinessWarnings: Array<{ code: string; message: string }> }

    expect(res.status).toBe(200)
    const warning = body.readinessWarnings.find((w) => w.code === "guest_counts_missing")
    expect(warning?.message).toContain("DaVinci Hotel & Suites")
  })

  it("does not warn about guest counts when the leg's units carry real occupancy", async () => {
    buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      blocks: [
        {
          serviceType: "hotel",
          title: "DaVinci Hotel & Suites",
          displayOrder: 0,
          serviceData: { guestBreakdown: { adults: 2, children: 0, infants: 0 } },
        },
      ],
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))
    const body = (await res.json()) as { readinessWarnings: Array<{ code: string }> }

    expect(res.status).toBe(200)
    expect(body.readinessWarnings.some((w) => w.code === "guest_counts_missing")).toBe(false)
  })

  it("warns when the guest roster and the priced passenger counts disagree", async () => {
    buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      noOfAdults: 1,
      noOfChildren: 0,
      travellers: [
        { prefix: "Ms", first_name: "Jacomien", last_name: "Lombard" },
        { prefix: "Mr", first_name: "Pieter", last_name: "Lombard" },
      ],
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))
    const body = (await res.json()) as { readinessWarnings: Array<{ code: string; message: string }> }

    // Advisory only — two names above "Number of Guests: 1" is worth flagging, not worth blocking.
    expect(res.status).toBe(200)
    const warning = body.readinessWarnings.find((w) => w.code === "guest_count_mismatch")
    expect(warning?.message).toContain("2")
    expect(warning?.message).toContain("priced for 1")
  })

  it("stays quiet when the roster matches the priced pax, and when no roster is captured yet", async () => {
    buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      noOfAdults: 2,
      travellers: [
        { prefix: "Ms", first_name: "Jacomien", last_name: "Lombard" },
        { prefix: "Mr", first_name: "Pieter", last_name: "Lombard" },
      ],
    })
    const matched = (await (await POST(postJson({ jobId: BOOKING_ID }))).json()) as {
      readinessWarnings: Array<{ code: string }>
    }
    expect(matched.readinessWarnings.some((w) => w.code === "guest_count_mismatch")).toBe(false)

    // An empty roster is not a disagreement — there is nothing yet to disagree with.
    buildAuth({ stage: "final_paid", invoiceBalance: 0, noOfAdults: 2, travellers: [] })
    const empty = (await (await POST(postJson({ jobId: BOOKING_ID }))).json()) as {
      readinessWarnings: Array<{ code: string }>
    }
    expect(empty.readinessWarnings.some((w) => w.code === "guest_count_mismatch")).toBe(false)
  })

  it("keeps an already-sent voucher document sent when it is regenerated", async () => {
    const ctx = buildAuth({
      stage: "closed",
      invoiceBalance: 0,
      existingDocumentId: "document-1",
      existingDocumentStatus: "sent",
      existingVoucherId: "voucher-1",
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    // Regenerating re-renders the document; it does not retract the email that already went out.
    expect(ctx.documentWrites.at(-1)).toMatchObject({ kind: "voucher_pdf", status: "sent" })
  })

  it("marks a regenerated voucher document generated when it was never sent", async () => {
    const ctx = buildAuth({
      stage: "final_paid",
      invoiceBalance: 0,
      existingDocumentId: "document-1",
      existingDocumentStatus: "generated",
      existingVoucherId: "voucher-1",
    })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(ctx.documentWrites.at(-1)).toMatchObject({ kind: "voucher_pdf", status: "generated" })
  })

  it("scopes the voucher to the accepted quote's legs and drops transport requests tied to no leg", async () => {
    buildAuth({ stage: "final_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(buildBlocksMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        legIds: new Set(["leg-train"]),
        includeUnlinkedTransportRequests: false,
      }),
    )
    // The references gate reads the same scope, so an unsold service can never demand a reference.
    expect(legReferenceMocks.loadLegReferenceRows).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      { legIds: new Set(["leg-train"]) },
    )
  })

  it("leaves the itinerary unfiltered when the accepted quote priced no legs (manual quote)", async () => {
    scopeMocks.resolveAcceptedQuoteScope.mockResolvedValue({
      quoteId: "quote-1",
      quoteNumber: "BT-2026-0001-Q1",
      legIds: new Set<string>(),
      legLabels: new Map(),
      hasAcceptedQuote: true,
    })
    buildAuth({ stage: "final_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(200)
    expect(buildBlocksMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ legIds: undefined }),
    )
  })

  it("blocks generation when a service on the accepted quote is gone from the builder", async () => {
    scopeMocks.findMissingQuotedLegs.mockResolvedValue(["Rovos Rail"])
    buildAuth({ stage: "final_paid", invoiceBalance: 0 })

    const res = await POST(postJson({ jobId: BOOKING_ID }))

    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain("Rovos Rail")
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

  it("numbers the voucher with the salesperson-entered customer invoice number", async () => {
    buildAuth({ stage: "final_paid", invoiceBalance: 0, customerInvoiceNumber: "  242541  " })

    const res = await POST(postJson({ jobId: BOOKING_ID }))
    const body = (await res.json()) as {
      voucherRecord: { voucherNumber: string }
      voucher: { filename: string }
    }

    expect(res.status).toBe(200)
    expect(body.voucherRecord.voucherNumber).toBe("242541")
    expect(body.voucher.filename).toBe("voucher-242541.pdf")
    expect(vi.mocked(renderVoucherPdf).mock.calls[0]?.[0].data.voucherNumber).toBe("242541")
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ meta: expect.objectContaining({ voucher_number: "242541" }) }),
    )
  })

  it("falls back to the internal invoice number when none has been captured", async () => {
    buildAuth({ stage: "final_paid", invoiceBalance: 0, customerInvoiceNumber: null })

    const res = await POST(postJson({ jobId: BOOKING_ID }))
    const body = (await res.json()) as { voucherRecord: { voucherNumber: string } }

    expect(res.status).toBe(200)
    expect(body.voucherRecord.voucherNumber).toBe("BT-2026-0001-INV")
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
