import { addDays, trainArrivalDate } from "@/lib/packages/hotel-dates"
import { firstRecord } from "@/lib/utils"
import { mapSupplierKindToServiceType } from "@/lib/voucher/build-service-blocks"
import type { WorksheetServiceLine } from "@/lib/worksheet/pdf/worksheet-document"

type Join<T> = T | T[] | null | undefined

/** The `booking_services` shape the worksheet loads — the booking's real itinerary. */
export interface WorksheetServiceRow {
  id: string
  supplier_id: string | null
  sort_order: number
  service_date: string | null
  nights: number | null
  arrival_date: string | null
  supplier_reference: string | null
  notes: string | null
  suppliers: Join<{ name: string; kind: string }>
  routes: Join<{ duration_days: number | null }>
}

/** A captured transfer/rental/flight trip. `service_id` links it back to its service row. */
export interface WorksheetTransportRow {
  service_id: string | null
  supplier_id: string | null
  sort_order: number
  pickup_at: string | null
  notes: string | null
  supplier_reference: string | null
  suppliers: Join<{ name: string }>
}

/** The Suppliers tab's manually-captured admin dates, keyed by supplier. */
export interface WorksheetScheduleRow {
  supplier_id: string | null
  booking_date: string | null
  confirmation_date: string | null
  payment_made_date: string | null
  paid_with: string | null
}

export interface BuildWorksheetServiceLinesInput {
  services: readonly WorksheetServiceRow[]
  transportRequests: readonly WorksheetTransportRow[]
  schedules: readonly WorksheetScheduleRow[]
}

/**
 * End date of a service. Every kind derives it differently and none of them store it directly
 * (except a flight, whose overnight arrival no offset could know) — the rules mirror
 * `buildVoucherServiceBlocks` so the worksheet and the voucher never disagree about a date.
 */
function resolveToDate(
  serviceType: string,
  serviceDate: string | null,
  nights: number | null,
  arrivalDate: string | null,
  durationDays: number | null,
): string | null {
  if (serviceType === "airline") return arrivalDate
  if (!serviceDate) return null
  if (serviceType === "hotel") return nights && nights > 0 ? addDays(serviceDate, nights) : null
  // An unconfigured route duration leaves this blank rather than silently claiming a same-day
  // arrival on a multi-day train.
  if (durationDays && durationDays > 0) return trainArrivalDate(serviceDate, durationDays)
  return null
}

/**
 * Flattens a booking's services and captured trips into the worksheet's service-line grid.
 *
 * The worksheet is an internal hand-finished document: the description is deliberately nothing but
 * the supplier name, and every financial column is left blank for pen. Only the admin dates the
 * Suppliers tab already captured are carried over, matched by supplier.
 */
export function buildWorksheetServiceLines({
  services,
  transportRequests,
  schedules,
}: BuildWorksheetServiceLinesInput): WorksheetServiceLine[] {
  const scheduleBySupplier = new Map<string, WorksheetScheduleRow>()
  for (const schedule of schedules) {
    if (schedule.supplier_id && !scheduleBySupplier.has(schedule.supplier_id)) {
      scheduleBySupplier.set(schedule.supplier_id, schedule)
    }
  }

  const adminDates = (supplierId: string | null) => {
    const schedule = supplierId ? scheduleBySupplier.get(supplierId) : undefined
    return {
      bookingDate: schedule?.booking_date ?? null,
      confirmationDate: schedule?.confirmation_date ?? null,
      paymentMadeDate: schedule?.payment_made_date ?? null,
      paidWith: schedule?.paid_with ?? null,
    }
  }

  const transportLine = (request: WorksheetTransportRow): WorksheetServiceLine => ({
    fromDate: request.pickup_at ? request.pickup_at.slice(0, 10) : null,
    toDate: null,
    description: firstRecord(request.suppliers)?.name ?? "",
    reservationReference: request.supplier_reference,
    notes: request.notes,
    ...adminDates(request.supplier_id),
  })

  const orderedServices = [...services].sort((a, b) => a.sort_order - b.sort_order)
  const orderedRequests = [...transportRequests].sort((a, b) => a.sort_order - b.sort_order)

  const lines: WorksheetServiceLine[] = orderedServices.flatMap((service) => {
    const supplier = firstRecord(service.suppliers)
    const serviceType = mapSupplierKindToServiceType(supplier?.kind ?? null)

    // A transfer leg is only a container: the trips captured against it are the real lines, so
    // emitting both would double-count every transfer (mirrors buildVoucherServiceBlocks).
    if (serviceType === "transfer") {
      const legRequests = orderedRequests.filter((request) => request.service_id === service.id)
      if (legRequests.length > 0) return legRequests.map(transportLine)
    }

    return [
      {
        fromDate: service.service_date,
        toDate: resolveToDate(
          serviceType,
          service.service_date,
          service.nights,
          service.arrival_date,
          firstRecord(service.routes)?.duration_days ?? null,
        ),
        description: supplier?.name ?? "",
        reservationReference: service.supplier_reference,
        notes: service.notes,
        ...adminDates(service.supplier_id),
      },
    ]
  })

  // Trips typed straight onto the booking never hang off a service row, so nothing above emits
  // them — they are lines in their own right.
  const serviceIds = new Set(orderedServices.map((service) => service.id))
  for (const request of orderedRequests) {
    if (!request.service_id || !serviceIds.has(request.service_id)) {
      lines.push(transportLine(request))
    }
  }

  return lines.sort((a, b) => {
    if (!a.fromDate) return 1
    if (!b.fromDate) return -1
    return a.fromDate.localeCompare(b.fromDate)
  })
}
