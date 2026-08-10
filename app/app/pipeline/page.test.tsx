import React from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const pipelinePageMocks = vi.hoisted(() => ({
  useData: vi.fn(),
  usePipeline: vi.fn(),
}))

vi.mock("@/lib/use-data", () => pipelinePageMocks)

vi.mock("@/lib/role-context", () => ({
  useRole: () => ({
    can: (permission: string) => permission === "edit:pipeline",
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/new-enquiry-dialog", () => ({
  NewEnquiryDialog: () => null,
}))

vi.mock("@/components/stage-transition-modal", () => ({
  StageTransitionModal: () => null,
}))

vi.mock("@/lib/export-audit", () => ({
  downloadAuditLog: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import PipelinePage from "./page"

const pipelineJob = {
  id: "job-1",
  bookingNumber: "BT-2026-0001",
  customerInvoiceNumber: null as string | null,
  customerName: "Ada Lovelace",
  direction: "Pretoria to Cape Town",
  departureDate: "2026-06-01",
  stage: "quote_sent",
  consultant: "LB",
  paymentColor: "red",
  totalPaid: 0,
  quoteTotal: 1000,
  tripEndDate: null,
  thankYouScheduledAt: null,
}

function renderPipelinePage() {
  return render(<PipelinePage />)
}

describe("PipelinePage Kanban accessibility", () => {
  beforeEach(() => {
    pipelinePageMocks.usePipeline.mockReset()
    pipelinePageMocks.useData.mockReset()
    pipelinePageMocks.usePipeline.mockReturnValue({
      data: [pipelineJob],
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })
    pipelinePageMocks.useData.mockReturnValue({
      data: {
        bookings: [],
        customers: [],
        payments: [],
        quotes: [],
        auditLogs: [],
        settings: { defaultDepositPercentage: 25 },
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })
  })

  it("announces stage columns with aria labels", () => {
    renderPipelinePage()

    expect(screen.getByRole("region", { name: "Quote Sent stage column" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Voucher Sent stage column" })).toBeInTheDocument()
  })

  it("keeps Kanban card link, stage move control, and audit action keyboard-reachable in order", () => {
    renderPipelinePage()

    const column = screen.getByRole("region", { name: "Quote Sent stage column" })
    const cardLink = within(column).getByRole("link", { name: "BT-2026-0001" })
    const stageSelect = within(column).getByRole("combobox", { name: "Move BT-2026-0001 to stage" })
    const auditButton = within(column).getByRole("button", { name: "Download audit log for BT-2026-0001" })
    const focusable = Array.from(
      column.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [role="combobox"]'),
    )

    expect(focusable.indexOf(cardLink)).toBeLessThan(focusable.indexOf(stageSelect))
    expect(focusable.indexOf(stageSelect)).toBeLessThan(focusable.indexOf(auditButton))

    cardLink.focus()
    expect(cardLink).toHaveFocus()
    stageSelect.focus()
    expect(stageSelect).toHaveFocus()
    auditButton.focus()
    expect(auditButton).toHaveFocus()
  })
})

describe("PipelinePage reference display", () => {
  // Salespeople identify a booking by the invoice number they typed in, so the
  // board and list lead with it and fall back to the booking number until it exists.
  function mockPipeline(job: typeof pipelineJob) {
    pipelinePageMocks.usePipeline.mockReturnValue({
      data: [job],
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })
    pipelinePageMocks.useData.mockReturnValue({
      data: {
        bookings: [{ ...job, purpose: "quote", source: "web_form", updatedAt: "2026-05-02T00:00:00.000Z" }],
        customers: [{ id: "cust-1", firstName: "Ada", lastName: "Lovelace" }],
        payments: [],
        quotes: [],
        auditLogs: [],
        settings: { defaultDepositPercentage: 25 },
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })
  }

  // Radix activates a tab on mousedown, not click.
  function openAllItemsTab() {
    const trigger = screen.getByRole("tab", { name: "All Items" })
    fireEvent.mouseDown(trigger, { button: 0 })
    return screen.getByRole("tabpanel", { name: "All Items" })
  }

  beforeEach(() => {
    pipelinePageMocks.usePipeline.mockReset()
    pipelinePageMocks.useData.mockReset()
    localStorage.setItem("pipeline_showAllItems", "true")
  })

  it("leads the Kanban card with the invoice number when one is captured", () => {
    mockPipeline({ ...pipelineJob, customerInvoiceNumber: "244453" })
    renderPipelinePage()

    const column = screen.getByRole("region", { name: "Quote Sent stage column" })
    expect(within(column).getByRole("link", { name: "244453" })).toBeInTheDocument()
    expect(within(column).queryByRole("link", { name: "BT-2026-0001" })).not.toBeInTheDocument()
    expect(within(column).getByRole("combobox", { name: "Move 244453 to stage" })).toBeInTheDocument()
    expect(within(column).getByRole("button", { name: "Download audit log for 244453" })).toBeInTheDocument()
  })

  it("falls back to the booking number when the invoice number is blank", () => {
    mockPipeline({ ...pipelineJob, customerInvoiceNumber: "   " })
    renderPipelinePage()

    const column = screen.getByRole("region", { name: "Quote Sent stage column" })
    expect(within(column).getByRole("link", { name: "BT-2026-0001" })).toBeInTheDocument()
  })

  it("leads the All Items row with the invoice number", () => {
    mockPipeline({ ...pipelineJob, customerInvoiceNumber: "244453" })
    renderPipelinePage()
    const panel = openAllItemsTab()

    expect(within(panel).getByText("244453")).toBeInTheDocument()
    expect(within(panel).queryByText("BT-2026-0001")).not.toBeInTheDocument()
  })

  it("matches the All Items search against the invoice number", () => {
    mockPipeline({ ...pipelineJob, customerInvoiceNumber: "244453" })
    renderPipelinePage()
    const panel = openAllItemsTab()

    const search = within(panel).getByPlaceholderText("Search jobs...")
    fireEvent.change(search, { target: { value: "2444" } })
    expect(within(panel).getByText("244453")).toBeInTheDocument()

    fireEvent.change(search, { target: { value: "no-such-ref" } })
    expect(within(panel).getByText("No bookings found")).toBeInTheDocument()
  })
})
