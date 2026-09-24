import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { JobReservationTab } from "./job-reservation-tab"
import type { JobReservationDetails, JobTraveller } from "@/lib/use-data"

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
    useClubNames: () => ({ data: { names: [] } }),
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

function setup(details: JobReservationDetails, travellers: JobTraveller[] = []) {
  useDataMocks.useJobTravellers.mockReturnValue({
    data: { travellers, paxComparison: null },
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

describe("JobReservationTab — club member numbers", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function guest(overrides: Partial<JobTraveller>): JobTraveller {
    return {
      id: "t1",
      prefix: "",
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B1",
      dateOfBirth: "",
      residence: "",
      roomWith: "",
      roomType: "",
      isChild: false,
      isPrimary: true,
      sortOrder: 0,
      clubMemberships: [],
      ...overrides,
    }
  }

  it("shows each guest's own saved numbers and a compact add link for guests without any", () => {
    setup(reservationDetails(), [
      guest({ clubMemberships: [{ club: "Rovos Rail", number: "RR-1" }] }),
      guest({ id: "t2", firstName: "John", isPrimary: false, sortOrder: 1 }),
    ])

    expect(screen.getByDisplayValue("Rovos Rail")).toBeInTheDocument()
    expect(screen.getByDisplayValue("RR-1")).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText("Club / programme")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /^club member number$/i })).toBeInTheDocument()
  })
})
