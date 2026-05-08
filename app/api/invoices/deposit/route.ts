import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate } from "@/lib/date-format"
import { calculateDepositAmount, normalizeDepositPercentage } from "@/lib/pipeline/constants"
import { renderInvoiceEmail } from "@/lib/invoices/render-invoice-email"

export const runtime = "nodejs"

const depositInvoiceSchema = z.object({
  jobId: z.string().uuid(),
  depositPercentage: z.number().min(0).max(100),
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
    .select("id, booking_number, customer:customers(first_name, last_name, email)")
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

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, total, status, created_at")
    .eq("booking_id", parsed.data.jobId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (quoteError) return safeSupabaseError("deposit-invoice:quote", quoteError)
  if (!quote || quote.total <= 0) {
    return jsonError("A priced quote is required before generating a deposit invoice", 422)
  }

  const now = new Date()
  const dueDate = addDays(now, 7)
  const amount = calculateDepositAmount(quote.total, depositPercentage)
  const invoiceNumber = `${booking.booking_number}-DEP1`

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

    const { error: documentError } = await supabase.from("documents").insert({
      booking_id: parsed.data.jobId,
      kind: "invoice_pdf",
      status: "generated",
      storage_path: `invoices/${data.id}`,
    })

    if (documentError) throw documentError
    return data
  })().catch((error: unknown) => {
    console.error("supabase:deposit-invoice:create", error)
    return null
  })

  if (!invoice) return jsonError("Deposit invoice could not be generated", 500)

  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
  const bodyHtml = await renderInvoiceEmail({
    customerName,
    invoiceNumber: invoice.invoice_number,
    bookingNumber: booking.booking_number,
    invoiceKind: "deposit",
    amount: formatMoney(invoice.amount, invoice.currency),
    depositPercentage: invoice.deposit_percentage,
    dueDate: formatDisplayDate(invoice.due_date),
    lines: [
      { label: "Quote total", value: formatMoney(quote.total, invoice.currency) },
      { label: "Invoice status", value: "Draft" },
    ],
  })

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
      subject: `Deposit invoice ${invoice.invoice_number}`,
      bodyHtml,
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
