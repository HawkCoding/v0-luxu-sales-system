// @vitest-environment node
// jsdom breaks @react-pdf font subsetting; production renders run in the Node runtime.
//
// Renders the quote, invoice, voucher and itinerary for one real-shaped booking into
// $PDF_SAMPLES_DIR, for a side-by-side check against the designer's templates (Figma "SA-Rail new
// Templates"). Skipped unless the variable is set:
//
//   $env:PDF_SAMPLES_DIR = "C:\path\to\out"; pnpm vitest run lib/pdf/design-review
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { FOOTER_BRAND_PRODUCT_LINE } from "@/lib/assets/footer-brand"
import { buildDeparture, buildInvoiceItems, invoiceJourneyHeading } from "@/lib/invoices/build-invoice-view"
import { derivePerPersonTotals } from "@/lib/invoices/per-person-totals"
import { renderInvoicePdf } from "@/lib/invoices/render-invoice-pdf"
import { renderItineraryPdf } from "@/lib/itinerary/render-pdf"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import { footerCompanyFromBanking } from "@/lib/pdf/sarail-design"
import { buildQuoteJourneyDetails } from "@/lib/quotes/pdf/quote-journey-details"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import type { Json } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import { renderVoucherPdf } from "@/lib/voucher/render-pdf"
import {
  SAMPLE_BOOKING_NUMBER,
  SAMPLE_CUSTOMER,
  SAMPLE_DISCOUNT,
  SAMPLE_GUESTS,
  SAMPLE_INVOICE_NUMBER,
  SAMPLE_SUBTOTAL,
  SAMPLE_TOTAL,
  sampleBanking,
  sampleBrand,
  sampleQuoteLineItems,
  sampleServiceBlocks,
  sampleVoucherData,
  sampleVoucherTemplate,
} from "./sample-booking"

const OUT = process.env.PDF_SAMPLES_DIR

/**
 * The document text as Settings hold it once migration 20260927090000_sarail_pdf_redesign_copy has
 * run (and as the code defaults now read). The invoice's journey heading is the unchanged global
 * "Your Journey".
 */
const DESIGN_SETTINGS = {
  brandHeading: FOOTER_BRAND_PRODUCT_LINE,
  includesHeading: "Travel Package Includes",
  quoteFooterText: "This quotation is subject to availability. Prices are quoted in {{currency}}.",
  journeyHeading: "Your Journey",
  // Invoice Terms wording as migration 20261002090000_invoice_terms_copy sets it.
  paymentNote:
    "Email proof of payment directly to your consultant. Reservations can only be confirmed once payment has been received.",
  bankChargesNote: "Amounts transferred should exclude all bank charges.",
}

describe.skipIf(!OUT)("render design-review samples", { timeout: 60_000 }, () => {
  it("renders the quote, invoice, voucher and itinerary", async () => {
    const dir = OUT as string
    mkdirSync(dir, { recursive: true })
    const brand = { ...sampleBrand(), heading: DESIGN_SETTINGS.brandHeading }
    const brandLogo = await loadBrandLogo(null)
    const blocks = sampleServiceBlocks()
    const company = footerCompanyFromBanking(sampleBanking())

    const quote = await renderQuotePdf({
      quoteNumber: `${SAMPLE_BOOKING_NUMBER}-Q1`,
      customerName: SAMPLE_CUSTOMER.name,
      customerPhone: SAMPLE_CUSTOMER.phone,
      customerEmail: SAMPLE_CUSTOMER.email,
      quoteDate: "2026-09-20",
      validUntil: null,
      journeyStart: "2027-03-16",
      journeyEnd: "2027-03-25",
      adults: 2,
      children: 0,
      journeyDetails: buildQuoteJourneyDetails(blocks[2], "Golf Safari"),
      total: SAMPLE_TOTAL,
      perPersonTotals: derivePerPersonTotals({
        lines: sampleQuoteLineItems(),
        adults: 2,
        children: 0,
        total: SAMPLE_TOTAL,
      }),
      subtotal: SAMPLE_SUBTOTAL,
      discount: SAMPLE_DISCOUNT,
      discountVisible: true,
      itineraryBlocks: blocks,
      title: "QUOTATION",
      footerText: DESIGN_SETTINGS.quoteFooterText,
      packageIncludesHeading: DESIGN_SETTINGS.includesHeading,
      packageExcludesHeading: "Your Package Excludes",
      packageExcludesDefault: "Services not mentioned.",
      brand,
      brandPosition: "top",
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Quote-26-0035.pdf"), quote)

    const deposit = Math.round(SAMPLE_TOTAL * 0.25 * 100) / 100
    const invoice = await renderInvoicePdf({
      invoiceNumber: SAMPLE_INVOICE_NUMBER,
      bookingNumber: SAMPLE_BOOKING_NUMBER,
      customerName: "Mr Hancke le Roux",
      issueDate: "2026-09-27",
      dueDate: null,
      consultant: "CD",
      guestNames: SAMPLE_GUESTS,
      billing: {
        companyName: null,
        addressLines: ["49 Mitchell Ave", "New Castle-Upon-Tyme", "NE1 7RU", "United Kingdom"],
        phone: SAMPLE_CUSTOMER.phone,
        email: SAMPLE_CUSTOMER.email,
        vatNumber: null,
      },
      departure: buildDeparture([blocks[2]], invoiceJourneyHeading(DESIGN_SETTINGS.journeyHeading, "train_operator"), {
        tourName: "Golf Safari",
        durationNights: 9,
        durationUnit: null,
        suites: 1,
        adults: 2,
        children: 0,
      }),
      items: buildInvoiceItems(sampleQuoteLineItems(), blocks),
      totals: {
        subtotalInclVat: SAMPLE_SUBTOTAL,
        discount: SAMPLE_DISCOUNT,
        discountVisible: true,
        totalInclVat: SAMPLE_TOTAL,
        depositPercentage: 25,
        depositAmount: deposit,
        finalAmount: Math.round((SAMPLE_TOTAL - deposit) * 100) / 100,
        finalDueDate: "2027-01-16",
        amountReceived: SAMPLE_TOTAL,
        amountReceivedAt: "2026-09-27",
        outstanding: 0,
        ...derivePerPersonTotals({
          lines: sampleQuoteLineItems(),
          adults: 2,
          children: 0,
          total: SAMPLE_TOTAL,
        }),
      },
      currency: "ZAR",
      statusLabel: "Guaranteed",
      banking: sampleBanking(),
      paymentNote: DESIGN_SETTINGS.paymentNote,
      bankChargesNote: DESIGN_SETTINGS.bankChargesNote,
      brand,
      brandPosition: "top",
      brandLogo,
    })
    writeFileSync(path.join(dir, "Invoice-42752.pdf"), invoice)

    // A family of six: Guest 3–6 rows, and a per-adult/per-child split priced off adult and child
    // fares, with the per-vehicle airport shuttle shared pro rata to those fares.
    const familyLines = sampleQuoteLineItems()
      .filter((row) => {
        const snapshot = row.pricing_snapshot as unknown as PricingSnapshot
        return snapshot.supplierKind === "train_operator" || snapshot.routeName === "JHB – APT JHTL"
      })
      .flatMap((row) => {
        if ((row.pricing_snapshot as unknown as PricingSnapshot).supplierKind !== "train_operator") return [row]
        const snapshot = row.pricing_snapshot as unknown as PricingSnapshot
        return [
          { ...row, qty: 4, total: row.unit_price * 4, pricing_snapshot: { ...snapshot, unit: "per person sharing" } as unknown as Json },
          {
            ...row,
            description: `${row.description} - Child`,
            qty: 2,
            unit_price: 95974.38,
            total: 191948.76,
            pricing_snapshot: { ...snapshot, passengerKind: "child", unit: "per person sharing" } as unknown as Json,
          },
        ]
      })
    const familyTotal = familyLines.reduce((sum, row) => sum + row.total, 0)
    const familyInvoice = await renderInvoicePdf({
      invoiceNumber: SAMPLE_INVOICE_NUMBER,
      bookingNumber: SAMPLE_BOOKING_NUMBER,
      customerName: "Mr Hancke le Roux",
      issueDate: "2026-09-27",
      dueDate: null,
      consultant: "CD",
      guestNames: [...SAMPLE_GUESTS, "Mr Steyn van Coller", "Mrs June van Coller", "Miss Anna van Coller", "Master Jan van Coller"],
      billing: {
        addressLines: ["13 Epsom Road", "Long Acres Country Estate", "Langebaan, WC", "7357", "South Africa"],
        phone: SAMPLE_CUSTOMER.phone,
        email: SAMPLE_CUSTOMER.email,
      },
      departure: buildDeparture([blocks[2]], invoiceJourneyHeading(DESIGN_SETTINGS.journeyHeading, "train_operator"), {
        tourName: "Golf Safari",
        durationNights: 9,
        durationUnit: null,
        suites: 3,
        adults: 4,
        children: 2,
      }),
      items: buildInvoiceItems(familyLines, blocks),
      totals: {
        subtotalInclVat: familyTotal,
        depositPercentage: 25,
        depositAmount: Math.round(familyTotal * 0.25 * 100) / 100,
        finalAmount: Math.round(familyTotal * 0.75 * 100) / 100,
        finalDueDate: "2027-01-16",
        amountReceived: 0,
        outstanding: familyTotal,
        ...derivePerPersonTotals({ lines: familyLines, adults: 4, children: 2, total: familyTotal }),
      },
      banking: sampleBanking(),
      paymentNote: DESIGN_SETTINGS.paymentNote,
      bankChargesNote: DESIGN_SETTINGS.bankChargesNote,
      brand,
      brandLogo,
    })
    writeFileSync(path.join(dir, "Invoice-family.pdf"), familyInvoice)

    // The same family on the quote: two rooms, three suites of two types, a flight with its fare
    // cap, and the per-adult/per-child rows under "Total for 4 Adults & 2 Children incl. VAT".
    const familyBlocks = blocks.map((block) =>
      block.serviceType === "hotel"
        ? { ...block, serviceData: { ...block.serviceData, itinerarySuiteCounts: [{ label: "Premier Suite Room", count: 2 }] } }
        : block.serviceType === "train"
          ? {
              ...block,
              serviceData: {
                ...block.serviceData,
                itinerarySuiteCounts: [
                  { label: "Deluxe Suite", count: 2 },
                  { label: "Royal Suite", count: 1 },
                ],
              },
            }
          : block,
    )
    familyBlocks.unshift({
      serviceType: "airline",
      title: "Airlink",
      displayOrder: -1,
      clockTime: "10:00",
      contactDetails: { name: "Airlink" },
      serviceData: {
        flightNumber: "4Z492",
        route: "Cape Town INT Airport → OR Tambo INT Airport",
        cabin: "Economy",
        departureDate: "2027-03-15",
        arrivalDate: "2027-03-15",
        startTime: "10:00",
        endTime: "11:45",
      },
    })
    const familyQuote = await renderQuotePdf({
      quoteNumber: `${SAMPLE_BOOKING_NUMBER}-Q1`,
      customerName: SAMPLE_CUSTOMER.name,
      customerPhone: SAMPLE_CUSTOMER.phone,
      customerEmail: SAMPLE_CUSTOMER.email,
      quoteDate: "2026-09-20",
      validUntil: null,
      journeyStart: "2027-03-15",
      journeyEnd: "2027-03-25",
      adults: 4,
      children: 2,
      journeyDetails: buildQuoteJourneyDetails(familyBlocks[3], "Golf Safari"),
      total: familyTotal,
      subtotal: familyTotal,
      perPersonTotals: derivePerPersonTotals({ lines: familyLines, adults: 4, children: 2, total: familyTotal }),
      flightCapPerPerson: 4100,
      itineraryBlocks: familyBlocks,
      title: "QUOTATION",
      footerText: DESIGN_SETTINGS.quoteFooterText,
      packageIncludesHeading: DESIGN_SETTINGS.includesHeading,
      packageExcludesHeading: "Your Package Excludes",
      packageExcludesDefault: "Services not mentioned.",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Quote-family.pdf"), familyQuote)

    const voucher = await renderVoucherPdf({
      data: sampleVoucherData(),
      template: sampleVoucherTemplate(),
      docTitle: "TRAVEL VOUCHERS",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Voucher-26-0035.pdf"), voucher)

    const itinerary = await renderItineraryPdf({
      data: {
        bookingNumber: SAMPLE_BOOKING_NUMBER,
        tripTitle: "Rovos Rail Golf Safari",
        tripNotes: "",
        guestNames: "Mr Hancke le Roux, Mrs Jean Adams",
        departure: "16 March 2027",
        consultantName: "Carmen de Jager",
        serviceBlocks: blocks,
      },
      template: sampleVoucherTemplate(),
      journeyHeading: "Your Journey",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Itinerary-26-0035.pdf"), itinerary)

    for (const buffer of [quote, invoice, voucher, itinerary]) {
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    }
  })

  // The multipage rules: the quote's first section flows across pages and its details section
  // starts a fresh page; voucher blocks never split; the letterhead prints on page one only and
  // the company footer on the last page only.
  it("renders long, multi-page variants", async () => {
    const dir = path.join(OUT as string, "multi-page")
    mkdirSync(dir, { recursive: true })
    const brand = { ...sampleBrand(), heading: DESIGN_SETTINGS.brandHeading }
    const brandLogo = await loadBrandLogo(null)
    const company = footerCompanyFromBanking(sampleBanking())
    const shift = (iso: string | null | undefined, days: number) => {
      if (!iso) return iso
      const date = new Date(`${iso}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    }
    // The booking five times over, a fortnight apart: 25 services across ten weeks.
    const blocks = [0, 14, 28, 42, 56].flatMap((offset, round) =>
      sampleServiceBlocks().map((block) => ({
        ...block,
        displayOrder: block.displayOrder + round * 10,
        serviceData: {
          ...block.serviceData,
          departureDate: shift(block.serviceData.departureDate, offset),
          arrivalDate: shift(block.serviceData.arrivalDate, offset),
        },
      })),
    )

    const quote = await renderQuotePdf({
      quoteNumber: `${SAMPLE_BOOKING_NUMBER}-Q1`,
      customerName: SAMPLE_CUSTOMER.name,
      customerPhone: SAMPLE_CUSTOMER.phone,
      customerEmail: SAMPLE_CUSTOMER.email,
      quoteDate: "2026-09-20",
      validUntil: null,
      journeyStart: "2027-03-16",
      journeyEnd: "2027-05-20",
      adults: 2,
      children: 0,
      journeyDetails: buildQuoteJourneyDetails(blocks[2], "Golf Safari"),
      total: SAMPLE_TOTAL * 5,
      subtotal: SAMPLE_SUBTOTAL * 5,
      discount: SAMPLE_DISCOUNT * 5,
      itineraryBlocks: blocks,
      title: "QUOTATION",
      footerText: DESIGN_SETTINGS.quoteFooterText,
      packageIncludesHeading: DESIGN_SETTINGS.includesHeading,
      packageExcludesDefault: "Services not mentioned.",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Quote-long.pdf"), quote)

    const voucher = await renderVoucherPdf({
      data: { ...sampleVoucherData(), serviceBlocks: blocks },
      template: sampleVoucherTemplate(),
      docTitle: "TRAVEL VOUCHERS",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Voucher-long.pdf"), voucher)

    // Every priced line of all five rounds twice over (adult and child lines), each dated on its own
    // round's legs — long enough that the description table itself breaks across pages.
    const lineItems = [0, 0, 14, 14, 28, 28, 42, 42, 56, 56].flatMap((offset) =>
      sampleQuoteLineItems().map((row) => {
        const snapshot = row.pricing_snapshot as unknown as PricingSnapshot
        return {
          ...row,
          pricing_snapshot: { ...snapshot, travelDate: shift(snapshot.travelDate, offset) } as unknown as Json,
        }
      }),
    )
    const total = SAMPLE_TOTAL * 10
    const deposit = Math.round(total * 0.25 * 100) / 100
    const invoice = await renderInvoicePdf({
      invoiceNumber: SAMPLE_INVOICE_NUMBER,
      bookingNumber: SAMPLE_BOOKING_NUMBER,
      customerName: "Mr Hancke le Roux",
      issueDate: "2026-09-27",
      dueDate: null,
      consultant: "CD",
      guestNames: [...SAMPLE_GUESTS, "Mr Third Guest", "Ms Fourth Guest"],
      billing: { addressLines: ["49 Mitchell Ave", "New Castle-Upon-Tyme", "United Kingdom"] },
      // With its journey block, so the long table has to spill onto a second page.
      departure: buildDeparture([blocks[2]], invoiceJourneyHeading(DESIGN_SETTINGS.journeyHeading, "train_operator"), {
        tourName: "Golf Safari",
        durationNights: 9,
        durationUnit: null,
        suites: 1,
        adults: 2,
        children: 0,
      }),
      items: buildInvoiceItems(lineItems, blocks),
      totals: {
        subtotalInclVat: total,
        depositPercentage: 25,
        depositAmount: deposit,
        finalAmount: Math.round((total - deposit) * 100) / 100,
        finalDueDate: "2027-01-16",
        amountReceived: 0,
        outstanding: total,
      },
      banking: sampleBanking(),
      paymentNote: DESIGN_SETTINGS.paymentNote,
      bankChargesNote: DESIGN_SETTINGS.bankChargesNote,
      brand,
      brandLogo,
    })
    writeFileSync(path.join(dir, "Invoice-long.pdf"), invoice)

    // A block taller than a page (the one case a voucher block may break) and a details section
    // longer than a page.
    const [train] = sampleServiceBlocks().filter((block) => block.serviceType === "train")
    const longInclusions = Array.from({ length: 90 }, (_, index) =>
      index % 15 === 0 ? `# Section ${index / 15 + 1}:` : `Inclusion line ${index} with enough words to read like a real one`,
    )
    const giantTrain = {
      ...train,
      serviceData: { ...train.serviceData, notes: "Operational note. ".repeat(260), inclusions: longInclusions },
    }
    const oversizeVoucher = await renderVoucherPdf({
      data: { ...sampleVoucherData(), serviceBlocks: [...sampleServiceBlocks().slice(0, 2), giantTrain] },
      template: sampleVoucherTemplate(),
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Voucher-oversize-block.pdf"), oversizeVoucher)

    // Four services: the last box ends low on page one, so "End Of Services" must move with it
    // rather than open page two on its own.
    const closingLineVoucher = await renderVoucherPdf({
      data: { ...sampleVoucherData(), serviceBlocks: sampleServiceBlocks().slice(0, 4) },
      template: sampleVoucherTemplate(),
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Voucher-closing-line.pdf"), closingLineVoucher)

    const longDetailsQuote = await renderQuotePdf({
      quoteNumber: `${SAMPLE_BOOKING_NUMBER}-Q1`,
      customerName: SAMPLE_CUSTOMER.name,
      customerPhone: SAMPLE_CUSTOMER.phone,
      customerEmail: SAMPLE_CUSTOMER.email,
      quoteDate: "2026-09-20",
      validUntil: null,
      journeyStart: "2027-03-16",
      journeyEnd: "2027-03-25",
      adults: 2,
      children: 0,
      journeyDetails: buildQuoteJourneyDetails(giantTrain, "Golf Safari"),
      total: SAMPLE_TOTAL,
      itineraryBlocks: [...sampleServiceBlocks().filter((block) => block.serviceType !== "train"), giantTrain],
      title: "QUOTATION",
      footerText: DESIGN_SETTINGS.quoteFooterText,
      packageIncludesHeading: DESIGN_SETTINGS.includesHeading,
      packageExcludesDefault: "Services not mentioned.",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Quote-long-details.pdf"), longDetailsQuote)

    const oversizeItinerary = await renderItineraryPdf({
      data: {
        bookingNumber: SAMPLE_BOOKING_NUMBER,
        tripTitle: "Rovos Rail Golf Safari",
        tripNotes: "",
        guestNames: "Mr Hancke le Roux, Mrs Jean Adams",
        departure: "16 March 2027",
        consultantName: "Carmen de Jager",
        serviceBlocks: [...sampleServiceBlocks().slice(0, 2), giantTrain],
      },
      template: sampleVoucherTemplate(),
      journeyHeading: DESIGN_SETTINGS.journeyHeading,
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Itinerary-oversize-block.pdf"), oversizeItinerary)

    for (const buffer of [quote, voucher, invoice, oversizeVoucher, longDetailsQuote, oversizeItinerary]) {
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    }
  })
})
