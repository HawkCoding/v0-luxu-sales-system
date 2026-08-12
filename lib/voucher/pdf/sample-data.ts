import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"

// Shared sample fixtures for the voucher render smoke test and the
// /api/pdf-preview route — realistic data, no DB access required.
export function sampleVoucherData(): VoucherData {
  return {
    voucherNumber: "180226-01",
    guestNames: "Mr & Mrs Sample Guest",
    consultantName: "Carmen de Jongh",
    supplierName: "Rovos Rail",
    supplierDescription: "Luxury rail journeys through Southern Africa since 1989.",
    route: "Cape Town → Pretoria",
    departure: "10 March 2026 at 11h00",
    arrival: "13 March 2026 at 16h00",
    suiteType: "Double Deluxe Suite",
    numberOfGuests: 2,
    specialRequests: "Anniversary celebration",
    customerEmail: "guest@example.com",
    customerPhone: "+27 82 000 0000",
    consultant: "CDJ",
    enquiry: {
      id: "preview",
      jobId: "preview",
      source: "email",
      purpose: "reservation",
      title: "Mr",
      name: "Sample",
      surname: "Guest",
      contactNumber: "+27 82 000 0000",
      email: "guest@example.com",
      country: "South Africa",
      direction: "Cape Town to Pretoria",
      departureDate: "2026-03-10",
      noOfSuites: 1,
      noOfAdults: 2,
      noOfChildren: 0,
      suiteTypes: ["Double Deluxe Suite"],
      termsAccepted: true,
      createdAt: "2026-03-01T08:00:00.000Z",
    },
  }
}

export function sampleVoucherServiceBlocks(): VoucherServiceBlock[] {
  return [
    {
      serviceType: "train",
      title: "Rovos Rail — Cape Town to Pretoria",
      supplierReference: "RR-84321",
      displayOrder: 0,
      contactDetails: {
        name: "Rovos Rail",
        phone: "+27 12 315 8242",
        email: "reservations@rovos.co.za",
        description: "Africa's most luxurious train, running between Cape Town and Pretoria.",
      },
      serviceData: {
        route: "Cape Town → Pretoria",
        // The two longest rows on a train block -- kept here so the design preview shows the
        // layout a real voucher actually renders.
        boardingPoint: "Rovos Rail Lounge, Cape Town Station, Adderley Street, Cape Town, 8001",
        arrivalPoint: "Rovos Rail Station, Capital Park, Pretoria, 0084",
        durationDays: 3,
        departureDate: "2026-03-10",
        arrivalDate: "2026-03-13",
        startTime: "11:00",
        endTime: "16:00",
        suiteType: "Double Deluxe Suite",
        numberOfSuites: 1,
        mealPlan: "Full Board (All meals included)",
        guestBreakdown: { adults: 2, children: 0, infants: 0 },
        requestsLine: "1st seating meals; Nonsmoking",
        occasion: "Anniversary Celebration",
        inclusions: ["High Tea", "24-hour Butler service"],
      },
    },
    {
      serviceType: "hotel",
      title: "The Silo Hotel — Cape Town",
      supplierReference: "SIL-2211",
      displayOrder: 1,
      contactDetails: {
        name: "The Silo Hotel",
        phone: "+27 21 670 0500",
        location: "V&A Waterfront, Cape Town",
        description: "A cliff-top boutique hotel above the Zeitz MOCAA museum.",
      },
      serviceData: {
        roomType: "Superior Suite",
        nights: 2,
        mealPlan: "Bed & Breakfast",
        departureDate: "2026-03-08",
        arrivalDate: "2026-03-10",
        startTime: "14:00",
        endTime: "11:00",
        guestBreakdown: { adults: 2, children: 0, infants: 0 },
        requestsLine: "1st seating meals; Nonsmoking",
        occasion: "Anniversary Celebration",
        inclusions: ["Welcome drink on arrival", "Access to Hydrotherapy pools"],
        notes: "Early check-in requested for international arrival.",
      },
    },
    {
      serviceType: "transfer",
      title: "Private Transfer — Hotel to Station",
      supplierReference: "TX-0099",
      displayOrder: 2,
      contactDetails: { name: "Cape Chauffeurs", phone: "+27 82 111 2222" },
      serviceData: {
        vehicleType: "Mercedes V-Class",
        passengerCount: 2,
        pickup: "The Silo Hotel",
        dropoff: "Cape Town Station, Platform 24",
        departureDate: "2026-03-10",
        startTime: "09:30",
      },
    },
    {
      serviceType: "tour",
      title: "Kimberley Day Excursion",
      supplierReference: "KIM-01",
      displayOrder: 3,
      contactDetails: { name: "Kimberley Tours" },
      serviceData: {
        itinerary: "Big Hole and diamond museum, weather and time permitting.",
        departureDate: "2026-03-11",
      },
    },
  ]
}
