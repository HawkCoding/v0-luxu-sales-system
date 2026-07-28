import { useState } from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TravellerCountsEditor, type TravellerCounts } from "./traveller-counts-editor"
import type { AgeBuckets } from "@/lib/pricing/age-buckets"

const BUCKETS: AgeBuckets = { infantMax: 2, childMax: 12 }

/** The component is controlled — a stateful wrapper is what a real parent (build-booking-dialog,
 * enquiry-parsed-fields-editor) looks like, and it's what lets these tests observe the roster
 * actually converting between the legacy free-count shape and the age-roster shape on click. */
function Stateful({ initial, buckets }: { initial: TravellerCounts; buckets?: AgeBuckets }) {
  const [value, setValue] = useState(initial)
  return <TravellerCountsEditor value={value} onChange={setValue} buckets={buckets} />
}

describe("TravellerCountsEditor", () => {
  it("shows a free Children input when there is no age roster yet", () => {
    render(<TravellerCountsEditor value={{ noOfAdults: 2, noOfChildren: 0, childAges: [] }} onChange={vi.fn()} />)
    expect(screen.getByLabelText("Adults")).toBeInTheDocument()
    expect(screen.getByLabelText("Children")).toBeInTheDocument()
    expect(screen.queryByText(/child ages/i)).not.toBeInTheDocument()
  })

  it("offers Add ages once there's a free children count, and converting seeds one row per child", () => {
    render(<Stateful initial={{ noOfAdults: 2, noOfChildren: 2, childAges: [] }} />)
    fireEvent.click(screen.getByRole("button", { name: /add ages/i }))
    expect(screen.getAllByLabelText(/child \d age/i)).toHaveLength(2)
    // Converting shouldn't touch the adult count or invent a third child.
    expect(screen.getByLabelText("Adults")).toHaveValue(2)
  })

  it("removing the last age returns to the free Children input (legacy shape, no invented data)", () => {
    render(<Stateful initial={{ noOfAdults: 2, noOfChildren: 1, childAges: [6] }} />)
    fireEvent.click(screen.getByRole("button", { name: /remove child 1/i }))
    expect(screen.queryByLabelText(/child 1 age/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Children")).toBeInTheDocument()
  })

  it("Add child appends a default-age row and derives the children count from the roster length", () => {
    render(<Stateful initial={{ noOfAdults: 2, noOfChildren: 1, childAges: [6] }} />)
    fireEvent.click(screen.getByRole("button", { name: /add child/i }))
    expect(screen.getAllByLabelText(/child \d age/i)).toHaveLength(2)
  })

  it("classifies each age against the supplied buckets", () => {
    render(<Stateful initial={{ noOfAdults: 2, noOfChildren: 2, childAges: [1, 15] }} buckets={BUCKETS} />)
    expect(screen.getByText("infant")).toBeInTheDocument()
    expect(screen.getByText("adult")).toBeInTheDocument()
  })

  it("renders the live preview using the same projection pricing uses", () => {
    render(<Stateful initial={{ noOfAdults: 2, noOfChildren: 1, childAges: [15] }} buckets={BUCKETS} />)
    // age 15 > childMax(12) promotes to adult: 2 + 1 = 3 adults, 0 children, 0 infants.
    expect(screen.getByText(/this booking prices as 3 adults, 0 children, 0 infants/i)).toBeInTheDocument()
  })

  it("omits the preview when no buckets are supplied", () => {
    render(<TravellerCountsEditor value={{ noOfAdults: 2, noOfChildren: 0, childAges: [] }} onChange={vi.fn()} />)
    expect(screen.queryByText(/this booking prices as/i)).not.toBeInTheDocument()
  })
})
