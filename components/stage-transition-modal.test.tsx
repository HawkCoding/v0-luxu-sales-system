import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
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

  it("routes the deposit-received gate to the payments tab", () => {
    expect(gateIdToTabPath("deposit_received_confirmation")).toBe("?tab=payments")
  })

  it("returns an empty path for the final-payment manual-confirmation gate (no Fix link)", () => {
    expect(gateIdToTabPath("final_payment_confirmation")).toBe("")
  })

  it("routes the missing-supplier-reference gate to the Voucher Details tab", () => {
    expect(gateIdToTabPath("leg_references")).toBe("?tab=references")
  })

  it("returns an empty path for gates with no corresponding tab", () => {
    expect(gateIdToTabPath("cancel_reason")).toBe("")
    expect(gateIdToTabPath("unknown_gate")).toBe("")
  })
})

const noop = async () => {}

function renderModal(failures: GateFailure[], options: { canOverride?: boolean; onOverride?: (reason: string) => Promise<void> } = {}) {
  return render(
    <StageTransitionModal
      open
      jobId="booking-1"
      jobNumber="LTT-2026-0025"
      targetStage="deposit_paid"
      failures={failures}
      canOverride={options.canOverride ?? false}
      submitting={false}
      onCancel={() => {}}
      onProceed={noop}
      onOverride={options.onOverride ?? noop}
    />,
  )
}

const depositGate: GateFailure = {
  gateId: "deposit_received_confirmation",
  message: "A payment must be recorded before the deposit can be marked received.",
  fixHint: "Record a payment on the Payments tab, then send the payment confirmation email.",
  severity: "block",
}

const finalPaymentGate: GateFailure = {
  gateId: "final_payment_confirmation",
  message: "Payment in full needs confirming.",
  fixHint: "No amount entry needed — the balance is already on record.",
  severity: "confirm",
  confirmLabel: "I confirm the full balance has been received.",
}

describe("StageTransitionModal", () => {
  it("shows a confirmation title when every failure is confirm-only", () => {
    renderModal([finalPaymentGate])
    expect(screen.getByText("Confirm this stage move")).toBeInTheDocument()
    expect(screen.queryByText("One more step first")).not.toBeInTheDocument()
  })

  it("shows the multi-step title when more than one failure is present", () => {
    renderModal([
      finalPaymentGate,
      {
        gateId: "quote_sent_required",
        message: "A quote must be sent first.",
        fixHint: "Send the quote.",
        severity: "block",
      },
    ])
    expect(screen.getByText("A few steps first")).toBeInTheDocument()
  })

  it("shows the single-step title when exactly one failure is present", () => {
    renderModal([depositGate])
    expect(screen.getByText("One more step first")).toBeInTheDocument()
  })

  it("renders a Fix link to the Payments tab for the deposit-received gate", () => {
    renderModal([depositGate])
    expect(screen.getByRole("link", { name: "Go to Payments tab" })).toBeInTheDocument()
  })

  it("renders a Fix link to the Voucher Details tab for the missing-reference gate", () => {
    renderModal([
      {
        gateId: "leg_references",
        message: "Supplier reference numbers are missing for: Table Bay Hotel.",
        fixHint: "Add a reference number for every leg on the Voucher Details tab.",
        severity: "block",
      },
    ])
    expect(screen.getByRole("link", { name: "Go to Voucher Details tab" })).toBeInTheDocument()
  })

  it("hides Confirm and move when the deposit-received gate is blocking", () => {
    renderModal([depositGate])
    expect(screen.queryByRole("button", { name: /Confirm and move/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Cancel move/i })).toBeInTheDocument()
  })

  it("blocks the unsent-deposit-invoice gate with no self-attest checkbox or Confirm and move", () => {
    renderModal([
      {
        gateId: "invoice_correspondence",
        message: "The deposit invoice is ready but hasn't been sent yet.",
        fixHint: "Send it to the customer to continue. This can be overridden with a recorded reason.",
        severity: "block",
      },
    ])
    expect(screen.getByText("One more step first")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Confirm and move/i })).not.toBeInTheDocument()
  })
})

describe("StageTransitionModal override panel", () => {
  it("starts collapsed: no reason field and no Force move button until expanded", () => {
    renderModal([depositGate], { canOverride: true })
    expect(screen.getByText("Override gates")).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Reason for forcing this stage move...")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Force move" })).not.toBeInTheDocument()
  })

  it("expanding the trigger reveals the reason field and a disabled Force move button", () => {
    renderModal([depositGate], { canOverride: true })
    fireEvent.click(screen.getByText("Override gates"))
    expect(screen.getByPlaceholderText("Reason for forcing this stage move...")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Force move" })).toBeDisabled()
  })

  it("typing a reason enables Force move", () => {
    renderModal([depositGate], { canOverride: true })
    fireEvent.click(screen.getByText("Override gates"))
    fireEvent.change(screen.getByPlaceholderText("Reason for forcing this stage move..."), {
      target: { value: "Confirmed with client by phone." },
    })
    expect(screen.getByRole("button", { name: "Force move" })).toBeEnabled()
  })

  it("collapsing the panel again clears the typed reason", () => {
    renderModal([depositGate], { canOverride: true })
    const trigger = screen.getByText("Override gates")
    fireEvent.click(trigger)
    fireEvent.change(screen.getByPlaceholderText("Reason for forcing this stage move..."), {
      target: { value: "Confirmed with client by phone." },
    })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(screen.getByPlaceholderText("Reason for forcing this stage move...")).toHaveValue("")
  })

  it("renders nothing override-related when canOverride is false", () => {
    renderModal([depositGate], { canOverride: false })
    expect(screen.queryByText("Override gates")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Force move" })).not.toBeInTheDocument()
  })
})
