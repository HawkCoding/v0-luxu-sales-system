import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { StageTransitionModal, gateIdToTabPath } from "./stage-transition-modal"
import type { GateFailure } from "@/lib/pipeline/validate-transition"

describe("gateIdToTabPath", () => {
  it("routes customer-completeness failures to the enquiry tab", () => {
    expect(gateIdToTabPath("customer_complete")).toBe("?tab=enquiry")
  })

  it("routes quote-sent failures to the quotes tab", () => {
    expect(gateIdToTabPath("quote_sent_required")).toBe("?tab=quotes")
  })

  it("routes quote-acceptance failures to the quotes tab", () => {
    expect(gateIdToTabPath("quote_sent_or_accepted")).toBe("?tab=quotes")
  })

  it("returns an empty path for manual-confirmation gates (no Fix link)", () => {
    expect(gateIdToTabPath("deposit_received_confirmation")).toBe("")
    expect(gateIdToTabPath("final_payment_confirmation")).toBe("")
  })

  it("returns an empty path for gates with no corresponding tab", () => {
    expect(gateIdToTabPath("cancel_reason")).toBe("")
    expect(gateIdToTabPath("unknown_gate")).toBe("")
  })
})

const noop = async () => {}

function renderModal(failures: GateFailure[]) {
  return render(
    <StageTransitionModal
      open
      jobId="booking-1"
      jobNumber="LTT-2026-0025"
      targetStage="deposit_paid"
      failures={failures}
      isManager={false}
      submitting={false}
      onCancel={() => {}}
      onProceed={noop}
      onOverride={noop}
    />,
  )
}

const depositGate: GateFailure = {
  gateId: "deposit_received_confirmation",
  message: "Confirm the deposit has been received.",
  fixHint: "Tick to confirm — no amount entry needed.",
  severity: "confirm",
}

describe("StageTransitionModal", () => {
  it("shows a confirmation title when every failure is confirm-only", () => {
    renderModal([depositGate])
    expect(screen.getByText("Confirm this stage move")).toBeInTheDocument()
    expect(screen.queryByText("Stage move needs attention")).not.toBeInTheDocument()
  })

  it("shows the attention title when a blocking failure is present", () => {
    renderModal([
      depositGate,
      {
        gateId: "quote_sent_required",
        message: "A quote must be sent first.",
        fixHint: "Send the quote.",
        severity: "block",
      },
    ])
    expect(screen.getByText("Stage move needs attention")).toBeInTheDocument()
  })

  it("renders no Fix link for the deposit-received confirmation gate", () => {
    renderModal([depositGate])
    expect(screen.queryByRole("link", { name: "Fix" })).not.toBeInTheDocument()
  })

  it("disables Confirm and move until the confirmation is ticked", () => {
    renderModal([depositGate])
    expect(screen.getByRole("button", { name: /Confirm and move/i })).toBeDisabled()
  })
})
