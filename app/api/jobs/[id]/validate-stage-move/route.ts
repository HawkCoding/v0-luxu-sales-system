import { NextResponse } from "next/server"
import { z } from "zod"
import { extractRoleFromJwt } from "@/lib/role-utils"
import { createSessionClient } from "@/lib/supabase/server"
import type { PipelineStage } from "@/lib/types"
import { validateTransition } from "@/lib/pipeline/validate-transition"

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
      createDepositInvoice: z.boolean().optional(),
      createInvoiceCorrespondence: z.boolean().optional(),
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
      "id, stage, source, customer_id, email_import_needs_review, email_import_review_resolved_at, reservation_form_received_at, customer_invoice_number",
    )
    .eq("id", id)
    .single()

  if (bookingError || !booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [
    { data: profile },
    { data: customer },
    { data: quotes },
    { data: documents },
    { data: invoices },
    { data: correspondences },
    { data: payments },
  ] = await Promise.all([
    supabase.from("profiles").select("clearance_level").eq("user_id", user.id).maybeSingle(),
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
    supabase.from("documents").select("kind, status").eq("booking_id", id),
    supabase.from("invoices").select("kind, status").eq("booking_id", id),
    supabase.from("correspondences").select("kind, subject, status").eq("booking_id", id),
    supabase.from("payments").select("amount").eq("booking_id", id),
  ])

  const role = extractRoleFromJwt(user) ?? profile?.clearance_level ?? null
  const isManager = role === "manager" || role === "admin"
  const failures = validateTransition({
    booking: {
      id: booking.id,
      stage: booking.stage as PipelineStage,
      source: booking.source,
      customer_invoice_number: booking.customer_invoice_number,
      email_import_needs_review: booking.email_import_needs_review,
      email_import_review_resolved_at: booking.email_import_review_resolved_at,
      reservation_form_received_at: booking.reservation_form_received_at,
    },
    customer,
    targetStage: body.targetStage as PipelineStage,
    quotes: quotes ?? [],
    documents: documents ?? [],
    invoices: invoices ?? [],
    correspondences: correspondences ?? [],
    payments: payments ?? [],
    manualConfirmations: body.manualConfirmations,
    lostContext: body.lostContext,
  })

  return NextResponse.json({
    failures,
    isManager,
    autoCreatableInvoice: failures.some((failure) => failure.autoFixable === "create_invoice_25pct"),
  })
}
