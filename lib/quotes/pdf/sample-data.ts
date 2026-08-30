import type { QuotePdfData } from "@/lib/quotes/pdf/quote-document"

// Sample quote fixture for /api/pdf-preview. Title/footer/section headings come
// from the document-text settings, so they are excluded here.
export function sampleQuotePdfData(): Omit<
  QuotePdfData,
  "title" | "footerText" | "packageIncludesHeading" | "packageExcludesHeading" | "packageExcludesDefault"
> {
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    quoteNumber: "BT-2026-0001_Q1",
    customerName: "Mr & Mrs Sample Guest",
    quoteDate: new Date().toISOString().slice(0, 10),
    validUntil,
    journeyStart: "2026-07-18",
    journeyEnd: "2026-07-22",
    adults: 2,
    children: 0,
    // Exercises the Agent Commission row: subtotal 91300, a R5000 discount, net total 86300.
    subtotal: 91300,
    agentCommission: 5000,
    total: 86300,
    itineraryBlocks: [
      {
        // Same-day flight: the arrival folds into the departure sentence as "departing at 10h00
        // for arrival at 12h15", which is the shape the client's own itinerary uses.
        serviceType: "airline",
        title: "SAfair flight",
        contactDetails: { name: "SAfair" },
        serviceData: {
          departureDate: "2026-07-18",
          arrivalDate: "2026-07-18",
          startTime: "10:00",
          endTime: "12:15",
          route: "Lanseria INT Airport → Cape Town INT Airport",
          cabin: "Economy",
          flightNumber: "FA212",
          departureAirportCode: "HLA",
          arrivalAirportCode: "CPT",
        },
        displayOrder: 0,
      },
      {
        serviceType: "hotel",
        title: "Irene Country Lodge",
        contactDetails: { name: "Irene Country Lodge", location: "Pretoria" },
        serviceData: {
          departureDate: "2026-07-18",
          arrivalDate: "2026-07-20",
          startTime: "14:00",
          endTime: "10:00",
          roomType: "Guest room with a lake view",
          nights: 2,
          mealPlan: "breakfast",
          notes: "Complimentary night offer",
        },
        displayOrder: 1,
      },
      {
        serviceType: "transfer",
        title: "Vehicle transfer",
        contactDetails: { name: "Luxus Chauffeur" },
        serviceData: {
          departureDate: "2026-07-20",
          startTime: "10:00",
          pickup: "Irene Country Lodge",
          dropoff: "Pretoria Station",
        },
        displayOrder: 2,
      },
      {
        serviceType: "train",
        title: "The Blue Train",
        contactDetails: { name: "The Blue Train", location: "Cape Town" },
        serviceData: {
          departureDate: "2026-07-20",
          arrivalDate: "2026-07-22",
          startTime: "12:00",
          endTime: "18:00",
          route: "Pretoria to Cape Town",
          // suiteType is the full configuration (voucher/invoice wording); itinerarySuiteType is
          // what the default 'type_only' supplier setting sends to this itinerary sentence.
          suiteType: "Twin bedded Deluxe Suite with a shower",
          itinerarySuiteType: "Deluxe Suite",
          durationDays: 3,
          inclusions: [
            "All applicable snacks, meals & drinks (alcoholic & non-alcoholic), Cognacs, and Cuban cigars",
            "High Tea",
            "Blue Train Gift & Certificate",
            "24-hour Butler service",
            "Wi-Fi",
          ],
          exclusions: [
            "French Champagne, caviar, telephone calls, and gratuities whilst on board The Blue Train",
          ],
        },
        displayOrder: 3,
      },
      {
        serviceType: "tour",
        title: "Excursion in Kimberley",
        contactDetails: { name: "The Blue Train", location: "Kimberley" },
        serviceData: {
          departureDate: "2026-07-21",
        },
        displayOrder: 4,
      },
    ],
    currency: "ZAR",
  }
}
