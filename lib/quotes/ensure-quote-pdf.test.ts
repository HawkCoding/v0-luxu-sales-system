import { describe, expect, it, vi } from "vitest"

// The customer-visible attachment name is the one place the quote number used
// to leak even when the document body hid it, so it is asserted directly.
describe("buildAttachmentFilename", () => {
  it("names the file after the short booking reference, without the quote version", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("LTT-26-0039-Q1", "LTT-26-0039")).toBe("Quote-26-0039.pdf")
    expect(buildAttachmentFilename("LTT-26-0039-Q3", "LTT-26-0039")).toBe("Quote-26-0039.pdf")
  })

  it("shortens a legacy 4-digit-year booking number the same way", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("LTT-2026-0038-Q2", "LTT-2026-0038")).toBe("Quote-26-0038.pdf")
  })

  it("falls back to the quote number (version stripped) when the booking number is unavailable", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("LTT-26-0039-Q1", null)).toBe("Quote-26-0039.pdf")
    expect(buildAttachmentFilename("LTT-2026-0001-Q1", "")).toBe("Quote-26-0001.pdf")
  })

  it("sanitizes characters that are unsafe in a storage path or filename", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("Q1", "LTT/2026 0001")).toBe("Quote-LTT_2026_0001.pdf")
  })

  it("never carries the quote version, even when the reference is re-enabled", async () => {
    vi.resetModules()
    vi.doMock("@/lib/feature-flags", () => ({
      QUOTE_REFERENCE_ENABLED: true,
      QUOTE_VALIDITY_ENABLED: false,
      BACKUPS_ENABLED: false,
    }))

    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")
    expect(buildAttachmentFilename("LTT-26-0001-Q1", "LTT-26-0001")).toBe("Quote-26-0001.pdf")

    vi.doUnmock("@/lib/feature-flags")
    vi.resetModules()
  })
})

describe("ensureQuotePdf with a pre-rename stored PDF", () => {
  it("reuses the stored legacy file instead of re-rendering it, attaching it under the new name", async () => {
    vi.resetModules()
    const renderQuotePdf = vi.fn()
    vi.doMock("@/lib/quotes/render-quote-pdf", () => ({ renderQuotePdf }))

    const legacyPath = "quotes/LTT-2026-0038-Q1/quote-LTT-2026-0038-Q1.pdf"
    const upload = vi.fn()
    const supabase = {
      from: vi.fn((table: string) => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () =>
            table === "quotes"
              ? {
                  data: {
                    id: "quote-1",
                    booking_id: "booking-1",
                    quote_number: "LTT-2026-0038-Q1",
                    pdf_document_id: "doc-1",
                    booking: { id: "booking-1", booking_number: "LTT-2026-0038" },
                  },
                  error: null,
                }
              : { data: null, error: { message: `unexpected ${table}` } },
          ),
          maybeSingle: vi.fn(async () =>
            table === "documents"
              ? {
                  data: {
                    id: "doc-1",
                    booking_id: "booking-1",
                    kind: "quote_pdf",
                    status: "sent",
                    storage_path: legacyPath,
                    created_at: "2026-09-01T00:00:00Z",
                  },
                  error: null,
                }
              : { data: null, error: null },
          ),
        }
        return chain
      }),
      storage: { from: vi.fn(() => ({ upload })) },
    }

    const { ensureQuotePdf } = await import("./ensure-quote-pdf")
    const ensured = await ensureQuotePdf(supabase as never, "quote-1", {
      actorName: "Test",
      actorUserId: "user-1",
    })

    expect(ensured).toMatchObject({
      documentId: "doc-1",
      storagePath: legacyPath,
      attachmentFilename: "Quote-26-0038.pdf",
      regenerated: false,
    })
    expect(renderQuotePdf).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()

    vi.doUnmock("@/lib/quotes/render-quote-pdf")
    vi.resetModules()
  })
})

describe("legacyQuoteObjectPath", () => {
  it("rebuilds the pre-rename lowercase key so older documents rows are re-pointed, not duplicated", async () => {
    const { legacyQuoteObjectPath } = await import("./ensure-quote-pdf")

    expect(legacyQuoteObjectPath("LTT-2026-0038-Q1")).toBe("LTT-2026-0038-Q1/quote-LTT-2026-0038-Q1.pdf")
  })
})
