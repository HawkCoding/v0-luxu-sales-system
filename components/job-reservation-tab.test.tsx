import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { JobReservationTab } from "./job-reservation-tab"
import type { JobReservationDetails } from "@/lib/use-data"

// This card used to also render a "From enquiry: …" hint sourced from the enquiry's
// "Briefly explain additional services" free text, which made the Special requests card look
// like it was partly filled from that field. The card only ever holds dietary/occasion/medical
// and the hand-typed voucher_special_requests value — this file guards that boundary.

// ReservationFormCard does its own SWR/fetch work irrelevant to what's under test here.
vi.mock("@/components/reservation-form-card", () => ({
  ReservationFormCard: () => null,
}))

const useDataMocks = vi.hoisted(() => ({
  useJobTravellers: vi.fn(),
  useJobReservationDetails: vi.fn(),
}))
vi.mock("@/lib/use-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/use-data")>()
  return {
    ...actual,
    useJobTravellers: useDataMocks.useJobTravellers,
    useJobReservationDetails: useDataMocks.useJobReservationDetails,
  }
})

function reservationDetails(overrides: Partial<JobReservationDetails> = {}): JobReservationDetails {
  return {
    dietary: "",
    medical: "",
    occasion: "",
    smokingPreference: null,
    mealSeating: null,
    voucherSpecialRequests: "",
    agencyName: "",
    agencyAddress: "",
    billingCompanyName: "",
    billingVatNumber: "",
    billingAddressLine1: "",
    billingAddressLine2: "",
    billingCity: "",
    billingProvince: "",
    billingPostalCode: "",
    billingCountry: "",
    updatedAt: null,
    ...overrides,
  }
}

function setup(details: JobReservationDetails) {
  useDataMocks.useJobTravellers.mockReturnValue({
    data: { travellers: [], paxComparison: null },
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  })
  useDataMocks.useJobReservationDetails.mockReturnValue({
    data: details,
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  })

  return render(
    <JobReservationTab
      bookingId="booking-1"
      reservationFormReceivedAt={null}
      mutateJob={vi.fn()}
      customer={null}
      stage="accepted"
    />,
  )
}

describe("JobReservationTab — Special requests card", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("never shows the enquiry's additional-services text, even though the component receives no such prop", () => {
    setup(reservationDetails())

    expect(screen.queryByText(/From enquiry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/additional services/i)).not.toBeInTheDocument()
  })

  it("shows only the saved voucher special requests value, never mixed with enquiry text", () => {
    setup(reservationDetails({ voucherSpecialRequests: "Anniversary celebration" }))

    const textarea = screen.getByPlaceholderText(
      "Anniversary celebration, wheelchair access at boarding, etc.",
    ) as HTMLTextAreaElement
    expect(textarea.value).toBe("Anniversary celebration")
    expect(screen.queryByText(/From enquiry/i)).not.toBeInTheDocument()
  })
})
