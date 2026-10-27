// @vitest-environment node
// jsdom breaks @react-pdf font subsetting; production renders run in the Node runtime.
//
// Renders before/after quote and invoice PDFs (and the quote email's price box) for the per-guest
// pricing rows (Carmen item #11), one folder per case, into $PER_GUEST_SAMPLES_DIR. "Before" is
// today's Total per Adult / Total per Child split; "after" is allocatePerGuest. Skipped unless the
// variable is set:
//
//   $env:PER_GUEST_SAMPLES_DIR = "C:\path\to\out"; pnpm vitest run lib/pdf/design-review/render-per-guest
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { FOOTER_BRAND_PRODUCT_LINE } from "@/lib/assets/footer-brand"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { buildDeparture, buildInvoiceItems, invoiceJourneyHeading } from "@/lib/invoices/build-invoice-view"
import { derivePerPersonTotals } from "@/lib/invoices/per-person-totals"
import { renderInvoicePdf } from "@/lib/invoices/render-invoice-pdf"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import { footerCompanyFromBanking } from "@/lib/pdf/sarail-design"
import { buildQuoteJourneyDetails } from "@/lib/quotes/pdf/quote-journey-details"
import { allocatePerGuest } from "@/lib/quotes/per-guest-allocation"
import { buildQuoteSummaryBlock } from "@/lib/quotes/quote-summary-block"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import type { Json } from "@/lib/supabase/types"
import type { PricingSnapshot, PricingUnitRef, SupplierKind } from "@/lib/types"
import { SAMPLE_CUSTOMER, sampleBanking, sampleBrand, sampleServiceBlocks } from "./sample-booking"

const OUT = process.env.PER_GUEST_SAMPLES_DIR

interface SampleLine {
  description: string
  qty: number
  unit_price: number
  total: number
  pricing_snapshot: Json
}

function ref(index: number, adults: number, children = 0): PricingUnitRef {
  return { index, adults, children, infants: 0 }
}

function priced(
  description: string,
  qty: number,
  unitPrice: number,
  snapshot: Partial<PricingSnapshot> & { supplierKind: SupplierKind; legId: string },
): SampleLine {
  const full: PricingSnapshot = {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Showcase",
    legLabel: null,
    supplierId: snapshot.legId,
    supplierName: null,
    routeId: null,
    routeName: null,
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "2027-03-16",
    passengerKind: "adult",
    baseUnitPrice: unitPrice,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...snapshot,
  }
  return {
    description,
    qty,
    unit_price: unitPrice,
    total: Math.round(unitPrice * qty * 100) / 100,
    pricing_snapshot: full as unknown as Json,
  }
}

interface ShowcaseCase {
  folder: string
  tourName: string
  adults: number
  children: number
  childAges: number[]
  suites: number
  nights: number
  lines: SampleLine[]
  blocks: VoucherServiceBlock[]
  /** Quote-level discount, to show the quote (gross) and invoice (net) disagreeing on purpose. */
  discount?: number
}

const blocks = sampleServiceBlocks()
const hotelBlock = blocks.find((block) => block.serviceType === "hotel") as VoucherServiceBlock
const trainBlock = blocks.find((block) => block.serviceType === "train") as VoucherServiceBlock
const transferBlock = blocks.find((block) => block.serviceType === "transfer") as VoucherServiceBlock

function withGuests(block: VoucherServiceBlock, adults: number, children: number, extra: Record<string, unknown> = {}) {
  return {
    ...block,
    serviceData: { ...block.serviceData, guestBreakdown: { adults, children, infants: 0 }, ...extra },
  } as VoucherServiceBlock
}

// (a) Carmen's case: two adults sharing a Rovos Pullman, a third alone at a 35% single supplement,
// and a pre-night hotel priced per room.
const rovosSingle: ShowcaseCase = {
  folder: "a - 2 sharing + 1 single, Rovos + per-room hotel",
  tourName: "Pretoria - Cape Town",
  adults: 3,
  children: 0,
  childAges: [],
  suites: 2,
  nights: 2,
  lines: [
    priced("Rovos Rail — Pullman Suite - Adult", 2, 20_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      unitRefs: [ref(0, 2)],
    }),
    priced("Rovos Rail — Pullman Suite (35% single supplement included) - Adult", 1, 27_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      singleSupplementPct: 35,
      unitRefs: [ref(1, 1)],
    }),
    priced("Ivory Manor Boutique Hotel — Premier Double", 2, 4_728, {
      supplierKind: "hotel_property",
      legId: "leg-ivory",
      unit: "per room per night",
      travelDate: "2027-03-15",
      unitRefs: [ref(0, 2)],
    }),
    priced("Ivory Manor Boutique Hotel — Premier Single", 2, 4_174.5, {
      supplierKind: "hotel_property",
      legId: "leg-ivory",
      unit: "per room per night",
      travelDate: "2027-03-15",
      unitRefs: [ref(1, 1)],
    }),
  ],
  blocks: [
    withGuests(hotelBlock, 3, 0, { numberOfSuites: 2, nights: 2 }),
    withGuests(trainBlock, 3, 0, {
      numberOfSuites: 2,
      itinerarySuiteType: "Pullman Suite",
      itinerarySuiteCounts: [{ label: "Pullman Suite", count: 2 }],
      invoiceSuiteCounts: [{ label: "Pullman Suite", count: 2 }],
    }),
  ],
}

// (b) Kruger Shalati: two adults and two children in one suite priced per room.
const shalatiFamily: ShowcaseCase = {
  folder: "b - 2 adults + 2 children, one per-room Kruger Shalati suite",
  tourName: "Kruger Shalati",
  adults: 2,
  children: 2,
  childAges: [6, 9],
  suites: 1,
  nights: 2,
  lines: [
    priced("Kruger Shalati — Bridge Suite", 2, 39_375, {
      supplierKind: "hotel_property",
      legId: "leg-shalati",
      unit: "per room per night",
      unitRefs: [ref(0, 2, 2)],
    }),
  ],
  blocks: [
    {
      ...withGuests(hotelBlock, 2, 2, { roomType: "Bridge Suite", nights: 2, mealPlan: "Full Board" }),
      title: "Kruger Shalati",
      contactDetails: { name: "Kruger Shalati", location: "Skukuza, Kruger National Park" },
    },
  ],
}

// (c) A family on Rovos: the child's own fare is half the adult's, plus a shared transfer.
const rovosFamily: ShowcaseCase = {
  folder: "c - family, child fare lower than adult fare",
  tourName: "Pretoria - Cape Town",
  adults: 2,
  children: 1,
  childAges: [8],
  suites: 1,
  nights: 2,
  lines: [
    priced("Transfer JHB – APT JHTL", 1, 3_000, {
      supplierKind: "transfers",
      legId: "leg-transfer",
      serviceType: "transfer",
      passengerKind: "service",
      unit: "per vehicle",
      travelDate: "2027-03-15",
    }),
    priced("Rovos Rail — Deluxe Suite - Adult", 2, 30_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      unitRefs: [ref(0, 2, 1)],
    }),
    priced("Rovos Rail — Deluxe Suite - Child", 1, 15_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      passengerKind: "child",
      unitRefs: [ref(0, 2, 1)],
    }),
  ],
  blocks: [withGuests(transferBlock, 2, 1, { passengerCount: 3 }), withGuests(trainBlock, 2, 1)],
}

// (d) Case (a) with a R8 480,50 discount (10%): the quote's rows head the gross price, the
// invoice's add up to the net total — today's split behaves the same way.
const rovosSingleDiscount: ShowcaseCase = {
  ...rovosSingle,
  folder: "d - case a with a 10% discount (quote gross, invoice net)",
  discount: 8_480.5,
}

// (e) A big party: 6 adults + 2 children across four Rovos suites and four hotel rooms (per room),
// with two shared transfers — how long the list gets.
const bigParty: ShowcaseCase = {
  folder: "e - big party, 6 adults + 2 children",
  tourName: "Pretoria - Cape Town",
  adults: 6,
  children: 2,
  childAges: [7, 11],
  suites: 4,
  nights: 2,
  lines: [
    priced("Transfer JHB – APT JHTL", 2, 2_150, {
      supplierKind: "transfers",
      legId: "leg-transfer",
      serviceType: "transfer",
      passengerKind: "service",
      unit: "per vehicle",
      travelDate: "2027-03-15",
    }),
    priced("Rovos Rail — Deluxe Suite - Adult", 6, 30_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      unitRefs: [ref(0, 2), ref(1, 2), ref(2, 1, 1), ref(3, 1, 1)],
    }),
    priced("Rovos Rail — Deluxe Suite - Child", 2, 15_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      passengerKind: "child",
      unitRefs: [ref(2, 1, 1), ref(3, 1, 1)],
    }),
    ...[0, 1, 2, 3].map((index) =>
      priced("Ivory Manor Boutique Hotel — Premier Double", 2, 4_728, {
        supplierKind: "hotel_property",
        legId: "leg-ivory",
        unit: "per room per night",
        travelDate: "2027-03-15",
        unitRefs: [index < 2 ? ref(index, 2) : ref(index, 1, 1)],
      }),
    ),
  ],
  blocks: [
    withGuests(transferBlock, 6, 2, { passengerCount: 8 }),
    withGuests(hotelBlock, 6, 2, { numberOfSuites: 4, nights: 2 }),
    withGuests(trainBlock, 6, 2, {
      numberOfSuites: 4,
      itinerarySuiteCounts: [{ label: "Deluxe Suite", count: 4 }],
      invoiceSuiteCounts: [{ label: "Double Deluxe Suite", count: 4 }],
    }),
  ],
}

// (f) Case b again, but Kruger Shalati entered per person with a child rate (question 1, option B).
const shalatiPerPerson: ShowcaseCase = {
  ...shalatiFamily,
  folder: "f - case b with Shalati entered per person (child rate)",
  lines: [
    priced("Kruger Shalati — Bridge Suite - Adult", 4, 13_125, {
      supplierKind: "hotel_property",
      legId: "leg-shalati",
      unit: "per person per night",
      unitRefs: [ref(0, 2, 2)],
    }),
    priced("Kruger Shalati — Bridge Suite - Child", 4, 6_562.5, {
      supplierKind: "hotel_property",
      legId: "leg-shalati",
      unit: "per person per night",
      passengerKind: "child",
      unitRefs: [ref(0, 2, 2)],
    }),
  ],
}

// (g) Two friends share a Rovos suite but take separate hotel rooms (question 6).
const shareTrainNotHotel: ShowcaseCase = {
  folder: "g - share the train, separate hotel rooms",
  tourName: "Pretoria - Cape Town",
  adults: 2,
  children: 0,
  childAges: [],
  suites: 1,
  nights: 2,
  lines: [
    priced("Rovos Rail — Pullman Suite - Adult", 2, 20_000, {
      supplierKind: "train_operator",
      legId: "leg-rovos",
      unit: "per person sharing",
      unitRefs: [ref(0, 2)],
    }),
    ...[0, 1].map((index) =>
      priced("Ivory Manor Boutique Hotel — Premier Single", 2, 4_174.5, {
        supplierKind: "hotel_property",
        legId: "leg-ivory",
        unit: "per room per night",
        travelDate: "2027-03-15",
        unitRefs: [ref(index, 1)],
      }),
    ),
  ],
  blocks: [withGuests(hotelBlock, 2, 0, { numberOfSuites: 2, nights: 2 }), withGuests(trainBlock, 2, 0)],
}

const CASES = [
  rovosSingle,
  shalatiFamily,
  rovosFamily,
  rovosSingleDiscount,
  bigParty,
  shalatiPerPerson,
  shareTrainNotHotel,
]

describe.skipIf(!OUT)("render per-guest pricing showcase", { timeout: 120_000 }, () => {
  it.each(CASES)("renders $folder", async (sample) => {
    const dir = path.join(OUT as string, sample.folder)
    mkdirSync(dir, { recursive: true })
    const brand = { ...sampleBrand(), heading: FOOTER_BRAND_PRODUCT_LINE }
    const brandLogo = await loadBrandLogo(null)
    const company = footerCompanyFromBanking(sampleBanking())

    const subtotal = Math.round(sample.lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100
    const discount = sample.discount ?? 0
    const total = Math.round((subtotal - discount) * 100) / 100
    const pax = { adults: sample.adults, children: sample.children }

    const quoteRows = allocatePerGuest({ lines: sample.lines, ...pax, childAges: sample.childAges, target: subtotal })
    const invoiceRows = allocatePerGuest({ lines: sample.lines, ...pax, childAges: sample.childAges, target: total })
    expect(quoteRows).not.toBeNull()
    expect(invoiceRows).not.toBeNull()

    const primary = sample.blocks.find((block) => block.serviceType === "train") ?? sample.blocks[0]
    for (const variant of ["before", "after"] as const) {
      const quote = await renderQuotePdf({
        quoteNumber: "LTT-26-0040-Q1",
        customerName: SAMPLE_CUSTOMER.name,
        customerPhone: SAMPLE_CUSTOMER.phone,
        customerEmail: SAMPLE_CUSTOMER.email,
        quoteDate: "2026-10-26",
        validUntil: null,
        journeyStart: "2027-03-15",
        journeyEnd: "2027-03-18",
        ...pax,
        payingPax: pax,
        journeyDetails: buildQuoteJourneyDetails(primary, sample.tourName),
        total,
        subtotal,
        discount,
        discountVisible: true,
        perPersonTotals: derivePerPersonTotals({ lines: sample.lines, ...pax, total: subtotal }),
        perGuestRows: variant === "after" ? quoteRows : null,
        itineraryBlocks: sample.blocks,
        title: "QUOTATION",
        footerText: "This quotation is subject to availability. Prices are quoted in {{currency}}.",
        packageIncludesHeading: "Travel Package Includes",
        packageExcludesHeading: "Your Package Excludes",
        packageExcludesDefault: "Services not mentioned.",
        brand,
        brandLogo,
        company,
      })
      writeFileSync(path.join(dir, `Quote - ${variant}.pdf`), quote)

      const deposit = Math.round(total * 0.25 * 100) / 100
      const invoice = await renderInvoicePdf({
        invoiceNumber: "42790",
        bookingNumber: "LTT-26-0040",
        customerName: "Mr Hancke le Roux",
        issueDate: "2026-10-26",
        dueDate: null,
        consultant: "CD",
        guestNames: [],
        billing: { addressLines: ["13 Epsom Road", "Langebaan, WC", "7357", "South Africa"] },
        departure: buildDeparture([primary], invoiceJourneyHeading("Your Journey", "train_operator"), {
          tourName: sample.tourName,
          durationNights: sample.nights,
          durationUnit: null,
          suites: sample.suites,
          ...pax,
        }),
        items: buildInvoiceItems(sample.lines, sample.blocks),
        totals: {
          subtotalInclVat: subtotal,
          discount,
          discountVisible: true,
          totalInclVat: total,
          depositPercentage: 25,
          depositAmount: deposit,
          finalAmount: Math.round((total - deposit) * 100) / 100,
          finalDueDate: "2027-01-15",
          amountReceived: 0,
          outstanding: total,
          ...derivePerPersonTotals({ lines: sample.lines, ...pax, total }),
          perGuestRows: variant === "after" ? invoiceRows : null,
        },
        currency: "ZAR",
        statusLabel: "Provisional",
        banking: sampleBanking(),
        paymentNote:
          "Email proof of payment directly to your consultant. Reservations can only be confirmed once payment has been received.",
        bankChargesNote: "Amounts transferred should exclude all bank charges.",
        brand,
        brandLogo,
      })
      writeFileSync(path.join(dir, `Invoice - ${variant}.pdf`), invoice)

      const email = buildQuoteSummaryBlock({
        quoteNumber: "LTT-26-0040-Q1",
        quoteDate: "2026-10-26",
        validUntil: null,
        journeyStart: "2027-03-15",
        journeyEnd: "2027-03-18",
        ...pax,
        total,
        subtotal,
        discount,
        discountVisible: true,
        itineraryBlocks: [],
        perGuestRows: variant === "after" ? quoteRows : null,
      })
      writeFileSync(
        path.join(dir, `Email price box - ${variant}.html`),
        `<!doctype html><meta charset="utf-8"><body style="font-family:Arial,sans-serif;max-width:640px;margin:24px auto">${email}</body>`,
      )

      for (const buffer of [quote, invoice]) expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    }

    writeFileSync(
      path.join(dir, "rows.json"),
      JSON.stringify(
        {
          subtotal,
          discount,
          total,
          before: {
            quote: derivePerPersonTotals({ lines: sample.lines, ...pax, total: subtotal }),
            invoice: derivePerPersonTotals({ lines: sample.lines, ...pax, total }),
          },
          after: { quote: quoteRows, invoice: invoiceRows },
        },
        null,
        2,
      ),
    )
  })
})
