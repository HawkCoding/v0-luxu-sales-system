import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { EnquiriesList } from "./enquiries-list"
import type { EnquiryListItem } from "@/lib/use-data"

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const makeEnquiry = (overrides: Partial<EnquiryListItem> = {}): EnquiryListItem => ({
  id: "enq-1",
  bookingNumber: "BT-2026-0001",
  customerId: "cust-1",
  stage: "enquiry",
  purpose: "Quote",
  source: "email",
  consultant: null,
  ownerUserId: null,
  assignedSalespersonId: null,
  departureDate: "2026-09-01",
  durationNights: null,
  emailImportNeedsReview: false,
  emailImportReviewResolvedAt: null,
  emailImportMissingFields: [],
  emailImportWarnings: [],
  emailImportSourceMessageId: null,
  emailImportDuplicateOfBookingId: null,
  emailImportSubject: null,
  emailImportMailbox: null,
  emailImportReceivedAt: null,
  emailImportRawPreview: null,
  noOfAdults: 2,
  noOfChildren: 0,
  noOfSuites: 1,
  childAges: null,
  routeId: null,
  direction: "Cape Town to Pretoria",
  rawText: null,
  extractedJson: null,
  termsAccepted: false,
  additionalServices: false,
  additionalServicesDetails: null,
  promotionCode: null,
  extendStay: false,
  extraNights: null,
  hotelPhase: "",
  hotelSupplierId: null,
  createdAt: "2026-05-01T10:00:00Z",
  updatedAt: "2026-05-01T10:00:00Z",
  quoteSentAt: null,
  acceptedAt: null,
  depositRequestedAt: null,
  depositPaidAt: null,
  finalPaidAt: null,
  voucherSentAt: null,
  closedAt: null,
  depositPaid: false,
  invoiceBalance: 0,
  cancelledAt: null,
  refundStatus: null,
  refundAmount: null,
  refundReference: null,
  refundedAt: null,
  customer: {
    id: "cust-1",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    title: "Ms",
  },
  ...overrides,
})

describe("EnquiriesList", () => {
  it("renders loading state", () => {
    render(<EnquiriesList enquiries={[]} isLoading={true} />)
    expect(screen.getByTestId("enquiries-loading")).toBeInTheDocument()
  })

  it("renders error state", () => {
    render(<EnquiriesList enquiries={[]} isLoading={false} error={new Error("Network error")} />)
    expect(screen.getByTestId("enquiries-error")).toBeInTheDocument()
    expect(screen.getByText(/Network error/)).toBeInTheDocument()
  })

  it("renders empty state with no filter", () => {
    render(<EnquiriesList enquiries={[]} isLoading={false} />)
    expect(screen.getByTestId("enquiries-empty")).toBeInTheDocument()
    expect(screen.getByText(/no new enquiries yet/i)).toBeInTheDocument()
  })

  it("renders empty state with active filter message", () => {
    render(<EnquiriesList enquiries={[]} isLoading={false} activeFilter="needs_review" />)
    expect(screen.getByText(/no enquiries match this filter/i)).toBeInTheDocument()
  })

  it("renders success state with enquiry cards", () => {
    render(<EnquiriesList enquiries={[makeEnquiry()]} isLoading={false} />)
    expect(screen.getByTestId("enquiries-list")).toBeInTheDocument()
    expect(screen.getByText("BT-2026-0001")).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })

  it("shows Needs Review badge when emailImportNeedsReview is true", () => {
    render(<EnquiriesList enquiries={[makeEnquiry({ emailImportNeedsReview: true })]} isLoading={false} />)
    expect(screen.getByText("Needs Review")).toBeInTheDocument()
  })

  it("shows Possible duplicate badge when emailImportDuplicateOfBookingId is set", () => {
    render(
      <EnquiriesList
        enquiries={[makeEnquiry({ emailImportDuplicateOfBookingId: "other-id" })]}
        isLoading={false}
      />,
    )
    expect(screen.getByText("Possible duplicate")).toBeInTheDocument()
  })

  it("calls onSendQuote with the booking id when Send Quote is clicked", () => {
    const onSendQuote = vi.fn()
    render(<EnquiriesList enquiries={[makeEnquiry()]} isLoading={false} onSendQuote={onSendQuote} />)
    fireEvent.click(screen.getByRole("button", { name: /send quote/i }))
    expect(onSendQuote).toHaveBeenCalledWith("enq-1")
  })

  it("renders multiple enquiry cards", () => {
    const enquiries = [
      makeEnquiry({ id: "a", bookingNumber: "BT-2026-0001" }),
      makeEnquiry({ id: "b", bookingNumber: "RR-2026-0001" }),
    ]
    render(<EnquiriesList enquiries={enquiries} isLoading={false} />)
    expect(screen.getByText("BT-2026-0001")).toBeInTheDocument()
    expect(screen.getByText("RR-2026-0001")).toBeInTheDocument()
  })
})
