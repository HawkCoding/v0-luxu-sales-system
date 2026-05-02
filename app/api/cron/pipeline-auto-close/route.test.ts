import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"
import { applyTransition } from "@/lib/pipeline/apply-transition"

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => fakeSupabase),
}))

vi.mock("@/lib/pipeline/apply-transition", () => ({
  applyTransition: vi.fn(async (_supabase: unknown, input: { targetStage: string }) => ({
    updated: { stage: input.targetStage },
  })),
}))

interface TestBooking {
  id: string
  booking_number: string
  stage: "voucher_sent" | "trip_active"
  source: "web_form"
  raw_text: string | null
  updated_at: string
  customer_id: string
  consultant: string | null
  departure_date: string | null
  duration_nights: number | null
  customer: { first_name: string | null } | null
  route: { name: string | null } | null
}

interface InsertOperation {
  table: string
  payload: unknown
}

let testBookings: TestBooking[] = []
let existingThankYouBookingIds: string[] = []
let insertOperations: InsertOperation[] = []

class FakeSelectQuery {
  constructor(private readonly table: string) {}

  in(): Promise<{ data: unknown[]; error: null }> | FakeSelectQuery {
    if (this.table === "bookings") return this

    return Promise.resolve({
      data: existingThankYouBookingIds.map((booking_id) => ({ booking_id })),
      error: null,
    })
  }

  eq(): FakeSelectQuery {
    return this
  }

  not(): Promise<{ data: TestBooking[]; error: null }> {
    return Promise.resolve({ data: testBookings, error: null })
  }
}

const fakeSupabase = {
  from(table: string) {
    return {
      select() {
        return new FakeSelectQuery(table)
      },
      insert(payload: unknown) {
        insertOperations.push({ table, payload })
        return Promise.resolve({ error: null })
      },
    }
  },
}

function createBooking(id: string, departureDate: string): TestBooking {
  return {
    id,
    booking_number: `BT-2026-${id}`,
    stage: "voucher_sent",
    source: "web_form",
    raw_text: null,
    updated_at: "2026-04-30T09:00:00.000Z",
    customer_id: `customer-${id}`,
    consultant: "DR",
    departure_date: departureDate,
    duration_nights: 0,
    customer: { first_name: "Ada" },
    route: { name: "Blue Train" },
  }
}

function authedRequest(): Request {
  return new Request("http://localhost:3000/api/cron/pipeline-auto-close", {
    headers: { authorization: "Bearer test-secret" },
  })
}

describe("pipeline auto-close cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"))
    testBookings = []
    existingThankYouBookingIds = []
    insertOperations = []
    vi.mocked(applyTransition).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.CRON_SECRET
  })

  it("schedules a catch-up thank-you inside the window", async () => {
    testBookings = [createBooking("booking-1", "2026-05-05")]

    const response = await GET(authedRequest())
    const body = await response.json()

    expect(body).toEqual({ thankYousScheduled: 1, autoClosed: 0 })
    expect(insertOperations).toContainEqual(
      expect.objectContaining({
        table: "correspondences",
        payload: expect.objectContaining({
          booking_id: "booking-1",
          kind: "thank_you",
          status: "scheduled",
        }),
      }),
    )
  })

  it("does not schedule a duplicate catch-up thank-you", async () => {
    testBookings = [createBooking("booking-2", "2026-05-05")]
    existingThankYouBookingIds = ["booking-2"]

    const response = await GET(authedRequest())
    const body = await response.json()

    expect(body).toEqual({ thankYousScheduled: 0, autoClosed: 0 })
    expect(insertOperations).not.toContainEqual(
      expect.objectContaining({
        table: "correspondences",
      }),
    )
  })

  it("skips late thank-yous outside the window while still auto-closing", async () => {
    testBookings = [createBooking("booking-3", "2026-04-20")]

    const response = await GET(authedRequest())
    const body = await response.json()

    expect(body).toEqual({ thankYousScheduled: 0, autoClosed: 1 })
    expect(insertOperations).not.toContainEqual(
      expect.objectContaining({
        table: "correspondences",
      }),
    )
    expect(applyTransition).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({
        targetStage: "closed",
      }),
    )
  })
})
