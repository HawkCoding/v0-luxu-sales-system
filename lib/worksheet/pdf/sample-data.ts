import type { WorksheetPdfData } from "./worksheet-document"

// Sample worksheet fixture for /api/pdf-preview, mirroring the reference
// paper worksheet (Blue Train, 2 pax, full payment) so the layout can be
// judged against the document it is meant to reproduce.
export function sampleWorksheetData(): Omit<WorksheetPdfData, "brand" | "brandLogo"> {
  return {
    bookingNumber: "LTT-2026-0042",
    productName: "Blue Train",
    consultant: "LB",
    arriveDate: "2026-12-13",
    departDate: "2026-12-20",
    noOfPax: 2,
    contact: {
      title: "Mr",
      name: "Schalk van der Merwe",
      nationality: "RSA",
      email: "swvdmlegal@example.com",
      phone: "083 377 3203",
    },
    invoiceDate: "2025-10-08",
    depositPercentage: null,
    depositDueDate: null,
    depositPaidAt: null,
    finalDueDate: new Date().toISOString().slice(0, 10),
    finalPaidAt: null,
    allPaid: false,
    allSent: false,
    docsDate: null,
    docsBy: "LB",
    pax: [
      {
        title: "Mr",
        firstName: "Schalk",
        lastName: "van der Merwe",
        nationality: "RSA",
        age: 52,
        roomWith: null,
        roomType: "Deluxe",
        remarks: "1st Seating meals; Nonsmoking",
      },
      {
        title: "Mrs",
        firstName: "Anrike",
        lastName: "van der Merwe",
        nationality: "RSA",
        age: 49,
        roomWith: null,
        roomType: "Deluxe",
        remarks: null,
      },
    ],
    serviceLines: [
      {
        fromDate: "2026-12-13",
        toDate: "2026-12-14",
        description: "Blue Train — Pretoria to Cape Town",
        bookingDate: null,
        confirmationDate: null,
        reservationReference: "BT-118824",
        paymentMadeDate: null,
        paidWith: null,
        amountPayable: null,
        amountReceivable: null,
        notes: null,
      },
      {
        fromDate: "2026-12-14",
        toDate: "2026-12-20",
        description: "Cape Town Hotel — 6 nights",
        bookingDate: null,
        confirmationDate: null,
        reservationReference: null,
        paymentMadeDate: null,
        paidWith: null,
        amountPayable: null,
        amountReceivable: null,
        notes: "Sea-facing room requested",
      },
    ],
    payments: [
      {
        date: "2025-10-08",
        paidWith: "EFT",
        amount: 33807.5,
        reference: null,
      },
    ],
    hasSupplierCosts: false,
  }
}
