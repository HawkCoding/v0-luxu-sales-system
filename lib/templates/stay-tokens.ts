// Stay-shaped email tokens, for bookings whose product is a property rather than a journey.
//
// Kruger Shalati is sold as a hotel — per room, per night, check-in/check-out, no route and no
// departure (see supabase/migrations/20260902090000_standalone_suppliers.sql). The rail vocabulary
// has nothing accurate to say about it: {{direction}} falls back to the stay's length and
// {{departureDate}} is really a check-in date wearing a rail name. These tokens name what a stay
// actually is.
//
// Read straight off booking_services rather than off buildVoucherServiceBlocks, because that only
// runs once a quote exists (see lib/templates/resolve-shared-tokens.ts) and a stay's check-in date
// is just as true on a reservation-received or follow-up send.

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"
import { addDays } from "@/lib/packages/hotel-dates"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatTimeOfDay } from "@/lib/quotes/quote-presentation"
import { getHotelDefaultTimes, parseTimeOfDay } from "@/lib/suppliers/hotel-default-times"
import { firstRecord } from "@/lib/utils"

const SELECT =
  "id, sort_order, service_date, nights, supplier_id, " +
  "route:routes(name), " +
  "supplier:suppliers(name, kind, location, street_address, default_time_start, default_time_end)"

/** Every value is already display-formatted; empty string means "this booking has nothing to say",
 *  which the caller turns into the em-dash placeholder. */
export interface StayTokens {
  checkInDate: string
  checkOutDate: string
  nights: string
  mealPlan: string
  propertyName: string
  propertyLocation: string
  propertyAddress: string
  checkInTime: string
  checkOutTime: string
}

const EMPTY_STAY_TOKENS: StayTokens = {
  checkInDate: "",
  checkOutDate: "",
  nights: "",
  mealPlan: "",
  propertyName: "",
  propertyLocation: "",
  propertyAddress: "",
  checkInTime: "",
  checkOutTime: "",
}

/** A copy of the empty set, so callers can't mutate the shared constant. */
export function emptyStayTokens(): StayTokens {
  return { ...EMPTY_STAY_TOKENS }
}

type NamedRow = { name: string | null } | { name: string | null }[] | null
type SupplierRow =
  | {
      name: string | null
      kind: SupplierKind | null
      location: string | null
      street_address: string | null
      default_time_start: string | null
      default_time_end: string | null
    }
  | {
      name: string | null
      kind: SupplierKind | null
      location: string | null
      street_address: string | null
      default_time_start: string | null
      default_time_end: string | null
    }[]
  | null

interface LegRow {
  id: string
  sort_order: number | null
  service_date: string | null
  nights: number | null
  supplier_id: string | null
  route: NamedRow
  supplier: SupplierRow
}

/**
 * Which hotel leg names the stay. Mirrors resolvePrimarySupplier's precedence
 * (lib/quotes/resolve-primary-route.ts): the leg belonging to the booking's own primary supplier
 * wins, so a standalone Kruger Shalati stay is never described by a pre-night hotel booked
 * alongside it. Falls back to the first hotel leg in itinerary order, which is what a rail booking
 * with one pre-stay wants.
 */
function pickStayLeg(legs: LegRow[], primarySupplierId: string | null): LegRow | null {
  const hotels = legs
    .filter((leg) => firstRecord(leg.supplier)?.kind === "hotel_property")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  if (hotels.length === 0) return null

  return (
    (primarySupplierId ? hotels.find((leg) => leg.supplier_id === primarySupplierId) : null) ??
    hotels[0]
  )
}

/**
 * Resolves the accommodation tokens for a booking, or empty strings when it has no hotel leg (a
 * pure rail booking) — a send must degrade to a missing line, never fail. `bookingNights` is the
 * enquiry-level fallback (bookings.duration_nights) for a stay captured before its leg carried a
 * night count of its own.
 */
export async function loadStayTokens(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  primarySupplierId: string | null,
  bookingNights: number | null,
): Promise<StayTokens> {
  const { data, error } = await supabase
    .from("booking_services")
    .select(SELECT)
    .eq("booking_id", bookingId)
    .eq("selected", true)

  if (error || !data) return emptyStayTokens()

  // Nested embeds outrun the generated select-string inference, as elsewhere in the codebase
  // (see lib/templates/suite-selections.ts).
  const leg = pickStayLeg(data as unknown as LegRow[], primarySupplierId)
  if (!leg) return emptyStayTokens()

  const supplier = firstRecord(leg.supplier)
  const nights = leg.nights && leg.nights > 0 ? leg.nights : bookingNights && bookingNights > 0 ? bookingNights : null

  // Check-out is derived, never stored: nights is the fact the consultant captured, so deriving
  // keeps the two from ever disagreeing (the same rule lib/voucher/build-service-blocks.ts uses).
  const checkIn = leg.service_date
  const checkOut = checkIn && nights ? addDays(checkIn, nights) : null

  // A property with no times of its own falls back to the app-wide defaults, exactly as the
  // voucher does. Only fetched once we know there is a stay to describe.
  const defaults = await getHotelDefaultTimes(supabase)

  return {
    checkInDate: formatDisplayDateLong(checkIn),
    checkOutDate: formatDisplayDateLong(checkOut),
    nights: nights ? String(nights) : "",
    // A hotel supplier's "route" is its meal plan — the same row, relabelled by
    // SUPPLIER_VOCABULARY (lib/types.ts).
    mealPlan: firstRecord(leg.route)?.name?.trim() ?? "",
    propertyName: supplier?.name?.trim() ?? "",
    propertyLocation: supplier?.location?.trim() ?? "",
    propertyAddress: supplier?.street_address?.trim() ?? "",
    checkInTime: formatTimeOfDay(parseTimeOfDay(supplier?.default_time_start, defaults.checkIn)) ?? "",
    checkOutTime: formatTimeOfDay(parseTimeOfDay(supplier?.default_time_end, defaults.checkOut)) ?? "",
  }
}
