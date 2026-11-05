// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { JobReferencesTab } from "@/components/job-references-tab"
import type { JobLegReferenceRow } from "@/lib/use-data"

const mutate = vi.fn()
let rows: JobLegReferenceRow[] = []
let response: { rows: JobLegReferenceRow[] } | undefined

// Same object until the rows change, as SWR does; the tab's draft effect keys off its identity.
function stableResponse() {
  if (response?.rows !== rows) response = { rows }
  return response
}

vi.mock("@/lib/use-data", () => ({
  useJobLegReferences: () => ({ data: stableResponse(), error: undefined, isLoading: false, mutate }),
}))

function row(overrides: Partial<JobLegReferenceRow> = {}): JobLegReferenceRow {
  return {
    key: "service:train",
    kind: "service",
    id: "train",
    label: "Rovos Rail",
    supplierName: "Rovos Rail",
    supplierReference: null,
    supplierContactName: null,
    voucherFootnote: null,
    isAirline: false,
    flightNumber: null,
    ...overrides,
  } as JobLegReferenceRow
}

const referenceBox = () => screen.getByLabelText("Reference number") as HTMLInputElement

describe("JobReferencesTab", () => {
  beforeEach(() => {
    mutate.mockReset()
    rows = [row()]
  })
  afterEach(cleanup)

  it("does not refetch while hidden", () => {
    render(<JobReferencesTab bookingId="b1" isActive={false} />)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("refetches when the tab is opened", () => {
    const { rerender } = render(<JobReferencesTab bookingId="b1" isActive={false} />)
    rerender(<JobReferencesTab bookingId="b1" isActive />)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("refetches an open tab when the booking changes", () => {
    const { rerender } = render(<JobReferencesTab bookingId="b1" isActive refreshKey="t1" />)
    mutate.mockClear()
    rerender(<JobReferencesTab bookingId="b1" isActive refreshKey="t2" />)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("lists legs that appear after the first load", () => {
    rows = []
    const { rerender } = render(<JobReferencesTab bookingId="b1" isActive />)
    expect(screen.queryByText("Rovos Rail")).toBeNull()

    rows = [row()]
    rerender(<JobReferencesTab bookingId="b1" isActive />)
    expect(screen.getAllByText("Rovos Rail").length).toBeGreaterThan(0)
  })

  it("updates an untouched row from the server", () => {
    const { rerender } = render(<JobReferencesTab bookingId="b1" isActive />)
    rows = [row({ supplierReference: "RR-1" })]
    rerender(<JobReferencesTab bookingId="b1" isActive />)
    expect(referenceBox().value).toBe("RR-1")
  })

  it("keeps unsaved typing when the server data changes", () => {
    const { rerender } = render(<JobReferencesTab bookingId="b1" isActive />)
    fireEvent.change(referenceBox(), { target: { value: "typed" } })

    rows = [row({ supplierReference: "RR-1" })]
    rerender(<JobReferencesTab bookingId="b1" isActive />)
    expect(referenceBox().value).toBe("typed")
  })
})
