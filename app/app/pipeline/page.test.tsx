import React from "react"
import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const pipelinePageMocks = vi.hoisted(() => ({
  useAllData: vi.fn(),
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
    pipelinePageMocks.useAllData.mockReset()
    pipelinePageMocks.usePipeline.mockReturnValue({
      data: [pipelineJob],
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    })
    pipelinePageMocks.useAllData.mockReturnValue({
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
