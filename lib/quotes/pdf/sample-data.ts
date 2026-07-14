import type { QuotePdfData } from "@/lib/quotes/pdf/quote-document"

// Sample quote fixture for /api/pdf-preview. Title/footer/includes-heading come
// from the document-text settings, so they are excluded here.
export function sampleQuotePdfData(): Omit<QuotePdfData, "title" | "footerText" | "packageIncludesHeading"> {
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    quoteNumber: "BT-2026-0001_Q1",
    bookingNumber: "BT-2026-0001",
    customerName: "Mr & Mrs Sample Guest",
    quoteDate: new Date().toISOString().slice(0, 10),
    validUntil,
    journeyStart: "2026-07-18",
    journeyEnd: "2026-07-22",
    adults: 2,
    children: 0,
    total: 86300,
    inclusions: [
      {
        description: "The Blue Train — Pretoria to Cape Town, Deluxe Suite (all-inclusive)",
        supplierDescription: "All meals, drinks, high tea, 24-hour butler service, and Wi-Fi on board.",
        qty: 1,
        unit: "suite",
      },
      {
        description: "Irene Country Lodge — Guest room with lake view, incl. breakfast",
        qty: 2,
        unit: "night",
      },
      {
        description: "Private transfer — hotel to station",
        qty: 1,
      },
    ],
    itineraryBlocks: [
      {
        serviceType: "train",
        title: "The Blue Train",
        contactDetails: { name: "The Blue Train" },
        serviceData: {
          departureDate: "2026-07-20",
          route: "Pretoria to Cape Town",
          suiteType: "Deluxe Suite (twin, shower)",
          nights: 2,
          notes: "Check in from 10h00 — train departs at 12h00.",
        },
        displayOrder: 2,
      },
      {
        serviceType: "hotel",
        title: "Irene Country Lodge",
        contactDetails: { name: "Irene Country Lodge, Pretoria" },
        serviceData: {
          departureDate: "2026-07-18",
          roomType: "Guest room with lake view",
          nights: 2,
          mealPlan: "Breakfast included",
        },
        displayOrder: 1,
      },
      {
        serviceType: "transfer",
        title: "Vehicle transfer",
        contactDetails: {},
        serviceData: {
          departureDate: "2026-07-20",
          pickup: "Irene Country Lodge",
          dropoff: "Pretoria Station",
        },
        displayOrder: 3,
      },
    ],
    currency: "ZAR",
    statusLabel: "Provisional",
  }
}
