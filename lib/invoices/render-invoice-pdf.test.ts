import { describe, expect, it } from "vitest"
import { renderInvoicePdf } from "./render-invoice-pdf"

const banking = {
  bank_name: "Example Bank",
  bank_account_name: "Luxus Travel & Tours",
  bank_account_number: "1234567890",
  bank_branch_code: "250655",
  bank_swift_code: "EXAMZAJJ",
  payment_reference_hint: "BT-2026-0001",
  company_address: "1 Rail Road, Pretoria",
  company_reg_number: "2020/000000/07",
  company_vat_number: "4000000000",
}

describe("renderInvoicePdf smoke", () => {
  it("renders a deposit invoice with banking details", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "BT-2026-0001-DEP1",
      bookingNumber: "BT-2026-0001",
      customerName: "Jane Smith",
      kind: "deposit",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      lines: [
        { label: "Quote total", value: "R 58 900,00" },
        { label: "Deposit (25%)", value: "R 14 725,00" },
      ],
      amountDue: 14725,
      banking,
    })

    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
  })

  it("renders custom titles and footer text", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "BT-2026-0001-DEP1",
      bookingNumber: "BT-2026-0001",
      customerName: "Jane Smith",
      kind: "deposit",
      issueDate: "2026-07-12",
      dueDate: "2026-07-19",
      lines: [{ label: "Quote total", value: "R 58 900,00" }],
      amountDue: 14725,
      banking,
      depositTitle: "BOOKING DEPOSIT",
      finalTitle: "BALANCE DUE",
      footerText: "Custom footer wording",
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
  })

  it("renders a final invoice without banking details configured", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "BT-2026-0001-FIN1",
      bookingNumber: "BT-2026-0001",
      customerName: "Jane Smith",
      kind: "final",
      issueDate: "2026-07-12",
      dueDate: null,
      lines: [],
      amountDue: 44175,
      banking: Object.fromEntries(Object.keys(banking).map((k) => [k, ""])) as typeof banking,
    })

    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-")
  })
})
