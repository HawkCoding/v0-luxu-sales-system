import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))
const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getEmailFromAddress: vi.fn(),
  isFallbackSendingUnavailable: vi.fn(),
}))
const transitionMocks = vi.hoisted(() => ({
  applyTransition: vi.fn(),
}))
const quotePdfMocks = vi.hoisted(() => ({
  ensureQuotePdf: vi.fn(),
}))
const senderMocks = vi.hoisted(() => ({
  resolveSalespersonSender: vi.fn(),
}))
const templateMocks = vi.hoisted(() => ({
  composeEmail: vi.fn(),
}))
const libraryMocks = vi.hoisted(() => ({
  loadLibraryAttachments: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/email/transport", () => ({
  sendEmail: emailMocks.sendEmail,
  isFallbackSendingUnavailable: emailMocks.isFallbackSendingUnavailable,
}))

vi.mock("@/lib/email/from", () => ({
  getEmailFromAddress: emailMocks.getEmailFromAddress,
}))

vi.mock("@/lib/pipeline/apply-transition", () => ({
  applyTransition: transitionMocks.applyTransition,
}))

vi.mock("@/lib/quotes/ensure-quote-pdf", () => ({
  ensureQuotePdf: quotePdfMocks.ensureQuotePdf,
  QUOTE_BUCKET: "quotes",
}))

vi.mock("@/lib/email/resolve-sender", () => ({
  resolveSalespersonSender: senderMocks.resolveSalespersonSender,
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: templateMocks.composeEmail,
}))

vi.mock("@/lib/attachments/email-attachment-library", () => ({
  loadLibraryAttachments: libraryMocks.loadLibraryAttachments,
}))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const QUOTE_ID = "00000000-0000-4000-8000-00000000bbbb"

interface AuthOptions {
  bookingStage?: string
  /** Rows the stage gates read. Empty by default — the gates that need them are exercised
   * explicitly rather than standing in the way of every other test. */
  invoiceRows?: { id: string; kind: string; status: string }[]
  paymentRows?: { amount: number }[]
  /** Quotes the stage gates see. A send-and-move past `quote_sent` needs one that was sent. */
  contextQuotes?: { id: string; status: string; total: number; created_at: string }[]
  /** Documents the stage gates see — e.g. the voucher_pdf a voucher send always has by then. */
  documentRows?: { id: string; kind: string; status: string; created_at: string }[]
  customerEmail?: string | null
  customerFirstName?: string | null
  departureDate?: string | null
  invoiceBalance?: number | null
  quotePdfStoragePath?: string | null
  customerInvoiceNumber?: string | null
  emailImportNeedsReview?: boolean
  quoteStatus?: string
}

function buildAuth(options: AuthOptions = {}) {
  const bookingStage = options.bookingStage ?? "enquiry"
  const customerEmail = options.customerEmail === undefined ? "c@example.com" : options.customerEmail
  // Complete by default so the pre-send customer_complete gate stays out of
  // the way of tests exercising other behavior — override to test that gate.
  const customerFirstName =
    options.customerFirstName === undefined ? "Jane" : options.customerFirstName
  const departureDate = options.departureDate === undefined ? "2026-06-01" : options.departureDate
  const invoiceBalance = options.invoiceBalance === undefined ? 0 : options.invoiceBalance
  const quotePdfStoragePath = options.quotePdfStoragePath ?? null
  const customerInvoiceNumber =
    options.customerInvoiceNumber === undefined ? "INV-0001" : options.customerInvoiceNumber
  const emailImportNeedsReview = options.emailImportNeedsReview ?? false
  // The quote status the send gate reads. Draft by default so it never stands in the way of
  // tests exercising other behaviour — set "pricing_incomplete" to exercise the gate itself.
  const quoteStatus = options.quoteStatus ?? "draft"
  const invoiceRows = options.invoiceRows ?? []
  const paymentRows = options.paymentRows ?? []
  const contextQuotes = options.contextQuotes ?? []
  const documentRows = options.documentRows ?? []

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
  // The stage gates re-read correspondences after the send, so the row this request just wrote is
  // part of the evidence — that is how "the voucher email was sent" becomes true. A mock that
  // always returned [] would make every send-and-move look like it had never sent anything.
  const sentCorrespondences: { id: string; kind: string | null; subject: string; status: string; created_at: string }[] = []
  const correspondenceSelect = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: sentCorrespondences, error: null })),
  }))

  const quoteUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  }))
  const quoteSelect = vi.fn((columns: string) => {
    // The pricing_incomplete send gate — a quote whose lines aren't all priced must not become a
    // client document quoting a total that summed the unpriced ones as zero.
    if (columns === "status" || columns.includes("journey_class")) {
      return {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              status: quoteStatus,
              journey_class: null,
              rate_audience: null,
              show_train_only_note: null,
            },
            error: null,
          })),
        })),
      }
    }
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
    // Chainable and awaitable: shared email tokens await after .eq(), while the accepted-quote
    // scope lookup chains .eq().eq().order().limit().maybeSingle().
    //
    // The stage gates load quotes with `.order()` and no `.limit()`, and that read is the one that
    // decides whether a quote was ever sent — so it resolves `contextQuotes` while every other
    // path stays empty and leaves the voucher readiness gate unscoped.
    const self: Record<string, unknown> = {}
    self.eq = vi.fn(() => self)
    self.limit = vi.fn(() => self)
    self.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    self.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    self.order = vi.fn(() => {
      const ordered: Record<string, unknown> = {
        limit: vi.fn(() => ordered),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: contextQuotes, error: null }).then(resolve),
      }
      return ordered
    })
    return self
  })

  const documentSelect = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: documentRows, error: null })),
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
                  customer_invoice_number: customerInvoiceNumber,
                  email_import_needs_review: emailImportNeedsReview,
                  email_import_review_resolved_at: null,
                  customer: {
                    email: customerEmail,
                    first_name: customerFirstName,
                    last_name: "Doe",
                    phone: "+27821234567",
                    country: "South Africa",
                  },
                },
                error: null,
              })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }
      if (table === "correspondences") {
        return {
          insert: vi.fn((...args: unknown[]) => {
            correspondenceInsertCount += 1
            if (correspondenceInsertCount === 1) {
              const values = (args[0] ?? {}) as { kind?: string | null; subject?: string; status?: string }
              sentCorrespondences.push({
                id: "cor-1",
                kind: values.kind ?? null,
                subject: values.subject ?? "",
                status: values.status ?? "sent",
                created_at: "2026-05-01T00:00:00.000Z",
              })
              return correspondenceInsertChain(...(args as []))
            }
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
      // The stage gates now read the full evidence set, not just quotes — the gate that refuses
      // `deposit_paid` without a recorded payment reads `payments`, which this route never used to
      // load and so could never enforce.
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  first_name: customerFirstName,
                  last_name: "Doe",
                  email: customerEmail,
                  phone: "+27821234567",
                  country: "South Africa",
                },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: invoiceRows, error: null })),
          })),
        }
      }
      if (table === "payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: paymentRows, error: null })),
          })),
        }
      }
      if (table === "pipeline_history") {
        return { insert: pipelineHistoryInsert }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      if (table === "booking_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            // Chainable and awaitable: reads are ordered by sort_order now (the primary-supplier
            // fallbacks are "first leg in array order"), while resolve-shared-tokens still awaits
            // straight after .eq().
            eq: vi.fn(() => {
              const result = Promise.resolve({ data: [], error: null })
              return Object.assign(result, {
                order: vi.fn(async () => ({ data: [], error: null })),
              })
            }),
          })),
        }
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
    emailMocks.isFallbackSendingUnavailable.mockReset()
    emailMocks.isFallbackSendingUnavailable.mockReturnValue(false)
    senderMocks.resolveSalespersonSender.mockReset()
    senderMocks.resolveSalespersonSender.mockResolvedValue({
      fromAddress: null,
      salespersonCredentialId: null,
      reason: "profile-email",
    })
    quotePdfMocks.ensureQuotePdf.mockReset()
    quotePdfMocks.ensureQuotePdf.mockResolvedValue({
      documentId: "doc-1",
      bookingId: BOOKING_ID,
      // Storage stays keyed on the quote number so quote versions cannot
      // overwrite each other; the customer-visible attachment name does not.
      storagePath: "quotes/LTT-2026-0001-Q1/quote-LTT-2026-0001-Q1.pdf",
      attachmentFilename: "quote-LTT-2026-0001.pdf",
      status: "generated",
      createdAt: "2026-05-01T00:00:00.000Z",
      regenerated: false,
    })
    templateMocks.composeEmail.mockReset()
    templateMocks.composeEmail.mockResolvedValue({
      subject: "Following up on your enquiry — BT-2026-0001",
      bodyHtml: "<html><p>follow up</p></html>",
      bodyContentHtml: "<p>follow up</p>",
      warnings: [],
    })
    emailMocks.sendEmail.mockResolvedValue({
      success: true,
      provider: "mailpit",
      providerMessageId: "pmid",
      error: null,
    })
    libraryMocks.loadLibraryAttachments.mockReset()
    libraryMocks.loadLibraryAttachments.mockResolvedValue([])
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

  it("attaches selected library files to the outgoing email", async () => {
    buildAuth()
    libraryMocks.loadLibraryAttachments.mockResolvedValue([
      { filename: "reservation-form.pdf", contentBase64: "QQ==", contentType: "application/pdf" },
    ])

    const libraryId = "00000000-0000-4000-8000-00000000cccc"
    const res = await POST(
      postJson({ bookingId: BOOKING_ID, subject: "Hello", libraryAttachmentIds: [libraryId] }),
    )

    expect(res.status).toBe(200)
    expect(libraryMocks.loadLibraryAttachments).toHaveBeenCalledWith(expect.anything(), [libraryId])
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "reservation-form.pdf",
            contentType: "application/pdf",
          }),
        ],
      }),
    )
  })

  it("blocks the send when a library attachment cannot be loaded", async () => {
    buildAuth()
    libraryMocks.loadLibraryAttachments.mockRejectedValue(
      new Error('Attachment "fact-sheet.pdf" could not be loaded — email not sent'),
    )

    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Hello",
        libraryAttachmentIds: ["00000000-0000-4000-8000-00000000cccc"],
      }),
    )

    expect(res.status).toBe(502)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
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
    // The send itself is what puts the quote in front of the customer, so by the time the stage
    // moves there is a sent quote on file — the gates now read it rather than taking the move on
    // trust.
    const mocks = buildAuth({
      contextQuotes: [{ id: QUOTE_ID, status: "sent", total: 1000, created_at: "2026-05-01T00:00:00.000Z" }],
    })
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
    // A voucher send only ever happens after the voucher PDF was generated and the invoices were
    // raised and paid, so the gates see all three.
    const mocks = buildAuth({
      bookingStage: "final_paid",
      contextQuotes: [{ id: QUOTE_ID, status: "accepted", total: 1000, created_at: "2026-05-01T00:00:00.000Z" }],
      documentRows: [
        { id: "doc-voucher", kind: "voucher_pdf", status: "generated", created_at: "2026-05-01T00:00:00.000Z" },
      ],
      invoiceRows: [{ id: "inv-1", kind: "full", status: "paid" }],
      paymentRows: [{ amount: 1000 }],
    })
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
    // customerEmail stays present here (the pre-send customer_complete gate
    // below covers that case) so this isolates checkVoucherReadiness's own
    // departure-date check.
    const mocks = buildAuth({ bookingStage: "final_paid", departureDate: null })
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
        failures: [expect.objectContaining({ code: "departure_date_missing" })],
      },
    })
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("blocks voucher send before checking readiness when the customer record is incomplete", async () => {
    // Previously this stage-advancing send bypassed validate-transition's
    // customer_complete gate entirely — a booking missing phone/country
    // could still get its voucher sent and stage moved.
    const mocks = buildAuth({ bookingStage: "final_paid", customerFirstName: null })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Travel voucher BT-2026-0001",
        moveStage: "voucher_sent",
      }),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: "Stage transition blocked",
      details: {
        failures: [expect.objectContaining({ gateId: "customer_complete" })],
      },
    })
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("blocks a deposit-invoice send before it reaches the customer when no invoice number is set", async () => {
    // The exact bug this pre-send gate closes: Generate Invoice → Send could
    // move the booking to Deposit Invoice Sent with no customer_invoice_number,
    // something the Next button on the job page always blocked.
    const mocks = buildAuth({ bookingStage: "accepted", customerInvoiceNumber: null })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Your deposit invoice",
        kind: "invoice",
        moveStage: "deposit_requested",
      }),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: "Stage transition blocked",
      details: {
        failures: [expect.objectContaining({ gateId: "invoice_number_required" })],
      },
    })
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("allows a deposit-invoice send once the invoice number is set", async () => {
    // The invoice is generated before the email that sends it, so the invoice_document gate has
    // something to see by the time the stage moves.
    buildAuth({
      bookingStage: "accepted",
      customerInvoiceNumber: "INV-0042",
      contextQuotes: [{ id: QUOTE_ID, status: "accepted", total: 1000, created_at: "2026-05-01T00:00:00.000Z" }],
      invoiceRows: [{ id: "inv-1", kind: "deposit", status: "draft" }],
    })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Your deposit invoice",
        kind: "invoice",
        moveStage: "deposit_requested",
      }),
    )

    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalled()
    expect(transitionMocks.applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetStage: "deposit_requested" }),
    )
  })

  it("does not gate quote_sent on customer completeness (first outbound touch)", async () => {
    buildAuth({
      customerFirstName: null,
      contextQuotes: [{ id: QUOTE_ID, status: "sent", total: 1000, created_at: "2026-05-01T00:00:00.000Z" }],
    })
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
    expect(emailMocks.sendEmail).toHaveBeenCalled()
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

  it("ensures the quote PDF exists and attaches it to the quote email", async () => {
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
    expect(quotePdfMocks.ensureQuotePdf).toHaveBeenCalledWith(
      expect.anything(),
      QUOTE_ID,
      expect.objectContaining({ actorName: "Jane Doe", actorUserId: "u1" }),
    )
    expect(mocks.storageDownload).toHaveBeenCalledWith("LTT-2026-0001-Q1/quote-LTT-2026-0001-Q1.pdf")
    // The attachment is named from ensureQuotePdf, not derived from the storage
    // path, so the quote number cannot leak through the filename.
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: "quote-LTT-2026-0001.pdf", contentType: "application/pdf" }),
        ]),
      }),
    )
  })

  // QA 11, F11-1. calculateQuoteTotals sums item.total unconditionally, so a quote with an
  // unpriced line totals as though that line were free. The consultant's screen says so; the
  // client document does not — so the send is refused rather than mailing a short total.
  it("refuses to send a quote whose lines are not all priced", async () => {
    buildAuth({ quoteStatus: "pricing_incomplete" })
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Your quote",
        kind: "quote",
        quoteId: QUOTE_ID,
      }),
    )

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("unpriced lines")
    // Refused before anything is rendered or mailed.
    expect(quotePdfMocks.ensureQuotePdf).not.toHaveBeenCalled()
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("returns 500 and does not send when the quote PDF cannot be generated", async () => {
    quotePdfMocks.ensureQuotePdf.mockRejectedValue(new Error("Quote PDF could not be rendered"))
    const mocks = buildAuth()
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        subject: "Your quote",
        kind: "quote",
        quoteId: QUOTE_ID,
      }),
    )

    expect(res.status).toBe(500)
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
  })

  it("routes the send through the salesperson's SMTP credential when configured", async () => {
    senderMocks.resolveSalespersonSender.mockResolvedValue({
      fromAddress: "jane@luxustravel.co.za",
      salespersonCredentialId: "cred-1",
    })
    buildAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hello" }))

    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "jane@luxustravel.co.za",
        salespersonCredentialId: "cred-1",
      }),
    )
  })

  it("returns 503 before rendering the quote PDF when no mailbox is configured", async () => {
    emailMocks.isFallbackSendingUnavailable.mockReturnValue(true)
    senderMocks.resolveSalespersonSender.mockResolvedValue({
      fromAddress: null,
      salespersonCredentialId: null,
      reason: "no-salesperson",
    })
    const mocks = buildAuth()

    const res = await POST(
      postJson({ bookingId: BOOKING_ID, subject: "Your quote", kind: "quote", quoteId: QUOTE_ID }),
    )

    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/no assigned salesperson/i)
    expect(quotePdfMocks.ensureQuotePdf).not.toHaveBeenCalled()
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.correspondenceInsertChain).not.toHaveBeenCalled()
  })

  it("still sends when a salesperson credential exists and no fallback is available", async () => {
    emailMocks.isFallbackSendingUnavailable.mockReturnValue(true)
    senderMocks.resolveSalespersonSender.mockResolvedValue({
      fromAddress: "jane@luxustravel.co.za",
      salespersonCredentialId: "cred-1",
      reason: "credential",
    })
    buildAuth()

    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hello" }))

    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ salespersonCredentialId: "cred-1" }),
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
