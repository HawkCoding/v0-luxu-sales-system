import type { WorksheetPdfData } from "./worksheet-document"

// Sample worksheet fixture for /api/pdf-preview, mirroring the reference
// paper worksheet (Blue Train, 2 pax, train + hotel + transfer) so the layout
// can be judged against the document it is meant to reproduce.
export function sampleWorksheetData(): Omit<WorksheetPdfData, "brandLogo"> {
  return {
    bookingNumber: "LTT-2026-0042",
    serviceName: "The Blue Train",
    consultant: "Leonie Bisschoff",
    arriveDate: "2026-12-13",
    departDate: "2026-12-20",
    noOfPax: 2,
    contact: {
      title: "Mr",
      name: "Schalk van der Merwe",
      shortName: "S. van der Merwe",
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
    docsBy: "Leonie Bisschoff",
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
        description: "The Blue Train — Pretoria → Cape Town",
        bookingDate: null,
        confirmationDate: null,
        reservationReference: "BT-118824",
        paymentMadeDate: null,
        paidWith: null,
        notes: null,
      },
      {
        fromDate: "2026-12-14",
        toDate: "2026-12-20",
        description: "Commodore Hotel — Deluxe Suite",
        bookingDate: null,
        confirmationDate: null,
        reservationReference: null,
        paymentMadeDate: null,
        paidWith: null,
        notes: "Sea-facing room requested",
      },
      {
        fromDate: "2026-12-14",
        toDate: null,
        description: "Cape Town Executive Transfers",
        bookingDate: null,
        confirmationDate: null,
        reservationReference: "480789",
        paymentMadeDate: null,
        paidWith: null,
        notes: null,
      },
    ],
    payments: [
      {
        date: "2025-10-08",
        paidWith: "EFT",
        reference: "DEP-4471",
        amount: 18500,
      },
    ],
  }
}
