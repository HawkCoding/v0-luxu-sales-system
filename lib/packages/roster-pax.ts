import { classifyAge, type AgeBuckets } from "@/lib/pricing/age-buckets"
import { normalizeDateOfBirth } from "@/lib/date-format"
import { projectPassengerTotals, type PassengerTotals } from "@/lib/packages/passenger-totals"

/** The parts of a traveller row this module cares about. */
export interface RosterTraveller {
  dateOfBirth?: string | null
  isChild?: boolean
}

/** The booking columns the roster is compared against and written back to. */
export interface BookingPax {
  noOfAdults: number
  noOfChildren: number
  childAges: number[]
}

export interface RosterPax extends BookingPax {
  /** The same roster projected into the buckets the pricing engine actually charges by. */
  totals: PassengerTotals
  /** Guests with no readable date of birth — bucketed by the "child" tick instead. */
  undatedCount: number
  /** Head count of the roster itself. */
  total: number
}

interface DateParts {
  year: number
  month: number
  day: number
}

function parseIsoParts(value: string | null): DateParts | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/**
 * Whole years completed by `onDate`. Compared on calendar parts rather than epoch maths so a
 * birthday is a birthday regardless of the server's timezone. Returns null for anything
 * normalizeDateOfBirth can't read confidently, or a date of birth after the reference date.
 */
export function ageOnDate(dateOfBirth: string | null | undefined, onDate: string): number | null {
  const dob = parseIsoParts(normalizeDateOfBirth(dateOfBirth))
  const at = parseIsoParts(onDate)
  if (!dob || !at) return null

  let age = at.year - dob.year
  if (at.month < dob.month || (at.month === dob.month && at.day < dob.day)) age -= 1
  return age < 0 ? null : age
}

/**
 * Turn a captured guest roster into the pax shape the pricing engine reads
 * (bookings.no_of_adults / no_of_children / child_ages).
 *
 * child_ages carries only the ages we actually know, while no_of_children counts every non-adult —
 * a guest ticked as a child with no date of birth therefore lands in the child bucket without a
 * fabricated age, exactly as projectPassengerTotals expects. Guests with neither a date of birth
 * nor the child tick count as adults, and `undatedCount` lets the UI say why a number is a guess.
 *
 * Pure and sync so the same arithmetic runs in the API route and in a client-side preview.
 */
export function bucketRoster(
  travellers: RosterTraveller[],
  buckets: AgeBuckets,
  referenceDate: string,
): RosterPax {
  let noOfAdults = 0
  let noOfChildren = 0
  let undatedCount = 0
  const childAges: number[] = []

  for (const traveller of travellers) {
    const age = ageOnDate(traveller.dateOfBirth, referenceDate)

    if (age === null) {
      undatedCount += 1
      if (traveller.isChild) noOfChildren += 1
      else noOfAdults += 1
      continue
    }

    if (classifyAge(age, buckets) === "adult") {
      noOfAdults += 1
      continue
    }

    noOfChildren += 1
    childAges.push(age)
  }

  const pax: BookingPax = { noOfAdults, noOfChildren, childAges }
  return {
    ...pax,
    totals: projectPassengerTotals(pax, buckets),
    undatedCount,
    total: travellers.length,
  }
}

export interface RosterComparison {
  /** False when the roster and the booking's pax disagree — the mismatch QA 13 hits at invoice time. */
  matches: boolean
  /** Null when no guests have been captured yet: nothing to compare, so nothing to warn about. */
  roster: (PassengerTotals & { total: number; undatedCount: number }) | null
  booking: PassengerTotals & { total: number }
  referenceDate: string
}

function headCount(totals: PassengerTotals): number {
  return totals.adultCount + totals.childCount + totals.infantCount
}

/**
 * Compares a captured roster against the pax the booking is priced from. Booking-level default age
 * buckets are used deliberately: a supplier's own infant/child overrides only apply to that
 * supplier's legs, and this comparison is about the booking as a whole.
 */
export function compareRosterToBooking(
  travellers: RosterTraveller[],
  booking: BookingPax,
  buckets: AgeBuckets,
  referenceDate: string,
): RosterComparison {
  const bookingTotals = projectPassengerTotals(booking, buckets)
  const bookingSide = { ...bookingTotals, total: headCount(bookingTotals) }

  if (travellers.length === 0) {
    return { matches: true, roster: null, booking: bookingSide, referenceDate }
  }

  const roster = bucketRoster(travellers, buckets, referenceDate)
  const matches =
    roster.totals.adultCount === bookingTotals.adultCount &&
    roster.totals.childCount === bookingTotals.childCount &&
    roster.totals.infantCount === bookingTotals.infantCount

  return {
    matches,
    roster: { ...roster.totals, total: roster.total, undatedCount: roster.undatedCount },
    booking: bookingSide,
    referenceDate,
  }
}
