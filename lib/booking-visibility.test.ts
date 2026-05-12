import { describe, expect, it } from "vitest"
import { isVisibleInBookings, isVisibleInEnquiries } from "./booking-visibility"
import { KANBAN_STAGES } from "./types"

describe("booking visibility", () => {
  it("shows enquiry-stage jobs only in Enquiries", () => {
    const booking = { stage: "enquiry" }

    expect(isVisibleInEnquiries(booking)).toBe(true)
    expect(isVisibleInBookings(booking)).toBe(false)
  })

  it("shows quote-sent jobs in Pipeline and Bookings", () => {
    const booking = { stage: "quote_sent" }
    const quoteSentColumn = KANBAN_STAGES.find((stage) => stage.key === "quote_sent")

    expect(isVisibleInEnquiries(booking)).toBe(false)
    expect(isVisibleInBookings(booking)).toBe(true)
    expect(quoteSentColumn?.includes).toContain("quote_sent")
  })

  it("excludes lost jobs from Enquiries and Bookings", () => {
    const booking = { stage: "lost" }

    expect(isVisibleInEnquiries(booking)).toBe(false)
    expect(isVisibleInBookings(booking)).toBe(false)
  })
})
