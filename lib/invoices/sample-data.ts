import type { InvoicePdfData } from "@/lib/invoices/pdf/invoice-document"

// Sample invoice fixture for /api/pdf-preview. Banking details and the
// document-text notes/footer come from real settings, so they are excluded.
// Figures mirror a real Blue Train confirmation invoice so the layout can be
// judged against the document it is meant to reproduce.
export function sampleInvoicePdfData(): Omit<
  InvoicePdfData,
  "banking" | "footerText" | "paymentNote" | "bankChargesNote"
> {
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const unitPrice = 16903.75
  const subtotal = 33807.5
  // Exercises the Agent Commission row: deposit/final/outstanding are all percentages of the net.
  const agentCommission = 1807.5
  const total = Math.round((subtotal - agentCommission) * 100) / 100
  const deposit = Math.round(total * 0.25 * 100) / 100
  return {
    invoiceNumber: "LTT-2026-0001-INV",
    bookingNumber: "LTT-2026-0001",
    customerName: "Ms Virginia Lunn",
    guestNames: ["Ms Virginia Lunn", "Ms Jacqueline Allemaan"],
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate,
    consultant: "LB",
    billing: {
      companyName: "Lunn Family Travel",
      addressLines: ["14 Kensington Road", "London, Greater London", "United Kingdom"],
      postalCode: "SW7 2AB",
      phone: "+44 7884 495357",
      email: "sample.guest@example.com",
      vatNumber: "GB123456789",
    },
    departure: {
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
    },
    items: [
      {
        pax: 2,
        description: "Cape Town Journey — Deluxe Suite",
        unitPrice,
        total: subtotal,
      },
    ],
    totals: {
      subtotalInclVat: subtotal,
      agentCommission,
      totalInclVat: total,
      depositPercentage: 25,
      depositAmount: deposit,
      finalAmount: Math.round((total - deposit) * 100) / 100,
      finalDueDate: dueDate,
      amountReceived: 0,
      amountReceivedAt: null,
      outstanding: total,
    },
    currency: "ZAR",
    statusLabel: "Provisional",
  }
}
