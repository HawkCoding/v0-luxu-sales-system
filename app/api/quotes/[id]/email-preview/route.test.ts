import { beforeEach, describe, expect, it, vi } from "vitest"

// Regression test for the divergence this fix closes: before it, this route derived the summary
// label and {{departureDate}} without ever asking the primary supplier's kind, so a hotel-primary
// quote with a transfer extra previewed "Journey:" dated off the transfer, while the sent email
// (resolveSharedEmailTokens) already said "Stay:" dated off the hotel. Everything not central to
// that wiring -- quote-summary-block's own label logic, resolveSharedEmailTokens' own token
// resolution, the DB layer -- is mocked or stubbed rather than re-verified here.

const supabaseMocks = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: vi.fn(async () => buildSupabase()),
}))

const quoteConfigMocks = vi.hoisted(() => ({
  loadQuoteConfig: vi.fn(),
  loadQuoteDisplayTokens: vi.fn(),
  overridesFromQuoteRow: vi.fn(() => ({ journeyClass: null, rateAudience: null, showTrainOnlyNote: null })),
}))
vi.mock("@/lib/quotes/load-quote-config", () => quoteConfigMocks)

const resolvePrimaryRouteMocks = vi.hoisted(() => ({
  resolvePrimaryRoute: vi.fn(() => ({ routeName: null, source: "none" })),
}))
vi.mock("@/lib/quotes/resolve-primary-route", () => resolvePrimaryRouteMocks)

const loadSupplierKindMocks = vi.hoisted(() => ({ loadSupplierKind: vi.fn() }))
vi.mock("@/lib/suppliers/load-supplier-kind", () => loadSupplierKindMocks)

const summaryBlockMocks = vi.hoisted(() => ({ buildQuoteSummaryBlock: vi.fn(() => "SUMMARY_STUB") }))
vi.mock("@/lib/quotes/quote-summary-block", () => summaryBlockMocks)

const settingsMocks = vi.hoisted(() => ({
  getDocumentTextSettings: vi.fn(async () => ({
    quote_doc_includes_heading: "Your Package Includes",
    quote_doc_excludes_heading: "Your Package Excludes",
    quote_doc_excludes_default: "",
  })),
}))
vi.mock("@/lib/settings-access", () => settingsMocks)

const sharedTokensMocks = vi.hoisted(() => ({
  resolveSharedEmailTokens: vi.fn(async () => ({
    tokens: { direction: "—" },
    blocks: {},
    primarySupplierId: null,
  })),
  isPlaceholderToken: (value: string | null | undefined) => !value?.trim() || value.trim() === "—",
}))
vi.mock("@/lib/templates/resolve-shared-tokens", () => sharedTokensMocks)

const composeEmailMocks = vi.hoisted(() => ({
  composeEmail: vi.fn(async (..._args: unknown[]) => ({
    subject: "Your quote",
    bodyHtml: "<html></html>",
    bodyContentHtml: "<div></div>",
    warnings: [],
    signatureProfileId: null,
    signatureBrandId: null,
  })),
}))
vi.mock("@/lib/templates/compose-email", () => composeEmailMocks)

// mapSupplierKindToServiceType stays real -- it is the exact mapping this fix depends on, so
// faking it would hide a regression rather than catch one. Only the DB-backed block builder mocks.
const voucherBlocksMocks = vi.hoisted(() => ({ buildVoucherServiceBlocks: vi.fn() }))
vi.mock("@/lib/voucher/build-service-blocks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voucher/build-service-blocks")>()
  return { ...actual, buildVoucherServiceBlocks: voucherBlocksMocks.buildVoucherServiceBlocks }
})

import { POST } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-00000000eeee"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const HOTEL_SUPPLIER_ID = "00000000-0000-4000-8000-0000000hote1"

// The hotel checks in on 2026-08-10; a transfer extra it carries picks up on 2026-08-12. Before
// this fix, deriveTrainDepartureFromBlocks always looked for a "train" block, found none, and the
// route fell back to journey.start (the transfer's own date, since it's the only dated leg found
// by deriveJourneyFromBlocks alongside the hotel checkout).
const HOTEL_BLOCK = {
  serviceType: "hotel" as const,
  title: "Kruger Shalati",
  contactDetails: { name: "Kruger Shalati" },
  serviceData: { departureDate: "2026-08-10", arrivalDate: "2026-08-12", nights: 2 },
  displayOrder: 0,
}
const TRANSFER_BLOCK = {
  serviceType: "transfer" as const,
  title: "Airport transfer",
  contactDetails: { name: "Luxus Chauffeur" },
  serviceData: { departureDate: "2026-08-12" },
  displayOrder: 1,
}

function buildSupabase() {
  return {
    auth: { getUser: supabaseMocks.getUser },
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: QUOTE_ID,
                  booking_id: BOOKING_ID,
                  quote_number: "LTT-2026-0001-Q1",
                  validity_until: "2026-08-01",
                  subtotal: 50000,
                  total: 50000,
                  agent_commission: 0,
                  currency: "ZAR",
                  created_at: "2026-07-01T00:00:00.000Z",
                  journey_class: null,
                  rate_audience: null,
                  show_train_only_note: null,
                  booking: {
                    booking_number: "LTT-2026-0001",
                    no_of_adults: 2,
                    no_of_children: 0,
                    assigned_salesperson_id: "u1",
                    route: null,
                    hotel_supplier: null,
                    customer: { title: "Mr", first_name: "Jane", last_name: "Kluever" },
                  },
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "quote_line_items") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  { description: "Stay", supplier_description: null, qty: 1, unit_price: 50000, total: 50000, pricing_snapshot: null },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "suppliers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: "Kruger Shalati" }, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function baseQuoteConfig() {
  return {
    primarySupplierId: HOTEL_SUPPLIER_ID,
    primarySupplierSource: "booking",
    primaryCandidateIds: [HOTEL_SUPPLIER_ID],
    primaryRouteId: null,
    primaryTrainRateTypeId: null,
    journeyClass: null,
    rateAudience: null,
    trainOnly: false,
    auto: { journeyClass: true, rateAudience: true, trainOnly: true },
    unresolved: [],
  }
}

describe("POST /api/quotes/[id]/email-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@example.com" } } })
    quoteConfigMocks.loadQuoteConfig.mockResolvedValue(baseQuoteConfig())
    quoteConfigMocks.loadQuoteDisplayTokens.mockResolvedValue({ rateLabel: null, trainOnlyNote: null })
    loadSupplierKindMocks.loadSupplierKind.mockResolvedValue("hotel_property")
    voucherBlocksMocks.buildVoucherServiceBlocks.mockResolvedValue({ blocks: [HOTEL_BLOCK, TRANSFER_BLOCK] })
  })

  it("previews a hotel-primary quote as Stay, dated off the hotel leg -- not the transfer", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: QUOTE_ID }),
    })

    expect(res.status).toBe(200)
    expect(loadSupplierKindMocks.loadSupplierKind).toHaveBeenCalledWith(expect.anything(), HOTEL_SUPPLIER_ID)

    // The summary block is named after the primary product, matching the sent-email path.
    expect(summaryBlockMocks.buildQuoteSummaryBlock).toHaveBeenCalledWith(
      expect.objectContaining({ primarySupplierKind: "hotel_property" }),
    )

    // {{departureDate}} is the hotel's check-in (2026-08-10), not the transfer's pickup
    // (2026-08-12) that journey.start would have picked before this fix.
    const composeArgs = composeEmailMocks.composeEmail.mock.calls[0][2] as {
      tokens: Record<string, string>
    }
    expect(composeArgs.tokens.departureDate).toBe("10 August 2026")
    expect(composeArgs.tokens.departureDateShort).toBe("10 Aug 2026")
  })

  it("keeps dating off the train leg for a rail-primary booking (regression guard)", async () => {
    loadSupplierKindMocks.loadSupplierKind.mockResolvedValue("train_operator")
    voucherBlocksMocks.buildVoucherServiceBlocks.mockResolvedValue({
      blocks: [
        { ...HOTEL_BLOCK, serviceData: { departureDate: "2026-08-08", arrivalDate: "2026-08-10", nights: 2 } },
        {
          serviceType: "train" as const,
          title: "Rovos Rail",
          contactDetails: { name: "Rovos Rail" },
          serviceData: { departureDate: "2026-08-10", arrivalDate: "2026-08-12" },
          displayOrder: 1,
        },
      ],
    })

    await POST(new Request("http://localhost", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: QUOTE_ID }),
    })

    expect(summaryBlockMocks.buildQuoteSummaryBlock).toHaveBeenCalledWith(
      expect.objectContaining({ primarySupplierKind: "train_operator" }),
    )
    const composeArgs = composeEmailMocks.composeEmail.mock.calls[0][2] as {
      tokens: Record<string, string>
    }
    expect(composeArgs.tokens.departureDate).toBe("10 August 2026")
  })
})
