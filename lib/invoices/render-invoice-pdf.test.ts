import { describe, expect, it } from "vitest"
import type { InvoiceTotals } from "./pdf/invoice-document"
import { makeBankingSettings } from "@/lib/settings-access.fixtures"
import { renderInvoicePdf } from "./render-invoice-pdf"

const banking = makeBankingSettings({
  bank_name: "Example Bank",
  bank_account_name: "Luxus Travel & Tours",
  bank_account_number: "1234567890",
  bank_branch_code: "250655",
  bank_swift_code: "EXAMZAJJ",
  payment_reference_hint: "LTT-2026-0001-INV",
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
    route: "Pretoria to Cape Town",
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
