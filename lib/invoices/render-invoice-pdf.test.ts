// @vitest-environment node
// pdf-parse pulls in pdf.js, which needs the node environment (jsdom trips the
// "No PDFJS.workerSrc specified" path).
import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import type { InvoiceTotals } from "./pdf/invoice-document"
import { makeBankingSettings } from "@/lib/settings-access.fixtures"
import { renderInvoicePdf } from "./render-invoice-pdf"

const require = createRequire(import.meta.url)
// pdf-parse ships CJS with no usable type surface for text extraction.
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>

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
  heading: "Luxury Train Departure Information",
  trainName: "The Blue Train",
  tourName: "Cape Town Journey",
  daysLabel: "2 Nights / 3 Days",
  qty: "1",
  adults: "2",
  children: "0",
  outbound: {
    route: "Pretoria → Cape Town",
    departureDate: "2026-07-20",
    departureTime: "13h00",
    arrivalDate: "2026-07-22",
    arrivalTime: "18h00",
    suite: "Twin Deluxe with Shower",
  },
  returnLeg: null,
}

const items = [
  { pax: 2, description: "Cape Town Journey — Deluxe Suite", unitPrice: 29450, total: 58900 },
]

describe("renderInvoicePdf smoke", () => {
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

    const { text } = await pdfParse(buffer)
    expect(text).toContain("Pretoria → Cape Town")
    expect(text).not.toContain("Pretoria ’ Cape Town")
    expect(text).toContain("PLEASE USE REFERENCE")
    expect(text).toContain("LTT-2026-0001-INV")
    expect(text).not.toContain("Payable by")
    expect(text).not.toContain("Commission")
  })

  it("renders every billing address line alongside the phone and e-mail rows", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LTT-2026-0001-INV",
      bookingNumber: "LTT-2026-0001",
      customerName: "Rachel O'Brien",
      guestNames: ["Mrs Rachel O'Brien"],
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      departure: null,
      items,
      totals: depositTotals,
      banking,
      billing: {
        companyName: "JPS",
        // Deliberately long first line so it soft-wraps inside the value column.
        addressLines: [
          "7 Fulmar Close, Sandgebaan Estate, Western Cape Province",
          "Sandgebaan",
          "Cape Town, WC",
          "South Africa",
        ],
        postalCode: "7535",
        phone: "+353871234567",
        email: "rachel.obrien@eircom.ie",
        vatNumber: "112223456",
      },
    })

    const { text } = await pdfParse(buffer)
    // Every address line must survive: the stacked lines used to collapse into
    // one line's height and paint over the Phone row.
    expect(text).toContain("Sandgebaan")
    expect(text).toContain("Cape Town, WC")
    expect(text).toContain("South Africa")
    expect(text).toContain("+353871234567")
    expect(text).toContain("rachel.obrien@eircom.ie")
    expect(text).toContain("112223456")
    expect(text).toContain("7535")
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
    const { text } = await pdfParse(buffer)
    expect(text).toContain("Agent Commission")
    expect(text).toContain("Total incl. VAT")
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
})
