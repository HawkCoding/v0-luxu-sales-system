// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { JobTransferTimesTab } from "@/components/job-transfer-times-tab"
import type { JobMovementTimeRow } from "@/lib/use-data"

const mutate = vi.fn()
let rows: JobMovementTimeRow[] = []
let response: { rows: JobMovementTimeRow[] } | undefined

// Same object until the rows change, as SWR does; the tab's draft effect keys off its identity.
function stableResponse() {
  if (response?.rows !== rows) response = { rows }
  return response
}

vi.mock("@/lib/use-data", () => ({
  useJobMovementTimes: () => ({ data: stableResponse(), error: undefined, isLoading: false, mutate }),
}))

function flight(overrides: Partial<JobMovementTimeRow> = {}): JobMovementTimeRow {
  return {
    key: "service:flight",
    kind: "service",
    movementType: "flight",
    id: "flight",
    label: "FlySafair",
    supplierName: "FlySafair",
    departureDate: null,
    departureTime: null,
    arrivalDate: null,
    arrivalTime: null,
    flightNumber: null,
    departureAirportCode: null,
    arrivalAirportCode: null,
    handLuggageKg: null,
    checkedLuggageKg: null,
    hasArrival: true,
    hasFlightIdentity: true,
    updatedAt: null,
    ...overrides,
  } as JobMovementTimeRow
}

const flightNumberBox = () => screen.getByLabelText("Flight number") as HTMLInputElement

describe("JobTransferTimesTab", () => {
  beforeEach(() => {
    mutate.mockReset()
    rows = []
  })
  afterEach(cleanup)

  it("refetches when the tab is opened, not while hidden", () => {
    const { rerender } = render(<JobTransferTimesTab bookingId="b1" isActive={false} />)
    expect(mutate).not.toHaveBeenCalled()

    rerender(<JobTransferTimesTab bookingId="b1" isActive />)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("refetches an open tab when the booking changes", () => {
    const { rerender } = render(<JobTransferTimesTab bookingId="b1" isActive refreshKey="t1" />)
    mutate.mockClear()
    rerender(<JobTransferTimesTab bookingId="b1" isActive refreshKey="t2" />)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("points to Build Booking while the job has no movements", () => {
    render(<JobTransferTimesTab bookingId="b1" isActive />)
    expect(screen.getByText(/Add them in Build Booking/)).toBeTruthy()
  })

  it("lists movements that appear after the first load", () => {
    const { rerender } = render(<JobTransferTimesTab bookingId="b1" isActive />)
    rows = [flight()]
    rerender(<JobTransferTimesTab bookingId="b1" isActive />)
    expect(flightNumberBox()).toBeTruthy()
    expect(screen.queryByText(/Add them in Build Booking/)).toBeNull()
  })

  it("updates an untouched row from the server", () => {
    rows = [flight()]
    const { rerender } = render(<JobTransferTimesTab bookingId="b1" isActive />)
    rows = [flight({ flightNumber: "FA212" })]
    rerender(<JobTransferTimesTab bookingId="b1" isActive />)
    expect(flightNumberBox().value).toBe("FA212")
  })

  it("keeps unsaved typing when the server data changes", () => {
    rows = [flight()]
    const { rerender } = render(<JobTransferTimesTab bookingId="b1" isActive />)
    fireEvent.change(flightNumberBox(), { target: { value: "typed" } })

    rows = [flight({ flightNumber: "FA212" })]
    rerender(<JobTransferTimesTab bookingId="b1" isActive />)
    expect(flightNumberBox().value).toBe("typed")
  })
})
