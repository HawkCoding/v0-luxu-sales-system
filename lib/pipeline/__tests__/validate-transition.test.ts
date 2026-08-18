import { describe, expect, it } from "vitest"
import { validateTransition, type ValidateTransitionInput } from "../validate-transition"

const baseInput: ValidateTransitionInput = {
  booking: {
    id: "booking-1",
    stage: "enquiry",
    source: "web_form",
    email_import_needs_review: false,
    email_import_review_resolved_at: null,
    customer_invoice_number: "INV-2026-0001",
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
      booking: { ...baseInput.booking, reservation_form_received_at: "2026-01-01T00:00:00Z" },
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
      booking: { ...baseInput.booking, reservation_form_received_at: "2026-01-01T00:00:00Z" },
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
        booking: {
          ...baseInput.booking,
          stage: "quote_sent",
          reservation_form_received_at: "2026-01-01T00:00:00Z",
        },
        targetStage: "accepted",
        quotes: [{ status: "sent", total: 1000 }],
      }),
    ).toEqual([])
  })

  it("requires the reservation form to be received before quote acceptance", () => {
    const withoutForm = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "quote_sent" },
      targetStage: "accepted",
      quotes: [{ status: "sent", total: 1000 }],
    })

    expect(withoutForm).toEqual([
      expect.objectContaining({
        gateId: "reservation_form_received",
        severity: "block",
      }),
    ])

    const withForm = validateTransition({
      ...baseInput,
      booking: {
        ...baseInput.booking,
        stage: "quote_sent",
        reservation_form_received_at: "2026-01-01T00:00:00Z",
      },
      targetStage: "accepted",
      quotes: [{ status: "sent", total: 1000 }],
    })

    expect(withForm).toEqual([])
  })

  it("blocks the deposit invoice stage when no invoice number was entered", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: {
        ...baseInput.booking,
        stage: "accepted",
        customer_invoice_number: null,
      },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "deposit", status: "sent" }],
      correspondences: [],
    })

    expect(failures).toContainEqual(
      expect.objectContaining({ gateId: "invoice_number_required", severity: "block" }),
    )
  })

  it("treats a blank invoice number as missing", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: {
        ...baseInput.booking,
        stage: "accepted",
        customer_invoice_number: "   ",
      },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "deposit", status: "sent" }],
      correspondences: [],
    })

    expect(failures).toContainEqual(
      expect.objectContaining({ gateId: "invoice_number_required" }),
    )
  })

  it("passes the invoice number gate once a value is entered", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: {
        ...baseInput.booking,
        stage: "accepted",
        customer_invoice_number: "INV-777",
      },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "deposit", status: "sent" }],
      correspondences: [],
    })

    expect(failures.map((f) => f.gateId)).not.toContain("invoice_number_required")
  })

  it("blocks outright when there is no invoice, with no autofix on offer", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
    })

    expect(failures).toEqual([
      expect.objectContaining({
        gateId: "invoice_document",
        severity: "block",
      }),
    ])
    expect(failures[0]?.autoFixable).toBeUndefined()
  })

  it("requires an actual send when the deposit invoice is only generated", () => {
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
        severity: "block",
      }),
    ])
    expect(failures[0]?.autoFixable).toBeUndefined()
  })

  it("flags a draft deposit invoice that was never emailed", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "deposit", status: "draft" }],
      correspondences: [{ kind: "invoice", subject: "Deposit invoice", status: "scheduled" }],
    })

    expect(failures).toEqual([
      expect.objectContaining({ gateId: "invoice_correspondence", severity: "block" }),
    ])
  })

  it("passes when the deposit invoice was sent", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "deposit", status: "sent" }],
      correspondences: [],
    })

    expect(failures).toEqual([])
  })

  it("passes when an invoice correspondence was sent", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      documents: [{ kind: "invoice_pdf", status: "generated" }],
      correspondences: [{ kind: "invoice", subject: "Deposit invoice", status: "sent" }],
    })

    expect(failures).toEqual([])
  })

  it("still blocks an unsent invoice even with an unrelated manual confirmation set", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      documents: [{ kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
      manualConfirmations: { finalPaymentReceived: true },
    })

    expect(failures).toEqual([
      expect.objectContaining({ gateId: "invoice_correspondence", severity: "block" }),
    ])
  })

  it("requires a recorded payment before deposit paid", () => {
    const withoutPayment = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_requested" },
      targetStage: "deposit_paid",
    })
    const withPayment = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_requested" },
      targetStage: "deposit_paid",
      payments: [{ amount: 250 }],
    })

    expect(withoutPayment).toContainEqual(
      expect.objectContaining({ gateId: "deposit_received_confirmation", severity: "block" }),
    )
    expect(withPayment).toEqual([])
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

  it("allows paid in full after a sent payment-received confirmation", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "deposit", status: "sent" }],
      correspondences: [{ kind: "payment_received", subject: "Payment received — BT-2026-0001", status: "sent" }],
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

  it("blocks voucher sent while a leg is missing its supplier reference", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "final_paid" },
      targetStage: "voucher_sent",
      legReferences: [
        { label: "Rovos Rail — Pretoria to Cape Town", supplierReference: "RR-114" },
        { label: "Transfer: OR Tambo → Rovos Station", supplierReference: null },
        { label: "Table Bay Hotel", supplierReference: "   " },
      ],
    })

    const referenceFailure = failures.find((failure) => failure.gateId === "leg_references")
    expect(referenceFailure).toMatchObject({ severity: "block" })
    // Named so the modal tells the consultant which legs to chase, and blank-but-present
    // references count as missing.
    expect(referenceFailure?.message).toContain("Transfer: OR Tambo → Rovos Station")
    expect(referenceFailure?.message).toContain("Table Bay Hotel")
    expect(referenceFailure?.message).not.toContain("Rovos Rail")
    // Ordered ahead of the PDF gate: generating is impossible until references exist.
    expect(failures[0].gateId).toBe("leg_references")
  })

  it("does not raise the reference gate when every leg has one", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "final_paid" },
      targetStage: "voucher_sent",
      legReferences: [{ label: "Rovos Rail", supplierReference: "RR-114" }],
    })

    expect(failures.map((failure) => failure.gateId)).not.toContain("leg_references")
  })

  it("skips the reference gate for moves that do not cross voucher sent", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "final", status: "sent" }],
      correspondences: [{ kind: "invoice", subject: "Final invoice BT-2026-0001-FIN1", status: "sent" }],
      manualConfirmations: { finalPaymentReceived: true },
      legReferences: [{ label: "Rovos Rail", supplierReference: null }],
    })

    expect(failures).toEqual([])
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

  it("treats a full-payment invoice as satisfying the deposit invoice gate", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "accepted" },
      targetStage: "deposit_requested",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "full", status: "sent" }],
      correspondences: [{ kind: "invoice", subject: "Confirmation Invoice BT-2026-0001-INV", status: "sent" }],
    })

    expect(failures).toEqual([])
  })

  it("treats a full-payment invoice as satisfying the final invoice gate", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [{ kind: "full", status: "sent" }],
      correspondences: [{ kind: "invoice", subject: "Confirmation Invoice BT-2026-0001-INV", status: "sent" }],
      manualConfirmations: { finalPaymentReceived: true },
    })

    expect(failures).toEqual([])
  })

  it("still requires the final invoice gate when no full or final invoice was sent", () => {
    const failures = validateTransition({
      ...baseInput,
      booking: { ...baseInput.booking, stage: "deposit_paid" },
      targetStage: "final_paid",
      quotes: [{ status: "accepted", total: 1000 }],
      invoices: [],
    })

    expect(failures).toContainEqual(expect.objectContaining({ gateId: "final_invoice" }))
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
