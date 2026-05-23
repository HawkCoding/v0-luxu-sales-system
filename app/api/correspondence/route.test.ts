import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))
const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getEmailFromAddress: vi.fn(),
}))
const transitionMocks = vi.hoisted(() => ({
  applyTransition: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/email/transport", () => ({
  sendEmail: emailMocks.sendEmail,
}))

vi.mock("@/lib/email/from", () => ({
  getEmailFromAddress: emailMocks.getEmailFromAddress,
}))

vi.mock("@/lib/pipeline/apply-transition", () => ({
  applyTransition: transitionMocks.applyTransition,
}))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const QUOTE_ID = "00000000-0000-4000-8000-00000000bbbb"

interface AuthOptions {
  bookingStage?: string
  customerEmail?: string | null
  departureDate?: string | null
  invoiceBalance?: number | null
  quotePdfStoragePath?: string | null
}

function buildAuth(options: AuthOptions = {}) {
  const bookingStage = options.bookingStage ?? "enquiry"
  const customerEmail = options.customerEmail === undefined ? "c@example.com" : options.customerEmail
  const departureDate = options.departureDate === undefined ? "2026-06-01" : options.departureDate
  const invoiceBalance = options.invoiceBalance === undefined ? 0 : options.invoiceBalance
  const quotePdfStoragePath = options.quotePdfStoragePath ?? null

  const correspondenceInsertResult = vi.fn(async () => ({
    data: {
      id: "cor-1",
      booking_id: BOOKING_ID,
      channel: "email",
      kind: null,
      subject: "Hello",
      body_html: null,
      status: "sent",
      sent_at: "2026-05-01T00:00:00.000Z",
      error: null,
      provider_message_id: "pmid",
      recipients: ["c@example.com"],
    },
    error: null,
  }))

  const correspondenceInsertChain = vi.fn(() => ({
    select: vi.fn(() => ({
      single: correspondenceInsertResult,
    })),
  }))

  const followUpInsert = vi.fn(async () => ({ error: null }))
  const correspondenceSelect = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: [], error: null })),
  }))

  const quoteUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  }))
  const quoteSelect = vi.fn((columns: string) => {
    if (columns.includes("pdf_document_id")) {
      return {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: quotePdfStoragePath
              ? {
                  quote_number: "BT-2026-0001-Q1",
                  pdf_document_id: "doc-1",
                  documents: { storage_path: quotePdfStoragePath },
                }
              : null,
            error: null,
          })),
        })),
      }
    }
    return {
      eq: vi.fn(async () => ({ data: [], error: null })),
    }
  })

  const documentSelect = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: [], error: null })),
  }))

  const pipelineHistoryInsert = vi.fn(async () => ({ error: null }))
  const auditInsert = vi.fn(async () => ({ error: null }))
  const storageDownload = vi.fn(async () => ({
    data: new Blob(["pdf-content"], { type: "application/pdf" }),
    error: null,
  }))
  let correspondenceInsertCount = 0

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  booking_number: "BT-2026-0001",
                  stage: bookingStage,
                  source: "manual",
                  raw_text: null,
                  updated_at: "2026-05-01T00:00:00.000Z",
                  customer_id: "cust-1",
                  consultant: "HK",
                  departure_date: departureDate,
                  duration_nights: 3,
                  invoice_balance: invoiceBalance,
                  customer: { email: customerEmail },
                },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "correspondences") {
        return {
          insert: vi.fn((...args: unknown[]) => {
            correspondenceInsertCount += 1
            if (correspondenceInsertCount === 1) return correspondenceInsertChain(...(args as []))
            return followUpInsert()
          }),
          select: correspondenceSelect,
        }
      }
      if (table === "quotes") {
        return {
          update: quoteUpdate,
          select: quoteSelect,
        }
      }
      if (table === "documents") {
        return { select: documentSelect }
      }
      if (table === "pipeline_history") {
        return { insert: pipelineHistoryInsert }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({
        download: storageDownload,
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

  return {
    correspondenceInsertChain,
    followUpInsert,
    quoteUpdate,
    pipelineHistoryInsert,
    auditInsert,
    storageDownload,
  }
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/correspondence", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/correspondence", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    emailMocks.sendEmail.mockReset()
    emailMocks.getEmailFromAddress.mockReset()
    transitionMocks.applyTransition.mockReset()
    emailMocks.getEmailFromAddress.mockResolvedValue("noreply@example.com")
    emailMocks.sendEmail.mockResolvedValue({
      success: true,
      provider: "mailpit",
      providerMessageId: "pmid",
      error: null,
    })
    transitionMocks.applyTransition.mockResolvedValue({
      updated: {},
      crossedStages: [],
      createdInvoiceDocument: false,
      scheduledDepositCorrespondence: false,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hi" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hi" }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when bookingId/jobId missing", async () => {
    buildAuth()
    const res = await POST(postJson({ subject: "Hi" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when moveStage is not a known stage", async () => {
    buildAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hi", moveStage: "not_a_stage" }))
    expect(res.status).toBe(400)
  })

  it("sends the email and inserts correspondence on success", async () => {
    buildAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hello" }))
    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@example.com", subject: "Hello" }),
    )
  })

  it("returns 502 on email send failure without advancing stage or updating quote", async () => {
    emailMocks.sendEmail.mockResolvedValue({
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: "smtp 535",
    })
    const mocks = buildAuth()
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Quote",
        quoteId: QUOTE_ID,
        moveStage: "quote_sent",
      }),
    )

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe("smtp 535")
    expect(body.correspondenceId).toBe("cor-1")
    expect(mocks.correspondenceInsertChain).toHaveBeenCalledTimes(1)
    expect(mocks.correspondenceInsertChain).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", sent_at: null }),
    )
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
    expect(mocks.pipelineHistoryInsert).not.toHaveBeenCalled()
    expect(mocks.quoteUpdate).not.toHaveBeenCalled()
    expect(mocks.followUpInsert).not.toHaveBeenCalled()
    expect(mocks.auditInsert).not.toHaveBeenCalled()
  })

  it("on successful quote_sent: updates quote, applies transition, writes pipeline_history and audit", async () => {
    const mocks = buildAuth()
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Quote",
        quoteId: QUOTE_ID,
        moveStage: "quote_sent",
        kind: "quote",
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.quoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", last_sent_at: expect.any(String) }),
    )
    expect(transitionMocks.applyTransition).toHaveBeenCalledTimes(1)
    expect(transitionMocks.applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetStage: "quote_sent",
        actorName: "Jane Doe",
        actorUserId: "u1",
        booking: expect.objectContaining({ id: BOOKING_ID, stage: "enquiry" }),
      }),
    )
    expect(mocks.pipelineHistoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        from_stage: "enquiry",
        to_stage: "quote_sent",
        moved_by: "Jane Doe",
        moved_by_user_id: "u1",
      }),
    )
    expect(mocks.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "stage_change", entity_id: BOOKING_ID }),
    )
    expect(mocks.followUpInsert).toHaveBeenCalledTimes(1)
  })

  it("does not call applyTransition when moveStage matches current booking stage", async () => {
    const mocks = buildAuth({ bookingStage: "quote_sent" })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Quote",
        quoteId: QUOTE_ID,
        moveStage: "quote_sent",
      }),
    )

    expect(res.status).toBe(200)
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
    expect(mocks.pipelineHistoryInsert).not.toHaveBeenCalled()
    expect(mocks.quoteUpdate).toHaveBeenCalled()
  })

  it("sends a voucher email and applies the voucher_sent transition", async () => {
    const mocks = buildAuth({ bookingStage: "final_paid" })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Travel voucher BT-2026-0001",
        kind: "voucher",
        moveStage: "voucher_sent",
        attachments: [
          {
            filename: "voucher.pdf",
            contentBase64: Buffer.from("pdf").toString("base64"),
            contentType: "application/pdf",
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Travel voucher BT-2026-0001",
        attachments: [expect.objectContaining({ filename: "voucher.pdf" })],
      }),
    )
    expect(transitionMocks.applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetStage: "voucher_sent",
        booking: expect.objectContaining({ id: BOOKING_ID, stage: "final_paid" }),
      }),
    )
    expect(mocks.pipelineHistoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({ from_stage: "final_paid", to_stage: "voucher_sent" }),
    )
  })

  it("blocks voucher email before send when invoice balance is not zero", async () => {
    const mocks = buildAuth({ bookingStage: "final_paid", invoiceBalance: 100 })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Travel voucher BT-2026-0001",
        kind: "voucher",
        moveStage: "voucher_sent",
      }),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: "Voucher cannot be sent",
      details: {
        failures: [expect.objectContaining({ code: "balance_not_zero" })],
      },
    })
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("blocks voucher email before send when required readiness fields are missing", async () => {
    const mocks = buildAuth({ bookingStage: "final_paid", departureDate: null, customerEmail: null })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Travel voucher BT-2026-0001",
        moveStage: "voucher_sent",
      }),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({
      error: "Voucher cannot be sent",
      details: {
        failures: [
          expect.objectContaining({ code: "departure_date_missing" }),
          expect.objectContaining({ code: "customer_email_missing" }),
        ],
      },
    })
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("stores recipients in the correspondence record when email is sent", async () => {
    const mocks = buildAuth()
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Quote for you",
        to: "customer@example.com",
        kind: "quote",
        quoteId: QUOTE_ID,
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.correspondenceInsertChain).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ["customer@example.com"] }),
    )
    const body = await res.json()
    expect(body.recipients).toEqual(["c@example.com"])
  })

  it("attaches quote PDF when pdf_document_id is set on the quote", async () => {
    const mocks = buildAuth({ quotePdfStoragePath: "quotes/BT-2026-0001-Q1/quote-BT-2026-0001-Q1.pdf" })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Your quote",
        kind: "quote",
        quoteId: QUOTE_ID,
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.storageDownload).toHaveBeenCalledWith("BT-2026-0001-Q1/quote-BT-2026-0001-Q1.pdf")
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: "quote-BT-2026-0001-Q1.pdf", contentType: "application/pdf" }),
        ]),
      }),
    )
  })

  it("sends quote email without PDF attachment when no pdf_document_id is set", async () => {
    const mocks = buildAuth()
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Your quote",
        kind: "quote",
        quoteId: QUOTE_ID,
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.storageDownload).not.toHaveBeenCalled()
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    )
  })

  it("records correspondence as failed when email send fails", async () => {
    emailMocks.sendEmail.mockResolvedValue({
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: "Connection refused",
    })
    const mocks = buildAuth()
    const res = await POST(
      postJson({ bookingId: BOOKING_ID, subject: "Quote", kind: "quote", quoteId: QUOTE_ID }),
    )

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe("Connection refused")
    expect(mocks.correspondenceInsertChain).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", sent_at: null, error: "Connection refused" }),
    )
  })
})
