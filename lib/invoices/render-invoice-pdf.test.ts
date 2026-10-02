// @vitest-environment node
// Text extraction runs pdf.js, which needs the node environment (jsdom trips the
// "No PDFJS.workerSrc specified" path).
import { describe, expect, it } from "vitest"
import type { InvoiceTotals } from "./pdf/invoice-document"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
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
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Rachel O'Brien",
      guestNames: [
        "Mrs Rachel O'Brien",
        "Mr Sean O'Brien",
        "Mr Steyn van Coller",
        "Mrs June van Coller",
        "Miss Anna van Coller",
        "Master Jan van Coller",
      ],
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
      // A page-one invoice has ~10pt to spare here; a Sub Total + Discount pair and a dated "Amount
      // received, thank you …" line on top of all this push the Terms block onto page two.
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
    })

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

  it("prints every guest past the second as its own Guest N row, one name per row", async () => {
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
    // Each name on its own line, never comma-joined.
    expect(text).not.toContain("Mr Steyn van Coller, Mrs June van Coller")
    expect((await extractPdfPageTexts(buffer)).length).toBe(1)
  })

  it("prints Total per Adult and Total per Child under the total only when given", async () => {
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
