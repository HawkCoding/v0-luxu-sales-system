import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import type { Database } from "@/lib/supabase/types"

export interface BookingPaymentState {
  totalPaid: number
  depositPaid: boolean
  invoiceBalance: number
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
    supabase
      .from("bookings")
      .select("deposit_paid, deposit_paid_at, invoice_balance, stage, deposit_confirmed_manually")
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

  const depositThreshold = depositInvoice ? Number(depositInvoice.amount) : null
  const derivedDepositPaid = depositThreshold !== null && totalPaid >= depositThreshold
  // A manual "deposit received" confirmation is sticky: amounts can still
  // set deposit_paid true, but they can never clear a confirmed deposit.
  const isDepositPaid = derivedDepositPaid || currentBooking?.deposit_confirmed_manually === true

  const bookingUpdates: Record<string, unknown> = {
    invoice_balance: invoiceBalance,
    deposit_paid: isDepositPaid,
    updated_at: new Date().toISOString(),
  }

  // Only set deposit_paid_at the first time it flips to true
  if (isDepositPaid && !currentBooking?.deposit_paid) {
    bookingUpdates.deposit_paid_at = new Date().toISOString()
  }

  await supabase.from("bookings").update(bookingUpdates).eq("id", bookingId)

  const actorName = auditContext?.actorName ?? "system"
  const actorUserId = auditContext?.actorUserId ?? null

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

  return { totalPaid, depositPaid: isDepositPaid, invoiceBalance }
}
