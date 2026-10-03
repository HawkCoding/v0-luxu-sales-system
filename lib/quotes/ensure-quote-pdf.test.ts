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

describe("ensureQuotePdf headcounts", () => {
  it("prints the booking's own Guests counts but labels the total and divides per person by the paying pax", async () => {
    vi.resetModules()
    const renderQuotePdf = vi.fn(async () => Buffer.from("%PDF-1.4"))
    const resolveSupplierAgeBuckets = vi.fn(async () => ({ infantMax: 2, childMax: 12 }))
    vi.doMock("@/lib/quotes/render-quote-pdf", () => ({ renderQuotePdf }))
    vi.doMock("@/lib/packages/passenger-totals", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/packages/passenger-totals")>()),
      resolveSupplierAgeBuckets,
    }))
    vi.doMock("@/lib/quotes/load-quote-config", () => ({
      loadQuoteConfig: vi.fn(async () => ({
        primarySupplierId: "supplier-quote-primary",
        unresolved: [],
        journeyClass: null,
        rateAudience: "international",
      })),
      overridesFromQuoteRow: vi.fn(() => ({})),
    }))
    vi.doMock("@/lib/voucher/build-service-blocks", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/voucher/build-service-blocks")>()),
      buildVoucherServiceBlocks: vi.fn(async () => ({ blocks: [] })),
    }))
    vi.doMock("@/lib/suppliers/load-supplier-kind", () => ({ loadSupplierKind: vi.fn(async () => "train_operator") }))
    vi.doMock("@/lib/settings-access", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/settings-access")>()),
      getDocumentTextSettings: vi.fn(async () => ({})),
      getDocumentBrandSettings: vi.fn(async () => ({})),
    }))
    vi.doMock("@/lib/pdf/brand-logo", () => ({ loadBrandLogo: vi.fn(async () => null) }))
    vi.doMock("@/lib/pdf/document-footer-company", () => ({ loadDocumentFooterCompany: vi.fn(async () => ({})) }))
    vi.doMock("@/lib/documents/upsert-generated-document", () => ({
      upsertGeneratedDocument: vi.fn(async () => ({ id: "doc-1", booking_id: "booking-1", status: "draft", created_at: "" })),
    }))
    vi.doMock("@/lib/error-log", () => ({ logError: vi.fn() }))

    const snapshot = (passengerKind: string, unit: string, legId = "leg-train") => ({
      source: "pricing_engine",
      pricingMode: "rate_card",
      legId,
      passengerKind,
      unit,
      commission: null,
    })
    const results: Record<string, unknown> = {
      quotes: {
        data: {
          id: "quote-1",
          booking_id: "booking-1",
          quote_number: "LTT-26-0001-Q1",
          total: 107_100,
          subtotal: 107_100,
          created_at: "2026-10-02T00:00:00Z",
          pdf_document_id: null,
          booking: {
            id: "booking-1",
            booking_number: "LTT-26-0001",
            // 2 adults + children aged 1, 8 and 15: 3 paying adults, 1 child, 1 free infant.
            no_of_adults: 2,
            no_of_children: 3,
            child_ages: [1, 8, 15],
            primary_supplier_id: "supplier-booking-primary",
            route: null,
            customer: null,
          },
        },
        error: null,
      },
      quote_line_items: {
        data: [
          { total: 90_000, unit_price: 30_000, pricing_snapshot: snapshot("adult", "per person sharing") },
          { total: 15_000, unit_price: 15_000, pricing_snapshot: snapshot("child", "per person sharing") },
          { total: 0, unit_price: 0, pricing_snapshot: snapshot("infant", "per person sharing") },
          { total: 2_100, unit_price: 2_100, pricing_snapshot: snapshot("adult", "per vehicle", "leg-transfer") },
        ],
        error: null,
      },
    }
    const supabase = {
      from: vi.fn((table: string) => {
        const result = results[table] ?? { data: null, error: null }
        const chain: Record<string, unknown> = {}
        for (const method of ["select", "eq", "order", "update", "insert", "in"]) chain[method] = vi.fn(() => chain)
        chain.single = vi.fn(async () => result)
        chain.maybeSingle = vi.fn(async () => result)
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
        return chain
      }),
      storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ error: null })) })) },
    }

    const { ensureQuotePdf } = await import("./ensure-quote-pdf")
    await ensureQuotePdf(supabase as never, "quote-1", { actorName: "Test", actorUserId: "user-1", force: true })

    expect(resolveSupplierAgeBuckets).toHaveBeenCalledWith(expect.anything(), "supplier-quote-primary")
    const [data] = renderQuotePdf.mock.calls[0] as unknown as [
      {
        adults: number
        children: number
        payingPax: { adults: number; children: number }
        perPersonTotals: { perAdult: number | null; perChild: number | null }
      },
    ]
    // Guests row: the booking's own counts, infant included, as the e-mail/invoice/voucher print.
    expect([data.adults, data.children]).toEqual([2, 3])
    // Total label and per-person rows: the paying projection.
    expect(data.payingPax).toEqual({ adults: 3, children: 1 })
    expect(data.perPersonTotals).toEqual({ perAdult: 30_600, perChild: 15_300 })

    for (const path of [
      "@/lib/quotes/render-quote-pdf",
      "@/lib/packages/passenger-totals",
      "@/lib/quotes/load-quote-config",
      "@/lib/voucher/build-service-blocks",
      "@/lib/suppliers/load-supplier-kind",
      "@/lib/settings-access",
      "@/lib/pdf/brand-logo",
      "@/lib/pdf/document-footer-company",
      "@/lib/documents/upsert-generated-document",
      "@/lib/error-log",
    ]) {
      vi.doUnmock(path)
    }
    vi.resetModules()
  })
})

describe("legacyQuoteObjectPath", () => {
  it("rebuilds the pre-rename lowercase key so older documents rows are re-pointed, not duplicated", async () => {
    const { legacyQuoteObjectPath } = await import("./ensure-quote-pdf")

    expect(legacyQuoteObjectPath("LTT-2026-0038-Q1")).toBe("LTT-2026-0038-Q1/quote-LTT-2026-0038-Q1.pdf")
  })
})
