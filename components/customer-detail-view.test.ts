import React from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const customerDetailMock = vi.hoisted(() => ({
  useCustomerDetail: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
  }: {
    children: React.ReactNode
    href: string
    className?: string
  }) => children,
}))

vi.mock("swr", () => ({
  useSWRConfig: () => ({
    mutate: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-record-presence", () => ({
  useRecordPresence: () => ({
    others: [],
    setEditing: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-versioned-save", () => ({
  useVersionedSave: () => ({
    save: vi.fn(),
    isSaving: false,
    conflict: null,
    clearConflict: vi.fn(),
  }),
}))

vi.mock("@/lib/role-context", () => ({
  useRole: () => ({
    can: () => true,
  }),
}))

vi.mock("@/lib/use-data", () => customerDetailMock)

vi.mock("@/components/presence-avatars", () => ({
  PresenceAvatars: () => null,
}))

vi.mock("@/components/linked-account-form", () => ({
  LinkedAccountForm: () => null,
}))

vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => children,
  AccordionItem: ({ children }: { children: React.ReactNode }) => children,
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => children,
  AccordionContent: ({ children }: { children: React.ReactNode }) => children,
}))

import { CustomerDetailView } from "./customer-detail-view"

const customer = {
  id: "customer-1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "+27 82 000 0000",
  country: "South Africa",
  province: "Western Cape",
  title: "Ms",
  notes: "Prefers a quiet suite",
  dateOfBirth: "1980-01-02",
  vipStatus: true,
  preferences: "Window table",
  communicationPreferences: "Email mornings",
  firstTravelDate: "2026-01-10",
  firstTravelDateDisplay: "10 Jan 2026",
  lastTravelDate: "2026-03-15",
  lastTravelDateDisplay: "15 Mar 2026",
  isRepeatClient: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  createdAtDisplay: "1 Jan 2026, 00:00",
  updatedAtDisplay: "2 Jan 2026, 00:00",
}

function renderCustomerDetail(): string {
  return renderToString(React.createElement(CustomerDetailView, { customerId: "customer-1" }))
}

describe("CustomerDetailView", () => {
  beforeEach(() => {
    customerDetailMock.useCustomerDetail.mockReset()
  })

  it("renders the loading state", () => {
    customerDetailMock.useCustomerDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      mutate: vi.fn(),
    })

    expect(renderCustomerDetail()).toContain("animate-pulse")
  })

  it("renders the current error fallback state", () => {
    customerDetailMock.useCustomerDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load customer"),
      mutate: vi.fn(),
    })

    expect(renderCustomerDetail()).toContain("animate-pulse")
  })

  it("renders empty booking and linked-account states", () => {
    customerDetailMock.useCustomerDetail.mockReturnValue({
      data: {
        customer: { ...customer, isRepeatClient: false },
        bookings: [],
        linkedAccounts: [],
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })

    const html = renderCustomerDetail()

    expect(html).toContain("No bookings found for this customer.")
    expect(html).toContain("No linked accounts.")
  })

  it("renders CRM fields, booking history, linked accounts, VIP and repeat badges", () => {
    customerDetailMock.useCustomerDetail.mockReturnValue({
      data: {
        customer,
        bookings: [
          {
            id: "booking-1",
            bookingNumber: "BT-2026-0001",
            stage: "voucher_sent",
            consultant: "Leonie",
            departureDate: "2026-03-15",
            direction: "Pretoria to Cape Town",
            supplierName: "Rovos Rail",
            packageName: "Luxury Rail",
            createdAt: "2026-01-05T00:00:00.000Z",
          },
        ],
        linkedAccounts: [
          {
            id: "linked-1",
            customerId: "customer-1",
            linkedCustomerId: "customer-2",
            linkedCustomerName: "John Doe",
            relationship: "Spouse",
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
            phone: "+27 83 000 0000",
            isMirror: false,
            createdAt: "2026-01-03T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })

    const html = renderCustomerDetail()

    expect(html).toContain("Jane Doe")
    expect(html).toContain("VIP")
    expect(html).toContain("Repeat Client")
    expect(html).toContain("Preferences")
    expect(html).toContain("BT-2026-0001")
    expect(html).toContain("Pretoria to Cape Town")
    expect(html).toContain("John Doe")
    expect(html).toContain("Spouse")
  })
})
