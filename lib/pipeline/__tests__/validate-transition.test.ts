import { describe, expect, it } from "vitest"
import { validateTransition, type ValidateTransitionInput } from "../validate-transition"

const baseInput: ValidateTransitionInput = {
  booking: {
    id: "booking-1",
    stage: "enquiry",
    source: "web_form",
    email_import_needs_review: false,
    email_import_review_resolved_at: null,
  },
  customer: {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "+27110000000",
    country: "South Africa",
  },
  targetStage: "quote_sent",
  quotes: [],
  documents: [],
  correspondences: [],
}

describe("validateTransition", () => {
  it("allows backward moves", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "final_paid" },
      targetStage: "deposit_paid",
    })

    expect(failures).toEqual([])
  })

  it("blocks forward moves when the customer is incomplete", () => {
    const failures = validateTransition({
      ...baseInput,
      customer: { ...baseInput.customer, email: "", phone: null },
      targetStage: "quote_sent",
      quotes: [{ status: "sent", total: 1000 }],
    })

    expect(failures).toEqual([
      expect.objectContaining({
        gateId: "customer_complete",
        message: expect.stringContaining("email"),
      }),
    ])
    expect(failures[0]?.message).toContain("phone")
  })

  it("aggregates intermediate failures when stages are skipped", () => {
    const failures = validateTransition({
      ...baseInput,
      targetStage: "deposit_requested",
    })

    expect(failures.map((failure) => failure.gateId)).toEqual([
      "quote_sent_required",
      "invoice_document",
    ])
  })

  it("requires a sent or accepted quote before quote sent", () => {
    expect(
      validateTransition({
        ...baseInput,
        targetStage: "quote_sent",
      }),
    ).toContainEqual(expect.objectContaining({ gateId: "quote_sent_required" }))

    expect(
      validateTransition({
        ...baseInput,
        targetStage: "quote_sent",
        quotes: [{ status: "ready", total: 1000 }],
      }),
    ).toContainEqual(expect.objectContaining({ gateId: "quote_sent_required" }))

    expect(
      validateTransition({
        ...baseInput,
        targetStage: "quote_sent",
        quotes: [{ status: "sent", total: 1000 }],
      }),
    ).toEqual([])
  })

  it("does not duplicate quote failures when quote sent is skipped", () => {
    const failures = validateTransition({
      ...baseInput,
      targetStage: "accepted",
    })

    expect(failures.map((failure) => failure.gateId)).toEqual(["quote_sent_required"])
  })

  it("requires a sent or accepted quote before accepted", () => {
    expect(
      validateTransition({
        ...baseInput,
        booking: { ...baseInput.booking, stage: "quote_sent" },
        targetStage: "accepted",
      }),
    ).toContainEqual(
      expect.objectContaining({
        gateId: "quote_sent_or_accepted",
        message: "At least one sent or accepted quote is required before quote acceptance.",
        fixHint: "Send a quote for this job before moving it to Quote Accepted.",
      }),
    )

    expect(
      validateTransition({
        ...baseInput,
        booking: { ...baseInput.booking, stage: "quote_sent" },
        targetStage: "accepted",
        quotes: [{ status: "sent", total: 1000 }],
      }),
    ).toEqual([])
  })

  it("marks missing invoice document as an auto-fixable confirmation", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
    })

    expect(failures).toEqual([
      expect.objectContaining({
        gateId: "invoice_document",
        severity: "confirm",
        autoFixable: "create_invoice_25pct",
      }),
    ])
  })

  it("marks missing invoice correspondence as an auto-fixable confirmation", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      documents: [{ kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
    })

    expect(failures).toEqual([
      expect.objectContaining({
        gateId: "invoice_correspondence",
        severity: "confirm",
        autoFixable: "create_invoice_correspondence",
      }),
    ])
  })

  it("allows confirmed invoice correspondence creation", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      documents: [{ kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
      manualConfirmations: { createInvoiceCorrespondence: true },
    })

    expect(failures).toEqual([])
  })

  it("requires manual deposit confirmation", () => {
    const withoutConfirmation = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_requested" },
      targetStage: "deposit_paid",
    })
    const withConfirmation = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_requested" },
      targetStage: "deposit_paid",
      manualConfirmations: { depositReceived: true },
    })

    expect(withoutConfirmation).toContainEqual(
      expect.objectContaining({ gateId: "deposit_received_confirmation" }),
    )
    expect(withConfirmation).toEqual([])
  })

  it("prompts for a final invoice before paid in full", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
    })

    expect(failures).toEqual([
      expect.objectContaining({
        gateId: "final_invoice",
        severity: "confirm",
        autoFixable: "create_final_invoice",
      }),
      expect.objectContaining({ gateId: "final_payment_confirmation" }),
    ])
  })

  it("requires final invoice correspondence before paid in full", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "final", status: "sent" }],
      correspondences: [{ kind: "invoice", subject: "Deposit invoice", status: "sent" }],
      manualConfirmations: { finalPaymentReceived: true },
    })

    expect(failures).toEqual([
      expect.objectContaining({ gateId: "final_invoice_correspondence", severity: "block" }),
    ])
  })

  it("allows paid in full after final invoice email and payment confirmation", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "final", status: "sent" }],
      correspondences: [{ kind: "invoice", subject: "Final invoice BT-2026-0001-FIN1", status: "sent" }],
      manualConfirmations: { finalPaymentReceived: true },
    })

    expect(failures).toEqual([])
  })

  it("requires voucher document and correspondence before voucher sent", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "final_paid" },
      targetStage: "voucher_sent",
    })

    expect(failures.map((failure) => failure.gateId)).toEqual([
      "voucher_document",
      "voucher_correspondence",
    ])
    expect(failures).toContainEqual(
      expect.objectContaining({
        gateId: "voucher_document",
        severity: "confirm",
        autoFixable: "create_voucher_pdf",
      }),
    )
  })

  it("requires cancellation and refund capture from paid stages", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "lost",
      lostContext: {},
    })

    expect(failures.map((failure) => failure.gateId)).toEqual(["cancel_reason", "refund_capture"])
  })

  it("keeps customer completeness as a continuous forward invariant", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "quote_sent" },
      customer: { ...baseInput.customer, email: "" },
      targetStage: "accepted",
      quotes: [{ status: "sent", total: 1000 }],
    })

    expect(failures).toContainEqual(expect.objectContaining({ gateId: "customer_complete" }))
  })
})
