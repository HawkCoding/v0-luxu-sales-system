import { beforeEach, describe, expect, it, vi } from "vitest"

const fingerprintMocks = vi.hoisted(() => ({ computeContentFingerprint: vi.fn() }))
vi.mock("@/lib/documents/content-fingerprint", () => ({
  computeContentFingerprint: fingerprintMocks.computeContentFingerprint,
}))

import {
  captureIssuedDocument,
  documentVersionStoragePath,
  issuedDocumentTypeForKind,
  pickIssuedAttachment,
  recordIssuedDocument,
  sha256Hex,
} from "./document-versions"

const BOOKING_ID = "11111111-1111-4111-8111-111111111111"
const PDF_BASE64 = Buffer.from("%PDF-1.4 fake invoice bytes").toString("base64")

function attachment(filename: string, contentBase64 = PDF_BASE64, contentType = "application/pdf") {
  return { filename, contentBase64, contentType }
}

interface ClientOptions {
  existingBySha?: Array<string | null>
  latestVersion?: number | null
  uploadError?: { message?: string; statusCode?: string | number } | null
  insertResults?: Array<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>
  invoiceId?: string | null
}

function makeClient(options: ClientOptions = {}) {
  const existingQueue = [...(options.existingBySha ?? [null])]
  const insertQueue = [...(options.insertResults ?? [{ data: { id: "ver-1" }, error: null }])]
  const insertSpy = vi.fn()
  const uploadSpy = vi.fn(async () => ({ error: options.uploadError ?? null }))
  const correspondenceUpdate = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === "document_versions") {
      return {
        select: vi.fn((columns: string) => {
          const chain: Record<string, unknown> = {}
          chain.eq = vi.fn(() => chain)
          chain.order = vi.fn(() => chain)
          chain.limit = vi.fn(() => chain)
          chain.maybeSingle = vi.fn(async () => {
            if (columns === "version_no") {
              return {
                data: options.latestVersion == null ? null : { version_no: options.latestVersion },
                error: null,
              }
            }
            const id = existingQueue.length > 1 ? existingQueue.shift() : existingQueue[0]
            return { data: id ? { id } : null, error: null }
          })
          return chain
        }),
        insert: vi.fn((row: unknown) => {
          insertSpy(row)
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => insertQueue.shift() ?? { data: null, error: { message: "exhausted" } }),
            })),
          }
        }),
      }
    }
    if (table === "invoices") {
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.in = vi.fn(() => chain)
      chain.neq = vi.fn(() => chain)
      chain.order = vi.fn(() => chain)
      chain.limit = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(async () => ({
        data: options.invoiceId === null ? null : { id: options.invoiceId ?? "inv-1" },
        error: null,
      }))
      return chain
    }
    if (table === "correspondences") {
      return {
        update: vi.fn((values: unknown) => {
          correspondenceUpdate(values)
          return { eq: vi.fn(async () => ({ error: null })) }
        }),
      }
    }
    throw new Error(`Unexpected table ${table}`)
  })

  const client = {
    from,
    storage: { from: vi.fn(() => ({ upload: uploadSpy })) },
  }

  return { client: client as never, insertSpy, uploadSpy, correspondenceUpdate }
}

describe("issuedDocumentTypeForKind", () => {
  it("maps each document-carrying email kind and ignores the rest", () => {
    expect(issuedDocumentTypeForKind("quote")).toBe("quote")
    expect(issuedDocumentTypeForKind("invoice")).toBe("invoice")
    expect(issuedDocumentTypeForKind("payment_received")).toBe("invoice")
    expect(issuedDocumentTypeForKind("payment_reminder")).toBe("invoice")
    expect(issuedDocumentTypeForKind("Voucher")).toBe("voucher")
    expect(issuedDocumentTypeForKind("reservation_received")).toBeNull()
    expect(issuedDocumentTypeForKind("quote_follow_up")).toBeNull()
    expect(issuedDocumentTypeForKind(null)).toBeNull()
  })
})

describe("pickIssuedAttachment", () => {
  it("takes the quote PDF at the front of the list", () => {
    const quote = attachment("Quote-26-0039.pdf")
    expect(pickIssuedAttachment("quote", [quote, attachment("Fact-sheet.pdf")])).toBe(quote)
  })

  it("prefers the invoice-named PDF over other attachments", () => {
    const invoice = attachment("Invoice-244453.pdf")
    expect(pickIssuedAttachment("invoice", [attachment("Rates.pdf"), invoice])).toBe(invoice)
  })

  it("picks the voucher and never the itinerary sent beside it", () => {
    const voucher = attachment("Voucher-244453.pdf")
    expect(pickIssuedAttachment("voucher", [attachment("Itinerary-244453.pdf"), voucher])).toBe(voucher)
    expect(pickIssuedAttachment("voucher", [attachment("Itinerary-244453.pdf")])).toBeNull()
  })

  it("ignores non-PDF attachments", () => {
    expect(pickIssuedAttachment("quote", [attachment("notes.txt", PDF_BASE64, "text/plain")])).toBeNull()
  })
})

describe("captureIssuedDocument", () => {
  it("uploads the exact bytes at a content-addressed path and inserts version 1", async () => {
    const { client, insertSpy, uploadSpy } = makeClient({ latestVersion: null })

    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "invoice",
      attachment: attachment("Invoice-244453.pdf"),
      invoiceId: "inv-1",
      issuedBy: "user-1",
    })

    const sha = sha256Hex(Buffer.from(PDF_BASE64, "base64"))
    expect(id).toBe("ver-1")
    expect(uploadSpy).toHaveBeenCalledWith(
      documentVersionStoragePath(BOOKING_ID, "invoice", sha),
      expect.any(Buffer),
      { contentType: "application/pdf", upsert: false },
    )
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        doc_type: "invoice",
        invoice_id: "inv-1",
        version_no: 1,
        sha256: sha,
        file_name: "Invoice-244453.pdf",
        issue_kind: "sent",
        issued_by: "user-1",
      }),
    )
  })

  it("numbers the next version after the latest one", async () => {
    const { client, insertSpy } = makeClient({ latestVersion: 3 })
    await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "quote",
      attachment: attachment("Quote-26-0039.pdf"),
    })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ version_no: 4 }))
  })

  it("links to the existing version when the same bytes were already issued", async () => {
    const { client, insertSpy, uploadSpy } = makeClient({ existingBySha: ["ver-existing"] })
    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "invoice",
      attachment: attachment("Invoice-244453.pdf"),
    })
    expect(id).toBe("ver-existing")
    expect(uploadSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("returns null without inserting when the upload fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client, insertSpy } = makeClient({ uploadError: { message: "bucket missing", statusCode: 404 } })
    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "invoice",
      attachment: attachment("Invoice-244453.pdf"),
    })
    expect(id).toBeNull()
    expect(insertSpy).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it("treats an already-stored object as success and still records the row", async () => {
    const { client, insertSpy } = makeClient({ uploadError: { message: "The resource already exists", statusCode: 409 } })
    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "invoice",
      attachment: attachment("Invoice-244453.pdf"),
    })
    expect(id).toBe("ver-1")
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it("retries with the next number when a concurrent send took the version", async () => {
    const { client, insertSpy } = makeClient({
      latestVersion: 1,
      existingBySha: [null, null],
      insertResults: [
        { data: null, error: { code: "23505", message: "duplicate key" } },
        { data: { id: "ver-2" }, error: null },
      ],
    })
    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "quote",
      attachment: attachment("Quote-26-0039.pdf"),
    })
    expect(id).toBe("ver-2")
    expect(insertSpy).toHaveBeenCalledTimes(2)
  })

  it("links to the winner when a concurrent send stored the same bytes", async () => {
    const { client } = makeClient({
      existingBySha: [null, "ver-race"],
      insertResults: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
    })
    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "quote",
      attachment: attachment("Quote-26-0039.pdf"),
    })
    expect(id).toBe("ver-race")
  })

  it("never throws, even when the client does", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = {
      from: vi.fn(() => {
        throw new Error("db down")
      }),
      storage: { from: vi.fn() },
    } as never
    await expect(
      captureIssuedDocument(client, {
        bookingId: BOOKING_ID,
        docType: "quote",
        attachment: attachment("Quote-26-0039.pdf"),
      }),
    ).resolves.toBeNull()
    error.mockRestore()
  })

  it("keeps nothing for an empty attachment", async () => {
    const { client, uploadSpy } = makeClient()
    const id = await captureIssuedDocument(client, {
      bookingId: BOOKING_ID,
      docType: "quote",
      attachment: { filename: "Quote.pdf", contentBase64: "", contentType: "application/pdf" },
    })
    expect(id).toBeNull()
    expect(uploadSpy).not.toHaveBeenCalled()
  })
})

describe("recordIssuedDocument", () => {
  beforeEach(() => {
    fingerprintMocks.computeContentFingerprint.mockReset()
    fingerprintMocks.computeContentFingerprint.mockResolvedValue("fp-now")
  })

  it("stores the fingerprint of the booking as it was when the document went out", async () => {
    const { client, insertSpy } = makeClient()
    await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      correspondenceId: "cor-1",
      kind: "quote",
      attachments: [attachment("Quote-26-0039.pdf")],
      quoteId: "quote-1",
    })
    expect(fingerprintMocks.computeContentFingerprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingId: BOOKING_ID, docType: "quote", quoteId: "quote-1" }),
    )
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ content_fingerprint: "fp-now" }))
  })

  it("still keeps the copy, with no fingerprint, when the fingerprint cannot be taken", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    fingerprintMocks.computeContentFingerprint.mockRejectedValue(new Error("travellers: boom"))
    const { client, insertSpy, correspondenceUpdate } = makeClient()

    await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      correspondenceId: "cor-1",
      kind: "quote",
      attachments: [attachment("Quote-26-0039.pdf")],
      quoteId: "quote-1",
    })

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ content_fingerprint: null }))
    expect(correspondenceUpdate).toHaveBeenCalledWith({ document_version_id: "ver-1" })
    error.mockRestore()
  })

  it("can keep a copy without an email: saved, linked to no correspondence, and returns its id", async () => {
    const { client, insertSpy, correspondenceUpdate } = makeClient()
    const id = await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      kind: "invoice",
      attachments: [attachment("Invoice-244453.pdf")],
      issuedBy: "user-1",
      issueKind: "saved",
    })
    expect(id).toBe("ver-1")
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ issue_kind: "saved", issued_by: "user-1" }))
    expect(correspondenceUpdate).not.toHaveBeenCalled()
  })

  it("returns null when nothing could be kept", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = makeClient({ uploadError: { message: "nope", statusCode: 500 } })
    expect(
      await recordIssuedDocument(client, {
        bookingId: BOOKING_ID,
        kind: "quote",
        attachments: [attachment("Quote-26-0039.pdf")],
      }),
    ).toBeNull()
    expect(
      await recordIssuedDocument(client, { bookingId: BOOKING_ID, kind: "reservation_received", attachments: [] }),
    ).toBeNull()
    error.mockRestore()
  })

  it("captures the invoice, linking the live invoice and the email", async () => {
    const { client, insertSpy, correspondenceUpdate } = makeClient({ invoiceId: "inv-9" })
    await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      correspondenceId: "cor-1",
      kind: "invoice",
      attachments: [attachment("Invoice-244453.pdf")],
      issuedBy: "user-1",
    })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ doc_type: "invoice", invoice_id: "inv-9" }))
    expect(correspondenceUpdate).toHaveBeenCalledWith({ document_version_id: "ver-1" })
  })

  it("records the quote against its quote id", async () => {
    const { client, insertSpy } = makeClient()
    await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      correspondenceId: "cor-1",
      kind: "quote",
      attachments: [attachment("Quote-26-0039.pdf")],
      quoteId: "quote-1",
    })
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ doc_type: "quote", quote_id: "quote-1", invoice_id: null, voucher_id: null }),
    )
  })

  it("does nothing for an email kind that carries no document", async () => {
    const { client, insertSpy, uploadSpy, correspondenceUpdate } = makeClient()
    await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      correspondenceId: "cor-1",
      kind: "reservation_received",
      attachments: [attachment("Reservation-form.pdf")],
    })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
    expect(correspondenceUpdate).not.toHaveBeenCalled()
  })

  it("does not link the email when nothing was kept", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client, correspondenceUpdate } = makeClient({ uploadError: { message: "nope", statusCode: 500 } })
    await recordIssuedDocument(client, {
      bookingId: BOOKING_ID,
      correspondenceId: "cor-1",
      kind: "quote",
      attachments: [attachment("Quote-26-0039.pdf")],
    })
    expect(correspondenceUpdate).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
