import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}))

vi.mock("@/lib/email/transport", () => ({
  sendEmail: emailMocks.sendEmail,
}))

vi.mock("@/lib/voucher/render-voucher-email", () => ({
  renderVoucherEmail: vi.fn(async () => "<p>voucher</p>"),
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { POST } from "./route"

const VOUCHER_ID = "00000000-0000-4000-8000-000000000111"
const BOOKING_ID = "00000000-0000-4000-8000-000000000222"
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000333"

function makeParams(id = VOUCHER_ID) {
  return { params: Promise.resolve({ id }) }
}

interface BuildOpts {
  stage?: string
  invoiceBalance?: number | null
  customerEmail?: string | null
  storagePath?: string | null
  sendSucceeds?: boolean
  voucherExists?: boolean
}

function buildSupabase(opts: BuildOpts = {}) {
  const {
    stage = "final_paid",
    invoiceBalance = 0,
    customerEmail = "guest@example.test",
    storagePath = "vouchers/BT-2026-0001/voucher-BT-2026-0001.pdf",
    voucherExists = true,
  } = opts

  const voucherRow = voucherExists
    ? {
        id: VOUCHER_ID,
        voucher_number: "BT-2026-0001",
        sent_at: null,
        pdf_document_id: "doc-1",
        booking: {
          id: BOOKING_ID,
          booking_number: "BT-2026-0001",
          stage,
          invoice_balance: invoiceBalance,
          departure_date: "2026-06-01",
          consultant: "LB",
          customer_id: CUSTOMER_ID,
          customer: {
            first_name: "Ada",
            last_name: "Lovelace",
            email: customerEmail,
            phone: "123",
          },
          route: { name: "Pretoria to Cape Town" },
        },
        document: { storage_path: storagePath },
      }
    : null

  const correspondenceInsert = vi.fn(async () => ({ error: null }))
  const voucherUpdate = vi.fn(async () => ({ error: null }))
  const bookingUpdate = vi.fn(async () => ({ error: null }))
  const documentUpdate = vi.fn(async () => ({ error: null }))
  const customerUpdate = vi.fn(async () => ({ error: null }))

  const storageDownload = vi.fn(async () => ({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Blob,
    error: null,
  }))

  const supabase = {
    storage: {
      from: vi.fn(() => ({ download: storageDownload })),
    },
    from: vi.fn((table: string) => {
      if (table === "vouchers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: voucherRow, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => voucherUpdate()),
          })),
        }
      }
      if (table === "correspondences") {
        return { insert: vi.fn(async () => correspondenceInsert()) }
      }
      if (table === "bookings") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => bookingUpdate()),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                not: vi.fn(async () => ({ data: [{ departure_date: "2026-06-01" }], error: null })),
              })),
            })),
          })),
        }
      }
      if (table === "documents") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => documentUpdate()),
            })),
          })),
        }
      }
      if (table === "customers") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => customerUpdate()),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    supabase,
    correspondenceInsert,
    voucherUpdate,
    bookingUpdate,
    customerUpdate,
    storageDownload,
  }
}

function mockAuth(opts: BuildOpts = {}) {
  const built = buildSupabase(opts)
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: built.supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: {
        clearanceLevel: "consultant",
        actorName: "Jane",
        name: "Jane",
        surname: "D",
        email: "u@example.com",
        isActive: true,
      },
    },
  })
  return built
}

describe("POST /api/vouchers/[id]/send", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
    emailMocks.sendEmail.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 400 when invoice balance is not zero", async () => {
    mockAuth({ invoiceBalance: 100 })
    emailMocks.sendEmail.mockResolvedValue({
      success: true,
      provider: "mailpit",
      providerMessageId: "m-1",
      error: null,
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details.failures.some((f: { code: string }) => f.code === "balance_not_zero")).toBe(true)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("returns 400 when required customer email is missing", async () => {
    mockAuth({ customerEmail: null })
    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(400)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("returns 404 when voucher does not exist", async () => {
    mockAuth({ voucherExists: false })
    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(404)
  })

  it("sends voucher email, writes correspondence, updates sent_at and audits on success", async () => {
    const built = mockAuth()
    emailMocks.sendEmail.mockResolvedValue({
      success: true,
      provider: "mailpit",
      providerMessageId: "msg-1",
      error: null,
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guest@example.test",
        subject: expect.stringContaining("BT-2026-0001"),
        attachments: expect.arrayContaining([
          expect.objectContaining({ contentType: "application/pdf" }),
        ]),
      }),
    )
    expect(built.correspondenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        kind: "voucher",
        status: "sent",
        provider_message_id: "msg-1",
      }),
    )
    expect(built.voucherUpdate).toHaveBeenCalled()
    expect(built.bookingUpdate).toHaveBeenCalled()
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "voucher_sent" }),
    )
  })

  it("records correspondence with status=failed and audits voucher_send_failed on email failure", async () => {
    const built = mockAuth()
    emailMocks.sendEmail.mockResolvedValue({
      success: false,
      provider: "mailpit",
      providerMessageId: null,
      error: "smtp down",
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(502)
    expect(built.correspondenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "smtp down" }),
    )
    expect(built.voucherUpdate).not.toHaveBeenCalled()
    expect(built.bookingUpdate).not.toHaveBeenCalled()
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "voucher_send_failed" }),
    )
  })
})
