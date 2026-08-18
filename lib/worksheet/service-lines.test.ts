import { describe, expect, it } from "vitest"
import {
  buildWorksheetServiceLines,
  type WorksheetScheduleRow,
  type WorksheetServiceRow,
  type WorksheetTransportRow,
} from "@/lib/worksheet/service-lines"

function service(overrides: Partial<WorksheetServiceRow> & { id: string }): WorksheetServiceRow {
  return {
    supplier_id: `supplier-${overrides.id}`,
    sort_order: 0,
    service_date: null,
    nights: null,
    arrival_date: null,
    supplier_reference: null,
    notes: null,
    suppliers: null,
    routes: null,
    ...overrides,
  }
}

function transport(overrides: Partial<WorksheetTransportRow> = {}): WorksheetTransportRow {
  return {
    service_id: null,
    supplier_id: null,
    sort_order: 0,
    pickup_at: null,
    notes: null,
    supplier_reference: null,
    suppliers: null,
    ...overrides,
  }
}

const TRAIN = service({
  id: "train",
  sort_order: 0,
  service_date: "2026-10-14",
  supplier_reference: "BT-9001",
  suppliers: { name: "The Blue Train", kind: "train_operator" },
  routes: {
    duration_days: 2,
    name: null,
    direction_mode: "one_way",
    origin: { name: "Pretoria" },
    destination: { name: "Cape Town" },
  },
})

const HOTEL = service({
  id: "hotel",
  sort_order: 1,
  service_date: "2026-10-15",
  nights: 3,
  suppliers: { name: "Commodore Hotel", kind: "hotel_property" },
})

const FLIGHT = service({
  id: "flight",
  sort_order: 2,
  service_date: "2026-10-18",
  arrival_date: "2026-10-19",
  suppliers: { name: "FlySafair", kind: "airline" },
})

const TRANSFER = service({
  id: "transfer",
  sort_order: 3,
  service_date: "2026-10-20",
  suppliers: { name: "Cape Executive Transfers", kind: "transfers" },
})

describe("buildWorksheetServiceLines", () => {
  it("emits a line for every booked service, not just the transfers", () => {
    const lines = buildWorksheetServiceLines({
      services: [TRAIN, HOTEL, FLIGHT, TRANSFER],
      transportRequests: [],
      schedules: [],
    })

    expect(lines.map((l) => l.description)).toEqual([
      "The Blue Train",
      "Commodore Hotel",
      "FlySafair",
      "Cape Executive Transfers",
    ])
  })

  it("describes a line with the supplier name alone", () => {
    const [line] = buildWorksheetServiceLines({
      services: [HOTEL],
      transportRequests: [],
      schedules: [],
    })

    expect(line.description).toBe("Commodore Hotel")
  })

  it("derives each kind's end date the way the voucher does", () => {
    const lines = buildWorksheetServiceLines({
      services: [TRAIN, HOTEL, FLIGHT],
      transportRequests: [],
      schedules: [],
    })

    // Train: duration_days counts the departure day, so a 2-day run arrives the next day.
    expect(lines[0]).toMatchObject({ fromDate: "2026-10-14", toDate: "2026-10-15" })
    expect(lines[1]).toMatchObject({ fromDate: "2026-10-15", toDate: "2026-10-18" })
    expect(lines[2]).toMatchObject({ fromDate: "2026-10-18", toDate: "2026-10-19" })
  })

  it("leaves a train's end date blank when its route has no duration", () => {
    const [line] = buildWorksheetServiceLines({
      services: [
        service({
          ...TRAIN,
          routes: { duration_days: null, name: null, direction_mode: "one_way", origin: null, destination: null },
        }),
      ],
      transportRequests: [],
      schedules: [],
    })

    expect(line.toDate).toBeNull()
  })

  it("describes a train line with the route booked, alongside the supplier", () => {
    const [line] = buildWorksheetServiceLines({
      services: [
        service({
          ...TRAIN,
          routes: {
            duration_days: 2,
            name: "Pretoria → Cape Town",
            direction_mode: "one_way",
            origin: { name: "Pretoria" },
            destination: { name: "Cape Town" },
          },
        }),
      ],
      transportRequests: [],
      schedules: [],
    })

    expect(line.description).toBe("The Blue Train — Pretoria → Cape Town")
  })

  it("describes a hotel line with the room booked, alongside the supplier", () => {
    const [line] = buildWorksheetServiceLines({
      services: [
        service({
          id: "hotel",
          service_date: "2026-10-18",
          nights: 4,
          suppliers: { name: "Table Bay Hotel", kind: "hotel_property" },
          units: [
            { complimentary_first_night: false, suite_types: { name: "Deluxe Suite" } },
            { complimentary_first_night: false, suite_types: { name: "Deluxe Suite" } },
          ],
        }),
      ],
      transportRequests: [],
      schedules: [],
    })

    expect(line.description).toBe("Table Bay Hotel — Deluxe Suite")
  })

  it("notes a gifted first night on the hotel line so ops confirms the deal that was quoted", () => {
    const [line] = buildWorksheetServiceLines({
      services: [
        service({
          id: "hotel",
          service_date: "2026-10-18",
          nights: 4,
          notes: "Late check-out requested",
          suppliers: { name: "Table Bay Hotel", kind: "hotel_property" },
          units: [{ complimentary_first_night: true }, { complimentary_first_night: false }],
        }),
      ],
      transportRequests: [],
      schedules: [],
    })

    expect(line.notes).toBe("First night complimentary — Late check-out requested")
  })

  it("leaves a hotel line's notes alone when no night was gifted", () => {
    const [line] = buildWorksheetServiceLines({
      services: [
        service({
          id: "hotel",
          service_date: "2026-10-18",
          nights: 4,
          notes: "Late check-out requested",
          suppliers: { name: "Table Bay Hotel", kind: "hotel_property" },
          units: [{ complimentary_first_night: false }],
        }),
      ],
      transportRequests: [],
      schedules: [],
    })

    expect(line.notes).toBe("Late check-out requested")
  })

  it("replaces a transfer service with its captured trips instead of double-counting", () => {
    const lines = buildWorksheetServiceLines({
      services: [TRANSFER],
      transportRequests: [
        transport({
          service_id: "transfer",
          sort_order: 0,
          pickup_at: "2026-10-20T09:30:00+02:00",
          supplier_reference: "480789",
          suppliers: { name: "Cape Executive Transfers" },
        }),
        transport({
          service_id: "transfer",
          sort_order: 1,
          pickup_at: "2026-10-21T06:00:00+02:00",
          supplier_reference: "480788",
          suppliers: { name: "Cape Executive Transfers" },
        }),
      ],
      schedules: [],
    })

    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.reservationReference)).toEqual(["480789", "480788"])
    expect(lines.map((l) => l.fromDate)).toEqual(["2026-10-20", "2026-10-21"])
  })

  it("keeps a transfer service that has no captured trips", () => {
    const lines = buildWorksheetServiceLines({
      services: [TRANSFER],
      transportRequests: [],
      schedules: [],
    })

    expect(lines).toEqual([expect.objectContaining({ description: "Cape Executive Transfers" })])
  })

  it("emits trips that hang off no service row of their own", () => {
    const lines = buildWorksheetServiceLines({
      services: [TRAIN],
      transportRequests: [
        transport({
          pickup_at: "2026-10-13T14:00:00+02:00",
          suppliers: { name: "Airport Shuttle" },
        }),
      ],
      schedules: [],
    })

    expect(lines.map((l) => l.description)).toEqual(["Airport Shuttle", "The Blue Train"])
  })

  it("carries the Suppliers tab's admin dates across by supplier", () => {
    const schedules: WorksheetScheduleRow[] = [
      {
        supplier_id: "supplier-train",
        booking_date: "2026-08-01",
        confirmation_date: "2026-08-03",
        payment_made_date: "2026-08-10",
        paid_with: "EFT",
      },
    ]

    const [train, hotel] = buildWorksheetServiceLines({
      services: [TRAIN, HOTEL],
      transportRequests: [],
      schedules,
    })

    expect(train).toMatchObject({
      bookingDate: "2026-08-01",
      confirmationDate: "2026-08-03",
      paymentMadeDate: "2026-08-10",
      paidWith: "EFT",
    })
    expect(hotel).toMatchObject({ bookingDate: null, paidWith: null })
  })

  it("sorts by start date and pushes undated lines to the end", () => {
    const lines = buildWorksheetServiceLines({
      services: [HOTEL, service({ id: "tbc", suppliers: { name: "TBC Tour", kind: "tour_operator" } }), TRAIN],
      transportRequests: [],
      schedules: [],
    })

    expect(lines.map((l) => l.description)).toEqual(["The Blue Train", "Commodore Hotel", "TBC Tour"])
  })

  it("prints a blank description rather than inventing one when the supplier is missing", () => {
    const [line] = buildWorksheetServiceLines({
      services: [service({ id: "orphan", service_date: "2026-10-14" })],
      transportRequests: [],
      schedules: [],
    })

    expect(line.description).toBe("")
  })
})
