import React from "react"
import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { formatMoney } from "@/lib/money"

// Testing Library collapses the formatter's no-break group separators to plain spaces.
function money(amount: number, currency?: string): string {
  return formatMoney(amount, currency).replace(/\s+/g, " ")
}

const mocks = vi.hoisted(() => ({
  useData: vi.fn(),
  useAssignableUsers: vi.fn(),
  searchParams: new URLSearchParams(),
}))

vi.mock("@/lib/use-data", () => ({
  useData: mocks.useData,
  useAssignableUsers: mocks.useAssignableUsers,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => "/app/quotes",
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

import { JobSectionList } from "./job-section-list"

const recentSend = new Date(Date.now() - 2 * 86_400_000).toISOString()

const data = {
  customers: [{ id: "cust-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }],
  bookings: [
    { id: "b-enquiry", bookingNumber: "LTT-26-0001", customerId: "cust-1", stage: "enquiry", createdAt: "2026-10-01T08:00:00.000Z" },
    { id: "b-sent", bookingNumber: "LTT-26-0002", customerId: "cust-1", stage: "quote_sent", createdAt: "2026-10-02T08:00:00.000Z" },
    {
      id: "b-requested",
      bookingNumber: "LTT-26-0003",
      customerId: "cust-1",
      stage: "deposit_requested",
      depositPaid: true,
      createdAt: "2026-10-03T08:00:00.000Z",
    },
    { id: "b-paid", bookingNumber: "LTT-26-0004", customerId: "cust-1", stage: "deposit_paid", createdAt: "2026-10-04T08:00:00.000Z" },
    { id: "b-lost", bookingNumber: "LTT-26-0005", customerId: "cust-1", stage: "lost", createdAt: "2026-10-05T08:00:00.000Z" },
  ],
  quotes: [
    { id: "q1", bookingId: "b-sent", status: "superseded", total: 50_000, currency: "ZAR" },
    { id: "q2", bookingId: "b-sent", status: "sent", total: 80_000, currency: "USD", lastSentAt: recentSend },
    { id: "q3", bookingId: "b-requested", status: "accepted", total: 40_000, currency: "ZAR" },
    { id: "q4", bookingId: "b-paid", status: "accepted", total: 100_000, currency: "ZAR" },
  ],
  payments: [
    { bookingId: "b-requested", amount: 10_000 },
    { bookingId: "b-paid", amount: 25_000 },
  ],
}

function mockData(value: unknown, extra: Partial<{ error: unknown; isLoading: boolean }> = {}) {
  mocks.useData.mockReturnValue({ data: value, isLoading: false, error: null, mutate: vi.fn(), ...extra })
}

describe("JobSectionList", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams()
    mocks.useAssignableUsers.mockReturnValue({ data: { users: [] } })
    mockData(data)
  })

  it("lists only quote-stage records on Quotes, with the current quote's total", () => {
    render(<JobSectionList section="quotes" />)

    expect(screen.getByRole("heading", { level: 1, name: "Quotes" })).toBeInTheDocument()
    expect(screen.getByText("Quotes sent to clients, waiting for their go-ahead and deposit")).toBeInTheDocument()

    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/app/quotes/b-sent", "/app/quotes/b-requested"])

    const sent = links[0] as HTMLElement
    expect(within(sent).getByText(money(80_000, "USD"))).toBeInTheDocument()
    expect(within(sent).getByText(/^Sent .* · 2 days ago$/)).toBeInTheDocument()

    // A paid deposit at Deposit Invoice Sent stays a Quote: the flag drives the badge and the hint,
    // never the section.
    const requested = links[1] as HTMLElement
    expect(within(requested).getByText("Deposit paid")).toBeInTheDocument()
    expect(within(requested).getByText("Payment received — move to Deposit Paid")).toBeInTheDocument()
  })

  it("lists only deposit-paid-onward records on Bookings, with paid, total and balance", () => {
    render(<JobSectionList section="bookings" />)

    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/app/bookings/b-paid"])

    const card = links[0] as HTMLElement
    // The stage badge already says Deposit Paid, so no second "Deposit paid" payment badge.
    expect(within(card).getByText("Deposit Paid")).toBeInTheDocument()
    expect(within(card).queryByText("Deposit paid")).not.toBeInTheDocument()
    expect(within(card).getByText(money(25_000))).toHaveTextContent(`Paid ${money(25_000)}`)
    expect(within(card).getByText(`of ${money(100_000)}`)).toBeInTheDocument()
    expect(within(card).getByText(`Balance ${money(75_000)}`)).toBeInTheDocument()
  })

  it("filters by canonical stage from the URL", () => {
    mocks.searchParams = new URLSearchParams("status=deposit_requested")
    render(<JobSectionList section="quotes" />)

    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/app/quotes/b-requested"])
    expect(screen.getByText("Status: Deposit Invoice Sent")).toBeInTheDocument()
  })

  it("explains how a record becomes a booking when Bookings is empty", () => {
    mockData({ ...data, bookings: data.bookings.filter((booking) => booking.stage !== "deposit_paid") })
    render(<JobSectionList section="bookings" />)

    expect(screen.getByText("No bookings yet")).toBeInTheDocument()
    expect(screen.getByText("A quote becomes a booking when it reaches Deposit Paid.")).toBeInTheDocument()
  })

  it("offers a retry when loading fails", () => {
    mockData(undefined, { error: new Error("boom") })
    render(<JobSectionList section="quotes" />)

    expect(screen.getByText("Failed to load quotes")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })
})
