import { type ParsedDraft } from "@/lib/import/parseEmailDraft"

export interface EnquiryImportPayload {
  rawText: string
  purpose: ParsedDraft["trip"]["purpose"]
  title: string
  name: string
  surname: string
  contactNumber: string
  email: string
  country: string
  direction: string
  departureDate: string
  noOfSuites: number
  noOfAdults: number
  noOfChildren: number
  suiteTypes: string[]
  packageOption?: string
  hotelOption?: string
  flightBooking?: string
  flightDepartureDate?: string
  province?: string
  extractedJson: {
    parsedFrom: "email_draft"
    formFields: ParsedDraft["formFields"]
    requestedSuite: string | null
    purpose: ParsedDraft["trip"]["purpose"]
  }
  termsAccepted: true
}

export function buildEnquiryImportPayload(draft: ParsedDraft): EnquiryImportPayload {
  return {
    rawText: draft.rawText,
    purpose: draft.trip.purpose,
    title: draft.customer.title,
    name: draft.customer.firstName,
    surname: draft.customer.surname,
    contactNumber: draft.customer.phone,
    email: draft.customer.email,
    country: draft.customer.country,
    direction: draft.trip.route || "Pretoria to Cape Town",
    departureDate: draft.trip.departureDate,
    noOfSuites: draft.guests.suites,
    noOfAdults: draft.guests.adults,
    noOfChildren: draft.guests.children,
    suiteTypes: draft.guests.suiteType ? [draft.guests.suiteType] : ["Pullman Twin Suite"],
    packageOption: draft.trip.packageOption || undefined,
    hotelOption: draft.trip.hotelOption || undefined,
    flightBooking: draft.trip.flightBooking || undefined,
    flightDepartureDate: draft.trip.flightDepartureDate || undefined,
    province: draft.customer.province || undefined,
    extractedJson: {
      parsedFrom: "email_draft",
      formFields: draft.formFields,
      requestedSuite: draft.guests.suiteType || null,
      purpose: draft.trip.purpose,
    },
    termsAccepted: true,
  }
}
