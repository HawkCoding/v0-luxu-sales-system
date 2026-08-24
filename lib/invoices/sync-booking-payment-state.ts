import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import { getCrossedForwardStages } from "@/lib/pipeline/validate-transition"
import type { Database } from "@/lib/supabase/types"

export interface BookingPaymentState {
  totalPaid: number
  depositPaid: boolean
  invoiceBalance: number
  /** Amount received above the accepted quote total. Zero unless the booking is overpaid. */
  overpaidAmount: number
}

export interface PaymentSyncAuditContext {
  actorName: string
  actorUserId: string | null
}

/**
 * Recalculates deposit_paid and invoice_balance from actual payment records and
 * updates the booking row. Also marks deposit/final invoices as 'paid' when thresholds
 * are crossed. Call this after every payment insert, update, or delete.
 *
 * Safe to call when no accepted quote exists — returns early without error.
 */
export async function syncBookingPaymentState(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  auditContext?: PaymentSyncAuditContext,
): Promise<BookingPaymentState | null> {
  const [
    { data: quote },
    { data: payments },
    { data: depositInvoice },
    { data: finalInvoice },
    { data: fullInvoice },
    { data: currentBooking },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select("total")
      .eq("booking_id", bookingId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("payments").select("amount").eq("booking_id", bookingId),
    supabase
      .from("invoices")
      .select("id, amount, status")
      .eq("booking_id", bookingId)
      .eq("kind", "deposit")
      .in("status", ["draft", "sent", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("id, status")
      .eq("booking_id", bookingId)
      .eq("kind", "final")
      .in("status", ["draft", "sent", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A full-payment invoice covers the deposit and the final amount in one
    // go — its amount also serves as the deposit_paid threshold below.
    supabase
      .from("invoices")
      .select("id, amount, status")
      .eq("booking_id", bookingId)
      .eq("kind", "full")
      .in("status", ["draft", "sent", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("deposit_paid, deposit_paid_at, invoice_balance, overpaid_amount, stage, deposit_confirmed_manually")
      .eq("id", bookingId)
      .single(),
  ])

  if (!quote || Number(quote.total) <= 0) {
    // No priced accepted quote yet — nothing to sync against
    return null
  }

  const quoteTotal = Number(quote.total)
  const totalPaid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
  const invoiceBalance = Math.max(0, Math.round((quoteTotal - totalPaid) * 100) / 100)
  // The balance clamps at zero, so the excess would otherwise be invisible — a
  // typo'd extra digit or a double EFT looks exactly like paying to the cent.
  const overpaidAmount = Math.max(0, Math.round((totalPaid - quoteTotal) * 100) / 100)
  const previousOverpaidAmount = Number(currentBooking?.overpaid_amount ?? 0)

  // A full-payment invoice has no separate deposit — its full amount is the
  // threshold for both deposit_paid and (via invoiceBalance below) final_paid.
  const depositThreshold = depositInvoice
    ? Number(depositInvoice.amount)
    : fullInvoice
      ? Number(fullInvoice.amount)
      : null
  const derivedDepositPaid = depositThreshold !== null && totalPaid >= depositThreshold
  // A manual "deposit received" confirmation is sticky: amounts can still
  // set deposit_paid true, but they can never clear a confirmed deposit.
  const isDepositPaid = derivedDepositPaid || currentBooking?.deposit_confirmed_manually === true

  const bookingUpdates: Record<string, unknown> = {
    invoice_balance: invoiceBalance,
    overpaid_amount: overpaidAmount,
    deposit_paid: isDepositPaid,
    updated_at: new Date().toISOString(),
  }

  // Only set deposit_paid_at the first time it flips to true
  if (isDepositPaid && !currentBooking?.deposit_paid) {
    bookingUpdates.deposit_paid_at = new Date().toISOString()
  }

  // The client paid the whole amount in one go — whether via a full-payment
  // invoice or by settling a deposit request in full — so the booking can
  // skip straight to Paid in Full instead of waiting on a manual gate.
  const crossesToFinalPaid = getCrossedForwardStages(
    currentBooking?.stage ?? "enquiry",
    "final_paid",
  ).includes("final_paid")
  // A cancelled booking is off the ladder — getCrossedForwardStages treats `lost`
  // as a reopen and reports every stage as crossed, so without this a payment
  // write would silently un-cancel it into final_paid while outcome stays
  // "Cancelled" and cancelled_at stays set.
  const stageIsCancelled = currentBooking?.stage === "lost"
  const autoAdvancedToFinalPaid = invoiceBalance === 0 && crossesToFinalPaid && !stageIsCancelled
  if (autoAdvancedToFinalPaid) {
    bookingUpdates.stage = "final_paid"
    bookingUpdates.final_paid_at = new Date().toISOString()
  }

  await supabase.from("bookings").update(bookingUpdates).eq("id", bookingId)

  const actorName = auditContext?.actorName ?? "system"
  const actorUserId = auditContext?.actorUserId ?? null

  if (autoAdvancedToFinalPaid) {
    await writeAuditLog(supabase, {
      actor: actorName,
      actorUserId,
      entityType: "Booking",
      entityId: bookingId,
      action: "booking_paid_in_full",
      before: { stage: currentBooking?.stage ?? null },
      after: { stage: "final_paid", invoice_balance: invoiceBalance },
    })
  }

  // Only on a change — this sync runs on every payment write, and an unchanged
  // overage must not append a duplicate entry each time.
  if (overpaidAmount !== previousOverpaidAmount) {
    await writeAuditLog(supabase, {
      actor: actorName,
      actorUserId,
      entityType: "Booking",
      entityId: bookingId,
      action: "payment_overpaid",
      before: { overpaid_amount: previousOverpaidAmount },
      after: { overpaid_amount: overpaidAmount, total_paid: totalPaid, quote_total: quoteTotal },
    })
  }

  // Mark deposit invoice as paid if threshold crossed
  if (depositInvoice && isDepositPaid && depositInvoice.status !== "paid") {
    await supabase
      .from("invoices")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", depositInvoice.id)

    await writeAuditLog(supabase, {
      actor: actorName,
      actorUserId,
      entityType: "Booking",
      entityId: bookingId,
      action: "deposit_marked_paid",
      before: { invoice_id: depositInvoice.id, status: depositInvoice.status },
      after: { invoice_id: depositInvoice.id, status: "paid", total_paid: totalPaid },
    })
  }

  // Mark final invoice as paid if balance is zero
  if (finalInvoice && invoiceBalance === 0 && finalInvoice.status !== "paid") {
    await supabase
      .from("invoices")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", finalInvoice.id)

    await writeAuditLog(supabase, {
      actor: actorName,
      actorUserId,
      entityType: "Booking",
      entityId: bookingId,
      action: "invoice_marked_paid",
      before: { invoice_id: finalInvoice.id, status: finalInvoice.status },
      after: { invoice_id: finalInvoice.id, status: "paid", invoice_balance: invoiceBalance },
    })
  }

  // Mark full-payment invoice as paid if balance is zero
  if (fullInvoice && invoiceBalance === 0 && fullInvoice.status !== "paid") {
    await supabase
      .from("invoices")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", fullInvoice.id)

    await writeAuditLog(supabase, {
      actor: actorName,
      actorUserId,
      entityType: "Booking",
      entityId: bookingId,
      action: "invoice_marked_paid",
      before: { invoice_id: fullInvoice.id, status: fullInvoice.status },
      after: { invoice_id: fullInvoice.id, status: "paid", invoice_balance: invoiceBalance },
    })
  }

  if (isDepositPaid && currentBooking?.deposit_paid !== true) {
    const depositPaidAt = typeof bookingUpdates.deposit_paid_at === "string" ? bookingUpdates.deposit_paid_at : null
    await writeAuditLog(supabase, {
      actor: actorName,
      actorUserId,
      entityType: "Booking",
      entityId: bookingId,
      action: "booking_confirmed",
      before: { deposit_paid: currentBooking?.deposit_paid ?? false, stage: currentBooking?.stage ?? null },
      after: { deposit_paid: true, deposit_paid_at: depositPaidAt },
    })
  }

  return { totalPaid, depositPaid: isDepositPaid, invoiceBalance, overpaidAmount }
}
