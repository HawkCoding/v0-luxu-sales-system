import { FOOTER_BRAND_PRODUCT_LINE } from "@/lib/assets/footer-brand"
import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"
import type { BankingSettings, DocumentBrand } from "@/lib/settings-access"
import type { Json } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS, type VoucherTemplate } from "@/lib/types"

// One real-shaped booking (LTT-26-0035 / invoice 42752 — a Rovos Rail Golf Safari with a
// pre-night hotel and three transfers) used to render every client PDF side by side for the
// design review in lib/pdf/design-review/render-design-samples.test.tsx. No DB access.

export const SAMPLE_BOOKING_NUMBER = "LTT-26-0035"
export const SAMPLE_INVOICE_NUMBER = "42752"

export function sampleBrand(): DocumentBrand {
  return {
    heading: FOOTER_BRAND_PRODUCT_LINE,
    subheading: "A division of Luxus Travel & Tours",
    logoUrl: null,
  }
}

export function sampleBanking(): BankingSettings {
  return {
    bank_name: "First National Bank",
    bank_account_name: "Luxus Travel and Tours",
    bank_account_number: "625 489 436 55",
    bank_branch_code: "250 655",
    bank_swift_code: "FIRNZAJJ",
    company_address: "SA-Rail (a division of Luxus Travel & Tours)\nUnit 6 Oostewal Business Centre, Oostewal Road, Langebaan",
    company_reg_number: "CK2007/049324/23",
    company_vat_number: "4580275016",
    company_tel: "+27 12 100 3596",
    company_cell: "+27 81 580 6471",
    company_fax: "",
    company_email: "info@sa-rail.co.za",
    company_website: "sa-rail.co.za",
  }
}

const ULYSSES = {
  name: "Ulysses Tours & Transfers",
  phone: "+27 12 653 0018",
  website: "https://www.ulysses.co.za/",
}

const ROVOS_INCLUSIONS = [
  "# Short Journeys",
  "Complimentary nights accommodation pre/post departure",
  "Vehicle transfer between the Hotel and Station",
  "Accommodation onboard the train",
  "All meals, all alcoholic and other beverages",
  "Room service and bar facilities",
  "Limited laundry service",
  "Off-the-train Excursions (as per itinerary)",
  "Government tax",
  "# Long Journeys",
  "# Onboard:",
  "Accommodation onboard the train",
  "All meals, all alcoholic and other beverages",
  "Room service and bar facilities",
  "Limited laundry service",
  "Guided excursions (where applicable)",
  "Entrance fees (as per the itinerary)",
  "Golf green fees, carts and halfway house meals, water and tea/coffee",
  "Onboard historian (Dar-Es-Salaam, Lobito & Trilogy Journeys)",
  "Doctor onboard (Dar-Es-Salaam, Lobito Journeys)",
  "# Off-train:",
  "Complimentary nights accommodation pre/post departure",
  "Vehicle transfer between the Hotel and Station",
  "Accommodation (as per train itinerary)",
  "Meals & drinks (water, tea/coffee and breakfast juices)",
  "Flights (as per itinerary)",
]

const ROVOS_EXCLUSIONS = [
  "International sparkling wine & Caviar",
  "Gratuities",
  "Personal expenses",
  "Off-the-train meals & drinks (unless specified)",
  "Visas",
  "Travel Insurance",
]

const IVORY_DESCRIPTION = [
  "This upscale hotel, set in beautiful gardens, is located 30 km from Wonderboom Airport and near Erasmus Castle and Rietvlei Nature Reserve.",
  "It features nine elegant rooms with free Wi-Fi, flat-screen TVs, minibars, and tea and coffee-making facilities. Some rooms include balconies or chandeliers. Breakfast is included, and amenities include a wine cellar, an elegant restaurant with a terrace, an outdoor pool, and meeting spaces.",
  "An airport shuttle service is also available.",
].join("\n")

const ROVOS_STATION =
  "Pretoria Capital Park Station, Rovos Rail Station, 1 Transnet Avenue, Capital Park, Pretoria, South Africa"

export function sampleServiceBlocks(): VoucherServiceBlock[] {
  return [
    {
      serviceType: "transfer",
      title: "Transfer",
      supplierId: "s-ulysses",
      supplierReference: "58267",
      supplierContactName: "Ndazi",
      displayOrder: 0,
      clockTime: "14:00",
      contactDetails: { ...ULYSSES },
      serviceData: {
        route: "JHB – APT JHTL",
        vehicleType: "Standard - Mazda",
        passengerCount: 2,
        pickup: "OR Tambo Airport",
        dropoff: "Ivory Manor Boutique Hotel",
        departureDate: "2027-03-15",
        startTime: "14:00",
      },
    },
    {
      serviceType: "hotel",
      title: "Ivory Manor Boutique Hotel",
      supplierId: "s-ivory",
      supplierReference: "58267",
      supplierContactName: "Ndazi",
      displayOrder: 1,
      contactDetails: {
        name: "Ivory Manor Boutique Hotel",
        phone: "+27 12 110 4380",
        website: "https://www.ivorymanor.co.za/",
        streetAddress: "280 Jochem St, Rietvalleirand, Pretoria, 0122",
        location: "Pretoria",
        description: IVORY_DESCRIPTION,
      },
      serviceData: {
        roomType: "Premier Suite Room",
        numberOfSuites: 1,
        nights: 1,
        mealPlan: "Bed & Breakfast",
        departureDate: "2027-03-15",
        arrivalDate: "2027-03-16",
        startTime: "14:00",
        endTime: "10:00",
        guestBreakdown: { adults: 2, children: 0, infants: 0 },
        dietary: "Mrs Adams - Gluten Free",
      },
    },
    {
      serviceType: "train",
      title: "Rovos Rail",
      supplierId: "s-rovos",
      supplierReference: "RVR42752",
      supplierContactName: "Monique",
      displayOrder: 2,
      contactDetails: { name: "Rovos Rail", phone: "+27 12 334 8459", website: "https://rovos.com/" },
      serviceData: {
        route: "Golf Safari",
        arrivalStation: "Pretoria",
        boardingPoint: ROVOS_STATION,
        arrivalPoint: ROVOS_STATION,
        durationDays: 10,
        departureDate: "2027-03-16",
        arrivalDate: "2027-03-25",
        startTime: "12:00",
        endTime: "10:00",
        checkInOffsetMinutes: 120,
        suiteType: "Double bedded Deluxe Suite with a shower, Lengthways",
        itinerarySuiteType: "Deluxe Suite",
        numberOfSuites: 1,
        guestBreakdown: { adults: 2, children: 0, infants: 0 },
        requestsLine: "Nonsmoking",
        inclusions: ROVOS_INCLUSIONS,
        exclusions: ROVOS_EXCLUSIONS,
      },
    },
    {
      serviceType: "transfer",
      title: "Transfer",
      supplierId: "s-ulysses",
      supplierReference: "58267",
      supplierContactName: "Ndazi",
      displayOrder: 3,
      clockTime: "11:00",
      contactDetails: { ...ULYSSES },
      serviceData: {
        route: "PTY – STA APT",
        vehicleType: "Standard - Mazda",
        passengerCount: 2,
        pickup: "Ivory Manor Boutique Hotel",
        dropoff: "Pretoria Station",
        departureDate: "2027-03-25",
        startTime: "11:00",
      },
    },
    {
      serviceType: "transfer",
      title: "Transfer",
      supplierId: "s-ulysses",
      supplierReference: "58267",
      supplierContactName: "Ndazi",
      displayOrder: 4,
      clockTime: "17:00",
      contactDetails: { ...ULYSSES },
      serviceData: {
        route: "PTY – PHTL APT",
        vehicleType: "Standard - Mazda",
        passengerCount: 2,
        pickup: "Pretoria Station",
        dropoff: "OR Tambo Airport",
        departureDate: "2027-03-25",
        startTime: "17:00",
      },
    },
  ]
}

function snapshot(partial: Partial<PricingSnapshot>): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Golf Safari",
    legId: null,
    legLabel: null,
    supplierId: null,
    supplierName: null,
    supplierKind: null,
    routeId: null,
    routeName: null,
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "",
    passengerKind: "adult",
    baseUnitPrice: 0,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...partial,
  }
}

/** The accepted quote's priced lines, as quote_line_items rows (the invoice builds its items from these). */
export function sampleQuoteLineItems(): Array<{
  description: string
  qty: number
  unit_price: number
  total: number
  pricing_snapshot: Json
}> {
  const rows = [
    {
      description: "Transfer JHB – APT JHTL",
      qty: 1,
      unit_price: 2150,
      total: 2150,
      pricing_snapshot: snapshot({
        legId: "leg-t1",
        supplierId: "s-ulysses",
        supplierName: "Ulysses Tours & Transfers",
        supplierKind: "transfers",
        routeName: "JHB – APT JHTL",
        serviceType: "transfer",
        travelDate: "2027-03-15",
        passengerKind: "service",
      }),
    },
    {
      description: "Ivory Manor Boutique Hotel — Bed & Breakfast",
      qty: 1,
      unit_price: 6850,
      total: 6850,
      pricing_snapshot: snapshot({
        legId: "leg-h1",
        supplierId: "s-ivory",
        supplierName: "Ivory Manor Boutique Hotel",
        supplierKind: "hotel_property",
        routeName: "Bed & Breakfast",
        travelDate: "2027-03-15",
      }),
    },
    {
      description: "Rovos Rail — Golf Safari",
      qty: 2,
      unit_price: 191948.75,
      total: 383897.5,
      pricing_snapshot: snapshot({
        legId: "leg-r1",
        supplierId: "s-rovos",
        supplierName: "Rovos Rail",
        supplierKind: "train_operator",
        routeName: "Golf Safari",
        travelDate: "2027-03-16",
      }),
    },
    {
      description: "Transfer PTY – STA APT",
      qty: 1,
      unit_price: 1950,
      total: 1950,
      pricing_snapshot: snapshot({
        legId: "leg-t2",
        supplierId: "s-ulysses",
        supplierName: "Ulysses Tours & Transfers",
        supplierKind: "transfers",
        routeName: "PTY – STA APT",
        serviceType: "transfer",
        travelDate: "2027-03-25",
        passengerKind: "service",
      }),
    },
    {
      description: "Transfer PTY – PHTL APT",
      qty: 1,
      unit_price: 2950,
      total: 2950,
      pricing_snapshot: snapshot({
        legId: "leg-t3",
        supplierId: "s-ulysses",
        supplierName: "Ulysses Tours & Transfers",
        supplierKind: "transfers",
        routeName: "PTY – PHTL APT",
        serviceType: "transfer",
        travelDate: "2027-03-25",
        passengerKind: "service",
      }),
    },
  ]
  return rows.map((row) => ({ ...row, pricing_snapshot: row.pricing_snapshot as unknown as Json }))
}

export const SAMPLE_SUBTOTAL = 397797.5
export const SAMPLE_DISCOUNT = 46320
export const SAMPLE_TOTAL = 351477.5

export function sampleVoucherData(): VoucherData {
  return {
    voucherNumber: SAMPLE_INVOICE_NUMBER,
    guestNames: "Mr Hancke le Roux, Mrs Jean Adams",
    consultantName: "Carmen de Jager",
    supplierName: "Rovos Rail",
    route: "Golf Safari",
    departure: "16 March 2027 at 12h00",
    arrival: "25 March 2027 at 10h00",
    suiteType: "Double bedded Deluxe Suite with a shower, Lengthways",
    passengerTotals: { adultCount: 2, childCount: 0, infantCount: 0 },
    specialRequests: "",
    customerEmail: "hancke123@gmail.com",
    customerPhone: "0713002305",
    consultant: "CD",
    enquiry: {
      id: "sample",
      jobId: "sample",
      source: "email",
      purpose: "reservation",
      title: "Mr",
      name: "Hancke",
      surname: "le Roux",
      contactNumber: "0713002305",
      email: "hancke123@gmail.com",
      country: "United Kingdom",
      direction: "Golf Safari",
      departureDate: "2027-03-16",
      noOfSuites: 1,
      noOfAdults: 2,
      noOfChildren: 0,
      suiteTypes: ["Double bedded Deluxe Suite with a shower, Lengthways"],
      termsAccepted: true,
      createdAt: "2026-09-01T08:00:00.000Z",
    },
    serviceBlocks: sampleServiceBlocks(),
  }
}

export function sampleVoucherTemplate(): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS }
}

export const SAMPLE_CUSTOMER = {
  name: "Mr le Roux",
  phone: "0713002305",
  email: "hancke123@gmail.com",
  addressLines: ["49 Mitchell Ave, New Castle-Upon-Tyme", "United Kingdom"],
}

export const SAMPLE_GUESTS = ["Mr Hancke le Roux", "Mrs Jean Adams"]
