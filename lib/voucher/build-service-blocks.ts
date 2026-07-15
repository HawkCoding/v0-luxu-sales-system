import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  VoucherServiceBlock,
  VoucherServiceBlockContact,
  VoucherServiceBlockData,
  VoucherServiceType,
} from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { addDays, trainArrivalDate } from "@/lib/packages/hotel-dates"
import { getHotelDefaultTimes, type HotelDefaultTimes } from "@/lib/suppliers/hotel-default-times"
import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"
import { firstRecord } from "@/lib/utils"

export function mapSupplierKindToServiceType(kind: SupplierKind | string | null): VoucherServiceType {
  switch (kind) {
    case "train_operator":
      return "train"
    case "hotel_property":
      return "hotel"
    case "transfers":
    case "vehicle_rental":
      return "transfer"
    case "tour_operator":
      return "tour"
    case "airline":
      return "airline"
    default:
      return "additional_service"
  }
}

interface BuildContext {
  bookingId: string
  supplierReferenceFallback?: string | null
  additionalServicesDetails?: string | null
  /** Fallback check-in/check-out times when a hotel has no default times of its own. */
  hotelDefaultTimes?: HotelDefaultTimes
}

interface SupplierJoin {
  name: string | null
  phone: string | null
  email: string | null
  website: string | null
  location: string | null
  kind: SupplierKind | string | null
  default_time_start: string | null
  default_time_end: string | null
  inclusions: string[] | null
  exclusions: string[] | null
}

interface RouteJoin {
  name: string | null
  duration_days: number | null
  pickup_point: string | null
  dropoff_point: string | null
}

interface SelectionJoinRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  suite_type_id: string | null
  service_date: string | null
  nights: number | null
  notes: string | null
  package_legs: { sort_order: number; label: string | null } | { sort_order: number; label: string | null }[] | null
  suppliers: SupplierJoin | SupplierJoin[] | null
  routes: RouteJoin | RouteJoin[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
}

export interface BuildVoucherServiceBlocksResult {
  blocks: VoucherServiceBlock[]
}

/** Postgres `time` comes back as HH:MM:SS; the documents only ever show HH:MM. */
function toHoursMinutes(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 5)
}

function cleanList(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
}

/**
 * Every itinerary surface — quote PDF, quote email, itinerary PDF, voucher — renders from these
 * blocks, so this is the one place a leg's dates, times and client-facing bullets get resolved.
 *
 * Dates: a hotel's service_date is its check-in, so check-out is check-in + nights. Everything else
 * runs for its route's duration_days, which counts the departure day itself.
 *
 * Times: a supplier's own default times win; hotels fall back to the app-wide check-in/check-out
 * settings so a stay always states a time.
 */
export async function buildVoucherServiceBlocks(
  supabase: SupabaseClient<Database>,
  context: BuildContext,
): Promise<BuildVoucherServiceBlocksResult> {
  const { data: rows, error } = await supabase
    .from("booking_package_selections")
    .select(
      `id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, nights, notes,
       package_legs(sort_order, label),
       suppliers(name, phone, email, website, location, kind, default_time_start, default_time_end, inclusions, exclusions),
       routes(name, duration_days, pickup_point, dropoff_point),
       suite_types(name)`,
    )
    .eq("booking_id", context.bookingId)

  if (error) throw error

  const selections = ((rows ?? []) as unknown as SelectionJoinRow[]).filter((row) => row.selected)

  const hotelDefaults =
    context.hotelDefaultTimes ??
    (selections.some((row) => firstRecord(row.suppliers)?.kind === "hotel_property")
      ? await getHotelDefaultTimes(supabase)
      : null)

  const blocks: VoucherServiceBlock[] = selections.map((row, idx) => {
    const supplier = firstRecord(row.suppliers)
    const route = firstRecord(row.routes)
    const suite = firstRecord(row.suite_types)
    const leg = firstRecord(row.package_legs)

    const serviceType = mapSupplierKindToServiceType(supplier?.kind ?? null)
    const isHotel = serviceType === "hotel"

    const contactDetails: VoucherServiceBlockContact = {
      name: supplier?.name ?? null,
      phone: supplier?.phone ?? null,
      email: supplier?.email ?? null,
      website: supplier?.website ?? null,
      location: supplier?.location ?? null,
    }

    const serviceDate = row.service_date ?? null
    const nights = isHotel ? (row.nights && row.nights > 0 ? row.nights : null) : null
    const durationDays = route?.duration_days ?? null

    let arrivalDate: string | null = null
    if (serviceDate) {
      if (isHotel) {
        if (nights) arrivalDate = addDays(serviceDate, nights)
      } else if (durationDays && durationDays > 1) {
        arrivalDate = trainArrivalDate(serviceDate, durationDays)
      }
    }

    const startTime =
      toHoursMinutes(supplier?.default_time_start) ?? (isHotel ? hotelDefaults?.checkIn ?? null : null)
    const endTime =
      toHoursMinutes(supplier?.default_time_end) ?? (isHotel ? hotelDefaults?.checkOut ?? null : null)

    // A hotel leg's "route" is its meal plan (see lib/packages/apply-dialog-state.ts).
    const serviceData: VoucherServiceBlockData = {
      route: isHotel ? null : route?.name ?? null,
      mealPlan: isHotel ? route?.name ?? null : null,
      suiteType: suite?.name ?? null,
      roomType: isHotel ? suite?.name ?? null : null,
      departureDate: serviceDate,
      arrivalDate,
      startTime,
      endTime,
      nights,
      durationDays,
      pickup: serviceType === "transfer" ? route?.pickup_point ?? null : null,
      dropoff: serviceType === "transfer" ? route?.dropoff_point ?? null : null,
      notes: row.notes ?? null,
      inclusions: cleanList(supplier?.inclusions),
      exclusions: cleanList(supplier?.exclusions),
    }

    return {
      serviceType,
      title: leg?.label?.trim() || voucherServiceTypeLabel(serviceType),
      supplierReference: context.supplierReferenceFallback ?? null,
      contactDetails,
      serviceData,
      displayOrder: leg?.sort_order ?? idx,
    }
  })

  if (context.additionalServicesDetails && context.additionalServicesDetails.trim()) {
    blocks.push({
      serviceType: "additional_service",
      title: "Additional Services",
      supplierReference: context.supplierReferenceFallback ?? null,
      contactDetails: {},
      serviceData: { notes: context.additionalServicesDetails.trim() },
      displayOrder: blocks.length,
    })
  }

  return { blocks }
}
