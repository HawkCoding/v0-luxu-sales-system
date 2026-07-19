import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate } from "@/lib/date-format"
import { calculateDepositAmount, normalizeDepositPercentage } from "@/lib/pipeline/constants"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { buildUnifiedTotals } from "@/lib/invoices/build-unified-totals"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { ensureInvoicePdf } from "@/lib/invoices/ensure-invoice-pdf"
import { resolveInvoiceStatusLabel, unifiedInvoiceNumber } from "@/lib/invoices/invoice-status"
import { logError } from "@/lib/error-log"
import { composeEmail } from "@/lib/templates/compose-email"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { getBankingSettings, getInvoiceStatusOptions } from "@/lib/settings-access"

export const runtime = "nodejs"

const depositInvoiceSchema = z.object({
  jobId: z.string().uuid(),
  depositPercentage: z.number().min(1).max(100),
})

const updateDepositInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  status: z.enum(["sent"]),
})

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

function addDays(date: Date, days: number): string {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = depositInvoiceSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user } = auth.value
  const depositPercentage = normalizeDepositPercentage(parsed.data.depositPercentage)

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, departure_date, deposit_paid, cancelled_at, customer:customers(title, first_name, last_name, email)",
    )
    .eq("id", parsed.data.jobId)
    .single()

  if (bookingError || !booking) return jsonError("Booking not found", 404)

  const { data: existingInvoice, error: existingInvoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("booking_id", parsed.data.jobId)
    .eq("kind", "deposit")
    .in("status", ["draft", "sent"])
    .maybeSingle()

  if (existingInvoiceError) return safeSupabaseError("deposit-invoice:existing", existingInvoiceError)

  let balance
  try {
    balance = await calculateInvoiceBalance(supabase, parsed.data.jobId)
  } catch (error) {
    if (error instanceof Error && error.message.includes("priced quote")) {
      return jsonError("A priced quote is required before generating a deposit invoice", 422)
    }
    return safeSupabaseError("deposit-invoice:balance", error)
  }
  const quote = balance.quote

  const now = new Date()
  // The sales team's payment terms: deposit due within 72 hours of the
  // confirmation invoice.
  const dueDate = addDays(now, 3)
  const amount = calculateDepositAmount(quote.total, depositPercentage)
  // One client-facing invoice per booking — the number stays fixed for the life
  // of the booking and doubles as the payment reference.
  const invoiceNumber = unifiedInvoiceNumber(booking.booking_number)

  const invoice = existingInvoice ?? await (async () => {
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        booking_id: parsed.data.jobId,
        quote_id: quote.id,
        kind: "deposit",
        status: "draft",
        invoice_number: invoiceNumber,
        deposit_percentage: depositPercentage,
        amount,
        currency: "ZAR",
        due_date: dueDate,
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !data) throw error ?? new Error("Invoice insert did not return a row")
    return data
  })().catch((error: unknown) => {
    console.error("supabase:deposit-invoice:create", error)
    void logError({ severity: "Critical", source: "invoice-deposit", message: "Deposit invoice could not be generated", details: { jobId: parsed.data.jobId, error: error instanceof Error ? error.message : String(error) } })
    return null
  })

  if (!invoice) return jsonError("Deposit invoice could not be generated", 500)

  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = formatCustomerSalutation(customer)

  const totals = buildUnifiedTotals({
    balance,
    departureDate: booking.departure_date,
    depositPercentage: invoice.deposit_percentage ?? depositPercentage,
    depositAmount: invoice.amount,
  })
  const statusOptions = await getInvoiceStatusOptions(supabase)
  const statusLabel = resolveInvoiceStatusLabel(
    statusOptions,
    {
      depositPaid: booking.deposit_paid ?? false,
      outstanding: balance.balance,
      cancelled: Boolean(booking.cancelled_at),
    },
    invoice.display_status,
  )

  // Render + store the invoice PDF and return it as an email attachment.
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
    console.error("deposit-invoice:pdf", error)
    return jsonError("Deposit invoice PDF could not be generated", 500)
  }

  const banking = await getBankingSettings(supabase)
  const composed = await composeEmail(supabase, "deposit_request", {
    tokens: {
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      invoiceNumber: invoice.invoice_number,
      depositAmount: formatMoney(invoice.amount, invoice.currency),
      depositPercentage: String(invoice.deposit_percentage ?? depositPercentage),
      dueDate: formatDisplayDate(invoice.due_date),
      finalDueDate: totals.finalDueDate ? formatDisplayDate(totals.finalDueDate) : "Now",
      finalAmount: formatMoney(totals.finalAmount, invoice.currency),
    },
    blocks: { bankingDetails: buildBankingDetailsBlock(banking) },
  })

  if (!composed) return jsonError("Deposit invoice email template could not be resolved", 500)

  return Response.json({
    invoice: {
      id: invoice.id,
      jobId: invoice.booking_id,
      quoteId: invoice.quote_id,
      kind: invoice.kind,
      status: invoice.status,
      invoiceNumber: invoice.invoice_number,
      depositPercentage: invoice.deposit_percentage,
      amount: invoice.amount,
      amountDisplay: formatMoney(invoice.amount, invoice.currency),
      currency: invoice.currency,
      dueDate: invoice.due_date,
      dueDateDisplay: formatDisplayDate(invoice.due_date),
      createdAt: invoice.created_at,
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

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = updateDepositInvoiceSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const now = new Date().toISOString()
  const { data: invoice, error } = await auth.value.supabase
    .from("invoices")
    .update({
      status: parsed.data.status,
      sent_at: now,
      updated_at: now,
    })
    .eq("id", parsed.data.invoiceId)
    .eq("kind", "deposit")
    .select("id, status, sent_at")
    .single()

  if (error || !invoice) return safeSupabaseError("deposit-invoice:update", error)

  return Response.json({
    id: invoice.id,
    status: invoice.status,
    sentAt: invoice.sent_at,
  })
}
