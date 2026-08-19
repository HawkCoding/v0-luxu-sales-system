import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatMoney } from "@/lib/money"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { buildUnifiedTotals } from "@/lib/invoices/build-unified-totals"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { ensureInvoicePdf } from "@/lib/invoices/ensure-invoice-pdf"
import { clientInvoiceNumber, resolveInvoiceStatusLabel } from "@/lib/invoices/invoice-status"
import { getPaymentMethod } from "@/lib/payment-methods"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { getInvoiceStatusOptions } from "@/lib/settings-access"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Prepare the payment-received confirmation email: the booking's one invoice is
 * re-rendered with the updated status block and money ladder ("amended
 * confirmation invoice") and attached. The client shows an editable preview and
 * sends via /api/correspondence (kind: payment_received).
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, customer_invoice_number, departure_date, deposit_paid, cancelled_at, assigned_salesperson_id, customer:customers(title, first_name, last_name, email)",
    )
    .eq("id", id)
    .single()

  if (bookingError || !booking) return jsonError("Booking not found", 404)

  // The most recent issue of the booking's invoice — its number and record are
  // reused so the client receives the same invoice with refreshed figures.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, booking_id, quote_id, kind, status, invoice_number, amount, currency, due_date, created_at, deposit_percentage, display_status, payment_method_id",
    )
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (invoiceError) return safeSupabaseError("payment-received:invoice", invoiceError)
  if (!invoice) {
    return jsonError("Generate the confirmation invoice before sending a payment confirmation", 422)
  }

  let balance
  try {
    balance = await calculateInvoiceBalance(supabase, id)
  } catch (error) {
    if (error instanceof Error && error.message.includes("priced quote")) {
      return jsonError(error.message, 422)
    }
    return safeSupabaseError("payment-received:balance", error)
  }

  if (balance.totalPaid <= 0) {
    return jsonError("No payment has been recorded for this booking yet", 422)
  }

  // The deposit issue carries the percentage for the ladder.
  const { data: depositInvoice } = await supabase
    .from("invoices")
    .select("deposit_percentage, amount")
    .eq("booking_id", id)
    .eq("kind", "deposit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const totals = buildUnifiedTotals({
    balance,
    departureDate: booking.departure_date,
    depositPercentage: depositInvoice?.deposit_percentage ?? null,
    depositAmount: depositInvoice?.amount ?? null,
  })
  const statusLabel = resolveInvoiceStatusLabel(
    await getInvoiceStatusOptions(supabase),
    {
      depositPaid: booking.deposit_paid ?? false,
      outstanding: balance.balance,
      cancelled: Boolean(booking.cancelled_at),
    },
    invoice.display_status,
  )

  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = formatCustomerSalutation(customer)
  const displayInvoiceNumber = clientInvoiceNumber(booking)

  if (!booking.customer_invoice_number?.trim()) {
    return jsonError("Enter the invoice number on the job before generating this invoice.", 400)
  }

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
        payment_method_id: invoice.payment_method_id,
      },
      bookingNumber: booking.booking_number,
      displayInvoiceNumber,
      customerName,
      statusLabel,
      totals,
    })
  } catch (error) {
    console.error("payment-received:pdf", error)
    return jsonError("Amended invoice PDF could not be generated", 500)
  }

  const method = await getPaymentMethod(supabase, invoice.payment_method_id)
  const banking = method.banking
  const shared = await resolveSharedEmailTokens(supabase, booking.id)
  const composed = await composeEmail(supabase, "payment_received", {
    tokens: {
      ...shared.tokens,
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      invoiceNumber: displayInvoiceNumber,
      receivedAmount: formatMoney(balance.totalPaid, invoice.currency),
      finalDueDate: totals.finalDueDate ? formatDisplayDateLong(totals.finalDueDate) : "Now",
      outstandingAmount: formatMoney(balance.balance, invoice.currency),
    },
    blocks: { ...shared.blocks, bankingDetails: buildBankingDetailsBlock(banking, displayInvoiceNumber) },
    senderProfileId: booking.assigned_salesperson_id ?? auth.value.user.id,
  })

  if (!composed) return jsonError("Payment-received template could not be resolved", 500)

  return Response.json({
    email: {
      to: customer?.email ?? "",
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
      bodyContentHtml: composed.bodyContentHtml,
      warnings: composed.warnings,
      signatureProfileId: composed.signatureProfileId,
      signatureBrandId: composed.signatureBrandId,
      paymentMethodId: method.id || null,
    },
    attachment: {
      filename: pdf.filename,
      contentBase64: pdf.contentBase64,
      contentType: "application/pdf",
    },
  })
}
