import React from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const customersPageMock = vi.hoisted(() => ({
  useData: vi.fn(),
}))

vi.mock("@/lib/use-data", () => customersPageMock)

vi.mock("@/lib/role-context", () => ({
  useRole: () => ({
    can: () => true,
  }),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/customers",
  useRouter: () => ({ replace: () => {} }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
  }: {
    children: React.ReactNode
    href: string
    onClick?: React.MouseEventHandler<HTMLAnchorElement>
  }) => children,
}))

vi.mock("@/components/customer-detail-view", () => ({
  CustomerDetailView: () => null,
}))

vi.mock("@/components/create-customer-dialog", () => ({
  CreateCustomerDialog: () => null,
}))

vi.mock("@/components/ui/faceted-filter", () => ({
  FacetedFilter: ({ label }: { label: string }) => <span>{label}</span>,
}))

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/ui/pagination", () => ({
  Pagination: ({ children }: { children: React.ReactNode }) => children,
  PaginationContent: ({ children }: { children: React.ReactNode }) => children,
  PaginationEllipsis: () => null,
  PaginationItem: ({ children }: { children: React.ReactNode }) => children,
  PaginationLink: ({ children }: { children: React.ReactNode }) => children,
  PaginationNext: () => null,
  PaginationPrevious: () => null,
}))

import CustomersPage from "./page"

function renderCustomersPage(): string {
  return renderToString(React.createElement(CustomersPage))
}

describe("CustomersPage", () => {
  beforeEach(() => {
    customersPageMock.useData.mockReset()
  })

  it("renders the loading state", () => {
    customersPageMock.useData.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      mutate: vi.fn(),
    })

    expect(renderCustomersPage()).toContain("animate-pulse")
  })

  it("renders the error state", () => {
    customersPageMock.useData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load"),
      mutate: vi.fn(),
    })

    expect(renderCustomersPage()).toContain("Could not load customers")
  })

  it("renders the empty state", () => {
    customersPageMock.useData.mockReturnValue({
      data: { customers: [], bookings: [] },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })

    expect(renderCustomersPage()).toContain("No customers found")
  })

  it("renders customers with repeat status in the success state", () => {
    customersPageMock.useData.mockReturnValue({
      data: {
        customers: [
          {
            id: "customer-1",
            firstName: "Jane",
            lastName: "Doe",
            email: "jane@example.com",
            phone: "+27 82 000 0000",
            country: "South Africa",
            vipStatus: true,
            isRepeatClient: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        bookings: [
          {
            id: "booking-1",
            customerId: "customer-1",
            bookingNumber: "BT-2026-0001",
            consultant: "DR",
            direction: "Blue Train Pretoria to Cape Town",
          },
        ],
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })

    const html = renderCustomersPage()

    expect(html).toContain("jane@example.com")
    expect(html).toContain("Repeat")
    expect(html).toMatch(/1<!-- --> booking/)
  })
})
