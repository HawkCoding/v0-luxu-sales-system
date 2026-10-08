// @vitest-environment node
// Text extraction runs pdf.js, which needs the node environment (jsdom trips the
// "No PDFJS.workerSrc specified" path).
import { describe, expect, it } from "vitest"
import type { InvoiceBillingParty, InvoicePdfData, InvoiceTotals } from "./pdf/invoice-document"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { buildDeparture } from "./build-invoice-view"
import { extractPdfPageTexts, extractPdfText } from "@/lib/pdf/extract-text.fixtures"
import { makeBankingSettings } from "@/lib/settings-access.fixtures"
import { renderInvoicePdf } from "./render-invoice-pdf"

const banking = makeBankingSettings({
  bank_name: "Example Bank",
  bank_account_name: "Luxus Travel & Tours",
  bank_account_number: "1234567890",
  bank_branch_code: "250655",
  bank_swift_code: "EXAMZAJJ",
  company_address: "1 Rail Road, Pretoria",
  company_reg_number: "2020/000000/07",
  company_vat_number: "4000000000",
  company_tel: "+27 12 000 0000",
  company_email: "info@example.co.za",
})

const depositTotals: InvoiceTotals = {
  subtotalInclVat: 58900,
  depositPercentage: 25,
  depositAmount: 14725,
  finalAmount: 44175,
  finalDueDate: "2026-07-19",
  amountReceived: 0,
  amountReceivedAt: null,
  outstanding: 58900,
}

const departure = {
  productLabel: "Train",
  trainName: "The Blue Train",
  tourName: "Cape Town Journey",
  daysLabel: "2 Nights / 3 Days",
  qty: "1",
  adults: "2",
  children: "0",
  legs: [
    {
      heading: "Luxury Train Departure Information",
      rows: [
        { left: { label: "Route", value: "Pretoria → Cape Town" }, right: null },
        { left: { label: "Departure Date", value: "20 July 2026 at 13h00" }, right: null },
        { left: { label: "Arrival Date", value: "22 July 2026 at 18h00" }, right: null },
        {
          left: { label: "Suite Type", value: "Twin Deluxe with Shower" },
          right: { label: "Qty", value: "1" },
        },
      ],
    },
  ],
}

const items = [
  { pax: 2, description: "Cape Town Journey — Deluxe Suite", unitPrice: 29450, total: 58900 },
]

interface TextRun {
  str: string
  x: number
  y: number
}

/** Every text run on page one with its x and baseline — for the layout assertions extractPdfText's
 *  joined lines can't express (which cells share a row, which share a column). */
async function pageOneRuns(buffer: Buffer): Promise<TextRun[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise
  const content = await (await document.getPage(1)).getTextContent()
  return content.items.flatMap((item) =>
    "str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : [],
  )
}

function runOf(runs: TextRun[], str: string): TextRun {
  const run = runs.find((candidate) => candidate.str === str)
  if (!run) throw new Error(`"${str}" is not on page one`)
  return run
}

/** The first non-blank run drawn after `label` — that label's value cell. */
function valueAfter(runs: TextRun[], label: string): TextRun {
  const index = runs.findIndex((run) => run.str === label)
  const value = index < 0 ? undefined : runs.slice(index + 1).find((run) => run.str.trim())
  if (!value) throw new Error(`no value after "${label}" on page one`)
  return value
}

/** The extracted line a totals row prints on — label and amount share a baseline, so one line. */
function lineIndex(text: string, prefix: string): number {
  return text.split("\n").findIndex((line) => line.startsWith(prefix))
}

const FAMILY_GUESTS = [
  "Mrs Rachel O'Brien",
  "Mr Sean O'Brien",
  "Mr Steyn van Coller",
  "Mrs June van Coller",
  "Miss Anna van Coller",
  "Master Jan van Coller",
]

const EIGHT_GUESTS = [...FAMILY_GUESTS, "Mr Piet van Coller", "Mrs Sarie van Coller"]

/**
 * A densely filled real invoice: a full billing block whose five-line address soft-wraps its first
 * line, a journey, six dated lines, the deposit due and both per-person rows. It sits at the
 * one-page limit — 2 guests leave ~1.5pt, 3–4 guests ~21pt and 5–6 guests ~7.5pt (Company, VAT,
 * Phone and E-mail move to the right beside the Address), and 7–8 guests run ~6pt over.
 */
function denseInvoice(guestNames: string[]): InvoicePdfData {
  return {
    invoiceNumber: "LTT-2026-0001-INV",
    bookingNumber: "LTT-2026-0001",
    customerName: "Rachel O'Brien",
    guestNames,
    issueDate: "2026-07-12",
    dueDate: "2026-07-19",
    departure: { ...departure, adults: "4", children: "2" },
    // A real booking's six dated lines: flight, transfer, hotel, transfer, train, transfer.
    items: [
      { ...items[0], description: "FlySafair — Cape Town INT Airport → OR Tambo INT Airport", date: "2026-07-18", time: "09:40" },
      { ...items[0], description: "Transfer JHB - APT PHTL", date: "2026-07-18", time: "11:50" },
      { ...items[0], description: "Irene Country Hotel — Breakfast", date: "2026-07-18", time: "14:00" },
      { ...items[0], description: "Transfer PTY - STA PHTL", date: "2026-07-20", time: "11:00" },
      { ...items[0], description: "Blue Train — Pretoria → Cape Town", date: "2026-07-20", time: "13:00" },
      { ...items[0], description: "Transfer CPT STA - V&A Waterfront", date: "2026-07-22", time: "18:30" },
    ],
    // The client's own invoice shape (deposit due, nothing received yet) with both per-person rows.
    totals: {
      subtotalInclVat: 62_600,
      depositPercentage: 25,
      depositAmount: 15_650,
      finalAmount: 46_950,
      finalDueDate: "2026-07-19",
      amountReceived: 0,
      amountReceivedAt: null,
      outstanding: 62_600,
      perAdult: 12_520,
      perChild: 6_260,
    },
    banking,
    bankChargesNote: "Amounts transferred should exclude all bank charges.",
    paymentNote:
      "Email proof of payment directly to your consultant. Reservations can only be confirmed once payment has been received.",
    billing: {
      companyName: "JPS",
      // Deliberately long first line so it soft-wraps inside the value column.
      addressLines: [
        "7 Fulmar Close, Sandgebaan Estate, Western Cape Province",
        "Sandgebaan",
        "Cape Town, WC",
        "7535",
        "South Africa",
      ],
      phone: "+353871234567",
      email: "rachel.obrien@eircom.ie",
      vatNumber: "112223456",
    },
  }
}

// A real react-pdf render takes a few seconds and overran the 5 s default under a loaded full run.
describe("renderInvoicePdf smoke", { timeout: 20_000 }, () => {
  it("renders the confirmation invoice with banking, departure, guests and line items", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      guestNames: ["Ms Jane Smith", "Mr John Smith"],
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      consultant: "LB",
      statusLabel: "Provisional",
      departure,
      items,
      totals: depositTotals,
      banking,
    })

    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")

    const text = await extractPdfText(buffer)
    expect(text).toContain("Pretoria → Cape Town")
    expect(text).not.toContain("Pretoria ’ Cape Town")
    // The reference sentence soft-wraps inside the Terms column, so match it without line breaks.
    expect(text.replace(/\s+/g, " ")).toContain("Please use reference LTT-2026-0001-INV when making payment.")
    expect(text).toContain("LTT-2026-0001-INV")
    expect(text).not.toContain("Payable by")
    expect(text).not.toContain("Commission")
  })

  it("renders the brand letterhead unbroken and the invoice identity fields below it", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      consultant: "LB",
      statusLabel: "Provisional",
      departure: null,
      items,
      totals: depositTotals,
      banking,
    })

    const text = await extractPdfText(buffer)
    // extractPdfText starts a new line whenever the text baseline changes, so a
    // heading that wraps onto a second line would break this substring match.
    expect(text).toContain(FOOTER_BRAND_PRODUCT_LINE)
    expect(text).toContain(FOOTER_BRAND_DIVISION_LINE)
    expect(text).toContain("Invoice No:")
    expect(text).toContain("LTT-2026-0001-INV")
    expect(text).toContain("Provisional")
    expect(text).toContain("Consultant")
    expect(text).toContain("LB")
  })

  it("renders a densely filled real invoice — full address, six guests, journey, per-person rows — on one page", async () => {
    const buffer = await renderInvoicePdf(denseInvoice(FAMILY_GUESTS))

    const text = await extractPdfText(buffer)
    // Every address line must survive: the stacked lines used to collapse into
    // one line's height and paint over the Phone row.
    expect(text).toContain("Sandgebaan")
    expect(text).toContain("Cape Town, WC")
    expect(text).toContain("South Africa")
    expect(text).toContain("+353871234567")
    expect(text).toContain("rachel.obrien@eircom.ie")
    expect(text).toContain("112223456")
    expect(text).toContain("7535")
    // The postal code sits in the address block — no separate "Code:" row any more.
    expect(text).not.toContain("Code:")
    expect(text).toContain("Guest 6:")
    expect(text).toContain("Total per Adult:")
    expect(text).toContain("Total per Child:")
    // The taller header (brand block + meta strip stacked, vs. the old side-by-side
    // layout), the guest rows, the time column and the per-person rows must not push this
    // densely-filled invoice onto a second page.
    expect((await extractPdfPageTexts(buffer)).length).toBe(1)
  })

  it("fits 8 guests with a long wrapping address on one page, footer included", async () => {
    // These used to take two pages: the Terms and Bank block carried the last-page footer's
    // clearance with it. The footer now sits on page one under a fixed margin, so it fits.
    const buffer = await renderInvoicePdf(denseInvoice(EIGHT_GUESTS))

    const pages = await extractPdfPageTexts(buffer)
    expect(pages).toHaveLength(1)
    const [first] = pages
    expect(first).toContain("Guest 8:")
    expect(first).toContain("OUTSTANDING AMOUNT:")
    expect(first).toContain("Terms and Conditions:")
    expect(first).toContain("Bank Details for EFT:")
    expect(first.split("Company Registration")).toHaveLength(2)
  })

  it("splits a longer invoice cleanly, with the company footer on the first page only", async () => {
    const buffer = await renderInvoicePdf({
      ...denseInvoice(EIGHT_GUESTS),
      items: Array.from({ length: 14 }, (_, index) => ({ ...items[0], description: `Service line ${index + 1}` })),
    })

    const pages = await extractPdfPageTexts(buffer)
    expect(pages).toHaveLength(2)
    const [first, second] = pages
    // The Terms and Bank block moves across as one piece.
    expect(first).not.toContain("Terms and Conditions:")
    expect(second).toContain("Terms and Conditions:")
    expect(second).toContain("Bank Details for EFT:")
    expect(first.split("Company Registration")).toHaveLength(2)
    expect(second).not.toContain("Company Registration")
  })

  it("renders custom notes and footer text", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      departure: null,
      items,
      totals: depositTotals,
      banking,
      footerText: "Custom footer wording",
      paymentNote: "Please e-mail proof of payment.",
      bankChargesNote: "Amounts must be exclusive of bank charges.",
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
  })

  it("renders the deposit-paid ladder without re-demanding the deposit", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      statusLabel: "Confirmed",
      departure: null,
      items,
      totals: {
        subtotalInclVat: 58900,
        depositPercentage: 25,
        depositAmount: 14725,
        finalAmount: 44175,
        finalDueDate: "2026-11-20",
        amountReceived: 14725,
        amountReceivedAt: "2026-07-13",
        outstanding: 44175,
      },
      banking,
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
    const text = await extractPdfText(buffer)
    // A paid deposit reads just "25% Deposit" — no "due now", no "— received".
    expect(text.split("\n")[lineIndex(text, "25% Deposit")]).toMatch(/^25% Deposit R/)
    expect(text).not.toContain("Deposit due now")
    expect(text).not.toContain("— received")
    // The receipt line carries no payment date.
    expect(text.split("\n")[lineIndex(text, "Amount received")]).toMatch(/^Amount received, thank you R/)
    expect(text).not.toContain("13-07-2026")
  })

  it("renders the Agent Commission row and a Total incl. VAT row when a discount is set", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      departure: null,
      items,
      totals: {
        subtotalInclVat: 63900,
        agentCommission: 5000,
        totalInclVat: 58900,
        depositPercentage: 25,
        depositAmount: 14725,
        finalAmount: 44175,
        finalDueDate: "2026-07-19",
        amountReceived: 0,
        amountReceivedAt: null,
        outstanding: 58900,
      },
      banking,
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
    const text = await extractPdfText(buffer)
    expect(text).toContain("Agent Commission")
    expect(text).toContain("Sub Total incl. VAT:")
    expect(text).toContain("Total incl. VAT:")
    expect(text).not.toContain("incl VAT")
  })

  it("renders a visible Discount row independently of Agent Commission", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      departure: null,
      items,
      totals: {
        subtotalInclVat: 63900,
        discount: 1300,
        discountVisible: true,
        totalInclVat: 62600,
        depositPercentage: 25,
        depositAmount: 15650,
        finalAmount: 46950,
        finalDueDate: "2026-07-19",
        amountReceived: 0,
        amountReceivedAt: null,
        outstanding: 62600,
      },
      banking,
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
    const text = await extractPdfText(buffer)
    expect(text).toContain("Discount")
    expect(text).toContain("Total incl. VAT:")
  })

  it("hides the Discount row when discountVisible is false", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      departure: null,
      items,
      totals: {
        subtotalInclVat: 63900,
        discount: 1300,
        discountVisible: false,
        totalInclVat: 62600,
        depositPercentage: 25,
        depositAmount: 15650,
        finalAmount: 46950,
        finalDueDate: "2026-07-19",
        amountReceived: 0,
        amountReceivedAt: null,
        outstanding: 62600,
      },
      banking,
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
    const text = await extractPdfText(buffer)
    expect(text).not.toContain("Discount")
  })

  it("renders a paid-up invoice without banking details configured", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Jane Smith",
      issueDate: "2026-07-12",
      dueDate: null,
      statusLabel: "Paid in Full",
      departure: null,
      items: [],
      totals: {
        subtotalInclVat: 58900,
        depositAmount: 14725,
        depositPercentage: 25,
        finalAmount: 44175,
        finalDueDate: null,
        amountReceived: 14725,
        amountReceivedAt: "2026-07-13",
        outstanding: 44175,
      },
      banking: makeBankingSettings(),
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
  })

  it("prints the guests two to a row — Guest 1 | Guest 2, Guest 3 | Guest 4, Guest 5 | Guest 6", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Carmen De Jongh",
      guestNames: [
        "Mrs Carmen De Jongh",
        "Mr Lourens De Jongh",
        "Mr Steyn van Coller",
        "Mrs June van Coller",
        "Miss Anna van Coller",
        "Master Jan van Coller",
      ],
      // A 3+ line address: the "address-alone" billing layout.
      billing: { addressLines: ["13 Epsom Road", "Langebaan, WC", "7357", "South Africa"] },
      issueDate: "2026-09-29",
      dueDate: null,
      departure,
      items,
      totals: depositTotals,
      banking,
    })

    const text = await extractPdfText(buffer)
    expect(text).toContain("Guest 3:")
    expect(text).toContain("Guest 6:")
    expect(text).toContain("Master Jan van Coller")
    expect(text).not.toContain("Guests:")
    // Each name in its own cell, never comma-joined.
    expect(text).not.toContain("Mr Steyn van Coller, Mrs June van Coller")
    // Each pair shares one row: label and name of both cells on one extracted line, in guest order.
    const lines = text.split("\n")
    expect(lines).toContain("Guest 1: Mrs Carmen De Jongh Guest 2: Mr Lourens De Jongh")
    expect(lines).toContain("Guest 3: Mr Steyn van Coller Guest 4: Mrs June van Coller")
    expect(lines).toContain("Guest 5: Miss Anna van Coller Guest 6: Master Jan van Coller")

    const runs = await pageOneRuns(buffer)
    const [guest1, guest2, guest3, guest4, guest5, guest6] = [1, 2, 3, 4, 5, 6].map((n) => runOf(runs, `Guest ${n}:`))
    // Odd guests stack in the left column under Guest 1, even guests in the right under Guest 2…
    for (const left of [guest3, guest5]) expect(left.x).toBeCloseTo(guest1.x, 1)
    for (const right of [guest4, guest6]) expect(right.x).toBeCloseTo(guest2.x, 1)
    // …each pair level, the rows running down the box in order.
    expect(guest2.y).toBeCloseTo(guest1.y, 1)
    expect(guest4.y).toBeCloseTo(guest3.y, 1)
    expect(guest6.y).toBeCloseTo(guest5.y, 1)
    expect(guest3.y).toBeLessThan(guest1.y)
    expect(guest5.y).toBeLessThan(guest3.y)
    // Past one guest row the billing block balances: the Address alone on the left, level with
    // Company, and Company, VAT, Phone, E-mail stacked down the right column in that order.
    const address = runOf(runs, "Address:")
    const [company, vat, phone, email] = ["Company:", "VAT:", "Phone:", "E-mail:"].map((label) => runOf(runs, label))
    expect(address.x).toBeCloseTo(guest1.x, 1)
    expect(address.y).toBeLessThan(guest5.y)
    expect(address.y).toBeCloseTo(company.y, 1)
    for (const right of [company, vat, phone, email]) expect(right.x).toBeCloseTo(guest2.x, 1)
    expect(vat.y).toBeLessThan(company.y)
    expect(phone.y).toBeLessThan(vat.y)
    expect(email.y).toBeLessThan(phone.y)
    expect((await extractPdfPageTexts(buffer)).length).toBe(1)
  })

  it("keeps the right-hand billing rows on the Address lines' baselines past one guest row", async () => {
    const buffer = await renderInvoicePdf({
      ...denseInvoice(FAMILY_GUESTS.slice(0, 3)),
      billing: {
        companyName: "JPS",
        addressLines: ["13 Epsom Road", "Langebaan, WC", "7357", "South Africa"],
        phone: "+353871234567",
        email: "rachel.obrien@eircom.ie",
        vatNumber: "112223456",
      },
    })

    const runs = await pageOneRuns(buffer)
    const pairs: Array<[string, string]> = [
      ["Company:", "13 Epsom Road"],
      ["VAT:", "Langebaan, WC"],
      ["Phone:", "7357"],
      ["E-mail:", "South Africa"],
    ]
    expect(Math.abs(runOf(runs, "Address:").y - runOf(runs, "13 Epsom Road").y)).toBeLessThan(0.5)
    for (const [right, addressLine] of pairs) {
      expect(Math.abs(runOf(runs, right).y - runOf(runs, addressLine).y), `${right} vs ${addressLine}`).toBeLessThan(0.5)
    }
  })

  it("keeps a two-guest invoice's box as it was — Guest 1 | Guest 2, then Company | VAT", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      guestNames: ["Ms Jane Smith", "Mr John Smith"],
      issueDate: "2026-09-29",
      dueDate: null,
      departure,
      items,
      totals: depositTotals,
      banking,
    })

    const runs = await pageOneRuns(buffer)
    const guest1 = runOf(runs, "Guest 1:")
    const guest2 = runOf(runs, "Guest 2:")
    const company = runOf(runs, "Company:")
    expect(guest2.y).toBeCloseTo(guest1.y, 1)
    expect(guest2.x).toBeGreaterThan(runOf(runs, "Ms Jane Smith").x)
    expect(runOf(runs, "VAT:").y).toBeCloseTo(company.y, 1)
    expect(runOf(runs, "VAT:").x).toBeCloseTo(guest2.x, 1)
    expect(company.x).toBeCloseTo(guest1.x, 1)
    // Company sits one guest row under Guest 1 — nothing in between.
    expect(company.y).toBeLessThan(guest1.y)
    expect(guest1.y - company.y).toBeLessThan(15)
    expect(runs.some((run) => run.str.startsWith("Guest 3"))).toBe(false)
    // One guest row: Company, Address, Phone and E-mail stay down the left, VAT alone on the right.
    const address = runOf(runs, "Address:")
    const phone = runOf(runs, "Phone:")
    const email = runOf(runs, "E-mail:")
    for (const left of [address, phone, email]) expect(left.x).toBeCloseTo(company.x, 1)
    expect(address.y).toBeLessThan(company.y)
    expect(phone.y).toBeLessThan(address.y)
    expect(email.y).toBeLessThan(phone.y)
  })

  it("prints Guest 2 as a dash when there is only one guest", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items,
      totals: depositTotals,
      banking,
    })

    expect((await extractPdfText(buffer)).split("\n")).toContain("Guest 1: Jane Smith Guest 2: –")
  })

  it("leaves the right cell of an odd last guest row empty, and keeps a wrapped name's partner level", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Carmen De Jongh",
      guestNames: [
        "Mrs Carmen De Jongh",
        "Mr Lourens De Jongh",
        // Too long for the left value cell, so it wraps onto a second line.
        "Mr Bartholomew Montgomery-Fitzgerald van der Westhuizen",
        "Mrs June van Coller",
        "Miss Anna van Coller",
      ],
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items,
      totals: depositTotals,
      banking,
    })

    const runs = await pageOneRuns(buffer)
    const guest3 = runOf(runs, "Guest 3:")
    const guest5 = runOf(runs, "Guest 5:")
    // The wrapped Guest 3 pushes its whole row down: Guest 4 stays level with it, and Guest 5 starts
    // two lines further on.
    expect(runOf(runs, "Guest 4:").y).toBeCloseTo(guest3.y, 1)
    expect(guest3.y - guest5.y).toBeGreaterThan(20)
    expect(guest5.x).toBeCloseTo(runOf(runs, "Guest 1:").x, 1)
    // Nothing beside Guest 5 — Company | VAT come next, level (no billing: "contacts-right").
    expect(runs.some((run) => run.str.startsWith("Guest 6"))).toBe(false)
    const company = runOf(runs, "Company:")
    expect(company.y).toBeLessThan(guest5.y)
    expect(company.x).toBeCloseTo(guest5.x, 1)
    expect(runOf(runs, "VAT:").x).toBeCloseTo(runOf(runs, "Guest 4:").x, 1)
    expect(runOf(runs, "VAT:").y).toBeCloseTo(company.y, 1)
  })

  // Past one guest row with a short address (0–2 lines, or none), the billing block keeps Company and
  // Address on the left and moves VAT, Phone and E-mail to the right ("contacts-right"), so the box
  // grows no more than ~2pt over the two-guest one.
  async function shortAddressRuns(billing: InvoiceBillingParty | undefined): Promise<{ pair: TextRun[]; three: TextRun[] }> {
    const render = async (guestNames: string[]) =>
      pageOneRuns(
        await renderInvoicePdf({
          invoiceNumber: "39023",
          bookingNumber: "LTT-26-0001",
          customerName: "Rachel O'Brien",
          guestNames,
          billing,
          issueDate: "2026-09-29",
          dueDate: null,
          departure: null,
          items,
          totals: depositTotals,
          banking,
        }),
      )
    return { pair: await render(FAMILY_GUESTS.slice(0, 2)), three: await render(FAMILY_GUESTS.slice(0, 3)) }
  }

  function expectContactsRight(runs: TextRun[]): void {
    const guest1 = runOf(runs, "Guest 1:")
    const guest2 = runOf(runs, "Guest 2:")
    const [company, address, vat, phone, email] = ["Company:", "Address:", "VAT:", "Phone:", "E-mail:"].map((label) =>
      runOf(runs, label),
    )
    for (const left of [company, address]) expect(left.x).toBeCloseTo(guest1.x, 1)
    for (const right of [vat, phone, email]) expect(right.x).toBeCloseTo(guest2.x, 1)
    expect(Math.abs(vat.y - company.y)).toBeLessThan(0.5)
    expect(Math.abs(phone.y - address.y)).toBeLessThan(0.5)
    expect(email.y).toBeLessThan(phone.y)
  }

  /** How much taller the three-guest box is than the two-guest one: the table heading's drop. */
  function boxGrowth({ pair, three }: { pair: TextRun[]; three: TextRun[] }): number {
    return runOf(pair, "Travel Package Description").y - runOf(three, "Travel Package Description").y
  }

  it("keeps Company and Address on the left past one guest row when there is no billing", async () => {
    const runs = await shortAddressRuns(undefined)
    expectContactsRight(runs.three)
    expect(boxGrowth(runs)).toBeLessThanOrEqual(2)
  })

  it("keeps Company and a two-line Address on the left past one guest row, E-mail on the second line", async () => {
    const runs = await shortAddressRuns({
      companyName: "JPS",
      addressLines: ["7 Fulmar Close, Langebaan", "South Africa"],
      phone: "+353871234567",
      email: "rachel.obrien@eircom.ie",
      vatNumber: "112223456",
    })
    expectContactsRight(runs.three)
    expect(Math.abs(runOf(runs.three, "E-mail:").y - runOf(runs.three, "South Africa").y)).toBeLessThan(0.5)
    expect(boxGrowth(runs)).toBeLessThanOrEqual(2)
  })

  it("prints the train's compact suite label beside QTY — one counted line per suite type", async () => {
    // The journey block built the production way: buildDeparture → invoiceRowsForBlock, off a train
    // block carrying the invoiceSuiteCounts buildVoucherServiceBlocks sets.
    const train = (serviceData: VoucherServiceBlock["serviceData"]): VoucherServiceBlock => ({
      serviceType: "train",
      title: "Rovos Rail",
      supplierReference: "RVR42752",
      contactDetails: { name: "Rovos Rail" },
      displayOrder: 0,
      serviceData: {
        route: "Pretoria → Cape Town",
        departureDate: "2026-07-20",
        startTime: "13:00",
        arrivalDate: "2026-07-22",
        endTime: "18:00",
        ...serviceData,
      },
    })
    const render = async (block: VoucherServiceBlock, suites: number) =>
      pageOneRuns(
        await renderInvoicePdf({
          invoiceNumber: "39023",
          bookingNumber: "LTT-26-0001",
          customerName: "Jane Smith",
          issueDate: "2026-09-29",
          dueDate: null,
          departure: buildDeparture([block], "Your Train Journey", {
            tourName: null,
            durationNights: 2,
            durationUnit: null,
            suites,
            adults: 4,
            children: 2,
          }),
          items,
          totals: depositTotals,
          banking,
        }),
      )

    // One suite type: the short label and its QTY on the Suite Type row's single baseline.
    const single = await render(
      train({
        suiteType: "Double bedded Deluxe Suite with a shower, Lengthways",
        invoiceSuiteCounts: [{ label: "Double Deluxe Suite", count: 1 }],
        numberOfSuites: 1,
      }),
      1,
    )
    const singleRow = runOf(single, "Suite Type:").y
    expect(valueAfter(single, "QTY:").str).toBe("1")
    for (const run of [runOf(single, "Double Deluxe Suite"), runOf(single, "QTY:"), valueAfter(single, "QTY:")]) {
      expect(Math.abs(run.y - singleRow), run.str).toBeLessThan(0.5)
    }
    expect(single.some((run) => run.str.includes("Lengthways"))).toBe(false)

    // Two suite types: a counted line each, QTY (the total) on the first, Adults clear of the second.
    const mixed = await render(
      train({
        suiteType:
          "Double bedded Deluxe Suite with a shower, Lengthways, Twin bedded Royal Suite with a shower and bath, Lengthways",
        invoiceSuiteCounts: [
          { label: "Double Deluxe Suite", count: 2 },
          { label: "Twin Royal Suite", count: 1 },
        ],
        numberOfSuites: 3,
      }),
      3,
    )
    const first = runOf(mixed, "2 × Double Deluxe Suite")
    const second = runOf(mixed, "1 × Twin Royal Suite")
    expect(Math.abs(first.y - runOf(mixed, "Suite Type:").y)).toBeLessThan(0.5)
    expect(second.x).toBeCloseTo(first.x, 1)
    expect(first.y - second.y).toBeCloseTo(10.65, 0)
    const qty = valueAfter(mixed, "QTY:")
    expect(qty.str).toBe("3")
    expect(Math.abs(qty.y - first.y)).toBeLessThan(0.5)
    expect(second.y - runOf(mixed, "Adults:").y).toBeGreaterThan(10)
  })

  it("prints Total per Adult and Total per Child above the totals only when given", async () => {
    const withPerPerson = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items,
      totals: { ...depositTotals, perAdult: 25000, perChild: 4450 },
      banking,
    })
    const text = await extractPdfText(withPerPerson)
    expect(text).toContain("Total per Adult")
    expect(text).toContain("Total per Child")
    // No deduction, so no Sub Total: the per-person rows head the ladder, above Total incl. VAT.
    expect(lineIndex(text, "Total per Adult:")).toBeGreaterThanOrEqual(0)
    expect(lineIndex(text, "Total per Adult:")).toBeLessThan(lineIndex(text, "Total per Child:"))
    expect(lineIndex(text, "Total per Child:")).toBeLessThan(lineIndex(text, "Total incl. VAT:"))
    expect(text).toContain("25% Deposit due now")

    const withDiscount = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items,
      totals: {
        ...depositTotals,
        subtotalInclVat: 63_900,
        discount: 5_000,
        discountVisible: true,
        totalInclVat: 58_900,
        perAdult: 25_000,
        perChild: 4_450,
      },
      banking,
    })
    const discounted = await extractPdfText(withDiscount)
    // Both per-person rows sit above Sub Total, which still leads Discount and Total incl. VAT.
    const subTotal = lineIndex(discounted, "Sub Total incl. VAT:")
    expect(lineIndex(discounted, "Total per Adult:")).toBeGreaterThanOrEqual(0)
    expect(lineIndex(discounted, "Total per Adult:")).toBeLessThan(lineIndex(discounted, "Total per Child:"))
    expect(lineIndex(discounted, "Total per Child:")).toBeLessThan(subTotal)
    expect(subTotal).toBeLessThan(lineIndex(discounted, "Discount:"))
    expect(lineIndex(discounted, "Discount:")).toBeLessThan(lineIndex(discounted, "Total incl. VAT:"))

    const without = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items,
      totals: { ...depositTotals, perAdult: null },
      banking,
    })
    expect(await extractPdfText(without)).not.toContain("Total per")
  })

  it("prints the item's time in its own column, apart from the date", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items: [{ ...items[0], date: "2026-10-24", time: "09:40" }],
      totals: depositTotals,
      banking,
    })
    const text = await extractPdfText(buffer)
    expect(text).toContain("24 October 2026")
    expect(text).toContain("09h40")
  })

  it("prints the Terms bullets in the client's wording", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "39023",
      bookingNumber: "LTT-26-0001",
      customerName: "Jane Smith",
      issueDate: "2026-09-29",
      dueDate: null,
      departure: null,
      items,
      totals: depositTotals,
      banking,
      bankChargesNote: "Amounts transferred should exclude all bank charges.",
      paymentNote:
        "Email proof of payment directly to your consultant. Reservations can only be confirmed once payment has been received.",
    })
    const text = (await extractPdfText(buffer)).replace(/\s+/g, " ")
    expect(text).toContain("Amounts transferred should exclude all bank charges.")
    expect(text).toContain("Please use reference 39023 when making payment.")
    expect(text).toContain("Email proof of payment directly to your consultant.")
    expect(text).toContain("Reservations can only be confirmed once payment has been received.")
    expect(text).not.toContain("Please note that the")
  })
})
