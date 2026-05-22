import { type ParsedDraft } from "@/lib/import/parseEmailDraft"
import { getDraftSuiteTypeNames } from "@/lib/import/suite-selections"

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
  supplierId?: string
  noOfSuites: number
  noOfAdults: number
  noOfChildren: number
  suiteTypes: string[]
  suiteSelections?: Array<{
    suiteTypeId: string
    suiteTypeName: string
  }>
  packageOption?: string
  hotelOption?: string
  flightBooking?: string
  flightDepartureDate?: string
  province?: string
  linkedCustomerId?: string
  extractedJson: {
    parsedFrom: "email_draft"
    formFields: ParsedDraft["formFields"]
    requestedSuite: string | null
    purpose: ParsedDraft["trip"]["purpose"]
  }
  termsAccepted: true
}

export function buildEnquiryImportPayload(draft: ParsedDraft): EnquiryImportPayload {
  const suiteTypes = getDraftSuiteTypeNames(draft)
  const suiteSelections = draft.guests.suiteSelections?.filter(
    (selection) => selection.suiteTypeId && selection.suiteTypeName,
  )

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
    supplierId: draft.trip.supplierId || undefined,
    noOfSuites: draft.guests.suites,
    noOfAdults: draft.guests.adults,
    noOfChildren: draft.guests.children,
    suiteTypes: suiteTypes.length > 0 ? suiteTypes : ["Pullman Twin Suite"],
    suiteSelections: suiteSelections && suiteSelections.length > 0 ? suiteSelections : undefined,
    packageOption: draft.trip.packageOption || undefined,
    hotelOption: draft.trip.hotelOption || undefined,
    flightBooking: draft.trip.flightBooking || undefined,
    flightDepartureDate: draft.trip.flightDepartureDate || undefined,
    province: draft.customer.province || undefined,
    linkedCustomerId: draft.linkedCustomerId || undefined,
    extractedJson: {
      parsedFrom: "email_draft",
      formFields: draft.formFields,
      requestedSuite: suiteTypes[0] || null,
      purpose: draft.trip.purpose,
    },
    termsAccepted: true,
  }
}
