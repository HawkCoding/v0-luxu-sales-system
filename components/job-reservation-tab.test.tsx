import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { JobReservationTab } from "./job-reservation-tab"
import type { Customer } from "@/lib/types"
import type { JobPaxGroup, JobReservationDetails, JobTraveller } from "@/lib/use-data"

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

function setup(
  details: JobReservationDetails,
  travellers: JobTraveller[] = [],
  customer: Customer | null = null,
) {
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
      customer={customer}
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

describe("JobReservationTab — Fill from customer profile", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const peter: Customer = {
    id: "c1",
    firstName: "Peter",
    lastName: "Award",
    email: "peter@example.com",
    phone: "+27 82 000 0000",
    country: "South Africa",
    title: "Mr",
    idPassport: "A1234567",
    dateOfBirth: "1960-05-04",
    createdAt: "2026-01-01T00:00:00Z",
  }

  function guest(overrides: Partial<JobTraveller>): JobTraveller {
    return {
      id: "t1",
      prefix: "",
      firstName: "Peter",
      lastName: "Award",
      idPassport: "",
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

  const fillButton = () => screen.getByRole("button", { name: /fill from customer profile/i })

  it("seeds the guest row from the customer when the booking has no guests", () => {
    setup(reservationDetails(), [], peter)
    fireEvent.click(fillButton())

    expect(screen.getByDisplayValue("Peter")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Award")).toBeInTheDocument()
    expect(screen.getByDisplayValue("A1234567")).toBeInTheDocument()
  })

  it("fills the blanks on a primary guest row on open", () => {
    setup(reservationDetails(), [guest({ isPrimary: true })], peter)
    expect(screen.getByDisplayValue("A1234567")).toBeInTheDocument()
  })

  it("fills a guest row that matches the customer by name even when it is not flagged primary", () => {
    setup(reservationDetails(), [guest({ isPrimary: false })], peter)
    expect(screen.getByDisplayValue("A1234567")).toBeInTheDocument()
  })

  it("fills nothing when no guest row is the customer (name differs, none flagged primary)", () => {
    setup(reservationDetails(), [guest({ firstName: "Pieter", isPrimary: false })], peter)
    fireEvent.click(fillButton())
    expect(screen.queryByDisplayValue("A1234567")).not.toBeInTheDocument()
  })

  it("is disabled until the customer has loaded", () => {
    setup(reservationDetails(), [], null)
    expect(fillButton()).toBeDisabled()
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

describe("JobReservationTab — suites (pax groups)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function guest(overrides: Partial<JobTraveller>): JobTraveller {
    return {
      id: "t1",
      prefix: "",
      firstName: "Jun",
      lastName: "Chen",
      idPassport: "A1",
      dateOfBirth: "",
      residence: "",
      roomWith: "Ling",
      roomType: "Twin",
      isChild: false,
      isPrimary: true,
      sortOrder: 0,
      clubMemberships: [],
      paxGroupId: "g1",
      ...overrides,
    }
  }

  const suites: JobPaxGroup[] = [
    { id: "g1", position: 1, label: null, autoLabel: "Twin Deluxe Suite 1", adults: 1, children: 0, infants: 0 },
    { id: "g2", position: 2, label: "Kids", autoLabel: "Twin Deluxe Suite 2", adults: 0, children: 2, infants: 0 },
  ]

  function setupWithSuites(travellers: JobTraveller[], paxGroups: JobPaxGroup[]) {
    useDataMocks.useJobTravellers.mockReturnValue({
      data: { travellers, paxComparison: null, paxGroups },
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    })
    useDataMocks.useJobReservationDetails.mockReturnValue({
      data: reservationDetails(),
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

  it("replaces Room with / Room type with a Suite select, and summarises who is placed", () => {
    setupWithSuites(
      [guest({}), guest({ id: "t2", firstName: "Ling", lastName: "Tsai", isPrimary: false, sortOrder: 1 }), guest({ id: "t3", firstName: "", lastName: "", paxGroupId: null, sortOrder: 2 })],
      suites,
    )
    expect(screen.queryByPlaceholderText("Room with")).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Suite for Jun Chen" })).toHaveTextContent(
      /^Suite 1 · Twin Deluxe Suite$/,
    )
    expect(screen.getByRole("combobox", { name: "Suite for guest 3" })).toHaveTextContent("Not placed yet")
    expect(screen.getByText(/Suites: 2 of 3 guests placed/)).toBeInTheDocument()
    expect(screen.getByText("Suite 1 has 2 guests placed; it is booked for 1.")).toBeInTheDocument()
  })

  it("lists the guests by suite, read-only and in position order, with the unplaced last", () => {
    setupWithSuites(
      [
        guest({ id: "t3", firstName: "", lastName: "", paxGroupId: null, sortOrder: 0 }),
        guest({ id: "t1", prefix: "Mr", sortOrder: 1 }),
        guest({ id: "t2", prefix: "Mrs", firstName: "Ling", lastName: "Tsai", isPrimary: false, sortOrder: 2 }),
      ],
      suites,
    )
    const list = screen.getByText("By suite").closest("details")
    expect(list).toHaveAttribute("open")
    const lines = within(list as HTMLElement)
      .getAllByRole("listitem")
      .map((item) => item.textContent)
    expect(lines).toEqual([
      "Suite 1 · Twin Deluxe Suite 1 — Mr Jun Chen, Mrs Ling Tsai",
      "Suite 2 · Kids — nobody placed yet",
      "Not placed yet — Guest 1",
    ])
  })

  it("names a typed suite as typed in its select", () => {
    setupWithSuites([guest({ paxGroupId: "g2", isChild: true })], suites)
    expect(screen.getByRole("combobox", { name: "Suite for Jun Chen" })).toHaveTextContent(/^Suite 2 · Kids$/)
  })

  it("is unchanged on a booking without suites", () => {
    setupWithSuites([guest({ paxGroupId: null })], [])
    expect(screen.getByPlaceholderText("Room with")).toHaveValue("Ling")
    expect(screen.queryByRole("combobox", { name: /Suite for/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/guests placed/)).not.toBeInTheDocument()
  })
})
