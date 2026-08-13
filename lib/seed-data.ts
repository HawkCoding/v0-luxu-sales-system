import type {
  Customer, Job, Enquiry, Itinerary, Quote, Payment,
  DocRecord, Template, Correspondence, AuditLog, RateCard, PipelineHistory,
} from "./types"

export const customers: Customer[] = [
  { id: "c1", firstName: "James", lastName: "Mitchell", email: "james.mitchell@gmail.com", phone: "+27821234567", country: "South Africa", createdAt: "2025-09-01T08:00:00Z" },
  { id: "c2", firstName: "Sarah", lastName: "Van Der Berg", email: "sarah.vdb@outlook.com", phone: "+27839876543", country: "South Africa", createdAt: "2025-09-05T10:30:00Z" },
  { id: "c3", firstName: "Thomas", lastName: "Worthington", email: "t.worthington@btinternet.com", phone: "+447700900123", country: "United Kingdom", createdAt: "2025-09-10T14:00:00Z" },
  { id: "c4", firstName: "Anna", lastName: "Muller", email: "anna.muller@web.de", phone: "+491771234567", country: "Germany", createdAt: "2025-09-15T09:00:00Z" },
  { id: "c5", firstName: "Robert", lastName: "Chen", email: "rchen@yahoo.com", phone: "+16505551234", country: "United States", createdAt: "2025-09-20T16:00:00Z" },
  { id: "c6", firstName: "Priya", lastName: "Naidoo", email: "priya.naidoo@gmail.com", phone: "+27841112233", country: "South Africa", createdAt: "2025-10-01T07:00:00Z" },
  { id: "c7", firstName: "Marco", lastName: "Rossi", email: "m.rossi@libero.it", phone: "+393391234567", country: "Italy", createdAt: "2025-10-05T11:00:00Z" },
  { id: "c8", firstName: "Elizabeth", lastName: "Taylor", email: "liz.taylor@aol.com", phone: "+61412345678", country: "Australia", createdAt: "2025-10-10T06:00:00Z" },
  { id: "c9", firstName: "David", lastName: "Kruger", email: "david.kruger@telkomsa.net", phone: "+27823456789", country: "South Africa", createdAt: "2025-10-15T13:00:00Z" },
  { id: "c10", firstName: "Marie", lastName: "Dupont", email: "marie.dupont@orange.fr", phone: "+33612345678", country: "France", createdAt: "2025-10-20T08:30:00Z" },
  { id: "c11", firstName: "Henrik", lastName: "Johansson", email: "henrik.j@gmail.com", phone: "+46701234567", country: "Sweden", createdAt: "2025-11-01T10:00:00Z" },
  { id: "c12", firstName: "Fatima", lastName: "Al-Rashid", email: "fatima.ar@outlook.com", phone: "+971501234567", country: "UAE", createdAt: "2025-11-05T12:00:00Z" },
]

export const jobs: Job[] = [
  { id: "j1", jobNumber: "BT-2025-0001", ownerUser: "consultant", customerId: "c1", consultant: "LB", purpose: "reservation", source: "web_form", stage: "enquiry", createdAt: "2025-09-01T08:05:00Z", updatedAt: "2025-09-01T08:05:00Z", outcome: "Open" },
  { id: "j2", jobNumber: "BT-2025-0002", ownerUser: "consultant", customerId: "c2", consultant: "CDJ", purpose: "quote", source: "web_form", stage: "quoted", createdAt: "2025-09-05T10:35:00Z", updatedAt: "2025-09-08T14:00:00Z", outcome: "Open" },
  { id: "j3", jobNumber: "RR-2025-0003", ownerUser: "consultant", customerId: "c3", consultant: "DR", purpose: "reservation", source: "paste_import", stage: "quote_sent", createdAt: "2025-09-10T14:05:00Z", updatedAt: "2025-09-15T09:00:00Z", outcome: "Open" },
  { id: "j4", jobNumber: "RR-2025-0004", ownerUser: "consultant", customerId: "c4", consultant: "MVE", purpose: "availability", source: "web_form", stage: "accepted", createdAt: "2025-09-15T09:05:00Z", updatedAt: "2025-09-22T11:00:00Z", outcome: "Open" },
  { id: "j5", jobNumber: "RR-2025-0005", ownerUser: "consultant", customerId: "c5", consultant: "DL", purpose: "reservation", source: "web_form", stage: "deposit_requested", createdAt: "2025-09-20T16:05:00Z", updatedAt: "2025-09-28T10:00:00Z", outcome: "Open" },
  { id: "j6", jobNumber: "RR-2025-0006", ownerUser: "consultant", customerId: "c6", consultant: "LB", purpose: "reservation", source: "web_form", stage: "deposit_paid", createdAt: "2025-10-01T07:05:00Z", updatedAt: "2025-10-10:15:00:00Z", outcome: "Open" },
  { id: "j7", jobNumber: "RR-2025-0007", ownerUser: "consultant", customerId: "c7", consultant: "CDJ", purpose: "quote", source: "web_form", stage: "final_paid", createdAt: "2025-10-05T11:05:00Z", updatedAt: "2025-10-25T16:00:00Z", outcome: "Open" },
  { id: "j8", jobNumber: "RR-2025-0008", ownerUser: "consultant", customerId: "c8", consultant: "DR", purpose: "reservation", source: "web_form", stage: "voucher_sent", createdAt: "2025-10-10T06:05:00Z", updatedAt: "2025-11-01T08:00:00Z", outcome: "Won" },
  { id: "j9", jobNumber: "RR-2025-0009", ownerUser: "consultant", customerId: "c9", consultant: "MVE", purpose: "quote", source: "paste_import", stage: "closed", createdAt: "2025-10-15T13:05:00Z", updatedAt: "2025-11-10T12:00:00Z", outcome: "Won" },
  { id: "j10", jobNumber: "RR-2025-0010", ownerUser: "consultant", customerId: "c10", consultant: "DL", purpose: "availability", source: "web_form", stage: "lost", createdAt: "2025-10-20T08:35:00Z", updatedAt: "2025-11-15T09:00:00Z", outcome: "Lost" },
  { id: "j11", jobNumber: "RR-2025-0011", ownerUser: "consultant", customerId: "c11", consultant: "LB", purpose: "reservation", source: "web_form", stage: "enquiry", createdAt: "2025-11-01T10:05:00Z", updatedAt: "2025-11-01T10:05:00Z", outcome: "Open" },
  { id: "j12", jobNumber: "RR-2025-0012", ownerUser: "consultant", customerId: "c12", consultant: "CDJ", purpose: "quote", source: "web_form", stage: "quoted", createdAt: "2025-11-05T12:05:00Z", updatedAt: "2025-11-08T14:00:00Z", outcome: "Open" },
  { id: "j13", jobNumber: "RR-2025-0013", ownerUser: "consultant", customerId: "c1", consultant: "LB", purpose: "reservation", source: "web_form", stage: "accepted", createdAt: "2025-11-12T09:05:00Z", updatedAt: "2025-11-14T11:00:00Z", outcome: "Open" },
  { id: "j14", jobNumber: "RR-2025-0014", ownerUser: "consultant", customerId: "c2", consultant: "CDJ", purpose: "reservation", source: "web_form", stage: "accepted", createdAt: "2025-11-13T09:05:00Z", updatedAt: "2025-11-15T11:00:00Z", outcome: "Open" },
  { id: "j15", jobNumber: "RR-2025-0015", ownerUser: "consultant", customerId: "c3", consultant: "DR", purpose: "reservation", source: "web_form", stage: "accepted", createdAt: "2025-11-14T09:05:00Z", updatedAt: "2025-11-16T11:00:00Z", outcome: "Open" },
  { id: "j16", jobNumber: "RR-2025-0016", ownerUser: "consultant", customerId: "c4", consultant: "MVE", purpose: "reservation", source: "web_form", stage: "accepted", createdAt: "2025-11-15T09:05:00Z", updatedAt: "2025-11-17T11:00:00Z", outcome: "Open" },
  { id: "j17", jobNumber: "RR-2025-0017", ownerUser: "consultant", customerId: "c5", consultant: "DL", purpose: "reservation", source: "web_form", stage: "accepted", createdAt: "2025-11-16T09:05:00Z", updatedAt: "2025-11-18T11:00:00Z", outcome: "Open" },
  { id: "j18", jobNumber: "RR-2025-0018", ownerUser: "consultant", customerId: "c6", consultant: "LB", purpose: "reservation", source: "web_form", stage: "accepted", createdAt: "2025-11-17T09:05:00Z", updatedAt: "2025-11-19T11:00:00Z", outcome: "Open" },
  { id: "j19", jobNumber: "RR-2025-0019", ownerUser: "consultant", customerId: "c7", consultant: "CDJ", purpose: "reservation", source: "web_form", stage: "deposit_requested", createdAt: "2025-11-18T09:05:00Z", updatedAt: "2025-11-21T10:00:00Z", outcome: "Open" },
  { id: "j20", jobNumber: "RR-2025-0020", ownerUser: "consultant", customerId: "c8", consultant: "DR", purpose: "reservation", source: "web_form", stage: "deposit_requested", createdAt: "2025-11-19T09:05:00Z", updatedAt: "2025-11-22T10:00:00Z", outcome: "Open" },
  { id: "j21", jobNumber: "RR-2025-0021", ownerUser: "consultant", customerId: "c9", consultant: "MVE", purpose: "reservation", source: "web_form", stage: "deposit_requested", createdAt: "2025-11-20T09:05:00Z", updatedAt: "2025-11-23T10:00:00Z", outcome: "Open" },
  { id: "j22", jobNumber: "RR-2025-0022", ownerUser: "consultant", customerId: "c10", consultant: "DL", purpose: "reservation", source: "web_form", stage: "final_paid", createdAt: "2025-11-21T09:05:00Z", updatedAt: "2025-11-26T16:00:00Z", outcome: "Open" },
  { id: "j23", jobNumber: "RR-2025-0023", ownerUser: "consultant", customerId: "c11", consultant: "LB", purpose: "reservation", source: "web_form", stage: "final_paid", createdAt: "2025-11-22T09:05:00Z", updatedAt: "2025-11-27T16:00:00Z", outcome: "Open" },
]

// Bidirectional routes — each row covers both legs.
const directions = [
  "Pretoria ↔ Cape Town",
  "Pretoria ↔ Durban",
  "Pretoria ↔ Victoria Falls",
  "Pretoria ↔ Swakopmund",
  "Cape Town ↔ Dar es Salaam",
]

export const enquiries: Enquiry[] = [
  { id: "e1", jobId: "j1", source: "web_form", purpose: "reservation", title: "Mr", name: "James", surname: "Mitchell", contactNumber: "+27821234567", email: "james.mitchell@gmail.com", country: "South Africa", direction: "Pretoria to Cape Town", departureDate: "2026-03-15", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Deluxe Double Suite"], travellers: [{ prefix: "Mr", name: "James", surname: "Mitchell", idPassport: "8501015800081", dateOfBirth: "15/01/1985" }, { prefix: "Mrs", name: "Linda", surname: "Mitchell", idPassport: "8703025800082", dateOfBirth: "02/03/1987" }], hotelBooking: "Pre-departure", hotelOption: "Irene Country Lodge - Pretoria", extendStay: "No", additionalServices: "No", termsAccepted: true, createdAt: "2025-09-01T08:05:00Z" },
  { id: "e2", jobId: "j2", source: "web_form", purpose: "quote", title: "Ms", name: "Sarah", surname: "Van Der Berg", contactNumber: "+27839876543", email: "sarah.vdb@outlook.com", country: "South Africa", direction: "Cape Town to Pretoria", departureDate: "2026-04-20", noOfSuites: 2, noOfAdults: 3, noOfChildren: 1, childAges: [7], suiteTypes: ["Pullman Twin Suite", "Pullman Double Suite"], termsAccepted: true, createdAt: "2025-09-05T10:35:00Z" },
  { id: "e3", jobId: "j3", source: "paste_import", purpose: "reservation", rawText: "Dear Luxus Travel,\n\nI would like to book a reservation on the Rovos Rail from Pretoria to Victoria Falls for myself and my wife.\n\nWe would prefer a Royal Double Suite departing on 15 May 2026.\n\nPlease advise on availability and pricing.\n\nKind regards,\nThomas Worthington\nt.worthington@btinternet.com\n+447700900123", title: "Mr", name: "Thomas", surname: "Worthington", contactNumber: "+447700900123", email: "t.worthington@btinternet.com", country: "United Kingdom", direction: "Pretoria to Victoria Falls", departureDate: "2026-05-15", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Royal Double Suite"], travellers: [{ prefix: "Mr", name: "Thomas", surname: "Worthington", idPassport: "GB123456789", dateOfBirth: "20/06/1972" }, { prefix: "Mrs", name: "Catherine", surname: "Worthington", idPassport: "GB987654321", dateOfBirth: "14/09/1975" }], hotelBooking: "Post-departure", hotelOption: "The Victoria Falls Hotel", extendStay: "Yes", extraNights: 2, additionalServices: "Yes", additionalServicesDetails: "Airport transfer from Victoria Falls Airport and a sunset cruise on the Zambezi River", termsAccepted: true, createdAt: "2025-09-10T14:05:00Z" },
  { id: "e4", jobId: "j4", source: "web_form", purpose: "availability", title: "Mrs", name: "Anna", surname: "Muller", contactNumber: "+491771234567", email: "anna.muller@web.de", country: "Germany", direction: "Cape Town to Dar es Salaam", departureDate: "2026-06-10", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Deluxe Twin Suite"], termsAccepted: true, createdAt: "2025-09-15T09:05:00Z" },
  { id: "e5", jobId: "j5", source: "web_form", purpose: "reservation", title: "Mr", name: "Robert", surname: "Chen", contactNumber: "+16505551234", email: "rchen@yahoo.com", country: "United States", direction: "Pretoria to Cape Town", departureDate: "2026-07-01", noOfSuites: 2, noOfAdults: 4, noOfChildren: 0, suiteTypes: ["Royal Twin Suite", "Deluxe Double Suite"], travellers: [{ prefix: "Mr", name: "Robert", surname: "Chen", idPassport: "US12345678", dateOfBirth: "10/04/1968" }, { prefix: "Mrs", name: "Jennifer", surname: "Chen", idPassport: "US87654321", dateOfBirth: "25/08/1970" }, { prefix: "Mr", name: "Michael", surname: "Chen", idPassport: "US11223344", dateOfBirth: "15/12/1995" }, { prefix: "Ms", name: "Emily", surname: "Chen", idPassport: "US55667788", dateOfBirth: "03/06/1998" }], hotelBooking: "Pre-departure", hotelOption: "Ivory Manor Boutique Hotel - Pretoria", extendStay: "No", additionalServices: "No", termsAccepted: true, createdAt: "2025-09-20T16:05:00Z" },
  { id: "e6", jobId: "j6", source: "web_form", purpose: "reservation", title: "Ms", name: "Priya", surname: "Naidoo", contactNumber: "+27841112233", email: "priya.naidoo@gmail.com", country: "South Africa", direction: "Durban to Pretoria", departureDate: "2026-02-14", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Pullman Double Suite"], travellers: [{ prefix: "Ms", name: "Priya", surname: "Naidoo", idPassport: "9001015800081", dateOfBirth: "01/01/1990" }, { prefix: "Mr", name: "Raj", surname: "Naidoo", idPassport: "8812015800082", dateOfBirth: "01/12/1988" }], hotelBooking: "Pre-departure", hotelOption: "The Capital Pearls - Umhlanga", extendStay: "No", additionalServices: "No", termsAccepted: true, createdAt: "2025-10-01T07:05:00Z" },
  { id: "e7", jobId: "j7", source: "web_form", purpose: "quote", title: "Mr", name: "Marco", surname: "Rossi", contactNumber: "+393391234567", email: "m.rossi@libero.it", country: "Italy", direction: "Pretoria to Swakopmund", departureDate: "2026-08-20", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Deluxe Double Suite"], termsAccepted: true, createdAt: "2025-10-05T11:05:00Z" },
  { id: "e8", jobId: "j8", source: "web_form", purpose: "reservation", title: "Mrs", name: "Elizabeth", surname: "Taylor", contactNumber: "+61412345678", email: "liz.taylor@aol.com", country: "Australia", direction: "Cape Town to Pretoria", departureDate: "2026-09-05", noOfSuites: 1, noOfAdults: 2, noOfChildren: 2, childAges: [5, 8], suiteTypes: ["Royal Double Suite"], travellers: [{ prefix: "Mrs", name: "Elizabeth", surname: "Taylor", idPassport: "AU12345678", dateOfBirth: "12/03/1980" }, { prefix: "Mr", name: "George", surname: "Taylor", idPassport: "AU87654321", dateOfBirth: "18/07/1978" }], childTravellers: [{ prefix: "Miss", name: "Sophie", surname: "Taylor", idPassport: "AU11112222", dateOfBirth: "10/02/2021" }, { prefix: "Mast", name: "Oliver", surname: "Taylor", idPassport: "AU33334444", dateOfBirth: "05/11/2017" }], hotelBooking: "Post-departure", hotelOption: "Irene Country Lodge - Pretoria", extendStay: "Yes", extraNights: 3, additionalServices: "Yes", additionalServicesDetails: "Full day Winelands tour and airport transfer to OR Tambo International", termsAccepted: true, createdAt: "2025-10-10T06:05:00Z" },
  { id: "e9", jobId: "j9", source: "paste_import", purpose: "quote", rawText: "Hi there, I'm interested in getting a quote for a Rovos Rail trip from Pretoria to Cape Town. Looking at Pullman Twin Suite for 2 adults, departing mid-October 2026. David Kruger, david.kruger@telkomsa.net, +27823456789", title: "Mr", name: "David", surname: "Kruger", contactNumber: "+27823456789", email: "david.kruger@telkomsa.net", country: "South Africa", direction: "Pretoria to Cape Town", departureDate: "2026-10-15", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Pullman Twin Suite"], termsAccepted: true, createdAt: "2025-10-15T13:05:00Z" },
  { id: "e10", jobId: "j10", source: "web_form", purpose: "availability", title: "Mrs", name: "Marie", surname: "Dupont", contactNumber: "+33612345678", email: "marie.dupont@orange.fr", country: "France", direction: "Pretoria to Victoria Falls", departureDate: "2026-11-01", noOfSuites: 1, noOfAdults: 2, noOfChildren: 0, suiteTypes: ["Deluxe Twin Suite"], termsAccepted: true, createdAt: "2025-10-20T08:35:00Z" },
  { id: "e11", jobId: "j11", source: "web_form", purpose: "reservation", title: "Mr", name: "Henrik", surname: "Johansson", contactNumber: "+46701234567", email: "henrik.j@gmail.com", country: "Sweden", direction: "Swakopmund to Pretoria", departureDate: "2026-04-10", noOfSuites: 1, noOfAdults: 1, noOfChildren: 0, suiteTypes: ["Pullman Twin Suite"], travellers: [{ prefix: "Mr", name: "Henrik", surname: "Johansson", idPassport: "SE12345678", dateOfBirth: "22/04/1982" }], hotelBooking: "Pre-departure", hotelOption: "Swakopmund Hotel", extendStay: "No", additionalServices: "No", termsAccepted: true, createdAt: "2025-11-01T10:05:00Z" },
  { id: "e12", jobId: "j12", source: "web_form", purpose: "quote", title: "Ms", name: "Fatima", surname: "Al-Rashid", contactNumber: "+971501234567", email: "fatima.ar@outlook.com", country: "UAE", direction: "Pretoria to Cape Town", departureDate: "2026-12-20", noOfSuites: 2, noOfAdults: 4, noOfChildren: 0, suiteTypes: ["Royal Double Suite", "Deluxe Double Suite"], termsAccepted: true, createdAt: "2025-11-05T12:05:00Z" },
]

export const itineraries: Itinerary[] = [
  { id: "it1", jobId: "j2", name: "Cape Town to Pretoria - Standard", notes: "3-night journey with all meals included" },
  { id: "it2", jobId: "j3", name: "Pretoria to Victoria Falls - Extended", notes: "4-night journey with game drives at Hwange", acceptedAt: "2025-09-14T10:00:00Z" },
  { id: "it3", jobId: "j5", name: "Pretoria to Cape Town - Family", notes: "3-night journey, 2 suites booked" },
  { id: "it4", jobId: "j6", name: "Durban to Pretoria - Valentine", notes: "2-night romantic journey" },
  { id: "it5", jobId: "j7", name: "Pretoria to Swakopmund - Desert", notes: "5-night journey through Namibia", acceptedAt: "2025-10-18T14:00:00Z" },
  { id: "it6", jobId: "j8", name: "Cape Town to Pretoria - Family Adventure", notes: "3-night journey with children's activities", acceptedAt: "2025-10-20T09:00:00Z" },
  { id: "it7", jobId: "j9", name: "Pretoria to Cape Town - Classic", notes: "Standard 3-night route", acceptedAt: "2025-10-28T11:00:00Z" },
  { id: "it8", jobId: "j12", name: "Pretoria to Cape Town - Luxury Group", notes: "3-night journey, 2 suites, VIP treatment" },
  { id: "it9", jobId: "j13", name: "Pretoria to Cape Town - Confirmed", notes: "Reservation sent and awaiting booking form", acceptedAt: "2025-11-14T11:00:00Z" },
  { id: "it10", jobId: "j14", name: "Cape Town to Pretoria - Confirmed", notes: "Reservation sent and awaiting booking form", acceptedAt: "2025-11-15T11:00:00Z" },
  { id: "it11", jobId: "j15", name: "Pretoria to Victoria Falls - Confirmed", notes: "Reservation sent with transfer request", acceptedAt: "2025-11-16T11:00:00Z" },
  { id: "it12", jobId: "j16", name: "Cape Town to Dar es Salaam - Confirmed", notes: "Reservation sent and awaiting guest details", acceptedAt: "2025-11-17T11:00:00Z" },
  { id: "it13", jobId: "j17", name: "Pretoria to Cape Town - Family Confirmed", notes: "Two-suite family reservation sent", acceptedAt: "2025-11-18T11:00:00Z" },
  { id: "it14", jobId: "j18", name: "Durban to Pretoria - Confirmed", notes: "Reservation sent for Pullman Double Suite", acceptedAt: "2025-11-19T11:00:00Z" },
  { id: "it15", jobId: "j19", name: "Pretoria to Swakopmund - Invoice Sent", notes: "Deposit invoice sent after accepted reservation", acceptedAt: "2025-11-20T11:00:00Z" },
  { id: "it16", jobId: "j20", name: "Cape Town to Pretoria - Family Invoice Sent", notes: "Deposit invoice sent for family reservation", acceptedAt: "2025-11-21T11:00:00Z" },
  { id: "it17", jobId: "j21", name: "Pretoria to Cape Town - Invoice Sent", notes: "Deposit invoice sent and awaiting payment", acceptedAt: "2025-11-22T11:00:00Z" },
  { id: "it18", jobId: "j22", name: "Pretoria to Victoria Falls - Paid", notes: "Fully paid reservation awaiting voucher", acceptedAt: "2025-11-24T11:00:00Z" },
  { id: "it19", jobId: "j23", name: "Swakopmund to Pretoria - Paid", notes: "Fully paid solo traveller reservation", acceptedAt: "2025-11-25T11:00:00Z" },
]

/** Demo fixtures predate multi-currency and are all rand; currency is stamped on below rather
 *  than repeated on every row. */
const seedQuotes: Omit<Quote, "currency">[] = [
  { id: "q1", itineraryId: "it1", jobId: "j2", status: "pricing_incomplete", validityUntil: "2025-12-31", lineItems: [{ description: "Pullman Twin Suite (2 pax)", qty: 1, unitPrice: 24900, total: 24900 }, { description: "Pullman Double Suite (1 pax)", qty: 1, unitPrice: 0, total: 0 }], subtotal: 24900, total: 24900 },
  { id: "q2", itineraryId: "it2", jobId: "j3", status: "sent", validityUntil: "2025-12-15", lineItems: [{ description: "Royal Double Suite (2 pax)", qty: 1, unitPrice: 62000, total: 62000 }, { description: "Victoria Falls Hotel (2 nights)", qty: 1, unitPrice: 8500, total: 8500 }, { description: "Sunset Cruise", qty: 2, unitPrice: 1200, total: 2400 }], subtotal: 72900, total: 72900, lastSentAt: "2025-09-15T09:30:00Z" },
  { id: "q3", itineraryId: "it5", jobId: "j7", status: "accepted", validityUntil: "2025-11-30", lineItems: [{ description: "Deluxe Double Suite (2 pax)", qty: 1, unitPrice: 38500, total: 38500 }, { description: "Swakopmund excursion package", qty: 2, unitPrice: 3500, total: 7000 }], subtotal: 45500, total: 45500, lastSentAt: "2025-10-12T14:00:00Z", overridePin: "1234", overrideReason: "Supplier special case" },
  { id: "q4", itineraryId: "it3", jobId: "j5", status: "ready", validityUntil: "2026-01-15", lineItems: [{ description: "Royal Twin Suite (2 pax)", qty: 1, unitPrice: 58000, total: 58000 }, { description: "Deluxe Double Suite (2 pax)", qty: 1, unitPrice: 38500, total: 38500 }, { description: "Ivory Manor Hotel (1 night)", qty: 4, unitPrice: 3200, total: 12800 }], subtotal: 109300, total: 109300 },
  { id: "q5", itineraryId: "it8", jobId: "j12", status: "draft", validityUntil: "2026-02-28", lineItems: [{ description: "Royal Double Suite (4 pax)", qty: 1, unitPrice: 62000, total: 62000 }, { description: "Deluxe Double Suite (2 pax - placeholder)", qty: 1, unitPrice: 38500, total: 38500 }], subtotal: 100500, total: 100500 },
  { id: "q6", itineraryId: "it9", jobId: "j13", status: "accepted", validityUntil: "2026-01-30", lineItems: [{ description: "Deluxe Double Suite (2 pax)", qty: 1, unitPrice: 77000, total: 77000 }], subtotal: 77000, total: 77000, lastSentAt: "2025-11-14T10:30:00Z" },
  { id: "q7", itineraryId: "it10", jobId: "j14", status: "accepted", validityUntil: "2026-01-31", lineItems: [{ description: "Pullman Twin Suite (2 pax)", qty: 1, unitPrice: 49800, total: 49800 }], subtotal: 49800, total: 49800, lastSentAt: "2025-11-15T10:30:00Z" },
  { id: "q8", itineraryId: "it11", jobId: "j15", status: "accepted", validityUntil: "2026-02-15", lineItems: [{ description: "Royal Double Suite (2 pax)", qty: 1, unitPrice: 144000, total: 144000 }, { description: "Airport transfer and private guide", qty: 1, unitPrice: 8400, total: 8400 }], subtotal: 152400, total: 152400, lastSentAt: "2025-11-16T10:30:00Z" },
  { id: "q9", itineraryId: "it12", jobId: "j16", status: "accepted", validityUntil: "2026-02-28", lineItems: [{ description: "Deluxe Twin Suite (2 pax)", qty: 1, unitPrice: 141000, total: 141000 }], subtotal: 141000, total: 141000, lastSentAt: "2025-11-17T10:30:00Z" },
  { id: "q10", itineraryId: "it13", jobId: "j17", status: "accepted", validityUntil: "2026-03-15", lineItems: [{ description: "Royal Twin Suite (2 pax)", qty: 1, unitPrice: 116000, total: 116000 }, { description: "Deluxe Double Suite (2 pax)", qty: 1, unitPrice: 77000, total: 77000 }], subtotal: 193000, total: 193000, lastSentAt: "2025-11-18T10:30:00Z" },
  { id: "q11", itineraryId: "it14", jobId: "j18", status: "accepted", validityUntil: "2026-03-31", lineItems: [{ description: "Pullman Double Suite (2 pax)", qty: 1, unitPrice: 37000, total: 37000 }], subtotal: 37000, total: 37000, lastSentAt: "2025-11-19T10:30:00Z" },
  { id: "q12", itineraryId: "it15", jobId: "j19", status: "accepted", validityUntil: "2026-04-15", lineItems: [{ description: "Deluxe Double Suite (2 pax)", qty: 1, unitPrice: 110000, total: 110000 }], subtotal: 110000, total: 110000, lastSentAt: "2025-11-21T09:30:00Z" },
  { id: "q13", itineraryId: "it16", jobId: "j20", status: "accepted", validityUntil: "2026-04-30", lineItems: [{ description: "Royal Double Suite (2 adults, 2 children)", qty: 1, unitPrice: 124000, total: 124000 }, { description: "Family tour and transfers", qty: 1, unitPrice: 8000, total: 8000 }], subtotal: 132000, total: 132000, lastSentAt: "2025-11-22T09:30:00Z" },
  { id: "q14", itineraryId: "it17", jobId: "j21", status: "accepted", validityUntil: "2026-05-15", lineItems: [{ description: "Pullman Twin Suite (2 pax)", qty: 1, unitPrice: 49800, total: 49800 }], subtotal: 49800, total: 49800, lastSentAt: "2025-11-23T09:30:00Z" },
  { id: "q15", itineraryId: "it18", jobId: "j22", status: "accepted", validityUntil: "2026-05-31", lineItems: [{ description: "Deluxe Twin Suite (2 pax)", qty: 1, unitPrice: 97000, total: 97000 }], subtotal: 97000, total: 97000, lastSentAt: "2025-11-24T09:30:00Z" },
  { id: "q16", itineraryId: "it19", jobId: "j23", status: "accepted", validityUntil: "2026-06-15", lineItems: [{ description: "Pullman Twin Suite (1 pax)", qty: 1, unitPrice: 55000, total: 55000 }], subtotal: 55000, total: 55000, lastSentAt: "2025-11-25T09:30:00Z" },
]

export const quotes: Quote[] = seedQuotes.map((quote) => ({ ...quote, currency: "ZAR" }))

export const payments: Payment[] = [
  { id: "p1", jobId: "j6", amount: 10000, receivedAt: "2025-10-08T10:00:00Z", method: "EFT", reference: "REF-PRN-001", notes: "Deposit payment - 25% of total" },
  { id: "p2", jobId: "j7", amount: 52325, receivedAt: "2025-10-22T14:00:00Z", method: "Credit Card", reference: "CC-MR-001", notes: "Full payment received" },
  { id: "p3", jobId: "j8", amount: 25000, receivedAt: "2025-10-25T09:00:00Z", method: "EFT", reference: "EFT-ET-001", notes: "Deposit" },
  { id: "p4", jobId: "j8", amount: 55000, receivedAt: "2025-10-30T16:00:00Z", method: "Credit Card", reference: "CC-ET-002", notes: "Final balance" },
  { id: "p5", jobId: "j5", amount: 5000, receivedAt: "2025-09-30T11:00:00Z", method: "EFT", reference: "REF-RC-001", notes: "Partial deposit - below threshold" },
  { id: "p6", jobId: "j9", amount: 28000, receivedAt: "2025-11-05T10:00:00Z", method: "EFT", reference: "REF-DK-001", notes: "Full payment" },
  { id: "p7", jobId: "j9", amount: -2000, paymentKind: "refund" as const, receivedAt: "2025-11-08T15:00:00Z", method: "Credit Adjustment", reference: "ADJ-DK-001", notes: "Credit adjustment for service not rendered" },
  { id: "p8", jobId: "j19", amount: 12500, receivedAt: "2025-11-24T11:00:00Z", method: "EFT", reference: "REF-MR-019", notes: "Partial deposit received" },
  { id: "p9", jobId: "j22", amount: 111550, receivedAt: "2025-11-26T15:30:00Z", method: "Credit Card", reference: "CC-MD-022", notes: "Full payment received" },
  { id: "p10", jobId: "j23", amount: 63250, receivedAt: "2025-11-27T15:30:00Z", method: "EFT", reference: "REF-HJ-023", notes: "Full payment received" },
]

export const documents: DocRecord[] = [
  { id: "d1", jobId: "j3", kind: "quote_pdf", generatedAt: "2025-09-15T09:00:00Z", urlOrBlobRef: "#quote-j3.pdf" },
  { id: "d2", jobId: "j7", kind: "quote_pdf", generatedAt: "2025-10-12T14:00:00Z", urlOrBlobRef: "#quote-j7.pdf" },
  { id: "d3", jobId: "j8", kind: "quote_pdf", generatedAt: "2025-10-15T08:00:00Z", urlOrBlobRef: "#quote-j8.pdf" },
  { id: "d4", jobId: "j8", kind: "voucher_pdf", generatedAt: "2025-11-01T08:00:00Z", urlOrBlobRef: "#voucher-j8.pdf" },
]

export const templates: Template[] = [
  { id: "t1", key: "quote_email", name: "Quote Email", sortOrder: 0, subject: "Your Quote - {{jobNumber}}", bodyHtml: "<p>Dear {{customerName}},</p><p>Thank you for your enquiry. Please find attached your personalised quotation for the <strong>{{direction}}</strong> journey departing on <strong>{{departureDate}}</strong>.</p><p>This quote is valid until <strong>{{validityDate}}</strong>.</p><p>Total: <strong>{{total}}</strong></p><p>Should you wish to proceed, please confirm your acceptance and we will arrange the deposit invoice.</p><p>Kind regards,<br/>Luxus Travel & Tours</p>", version: 2, active: true, isSystem: true },
  { id: "t2", key: "follow_up", name: "Follow Up", sortOrder: 1, subject: "Following up on your enquiry - {{jobNumber}}", bodyHtml: "<p>Dear {{customerName}},</p><p>We trust this email finds you well. We are following up on the quotation sent on <strong>{{lastSentDate}}</strong> for your journey.</p><p>Please let us know if you have any questions or would like to make any changes to the itinerary.</p><p>We look forward to hearing from you.</p><p>Warm regards,<br/>Luxus Travel & Tours</p>", version: 1, active: true, isSystem: true },
  { id: "t3", key: "deposit_request", name: "Deposit Request", sortOrder: 2, subject: "Deposit Request - {{jobNumber}}", bodyHtml: "<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. To secure your booking, a deposit of <strong>{{depositAmount}}</strong> is required.</p><p>Banking details:</p><ul><li>Bank: First National Bank</li><li>Account: Luxus Travel & Tours</li><li>Account No: 62XXXXXXXX</li><li>Branch: 250655</li><li>Reference: {{jobNumber}}</li></ul><p>Kind regards,<br/>Luxus Travel & Tours</p>", version: 1, active: true, isSystem: true },
  { id: "t4", key: "voucher_email", name: "Voucher Email", sortOrder: 3, subject: "Your Travel Voucher - {{jobNumber}}", bodyHtml: "<p>Dear {{customerName}},</p><p>Please find attached your travel voucher for the <strong>{{direction}}</strong> journey.</p><p>Departure: <strong>{{departureDate}}</strong></p><p>Please ensure all travellers have their documentation ready. We wish you a wonderful journey!</p><p>Kind regards,<br/>Luxus Travel & Tours</p>", version: 1, active: true, isSystem: true },
]

export const correspondences: Correspondence[] = [
  { id: "cor1", jobId: "j3", channel: "email", subject: "Your Rovos Rail Quote - RR-2025-0003", bodyHtml: "<p>Dear Thomas...</p>", status: "sent", sentAt: "2025-09-15T09:30:00Z" },
  { id: "cor2", jobId: "j7", channel: "email", subject: "Your Rovos Rail Quote - RR-2025-0007", bodyHtml: "<p>Dear Marco...</p>", status: "sent", sentAt: "2025-10-12T14:30:00Z" },
  { id: "cor3", jobId: "j3", channel: "email", subject: "Following up on your Rovos Rail enquiry - RR-2025-0003", bodyHtml: "<p>Dear Thomas, following up...</p>", status: "sent", sentAt: "2025-09-17T10:00:00Z" },
  { id: "cor4", jobId: "j8", channel: "email", subject: "Your Travel Voucher - RR-2025-0008", bodyHtml: "<p>Dear Elizabeth...</p>", status: "sent", sentAt: "2025-11-01T08:30:00Z" },
  { id: "cor5", jobId: "j5", channel: "email", subject: "Deposit Request - RR-2025-0005", bodyHtml: "<p>Dear Robert...</p>", status: "scheduled", scheduledAt: "2025-10-01T09:00:00Z" },
  { id: "cor6", jobId: "j19", channel: "email", subject: "Deposit Request - RR-2025-0019", bodyHtml: "<p>Dear Marco, your deposit invoice is attached.</p>", status: "sent", sentAt: "2025-11-21T10:15:00Z" },
  { id: "cor7", jobId: "j20", channel: "email", subject: "Deposit Request - RR-2025-0020", bodyHtml: "<p>Dear Elizabeth, your deposit invoice is attached.</p>", status: "sent", sentAt: "2025-11-22T10:15:00Z" },
  { id: "cor8", jobId: "j21", channel: "email", subject: "Deposit Request - RR-2025-0021", bodyHtml: "<p>Dear David, your deposit invoice is attached.</p>", status: "sent", sentAt: "2025-11-23T10:15:00Z" },
]

export const auditLogs: AuditLog[] = [
  { id: "a1", actor: "consultant", entityType: "Job", entityId: "j7", action: "pricing_override", beforeJson: JSON.stringify({ total: 48500 }), afterJson: JSON.stringify({ total: 52325 }), metaJson: JSON.stringify({ reason: "Supplier special case", pin: "****" }), createdAt: "2025-10-12T13:55:00Z" },
  { id: "a2", actor: "consultant", entityType: "Job", entityId: "j3", action: "stage_change", beforeJson: JSON.stringify({ stage: "quoted" }), afterJson: JSON.stringify({ stage: "quote_sent" }), createdAt: "2025-09-15T09:30:00Z" },
  { id: "a3", actor: "consultant", entityType: "Job", entityId: "j6", action: "stage_change", beforeJson: JSON.stringify({ stage: "deposit_requested" }), afterJson: JSON.stringify({ stage: "deposit_paid" }), createdAt: "2025-10-10T15:00:00Z" },
  { id: "a4", actor: "consultant", entityType: "Job", entityId: "j8", action: "stage_change", beforeJson: JSON.stringify({ stage: "final_paid" }), afterJson: JSON.stringify({ stage: "voucher_sent" }), createdAt: "2025-11-01T08:00:00Z" },
  { id: "a5", actor: "system", entityType: "Enquiry", entityId: "e1", action: "created_from_web_form", createdAt: "2025-09-01T08:05:00Z" },
  { id: "a6", actor: "consultant", entityType: "Enquiry", entityId: "e3", action: "created_from_paste_import", createdAt: "2025-09-10T14:05:00Z" },
  { id: "a7", actor: "consultant", entityType: "Quote", entityId: "q3", action: "pricing_override", beforeJson: JSON.stringify({ total: 48500 }), afterJson: JSON.stringify({ total: 52325 }), metaJson: JSON.stringify({ reason: "Supplier special case" }), createdAt: "2025-10-12T13:55:00Z" },
  { id: "a8", actor: "consultant", entityType: "Payment", entityId: "p7", action: "credit_adjustment", metaJson: JSON.stringify({ amount: -2000, reason: "Service not rendered" }), createdAt: "2025-11-08T15:00:00Z" },
]

// One priced row per (route, suite). Variant attributes (bedroom type, bedroom layout,
// bathroom type) are M:N joins on the live `suite_types` rows in Supabase.
export const rateCards: RateCard[] = [
  { direction: "Pretoria ↔ Cape Town", suiteType: "Pullman", pricePerPerson: 24900, currency: "ZAR" },
  { direction: "Pretoria ↔ Cape Town", suiteType: "Deluxe",  pricePerPerson: 38500, currency: "ZAR" },
  { direction: "Pretoria ↔ Cape Town", suiteType: "Royal",   pricePerPerson: 62000, currency: "ZAR" },
  { direction: "Pretoria ↔ Durban",         suiteType: "Pullman", pricePerPerson: 18500, currency: "ZAR" },
  { direction: "Pretoria ↔ Victoria Falls", suiteType: "Deluxe",  pricePerPerson: 48500, currency: "ZAR" },
  { direction: "Pretoria ↔ Victoria Falls", suiteType: "Royal",   pricePerPerson: 72000, currency: "ZAR" },
  { direction: "Pretoria ↔ Swakopmund",     suiteType: "Deluxe",  pricePerPerson: 55000, currency: "ZAR" },
  { direction: "Pretoria ↔ Swakopmund",     suiteType: "Royal",   pricePerPerson: 78000, currency: "ZAR" },
  { direction: "Cape Town ↔ Dar es Salaam", suiteType: "Deluxe",  pricePerPerson: 64000, currency: "ZAR" },
  { direction: "Cape Town ↔ Dar es Salaam", suiteType: "Royal",   pricePerPerson: 82500, currency: "ZAR" },
]

export const pipelineHistories: PipelineHistory[] = [
  { id: "ph1", jobId: "j3", fromStage: "enquiry", toStage: "quoted", movedBy: "consultant", movedAt: "2025-09-12T10:00:00Z" },
  { id: "ph2", jobId: "j3", fromStage: "quoted", toStage: "quote_sent", movedBy: "consultant", movedAt: "2025-09-15T09:30:00Z" },
  { id: "ph3", jobId: "j6", fromStage: "enquiry", toStage: "deposit_requested", movedBy: "consultant", movedAt: "2025-10-05T14:00:00Z" },
  { id: "ph4", jobId: "j6", fromStage: "deposit_requested", toStage: "deposit_paid", movedBy: "consultant", movedAt: "2025-10-10T15:00:00Z" },
  { id: "ph5", jobId: "j8", fromStage: "final_paid", toStage: "voucher_sent", movedBy: "consultant", movedAt: "2025-11-01T08:00:00Z" },
]
