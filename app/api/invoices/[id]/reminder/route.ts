import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate } from "@/lib/date-format"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { ensureInvoicePdf } from "@/lib/invoices/ensure-invoice-pdf"
import { composeEmail } from "@/lib/templates/compose-email"
import { getBankingSettings } from "@/lib/settings-access"

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
    .select("id, booking_id, kind, status, invoice_number, amount, currency, due_date, created_at")
    .eq("id", id)
    .single()

  if (invoiceError || !invoice) return jsonError("Invoice not found", 404)
  if (invoice.status === "paid" || invoice.status === "void") {
    return jsonError("Invoice is not awaiting payment", 409)
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_number, customer:customers(first_name, last_name, email)")
    .eq("id", invoice.booking_id)
    .single()

  if (bookingError || !booking) return jsonError("Booking not found", 404)
  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()

  const kind = invoice.kind === "deposit" ? ("deposit" as const) : ("final" as const)

  let pdf
  try {
    pdf = await ensureInvoicePdf(supabase, {
      invoice: {
        id: invoice.id,
        booking_id: invoice.booking_id,
        kind,
        invoice_number: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency,
        due_date: invoice.due_date,
        created_at: invoice.created_at,
        status: invoice.status,
      },
      bookingNumber: booking.booking_number,
      customerName,
      lines: [
        { label: "Invoice amount", value: formatMoney(invoice.amount, invoice.currency) },
      ],
    })
  } catch (error) {
    console.error("payment-reminder:pdf", error)
    return jsonError("Invoice PDF could not be generated", 500)
  }

  const overdue = daysOverdue(invoice.due_date)
  const banking = await getBankingSettings(supabase)
  const composed = await composeEmail(supabase, "payment_reminder", {
    tokens: {
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      invoiceNumber: invoice.invoice_number,
      invoiceKind: kind,
      amountDue: formatMoney(invoice.amount, invoice.currency),
      dueDate: formatDisplayDate(invoice.due_date),
      daysOverdue: overdue > 0 ? String(overdue) : "",
    },
    blocks: { bankingDetails: buildBankingDetailsBlock(banking) },
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
