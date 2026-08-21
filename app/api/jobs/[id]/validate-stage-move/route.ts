import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import type { PipelineStage } from "@/lib/types"
import { isReopenFromCancelled, isTerminalPipelineStage, validateTransition } from "@/lib/pipeline/validate-transition"
import { loadTransitionLegReferences } from "@/lib/pipeline/transition-leg-references"

const pipelineStageSchema = z.enum([
  "enquiry",
  "quoted",
  "quote_sent",
  "accepted",
  "form_done",
  "deposit_requested",
  "payment_schedule",
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "trip_active",
  "closed",
  "lost",
])

const validateMoveSchema = z.object({
  targetStage: pipelineStageSchema,
  manualConfirmations: z
    .object({
      finalPaymentReceived: z.boolean().optional(),
    })
    .optional(),
  lostContext: z
    .object({
      cancelReason: z.string().nullable().optional(),
      refundStatus: z.enum(["refunded", "not_refunded"]).nullable().optional(),
      refundAmount: z.number().nullable().optional(),
      refundReference: z.string().nullable().optional(),
      refundedAt: z.string().nullable().optional(),
    })
    .optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: z.infer<typeof validateMoveSchema>
  try {
    body = validateMoveSchema.parse(await req.json())
  } catch (error) {
    return NextResponse.json({ error: "Invalid request payload", details: error }, { status: 400 })
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, stage, source, customer_id, email_import_needs_review, email_import_review_resolved_at, reservation_form_received_at, revision_reset_at, customer_invoice_number",
    )
    .eq("id", id)
    .single()

  if (bookingError || !booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // `lost` and `closed` are permanently terminal (F12-4, 2026-08-21) — mirrors
  // the hard block in the real PATCH so a dry-run never reports "clear" for a
  // move the real transition will refuse outright, override or not.
  if (isTerminalPipelineStage(booking.stage as PipelineStage) && body.targetStage !== booking.stage) {
    const noun = isReopenFromCancelled(booking.stage as PipelineStage) ? "cancelled" : "closed"
    return NextResponse.json({
      failures: [
        {
          gateId: "terminal_stage",
          message: `This booking is ${noun} and cannot be reopened.`,
          fixHint: "Start a new enquiry instead.",
          severity: "block",
        },
      ],
      canOverride: false,
    })
  }

  const [
    { data: customer },
    { data: quotes },
    { data: documents },
    { data: invoices },
    { data: correspondences },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("first_name, last_name, email, phone, country")
      .eq("id", booking.customer_id)
      .maybeSingle(),
    supabase
      .from("quotes")
      .select("status, total, created_at")
      .eq("booking_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("documents").select("kind, status, created_at").eq("booking_id", id),
    supabase.from("invoices").select("kind, status").eq("booking_id", id),
    supabase.from("correspondences").select("kind, subject, status, created_at").eq("booking_id", id),
    supabase.from("payments").select("amount").eq("booking_id", id),
  ])

  // Deliberate product decision (#122): any authenticated role may override a
  // blocked stage transition. The control is the audit trail, not a role gate —
  // see the `stage_change_override` insert in PATCH /api/jobs/[id]/route.ts.
  const canOverride = true

  // Fails open: the generate/send readiness check still blocks a voucher with missing references,
  // so a lookup hiccup here costs a clearer message, never a wrongly-permitted move.
  let legReferences: Awaited<ReturnType<typeof loadTransitionLegReferences>> = []
  try {
    legReferences = await loadTransitionLegReferences(
      supabase,
      id,
      booking.stage as PipelineStage,
      body.targetStage as PipelineStage,
    )
  } catch (error) {
    console.error("validate-stage-move:leg-references", error)
  }

  const failures = validateTransition({
    booking: {
      id: booking.id,
      stage: booking.stage as PipelineStage,
      source: booking.source,
      customer_invoice_number: booking.customer_invoice_number,
      email_import_needs_review: booking.email_import_needs_review,
      email_import_review_resolved_at: booking.email_import_review_resolved_at,
      reservation_form_received_at: booking.reservation_form_received_at,
      revision_reset_at: booking.revision_reset_at,
    },
    customer,
    targetStage: body.targetStage as PipelineStage,
    quotes: quotes ?? [],
    documents: documents ?? [],
    invoices: invoices ?? [],
    correspondences: correspondences ?? [],
    payments: payments ?? [],
    legReferences,
    manualConfirmations: body.manualConfirmations,
    lostContext: body.lostContext,
  })

  // `autoCreatableInvoice` used to ride along here for the removed
  // `create_invoice_25pct` shortcut. Nothing consumed it, and there is no
  // auto-creatable invoice any more — the gate sends the user to the real
  // deposit-invoice dialog instead.
  return NextResponse.json({ failures, canOverride })
}
