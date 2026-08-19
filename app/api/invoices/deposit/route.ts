import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatMoney } from "@/lib/money"
import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import { calculateDepositAmount, normalizeDepositPercentage } from "@/lib/pipeline/constants"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { buildUnifiedTotals } from "@/lib/invoices/build-unified-totals"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { ensureInvoicePdf } from "@/lib/invoices/ensure-invoice-pdf"
import { clientInvoiceNumber, resolveInvoiceStatusLabel, unifiedInvoiceNumber } from "@/lib/invoices/invoice-status"
import { logError } from "@/lib/error-log"
import { getPaymentMethod } from "@/lib/payment-methods"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { buildGuestInfoBlock } from "@/lib/templates/guest-info-block"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { getInvoiceStatusOptions } from "@/lib/settings-access"

export const runtime = "nodejs"

const depositInvoiceSchema = z.object({
  jobId: z.string().uuid(),
  depositPercentage: z.number().min(1).max(100),
  mode: z.enum(["deposit", "full"]).default("deposit"),
  /** Full-payment mode only: overrides the default +48h due date. */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Bank/company details this invoice's PDF and email are generated with; omitted resolves to the account default. */
  paymentMethodId: z.string().uuid().nullish(),
})

const updateDepositInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  /** `void` discards an unsent draft so the amount can be decided again. */
  status: z.enum(["sent", "void"]),
})

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
  const isFullPayment = parsed.data.mode === "full"
  const depositPercentage = normalizeDepositPercentage(parsed.data.depositPercentage)
  const invoiceKind = isFullPayment ? "full" : "deposit"

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, customer_invoice_number, departure_date, deposit_paid, cancelled_at, assigned_salesperson_id, no_of_adults, no_of_children, customer:customers(title, first_name, last_name, email)",
    )
    .eq("id", parsed.data.jobId)
    .single()

  if (bookingError || !booking) return jsonError("Booking not found", 404)

  const { data: travellers } = await supabase
    .from("travellers")
    .select("prefix, first_name, last_name, id_passport")
    .eq("booking_id", parsed.data.jobId)
    .order("sort_order")

  const guestsIncomplete =
    (travellers ?? []).length === 0 ||
    (travellers ?? []).some((t) => !t.first_name?.trim() || !t.last_name?.trim() || !t.id_passport?.trim())

  if (guestsIncomplete) {
    return jsonError(
      "Guest details (name, surname, ID/passport) are required for every traveller before a deposit invoice can be generated. Fill them in on the Reservation tab.",
      422,
    )
  }

  // The booking carries one live invoice across both kinds. Matching on
  // `deposit` alone used to let a mode switch insert a second row sharing the
  // same invoice number, whose PDF then overwrote the first.
  const { data: existingInvoices, error: existingInvoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("booking_id", parsed.data.jobId)
    .in("kind", ["deposit", "full"])
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1)

  if (existingInvoiceError) return safeSupabaseError("deposit-invoice:existing", existingInvoiceError)

  const existingInvoice = existingInvoices?.[0] ?? null

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
  // confirmation invoice. Full-payment invoices (booking made inside 60 days
  // of departure) default to 48 hours, but the salesperson can override.
  const dueDate = isFullPayment ? parsed.data.dueDate ?? addDays(now, 2) : addDays(now, 3)
  const amount = isFullPayment ? quote.total : calculateDepositAmount(quote.total, depositPercentage)
  // Internal invoice number stored on the row — backend tracking only.
  const invoiceNumber = unifiedInvoiceNumber(booking.booking_number)
  // What the customer sees on the PDF/emails and uses as the bank reference:
  // the salesperson-entered number, falling back to the internal one.
  const displayInvoiceNumber = clientInvoiceNumber(booking)

  if (!booking.customer_invoice_number?.trim()) {
    return jsonError("Enter the invoice number on the job before generating this invoice.", 400)
  }

  // A live invoice priced off a superseded quote must be re-issued at the new
  // total rather than reused — that is the amendment path after a quote
  // revision. A mode switch (deposit ⇄ full) instead voids and starts over,
  // because the kind is baked into the row and the email template.
  const kindMismatch = existingInvoice !== null && existingInvoice.kind !== invoiceKind
  const stalePricing = existingInvoice !== null && existingInvoice.quote_id !== quote.id

  // Resolves to the requested method, else the invoice's own prior method
  // (an amend keeps its bank details unless the salesperson changes them),
  // else the account default. Stamped as a concrete id below so the PDF
  // keeps rendering the same bank details even if the default later changes.
  const method = await getPaymentMethod(
    supabase,
    parsed.data.paymentMethodId ?? existingInvoice?.payment_method_id ?? null,
  )

  const invoice = await (async () => {
    if (existingInvoice && !kindMismatch && !stalePricing && parsed.data.paymentMethodId === undefined) {
      return existingInvoice
    }

    if (existingInvoice && !kindMismatch) {
      const { data, error } = await supabase
        .from("invoices")
        .update({
          quote_id: quote.id,
          deposit_percentage: isFullPayment ? null : depositPercentage,
          amount,
          // Re-stamped alongside the amount: a revision could have landed the booking on a
          // quote priced in another currency, and the two must never disagree.
          currency: balance.currency,
          due_date: dueDate,
          payment_method_id: method.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInvoice.id)
        .select()
        .single()

      if (error || !data) throw error ?? new Error("Invoice amend did not return a row")
      return data
    }

    if (existingInvoice) {
      const { error: voidError } = await supabase
        .from("invoices")
        .update({ status: "void", updated_at: new Date().toISOString() })
        .eq("id", existingInvoice.id)

      if (voidError) throw voidError
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        booking_id: parsed.data.jobId,
        quote_id: quote.id,
        kind: invoiceKind,
        status: "draft",
        invoice_number: invoiceNumber,
        deposit_percentage: isFullPayment ? null : depositPercentage,
        amount,
        // An invoice is always raised in the currency of the quote it bills, so the client is
        // never asked to pay in a currency they didn't accept.
        currency: balance.currency,
        due_date: dueDate,
        payment_method_id: method.id || null,
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
    depositPercentage: isFullPayment ? null : invoice.deposit_percentage ?? depositPercentage,
    depositAmount: isFullPayment ? null : invoice.amount,
    mode: isFullPayment ? "full" : "deposit",
    fullDueDate: isFullPayment ? invoice.due_date : undefined,
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
        payment_method_id: invoice.payment_method_id,
      },
      bookingNumber: booking.booking_number,
      displayInvoiceNumber,
      customerName,
      statusLabel,
      totals,
    })
  } catch (error) {
    console.error("deposit-invoice:pdf", error)
    return jsonError("Deposit invoice PDF could not be generated", 500)
  }

  const banking = method.banking
  const guests = (travellers ?? [])
    .map((traveller) => ({
      name: [traveller.prefix, traveller.first_name, traveller.last_name].filter(Boolean).join(" ").trim(),
      idNumber: traveller.id_passport,
    }))
    .filter((guest) => guest.name)
  const shared = await resolveSharedEmailTokens(supabase, booking.id)
  const composed = isFullPayment
    ? await composeEmail(supabase, "full_payment_request", {
        tokens: {
          ...shared.tokens,
          customerName: customerName || "Valued Guest",
          jobNumber: booking.booking_number,
          invoiceNumber: displayInvoiceNumber,
          amountDue: formatMoney(invoice.amount, invoice.currency),
          dueDate: formatDisplayDateLong(invoice.due_date),
        },
        blocks: {
          ...shared.blocks,
          bankingDetails: buildBankingDetailsBlock(banking, displayInvoiceNumber),
          guestInfo: buildGuestInfoBlock({
            customerName: customerName || "Valued Guest",
            customerEmail: customer?.email ?? null,
            guests,
            adults: booking.no_of_adults ?? 0,
            children: booking.no_of_children ?? 0,
          }),
        },
        senderProfileId: booking.assigned_salesperson_id ?? user.id,
      })
    : await composeEmail(supabase, "deposit_request", {
        tokens: {
          ...shared.tokens,
          customerName: customerName || "Valued Guest",
          jobNumber: booking.booking_number,
          invoiceNumber: displayInvoiceNumber,
          depositAmount: formatMoney(invoice.amount, invoice.currency),
          depositPercentage: String(invoice.deposit_percentage ?? depositPercentage),
          dueDate: formatDisplayDateLong(invoice.due_date),
          finalDueDate: totals.finalDueDate ? formatDisplayDateLong(totals.finalDueDate) : "Now",
          finalAmount: formatMoney(totals.finalAmount, invoice.currency),
        },
        blocks: {
          ...shared.blocks,
          bankingDetails: buildBankingDetailsBlock(banking, displayInvoiceNumber),
          guestInfo: buildGuestInfoBlock({
            customerName: customerName || "Valued Guest",
            customerEmail: customer?.email ?? null,
            guests,
            adults: booking.no_of_adults ?? 0,
            children: booking.no_of_children ?? 0,
          }),
        },
        senderProfileId: booking.assigned_salesperson_id ?? user.id,
      })

  if (!composed) return jsonError("Invoice email template could not be resolved", 500)

  return Response.json({
    invoice: {
      id: invoice.id,
      jobId: invoice.booking_id,
      quoteId: invoice.quote_id,
      kind: invoice.kind,
      status: invoice.status,
      invoiceNumber: displayInvoiceNumber,
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
  const { supabase } = auth.value

  if (parsed.data.status === "void") {
    // Only an unsent draft can be discarded — a sent or paid invoice is a
    // record the customer already has, and is superseded via a quote revision.
    const { data: current, error: currentError } = await supabase
      .from("invoices")
      .select("id, kind, status")
      .eq("id", parsed.data.invoiceId)
      .maybeSingle()

    if (currentError) return safeSupabaseError("deposit-invoice:void-lookup", currentError)
    if (!current) return jsonError("Invoice not found", 404)
    if (current.kind !== "deposit" && current.kind !== "full") {
      return jsonError("Only deposit or full-payment invoices can be discarded", 409)
    }
    if (current.status !== "draft") {
      return jsonError("Only an invoice that has not been sent can be discarded", 409)
    }
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({
      status: parsed.data.status,
      ...(parsed.data.status === "sent" ? { sent_at: now } : {}),
      updated_at: now,
    })
    .eq("id", parsed.data.invoiceId)
    .in("kind", ["deposit", "full"])
    .select("id, status, sent_at")
    .single()

  if (error || !invoice) return safeSupabaseError("deposit-invoice:update", error)

  return Response.json({
    id: invoice.id,
    status: invoice.status,
    sentAt: invoice.sent_at,
  })
}
