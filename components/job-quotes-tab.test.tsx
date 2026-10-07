import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { Quote } from "@/lib/types"

vi.mock("@/lib/role-context", () => ({
  useRole: () => ({ can: () => true }),
}))

// The real dialogs pull in SWR, FX and presence hooks; this test is only about which quote gets the
// Amend entry point, so each stands in as a button that says which mode it was rendered in.
vi.mock("@/components/build-booking-dialog", () => ({
  BuildBookingDialog: ({
    quoteId,
    amend,
  }: {
    quoteId: string
    amend?: { currentTotal: number; bookingStage?: string | null }
  }) => (
    <button
      type="button"
      data-quote-id={quoteId}
      data-current-total={amend?.currentTotal}
      data-booking-stage={amend?.bookingStage ?? undefined}
    >
      {amend ? "Amend" : "Edit Quote"}
    </button>
  ),
}))
vi.mock("@/components/revise-quote-dialog", () => ({
  ReviseQuoteDialog: () => <button type="button">Revise</button>,
}))
vi.mock("@/components/quotes/convert-quote-currency-dialog", () => ({ ConvertQuoteCurrencyDialog: () => null }))
vi.mock("@/components/create-quote-dialog", () => ({ CreateQuoteDialog: () => null }))
vi.mock("@/components/quote-preview-send-dialog", () => ({ QuotePreviewSendDialog: () => null }))
vi.mock("@/components/quotes/quote-adjustments-ledger", () => ({ QuoteAdjustmentsLedger: () => null }))

import { JobQuotesTab } from "./job-quotes-tab"

function buildQuote(overrides: Partial<Quote>): Quote {
  return {
    id: "q1",
    itineraryId: "",
    jobId: "job-1",
    status: "draft",
    quoteNumber: "LTT-26-0001-Q1",
    validityUntil: "2026-10-21",
    updatedAt: "2026-10-07T00:00:00.000Z",
    lineItems: [
      { description: "Package Total", supplierDescription: null, qty: 1, unitPrice: 24800, total: 24800, pricingSnapshot: null },
    ],
    subtotal: 24800,
    total: 24800,
    currency: "ZAR",
    ...overrides,
  }
}

function renderTab(
  quotes: Quote[],
  booking: { stage?: string | null; cancelledAt?: string | null } = { stage: "deposit_paid", cancelledAt: null },
) {
  return render(
    <JobQuotesTab
      quotes={quotes}
      jobId="job-1"
      bookingNumber="LTT-26-0001"
      travelDate={null}
      customerName="Jane Doe"
      bookingHeadcount={2}
      bookingStage={booking.stage}
      bookingCancelledAt={booking.cancelledAt}
      mutate={() => undefined}
    />,
  )
}

describe("JobQuotesTab — Amend", () => {
  it("offers Amend on the accepted quote, alongside Revise", () => {
    renderTab([buildQuote({ id: "accepted-1", status: "accepted", total: 21800 })])

    const amend = screen.getByRole("button", { name: "Amend" })
    expect(amend).toHaveAttribute("data-quote-id", "accepted-1")
    expect(amend).toHaveAttribute("data-current-total", "21800")
    expect(screen.getByRole("button", { name: "Revise" })).toBeInTheDocument()
    // The normal builder stays off an accepted quote — Amend is the only in-place path.
    expect(screen.queryByRole("button", { name: "Edit Quote" })).not.toBeInTheDocument()
  })

  it.each(["draft", "sent", "expired", "superseded", "cancelled"] as const)(
    "does not offer Amend on a %s quote",
    (status) => {
      renderTab([buildQuote({ status })])
      expect(screen.queryByRole("button", { name: "Amend" })).not.toBeInTheDocument()
    },
  )

  it.each([
    ["closed", { stage: "closed", cancelledAt: null }],
    ["lost", { stage: "lost", cancelledAt: null }],
    ["cancelled", { stage: "deposit_paid", cancelledAt: "2026-10-01T00:00:00Z" }],
  ])("hides Amend on a %s booking, matching the server rule", (_label, booking) => {
    renderTab([buildQuote({ status: "accepted" })], booking)

    expect(screen.queryByRole("button", { name: "Amend" })).not.toBeInTheDocument()
    // Revise is untouched by this — it has its own rules.
    expect(screen.getByRole("button", { name: "Revise" })).toBeInTheDocument()
  })

  it("passes the booking stage through so the confirmation can warn after the voucher", () => {
    renderTab([buildQuote({ status: "accepted" })], { stage: "voucher_sent", cancelledAt: null })

    expect(screen.getByRole("button", { name: "Amend" })).toHaveAttribute("data-booking-stage", "voucher_sent")
  })

  it("only puts Amend on the accepted quote when superseded versions sit beside it", () => {
    renderTab([
      buildQuote({ id: "old", status: "superseded", quoteNumber: "LTT-26-0001-Q1" }),
      buildQuote({ id: "current", status: "accepted", quoteNumber: "LTT-26-0001-Q2" }),
    ])

    const amendButtons = screen.getAllByRole("button", { name: "Amend" })
    expect(amendButtons).toHaveLength(1)
    expect(amendButtons[0]).toHaveAttribute("data-quote-id", "current")
  })
})
