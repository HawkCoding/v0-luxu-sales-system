import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong } from "@/lib/date-format"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { buildUnifiedTotals } from "@/lib/invoices/build-unified-totals"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { ensureInvoicePdf } from "@/lib/invoices/ensure-invoice-pdf"
import { resolveInvoiceStatusLabel } from "@/lib/invoices/invoice-status"
import type { InvoiceTotals } from "@/lib/invoices/pdf/invoice-document"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { getBankingSettings, getInvoiceStatusOptions } from "@/lib/settings-access"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

function formatMoney(amount: number, currency = "ZAR"): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime()
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((today - due) / 86_400_000))
}

/**
 * Prepare a payment-reminder email for an unpaid invoice: composed from the
 * payment_reminder template with the invoice PDF attached. The client shows
 * an editable preview and sends via /api/correspondence (kind: payment_reminder).
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, booking_id, quote_id, kind, status, invoice_number, amount, currency, due_date, created_at, deposit_percentage, display_status",
    )
    .eq("id", id)
    .single()

  if (invoiceError || !invoice) return jsonError("Invoice not found", 404)
  if (invoice.status === "paid" || invoice.status === "void") {
    return jsonError("Invoice is not awaiting payment", 409)
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, departure_date, deposit_paid, cancelled_at, assigned_salesperson_id, customer:customers(title, first_name, last_name, email)",
    )
    .eq("id", invoice.booking_id)
    .single()

  if (bookingError || !booking) return jsonError("Booking not found", 404)
  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = formatCustomerSalutation(customer)

  const depositPercentage =
    invoice.kind === "deposit" ? invoice.deposit_percentage : null
  const depositAmount = invoice.kind === "deposit" ? invoice.amount : null

  // Rebuild the money ladder from the current balance so a re-issued reminder
  // reflects payments made since the invoice was first generated. If the balance
  // can't be resolved, the PDF still renders from the invoice's own amount.
  let totals: InvoiceTotals
  let outstanding = invoice.amount
  try {
    const balance = await calculateInvoiceBalance(supabase, invoice.booking_id)
    totals = buildUnifiedTotals({
      balance,
      departureDate: booking.departure_date,
      depositPercentage,
      depositAmount,
    })
    outstanding = balance.balance
  } catch {
    totals = {
      subtotalInclVat: invoice.amount,
      depositAmount: null,
      finalAmount: invoice.amount,
      finalDueDate: invoice.due_date,
      amountReceived: 0,
      amountReceivedAt: null,
      outstanding: invoice.amount,
    }
  }

  const statusLabel = resolveInvoiceStatusLabel(
    await getInvoiceStatusOptions(supabase),
    {
      depositPaid: booking.deposit_paid ?? false,
      outstanding,
      cancelled: Boolean(booking.cancelled_at),
    },
    invoice.display_status,
  )

  let pdf
  try {
    pdf = await ensureInvoicePdf(supabase, {
      invoice: {
        id: invoice.id,
        booking_id: invoice.booking_id,
        quote_id: invoice.quote_id,
        invoice_number: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency,
        due_date: invoice.due_date,
        created_at: invoice.created_at,
        status: invoice.status,
      },
      bookingNumber: booking.booking_number,
      customerName,
      statusLabel,
      totals,
    })
  } catch (error) {
    console.error("payment-reminder:pdf", error)
    return jsonError("Invoice PDF could not be generated", 500)
  }

  const overdue = daysOverdue(invoice.due_date)
  const banking = await getBankingSettings(supabase)
  const shared = await resolveSharedEmailTokens(supabase, booking.id)
  const composed = await composeEmail(supabase, "payment_reminder", {
    tokens: {
      ...shared.tokens,
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      invoiceNumber: invoice.invoice_number,
      invoiceKind: invoice.kind === "deposit" ? "deposit" : "final",
      amountDue: formatMoney(invoice.amount, invoice.currency),
      dueDate: formatDisplayDateLong(invoice.due_date),
      daysOverdue: overdue > 0 ? String(overdue) : "—",
    },
    blocks: { ...shared.blocks, bankingDetails: buildBankingDetailsBlock(banking) },
    senderProfileId: booking.assigned_salesperson_id ?? auth.value.user.id,
  })

  if (!composed) return jsonError("Payment reminder template could not be resolved", 500)

  return Response.json({
    invoice: {
      id: invoice.id,
      jobId: invoice.booking_id,
      invoiceNumber: invoice.invoice_number,
      daysOverdue: overdue,
    },
    email: {
      to: customer?.email ?? "",
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
      bodyContentHtml: composed.bodyContentHtml,
      warnings: composed.warnings,
    },
    attachment: {
      filename: pdf.filename,
      contentBase64: pdf.contentBase64,
      contentType: "application/pdf",
    },
  })
}

/** Record that a reminder was sent (called by the UI after a successful send). */
export async function PATCH(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (invoiceError || !invoice) return jsonError("Invoice not found", 404)

  const nowIso = new Date().toISOString()
  const { error } = await supabase.from("payment_reminders").insert({
    invoice_id: id,
    scheduled_for: nowIso.slice(0, 10),
    status: "sent",
    sent_at: nowIso,
  })

  if (error) return safeSupabaseError("payment-reminder:record", error)

  return Response.json({ ok: true })
}
