// @vitest-environment node
// jsdom breaks @react-pdf font subsetting; production renders run in the Node runtime.
//
// Renders the pax-group documents for Carmen's six-suite booking (lib/pax-groups/carmen-sample
// .fixtures.ts) with the real renderers — quote PDF, invoice PDF, the quote email's price panel and
// the deposit email's GUEST DETAILS / AVAILABILITY / per-suite lines — once at full price and once
// with a 10% discount, into $PAX_GROUP_SAMPLES_DIR. Skipped unless the variable is set:
//
//   $env:PAX_GROUP_SAMPLES_DIR = "C:\path\to\out"; pnpm vitest run lib/pdf/design-review/render-pax-group
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { FOOTER_BRAND_PRODUCT_LINE } from "@/lib/assets/footer-brand"
import { brandedEmailToPlainText } from "@/lib/email/plain-text"
import {
  buildDeparture,
  buildInvoiceItems,
  invoiceJourneyHeading,
  numberedGuestCells,
} from "@/lib/invoices/build-invoice-view"
import { renderInvoicePdf } from "@/lib/invoices/render-invoice-pdf"
import {
  buildAvailabilityHtml,
  buildBookingPaxGroupsView,
  buildGuestHeadings,
} from "@/lib/pax-groups/booking-pax-groups"
import {
  CARMEN_DEPARTURE,
  CARMEN_RATE_LABELS,
  CARMEN_SUBTOTAL,
  carmenPaxGroupRows,
  carmenQuoteLines,
  carmenServiceBlocks,
  carmenTravellers,
} from "@/lib/pax-groups/carmen-sample.fixtures"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import { footerCompanyFromBanking } from "@/lib/pdf/sarail-design"
import { allocatePaxGroups } from "@/lib/quotes/pax-group-pricing"
import { buildQuoteJourneyDetails } from "@/lib/quotes/pdf/quote-journey-details"
import { buildPaxGroupPricingRows, buildQuoteSummaryBlock } from "@/lib/quotes/quote-summary-block"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import { blockScopeTagger } from "@/lib/quotes/resolve-pax-group-pricing"
import { buildGuestInfoBlock, childAgesForTravellers } from "@/lib/templates/guest-info-block"
import { sampleBanking, sampleBrand } from "./sample-booking"

const OUT = process.env.PAX_GROUP_SAMPLES_DIR

/** Typed suite names long enough to wrap even the quote's full-width line — the alignment check. */
const LONG_LABELS: Record<string, string> = {
  g2: "Twin Deluxe Suite 2 for Mr & Mrs Chen (parents travelling with Hao and Yun)",
  g4: "Twin Deluxe Suite 4 — the Lin family's grandparents, joining from Taipei",
}

const CASES = [
  { folder: "a - Carmen 6 suites", discount: 0, longLabels: false },
  { folder: "b - Carmen 6 suites with a 10% discount", discount: CARMEN_SUBTOTAL * 0.1, longLabels: false },
  { folder: "c - long typed suite names (wrapping check)", discount: 0, longLabels: true },
]

/** The lines with two suites renamed (a consultant-typed label) on every primary-leg snapshot. */
function withLongLabels(lines: ReturnType<typeof carmenQuoteLines>): ReturnType<typeof carmenQuoteLines> {
  return lines.map((line) => {
    const snapshot = line.pricing_snapshot as unknown as { paxGroups?: Array<{ id: string; position: number; label: string }> }
    if (!snapshot.paxGroups) return line
    return {
      ...line,
      pricing_snapshot: {
        ...snapshot,
        paxGroups: snapshot.paxGroups.map((group) => ({ ...group, label: LONG_LABELS[group.id] ?? group.label })),
      } as unknown as typeof line.pricing_snapshot,
    }
  })
}

function emailShell(title: string, body: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body style="margin:0;background:#f4f1ec;"><div style="max-width:640px;margin:24px auto;padding:24px 28px;background:#fff;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#312b24;">${body}</div></body></html>`
  )
}

const heading = (text: string) =>
  `<p style="margin:18px 0 8px;color:#172018;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${text}</p>`

describe.skipIf(!OUT)("render pax-group samples", { timeout: 120_000 }, () => {
  it.each(CASES)("renders $folder", async ({ folder, discount, longLabels }) => {
    const dir = path.join(OUT as string, folder)
    mkdirSync(dir, { recursive: true })
    const brand = { ...sampleBrand(), heading: FOOTER_BRAND_PRODUCT_LINE }
    const brandLogo = await loadBrandLogo(null)
    const company = footerCompanyFromBanking(sampleBanking())

    const lines = longLabels ? withLongLabels(carmenQuoteLines()) : carmenQuoteLines()
    const blocks = carmenServiceBlocks()
    const subtotal = CARMEN_SUBTOTAL
    const total = Math.round((subtotal - discount) * 100) / 100
    const booked = { adults: 8, children: 4 }
    // Both documents print the suites on the GROSS subtotal (DESIGN §6).
    const pricing = allocatePaxGroups({ lines, target: subtotal, rateLabels: CARMEN_RATE_LABELS })
    expect(pricing?.lines).toHaveLength(6)
    const scopeTag = blockScopeTagger(lines, "Suite")
    const train = blocks[0]

    const quote = await renderQuotePdf({
      quoteNumber: "LTT-26-0052-Q1",
      customerName: "Mr Chen",
      customerPhone: "+27 82 555 0100",
      customerEmail: "jun.chen@example.com",
      quoteDate: "2026-06-01",
      validUntil: null,
      journeyStart: CARMEN_DEPARTURE,
      journeyEnd: "2026-08-15",
      ...booked,
      payingPax: booked,
      journeyDetails: buildQuoteJourneyDetails(train, "Pretoria to Cape Town"),
      total,
      subtotal,
      discount,
      discountVisible: true,
      paxGroupPricing: pricing,
      itineraryScopeTag: scopeTag,
      itineraryBlocks: blocks,
      title: "QUOTATION",
      footerText: "This quotation is subject to availability. Prices are quoted in {{currency}}.",
      packageIncludesHeading: "Travel Package Includes",
      packageExcludesHeading: "Your Package Excludes",
      packageExcludesDefault: "Services not mentioned.",
      brand,
      brandLogo,
      company,
    })
    writeFileSync(path.join(dir, "Quote.pdf"), quote)

    const travellers = carmenTravellers()
    const nameOf = (traveller: (typeof travellers)[number]) =>
      [traveller.prefix, traveller.first_name, traveller.last_name].join(" ")
    const deposit = Math.round(total * 0.25 * 100) / 100
    const invoice = await renderInvoicePdf({
      invoiceNumber: "42810",
      bookingNumber: "LTT-26-0052",
      customerName: "Mr Jun Chen",
      issueDate: "2026-06-03",
      dueDate: null,
      consultant: "CD",
      guestNames: travellers.map(nameOf),
      numberedGuests: numberedGuestCells(travellers, carmenPaxGroupRows().groupRows.map((group) => ({ id: group.id, position: group.position })), nameOf),
      billing: { addressLines: ["13 Epsom Road", "Langebaan, WC", "7357", "South Africa"], phone: "+27 82 555 0100", email: "jun.chen@example.com" },
      departure: buildDeparture([train], invoiceJourneyHeading("Your Journey", "train_operator"), {
        tourName: "Pretoria to Cape Town",
        durationNights: 2,
        durationUnit: null,
        suites: 6,
        ...booked,
      }),
      // As ensure-invoice-pdf prints a booking with per-suite prices: rows that print alike, once.
      items: buildInvoiceItems(lines, blocks, [], "Suite", true),
      totals: {
        paxGroupNoun: "Suite",
        subtotalInclVat: subtotal,
        discount,
        discountVisible: true,
        totalInclVat: total,
        depositPercentage: 25,
        depositAmount: deposit,
        finalAmount: Math.round((total - deposit) * 100) / 100,
        finalDueDate: "2026-06-11",
        amountReceived: 0,
        outstanding: total,
        paxGroupPricing: pricing,
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
    writeFileSync(path.join(dir, "Invoice.pdf"), invoice)

    const quoteEmail = buildQuoteSummaryBlock({
      quoteNumber: "LTT-26-0052-Q1",
      quoteDate: "2026-06-01",
      validUntil: null,
      journeyStart: CARMEN_DEPARTURE,
      journeyEnd: "2026-08-15",
      ...booked,
      total,
      subtotal,
      discount,
      discountVisible: true,
      paxGroupPricing: pricing,
      itineraryScopeTag: scopeTag,
      itineraryBlocks: blocks,
      packageExcludesDefault: "Services not mentioned.",
    })
    const { groupRows, services, primarySupplierId } = carmenPaxGroupRows()
    const view = buildBookingPaxGroupsView(groupRows, services, primarySupplierId)
    expect(view).not.toBeNull()
    if (!view) return
    // Carmen's Quote Email template with {{availability}} in her AVAILABILITY paragraph and
    // {{paxGroupPricing}} as its own paragraph after "Quotation …", as she adds them on go-live.
    const quoteEmailHtml = emailShell(
      "Quote email",
      `<p>Dear Mr Chen,</p><p>Thank you for your enquiry.</p>` +
        `${heading("Availability")}<p style="margin:0 0 8px;">${buildAvailabilityHtml(view)}</p>` +
        `${heading("Quotation")}<p style="margin:0 0 8px;">Please find your travel quotation attached.</p>` +
        `<div style="margin:0 0 8px;">${buildPaxGroupPricingRows(pricing, "ZAR", { standalone: true })}</div>` +
        quoteEmail,
    )
    writeFileSync(path.join(dir, "Quote email.html"), quoteEmailHtml)
    writeFileSync(path.join(dir, "Quote email (plain text).txt"), brandedEmailToPlainText(quoteEmailHtml))
    const childAges = childAgesForTravellers(travellers, [8, 10, 7, 7], CARMEN_DEPARTURE)
    const guestInfo = buildGuestInfoBlock({
      customerName: "Mr Chen",
      customerEmail: null,
      guests: travellers.map((traveller, index) => ({
        name: nameOf(traveller),
        dateOfBirth: traveller.date_of_birth,
        countryCode: traveller.residence,
        idNumber: traveller.id_passport,
        paxGroupId: traveller.pax_group_id,
        isChild: traveller.is_child,
        childAge: childAges[index],
      })),
      ...booked,
      paxGroups: { groups: view.groups, headings: buildGuestHeadings(view) },
    })
    const depositEmailHtml = emailShell(
      "Deposit email",
      `<p>Dear Mr Chen,</p><p>Thank you for confirming your booking. Your deposit invoice is attached.</p>` +
        `${heading("Guest details")}<p style="margin:0 0 8px;">Please ensure that all details match those on the ID or passport.</p>${guestInfo}` +
        `<p style="margin:0 0 8px;"><strong>Reservation/Itinerary details</strong></p>` +
        `${heading("Availability")}<p style="margin:0 0 8px;">${buildAvailabilityHtml(view)}</p>` +
        `${heading("Quotation")}${buildPaxGroupPricingRows(pricing, "ZAR", { standalone: true })}`,
    )
    writeFileSync(path.join(dir, "Deposit email - guest details.html"), depositEmailHtml)
    writeFileSync(path.join(dir, "Deposit email - guest details (plain text).txt"), brandedEmailToPlainText(depositEmailHtml))

    writeFileSync(path.join(dir, "pricing.json"), JSON.stringify({ subtotal, discount, total, pricing }, null, 2))
    for (const buffer of [quote, invoice]) expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-")
  })
})
