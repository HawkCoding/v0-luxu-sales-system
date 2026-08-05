import { type ParsedDraft } from "@/lib/import/parseEmailDraft"
import { getDraftSuiteUnits } from "@/lib/import/suite-selections"
import type { SuiteAxis } from "@/lib/suites/suite-vocabulary"

export interface EnquirySuiteUnitPayload {
  suiteNumber: number
  rawPhrase: string
  suiteTypeId: string | null
  suiteTypeName: string | null
  bedroomTypeId: string | null
  bedroomLayoutId: string | null
  bathroomTypeId: string | null
  match: Record<SuiteAxis, { score: number; source: string; notApplicable: boolean }>
  editedAxes: SuiteAxis[]
}

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
  suiteUnits: EnquirySuiteUnitPayload[]
  packageOption?: string
  hotelOption?: string
  hotelPhase?: 'pre' | 'post' | 'none'
  extendStay?: boolean
  additionalServices: boolean
  additionalServicesDetails?: string
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
  const suiteUnits: EnquirySuiteUnitPayload[] = getDraftSuiteUnits(draft).map((unit) => ({
    suiteNumber: unit.suiteNumber,
    rawPhrase: unit.rawPhrase,
    suiteTypeId: unit.suiteTypeId,
    suiteTypeName: unit.suiteTypeName,
    bedroomTypeId: unit.bedroomTypeId,
    bedroomLayoutId: unit.bedroomLayoutId,
    bathroomTypeId: unit.bathroomTypeId,
    match: {
      suiteType: {
        score: unit.match.suiteType.score,
        source: unit.match.suiteType.source,
        notApplicable: unit.match.suiteType.notApplicable,
      },
      bedroomType: {
        score: unit.match.bedroomType.score,
        source: unit.match.bedroomType.source,
        notApplicable: unit.match.bedroomType.notApplicable,
      },
      bedroomLayout: {
        score: unit.match.bedroomLayout.score,
        source: unit.match.bedroomLayout.source,
        notApplicable: unit.match.bedroomLayout.notApplicable,
      },
      bathroomType: {
        score: unit.match.bathroomType.score,
        source: unit.match.bathroomType.source,
        notApplicable: unit.match.bathroomType.notApplicable,
      },
    },
    editedAxes: unit.editedAxes ?? [],
  }))

  return {
    rawText: draft.rawText,
    purpose: draft.trip.purpose,
    title: draft.customer.title,
    name: draft.customer.firstName,
    surname: draft.customer.surname,
    contactNumber: draft.customer.phone,
    email: draft.customer.email,
    country: draft.customer.country,
    // No fabricated fallback: an unparsed route must stay empty and be reported, not silently
    // become a Pretoria-Cape Town enquiry.
    direction: draft.trip.route,
    departureDate: draft.trip.departureDate,
    supplierId: draft.trip.supplierId || undefined,
    noOfSuites: draft.guests.suites,
    noOfAdults: draft.guests.adults,
    noOfChildren: draft.guests.children,
    // Likewise no placeholder suite type: unresolved units travel with null ids and the raw
    // wording, so the consultant sees what the customer asked for and picks it themselves.
    suiteUnits,
    packageOption: draft.trip.packageOption || undefined,
    hotelOption: draft.trip.hotelOption || undefined,
    hotelPhase: draft.trip.hotelPhase || undefined,
    extendStay: draft.trip.extendStay ?? undefined,
    additionalServices: draft.additionalServices.requested,
    additionalServicesDetails: draft.additionalServices.details || undefined,
    flightBooking: draft.trip.flightBooking || undefined,
    flightDepartureDate: draft.trip.flightDepartureDate || undefined,
    province: draft.customer.province || undefined,
    linkedCustomerId: draft.linkedCustomerId || undefined,
    extractedJson: {
      parsedFrom: "email_draft",
      formFields: draft.formFields,
      requestedSuite: draft.guests.suitePhrases[0] ?? null,
      purpose: draft.trip.purpose,
    },
    termsAccepted: true,
  }
}
