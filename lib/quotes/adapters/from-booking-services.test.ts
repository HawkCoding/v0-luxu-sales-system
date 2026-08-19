import { describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/types"
import { bookingServicesToLegSelections } from "@/lib/quotes/adapters/from-booking-services"

type BookingServiceRow = Database["public"]["Tables"]["booking_services"]["Row"]
type BookingServiceUnitRow = Database["public"]["Tables"]["booking_service_units"]["Row"]

function service(partial: Partial<BookingServiceRow> & Pick<BookingServiceRow, "id">): BookingServiceRow {
  return {
    booking_id: "booking-1",
    supplier_id: "supplier-1",
    label: null,
    sort_order: 0,
    selected: true,
    route_id: null,
    route_reversed: false,
    suite_type_id: null,
    rate_type_id: null,
    service_date: null,
    nights: null,
    date_anchor: null,
    notes: null,
    supplier_reference: null,
    supplier_contact_name: null,
    voucher_footnote: null,
    excursions: null,
    departure_time: null,
    arrival_date: null,
    arrival_time: null,
    flight_number: null,
    departure_airport_code: null,
    arrival_airport_code: null,
    hand_luggage_kg: null,
    checked_luggage_kg: null,
    origin: "consultant",
    price_currency: "ZAR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  }
}

function unit(partial: Partial<BookingServiceUnitRow> & Pick<BookingServiceUnitRow, "id" | "service_id">): BookingServiceUnitRow {
  return {
    suite_type_id: null,
    bedroom_type_id: null,
    bedroom_layout_id: null,
    bathroom_type_id: null,
    adult_count: 0,
    child_count: 0,
    infant_count: 0,
    manual_adult_price: null,
    manual_child_price: null,
    manual_infant_price: null,
    manual_room_price: null,
    manual_room_price_set_at: null,
    manual_room_price_set_by: null,
    manual_tour_price: null,
    manual_tour_price_set_at: null,
    manual_tour_price_set_by: null,
    complimentary_first_night: false,
    sort_order: 0,
    origin: "consultant",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  }
}

describe("bookingServicesToLegSelections", () => {
  it("maps a service's own columns onto the leg-selection shape", () => {
    const services = [
      service({
        id: "svc-1",
        route_id: "route-1",
        route_reversed: true,
        rate_type_id: "rate-1",
        service_date: "2026-09-01",
        nights: 3,
      }),
    ]

    const [selection] = bookingServicesToLegSelections(services, [])

    expect(selection).toMatchObject({
      legId: "svc-1",
      selected: true,
      routeId: "route-1",
      routeReversed: true,
      rateTypeId: "rate-1",
      serviceDate: "2026-09-01",
      nights: 3,
      units: [],
    })
  })

  it("drops units with no resolved suite type -- never invents a room for an unknown one", () => {
    const services = [service({ id: "svc-1" })]
    const units = [
      unit({ id: "u1", service_id: "svc-1", suite_type_id: "suite-a", adult_count: 2 }),
      unit({ id: "u2", service_id: "svc-1", suite_type_id: null, adult_count: 1 }),
    ]

    const [selection] = bookingServicesToLegSelections(services, units)

    expect(selection.units).toHaveLength(1)
    expect(selection.units?.[0]).toMatchObject({ suiteTypeId: "suite-a", adultCount: 2 })
  })

  it("carries bedroom/layout/bathroom config through per unit", () => {
    const services = [service({ id: "svc-1" })]
    const units = [
      unit({
        id: "u1",
        service_id: "svc-1",
        suite_type_id: "suite-a",
        bedroom_type_id: "bed-1",
        bedroom_layout_id: "layout-1",
        bathroom_type_id: "bath-1",
        adult_count: 1,
        child_count: 1,
        infant_count: 0,
      }),
    ]

    const [selection] = bookingServicesToLegSelections(services, units)

    expect(selection.units?.[0]).toMatchObject({
      suiteTypeId: "suite-a",
      bedroomTypeId: "bed-1",
      bedroomLayoutId: "layout-1",
      bathroomTypeId: "bath-1",
      adultCount: 1,
      childCount: 1,
      infantCount: 0,
    })
  })

  it("orders units by sort_order and only attaches units belonging to that service", () => {
    const services = [service({ id: "svc-1" }), service({ id: "svc-2" })]
    const units = [
      unit({ id: "u1", service_id: "svc-1", suite_type_id: "suite-b", sort_order: 1 }),
      unit({ id: "u2", service_id: "svc-1", suite_type_id: "suite-a", sort_order: 0 }),
      unit({ id: "u3", service_id: "svc-2", suite_type_id: "suite-c", sort_order: 0 }),
    ]

    const [selection1, selection2] = bookingServicesToLegSelections(services, units)

    expect(selection1.units?.map((u) => u.suiteTypeId)).toEqual(["suite-a", "suite-b"])
    expect(selection2.units?.map((u) => u.suiteTypeId)).toEqual(["suite-c"])
  })

  it("maps a leg-level suite_type_id (transfer/rental vehicle category) onto suiteTypeId", () => {
    const services = [service({ id: "svc-1", suite_type_id: "vehicle-sedan" })]

    const [selection] = bookingServicesToLegSelections(services, [])

    expect(selection.suiteTypeId).toBe("vehicle-sedan")
  })
})
