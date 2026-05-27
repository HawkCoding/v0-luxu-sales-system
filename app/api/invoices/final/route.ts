import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate } from "@/lib/date-format"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { renderInvoiceEmail } from "@/lib/invoices/render-invoice-email"
import { logError } from "@/lib/error-log"

export const runtime = "nodejs"

const finalInvoiceSchema = z.object({
  jobId: z.string().uuid(),
  amount: z.number().min(0).optional(),
})

const updateFinalInvoiceSchema = z.object({
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

  const parsed = finalInvoiceSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user } = auth.value

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
    .eq("kind", "final")
    .in("status", ["draft", "sent"])
    .maybeSingle()

  if (existingInvoiceError) return safeSupabaseError("final-invoice:existing", existingInvoiceError)

  let balance
  try {
    balance = await calculateInvoiceBalance(supabase, parsed.data.jobId)
  } catch (error) {
    if (error instanceof Error && error.message.includes("priced quote")) {
      return jsonError(error.message, 422)
    }
    return safeSupabaseError("final-invoice:balance", error)
  }

  const now = new Date()
  const dueDate = addDays(now, 7)
  const amount = parsed.data.amount ?? balance.balance
  const invoiceNumber = `${booking.booking_number}-FIN1`

  const invoice = await (async () => {
    if (existingInvoice) {
      if (existingInvoice.status !== "draft") return existingInvoice

      const { data, error } = await supabase
        .from("invoices")
        .update({
          quote_id: balance.quote.id,
          amount,
          due_date: dueDate,
          updated_at: now.toISOString(),
        })
        .eq("id", existingInvoice.id)
        .select()
        .single()

      if (error || !data) throw error ?? new Error("Invoice update did not return a row")
      return data
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        booking_id: parsed.data.jobId,
        quote_id: balance.quote.id,
        kind: "final",
        status: "draft",
        invoice_number: invoiceNumber,
        deposit_percentage: null,
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
    console.error("supabase:final-invoice:create", error)
    void logError({ severity: "Critical", source: "invoice-final", message: "Final invoice could not be generated", details: { jobId: parsed.data.jobId, error: error instanceof Error ? error.message : String(error) } })
    return null
  })

  if (!invoice) return jsonError("Final invoice could not be generated", 500)

  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
  const bodyHtml = await renderInvoiceEmail({
    customerName,
    invoiceNumber: invoice.invoice_number,
    bookingNumber: booking.booking_number,
    invoiceKind: "final",
    amount: formatMoney(invoice.amount, invoice.currency),
    dueDate: formatDisplayDate(invoice.due_date),
    lines: [
      { label: "Quote total", value: formatMoney(balance.quoteTotal, invoice.currency) },
      { label: "Payments received", value: formatMoney(balance.totalPaid, invoice.currency) },
      { label: "Calculated balance", value: formatMoney(balance.balance, invoice.currency) },
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
      sentAt: invoice.sent_at,
      createdAt: invoice.created_at,
    },
    balance: {
      quoteTotal: balance.quoteTotal,
      totalPaid: balance.totalPaid,
      calculatedBalance: balance.balance,
    },
    email: {
      to: customer?.email ?? "",
      subject: `Final invoice ${invoice.invoice_number}`,
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

  const parsed = updateFinalInvoiceSchema.safeParse(raw)
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
    .eq("kind", "final")
    .select("id, status, sent_at")
    .single()

  if (error || !invoice) return safeSupabaseError("final-invoice:update", error)

  return Response.json({
    id: invoice.id,
    status: invoice.status,
    sentAt: invoice.sent_at,
  })
}
