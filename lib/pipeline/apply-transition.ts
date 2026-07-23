import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import { formatDisplayDateLong } from "@/lib/date-format"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { getBankingSettings } from "@/lib/settings-access"
import type { Database } from "@/lib/supabase/types"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import type { PipelineStage } from "@/lib/types"
import { calculateDepositAmount, getDefaultDepositPercentage } from "./constants"
import { getCrossedForwardStages, type LostContext, type ManualConfirmations } from "./validate-transition"

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"]
type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"]
type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"]
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"]
type CorrespondenceRow = Database["public"]["Tables"]["correspondences"]["Row"]

export interface ApplyTransitionInput {
  booking: Pick<
    BookingRow,
    | "id"
    | "booking_number"
    | "stage"
    | "source"
    | "raw_text"
    | "updated_at"
    | "customer_id"
    | "consultant"
  > & {
    /**
     * Optional so existing callers building this Pick literal don't all need
     * updating. Used only to pick a signature sender for the deposit-request
     * draft this transition composes — falls back to actorUserId when absent.
     */
    assigned_salesperson_id?: string | null
  }
  departureDate?: string | null
  durationNights?: number | null
  targetStage: PipelineStage
  actorName: string
  actorUserId: string | null
  expectedUpdatedAt?: string
  manualConfirmations?: ManualConfirmations
  lostContext?: LostContext
  quotes?: Pick<QuoteRow, "id" | "status" | "total" | "created_at">[]
  documents?: Pick<DocumentRow, "id" | "kind" | "status">[]
  correspondences?: Pick<CorrespondenceRow, "id" | "kind" | "subject" | "status">[]
  now?: Date
}

export interface ApplyTransitionResult {
  updated: BookingRow
  crossedStages: PipelineStage[]
  createdInvoiceDocument: boolean
  scheduledDepositCorrespondence: boolean
}

function newestAcceptedOrSentQuote(
  quotes: Pick<QuoteRow, "id" | "status" | "total" | "created_at">[],
): Pick<QuoteRow, "id" | "status" | "total" | "created_at"> | null {
  const candidates = quotes.filter((quote) => quote.status === "accepted" || quote.status === "sent")
  if (candidates.length === 0) return null

  return candidates.sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0
    return rightTime - leftTime
  })[0] ?? null
}

function hasCorrespondence(
  correspondences: Pick<CorrespondenceRow, "kind" | "subject" | "status">[],
  kind: string,
  terms: string[],
): boolean {
  return correspondences.some((correspondence) => {
    const subject = correspondence.subject?.toLowerCase() ?? ""
    return correspondence.kind === kind && terms.some((term) => subject.includes(term))
  })
}

function buildBookingUpdates(input: ApplyTransitionInput, nowIso: string): BookingUpdate {
  const updates: BookingUpdate = {
    stage: input.targetStage,
    updated_at: nowIso,
  }
  const crossedStages = getCrossedForwardStages(input.booking.stage as PipelineStage, input.targetStage)

  if (crossedStages.includes("quote_sent")) updates.quote_sent_at = nowIso
  if (crossedStages.includes("accepted")) updates.accepted_at = nowIso
  if (crossedStages.includes("deposit_requested")) updates.deposit_requested_at = nowIso
  if (crossedStages.includes("deposit_paid")) {
    updates.deposit_paid_at = nowIso
    updates.deposit_paid = true
    updates.deposit_confirmed_manually = true
  }
  if (crossedStages.includes("final_paid")) {
    updates.final_paid_at = nowIso
    updates.invoice_balance = 0
  }
  if (crossedStages.includes("voucher_sent")) {
    updates.voucher_sent_at = nowIso
    // Auto-set outcome to Won when voucher is sent (booking is complete)
    updates.outcome = "Won"
    updates.outcome_set_at = nowIso
  }
  if (crossedStages.includes("closed")) updates.closed_at = nowIso

  if (input.targetStage === "lost") {
    updates.cancelled_at = nowIso
    updates.refund_status = input.lostContext?.refundStatus ?? null
    updates.refund_amount = input.lostContext?.refundAmount ?? null
    updates.refund_reference = input.lostContext?.refundReference?.trim() || null
    updates.refunded_at = input.lostContext?.refundedAt || null
  }

  if (input.booking.source === "email" && input.targetStage !== "enquiry") {
    updates.raw_text = null
  }

  return updates
}

export async function applyTransition(
  supabase: SupabaseClient<Database>,
  input: ApplyTransitionInput,
): Promise<ApplyTransitionResult> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const crossedStages = getCrossedForwardStages(input.booking.stage as PipelineStage, input.targetStage)
  const updates = buildBookingUpdates(input, nowIso)

  let updateQuery = supabase.from("bookings").update(updates).eq("id", input.booking.id)
  if (input.expectedUpdatedAt) {
    updateQuery = updateQuery.eq("updated_at", input.expectedUpdatedAt)
  }

  const { data: updated, error } = await updateQuery.select().single()
  if (error) throw new Error(error.message)
  if (!updated) throw new Error("Booking update did not return a row")

  const latestQuote = newestAcceptedOrSentQuote(input.quotes ?? [])

  if (crossedStages.includes("accepted") && latestQuote?.status === "sent") {
    const { error: quoteError } = await supabase
      .from("quotes")
      .update({ status: "accepted", updated_at: nowIso })
      .eq("id", latestQuote.id)

    if (quoteError) throw new Error(quoteError.message)
  }

  if (crossedStages.includes("deposit_paid")) {
    await writeAuditLog(supabase, {
      actor: input.actorName,
      actorUserId: input.actorUserId,
      entityType: "Booking",
      entityId: input.booking.id,
      action: "booking_confirmed",
      before: { stage: input.booking.stage, deposit_paid: false },
      after: { stage: input.targetStage, deposit_paid: true, deposit_paid_at: updates.deposit_paid_at ?? nowIso },
    })
  }

  let createdInvoiceDocument = false
  let scheduledDepositCorrespondence = false

  if (crossedStages.includes("deposit_requested")) {
    const hasInvoiceDocument = (input.documents ?? []).some((document) => document.kind === "invoice_pdf")
    if (!hasInvoiceDocument && input.manualConfirmations?.createDepositInvoice) {
      const { error: documentError } = await supabase.from("documents").insert({
        booking_id: input.booking.id,
        kind: "invoice_pdf",
        status: "generated",
      })

      if (documentError) throw new Error(documentError.message)
      createdInvoiceDocument = true
    }

    const invoiceBalance = latestQuote?.total ?? null
    if (invoiceBalance !== null && updated.invoice_balance === null) {
      const { error: balanceError } = await supabase
        .from("bookings")
        .update({ invoice_balance: invoiceBalance })
        .eq("id", input.booking.id)

      if (balanceError) throw new Error(balanceError.message)
    }

    // Only the "create the invoice for me" confirmation schedules a deposit
    // email draft. The createInvoiceCorrespondence confirmation means the
    // invoice was already sent outside the system, so drafting another email
    // would be misleading.
    const shouldScheduleDepositCorrespondence =
      (hasInvoiceDocument || createdInvoiceDocument) &&
      !hasCorrespondence(input.correspondences ?? [], "invoice", ["invoice", "deposit request"]) &&
      input.manualConfirmations?.createDepositInvoice === true

    if (shouldScheduleDepositCorrespondence) {
      const defaultDepositPercentage = await getDefaultDepositPercentage(supabase)
      const depositAmount = latestQuote?.total ? calculateDepositAmount(latestQuote.total, defaultDepositPercentage) : null

      // Draft the deposit email from the editable deposit_request template so
      // the scheduled correspondence is a real, sendable email.
      let customerName = "Valued Guest"
      if (input.booking.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("title, first_name, last_name")
          .eq("id", input.booking.customer_id)
          .maybeSingle()
        const name = formatCustomerSalutation(customer)
        if (name) customerName = name
      }

      const dueDate = new Date(nowIso)
      dueDate.setDate(dueDate.getDate() + 7)
      const banking = await getBankingSettings(supabase)
      const shared = await resolveSharedEmailTokens(supabase, input.booking.id)
      const composed = await composeEmail(supabase, "deposit_request", {
        tokens: {
          ...shared.tokens,
          customerName,
          jobNumber: input.booking.booking_number,
          invoiceNumber: `${input.booking.booking_number}-DEP1`,
          depositAmount: depositAmount === null ? "TBC" : depositAmount.toFixed(2),
          depositPercentage: String(defaultDepositPercentage),
          dueDate: formatDisplayDateLong(dueDate),
        },
        blocks: { ...shared.blocks, bankingDetails: buildBankingDetailsBlock(banking) },
        senderProfileId: input.booking.assigned_salesperson_id ?? input.actorUserId,
      })

      const { error: correspondenceError } = await supabase.from("correspondences").insert({
        booking_id: input.booking.id,
        channel: "email",
        kind: "invoice",
        status: "scheduled",
        scheduled_at: nowIso,
        subject: composed?.subject ?? `Deposit invoice for ${input.booking.booking_number}`,
        body_html:
          composed?.bodyHtml ??
          "<p>Thank you for choosing Luxus. Please find your deposit invoice attached.</p>",
      })

      if (correspondenceError) throw new Error(correspondenceError.message)
      scheduledDepositCorrespondence = true
    }
  }

  if (crossedStages.includes("voucher_sent")) {
    const { error: voucherError } = await supabase
      .from("documents")
      .update({ status: "sent" })
      .eq("booking_id", input.booking.id)
      .eq("kind", "voucher_pdf")

    if (voucherError) throw new Error(voucherError.message)

    await writeAuditLog(supabase, {
      actor: input.actorName,
      actorUserId: input.actorUserId,
      entityType: "Booking",
      entityId: input.booking.id,
      action: "outcome_auto_set_won",
      before: { outcome: "Open" },
      after: { outcome: "Won", outcome_set_at: nowIso },
    })

    if (input.booking.customer_id) {
      const { data: completedBookings, error: completedBookingsError } = await supabase
        .from("bookings")
        .select("departure_date")
        .eq("customer_id", input.booking.customer_id)
        .in("stage", ["voucher_sent", "closed"])
        .not("departure_date", "is", null)

      if (completedBookingsError) throw new Error(completedBookingsError.message)

      const travelDates = (completedBookings ?? [])
        .map((booking) => booking.departure_date)
        .filter((departureDate): departureDate is string => Boolean(departureDate))
        .sort()

      if (travelDates.length > 0) {
        const { error: customerError } = await supabase
          .from("customers")
          .update({
            first_travel_date: travelDates[0],
            last_travel_date: travelDates[travelDates.length - 1],
          })
          .eq("id", input.booking.customer_id)

        if (customerError) throw new Error(customerError.message)
      }
    }
  }

  return {
    updated,
    crossedStages,
    createdInvoiceDocument,
    scheduledDepositCorrespondence,
  }
}
