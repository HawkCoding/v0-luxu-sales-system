import type { SupabaseClient } from "@supabase/supabase-js"
import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { sendEmail } from "@/lib/email/transport"
import { formatDisplayDateLong } from "@/lib/date-format"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import { renderVoucherEmail } from "@/lib/voucher/render-voucher-email"
import { BRAND_FROM_ADDRESS } from "@/lib/brand"
import { logError } from "@/lib/error-log"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

type CustomerJoin = {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

type VoucherSendRow = {
  id: string
  voucher_number: string
  sent_at: string | null
  pdf_document_id: string | null
  booking: {
    id: string
    booking_number: string
    stage: string | null
    invoice_balance: number | null
    departure_date: string | null
    consultant: string | null
    customer_id: string | null
    customer: CustomerJoin | CustomerJoin[] | null
    route: { name: string | null } | { name: string | null }[] | null
  } | null
  document: { storage_path: string | null } | { storage_path: string | null }[] | null
}

function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function parseStoragePath(combined: string | null): { bucket: string; path: string } | null {
  if (!combined) return null
  const slash = combined.indexOf("/")
  if (slash <= 0) return null
  return { bucket: combined.slice(0, slash), path: combined.slice(slash + 1) }
}

async function updateCustomerTravelDates(
  supabase: SupabaseClient<Database>,
  customerId: string,
): Promise<void> {
  const { data: completedBookings, error } = await supabase
    .from("bookings")
    .select("departure_date")
    .eq("customer_id", customerId)
    .in("stage", ["voucher_sent", "closed"])
    .not("departure_date", "is", null)

  if (error || !completedBookings || completedBookings.length === 0) return

  const travelDates = completedBookings
    .map((row) => row.departure_date)
    .filter((value): value is string => Boolean(value))
    .sort()

  if (travelDates.length === 0) return

  await supabase
    .from("customers")
    .update({
      first_travel_date: travelDates[0],
      last_travel_date: travelDates[travelDates.length - 1],
    })
    .eq("id", customerId)
}

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params

  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return jsonError("Invalid voucher id", 400)
  }

  const { supabase, user, profile } = auth.value

  const { data: voucherRaw, error: voucherError } = await supabase
    .from("vouchers")
    .select(
      `id, voucher_number, sent_at, pdf_document_id,
       booking:bookings(id, booking_number, stage, invoice_balance, departure_date, consultant, customer_id,
         customer:customers(first_name, last_name, email, phone),
         route:routes(name)),
       document:documents!pdf_document_id(storage_path)`,
    )
    .eq("id", id)
    .maybeSingle()

  if (voucherError) return safeSupabaseError("voucher-send:load", voucherError)
  if (!voucherRaw) return jsonError("Voucher not found", 404)

  const voucher = voucherRaw as unknown as VoucherSendRow
  const booking = voucher.booking
  if (!booking) return jsonError("Voucher booking missing", 422)

  const customer = firstRecord(booking.customer)
  const route = firstRecord(booking.route)
  const document = firstRecord(voucher.document)

  const readiness = checkVoucherReadiness({
    stage: booking.stage,
    invoiceBalance: booking.invoice_balance,
    departureDate: booking.departure_date,
    customerEmail: customer?.email ?? null,
  })
  if (!readiness.ready) {
    return jsonError("Voucher is not ready to send", 400, { failures: readiness.failures })
  }

  const recipientEmail = customer?.email?.trim()
  if (!recipientEmail) return jsonError("Customer email is missing", 400)

  const storageRef = parseStoragePath(document?.storage_path ?? null)
  if (!storageRef) {
    return jsonError("Voucher PDF is not available — generate it first", 400)
  }

  const { data: pdfDownload, error: pdfError } = await supabase.storage
    .from(storageRef.bucket)
    .download(storageRef.path)

  if (pdfError || !pdfDownload) {
    return jsonError("Voucher PDF could not be retrieved from storage", 500)
  }

  const pdfBuffer = Buffer.from(await pdfDownload.arrayBuffer())
  const filename = `voucher-${booking.booking_number}.pdf`

  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
  const bodyHtml = await renderVoucherEmail({
    customerName,
    bookingNumber: booking.booking_number,
    route: route?.name ?? "",
    departure: formatDisplayDateLong(booking.departure_date),
    consultantName: booking.consultant ?? "",
  })
  const subject = `Travel voucher ${booking.booking_number}`

  const fromAddress = process.env.VOUCHER_EMAIL_FROM?.trim()
    || process.env.OUTBOUND_EMAIL_FROM?.trim()
    || BRAND_FROM_ADDRESS

  const sendResult = await sendEmail({
    from: fromAddress,
    to: recipientEmail,
    subject,
    html: bodyHtml,
    attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
  })

  const nowIso = new Date().toISOString()
  const correspondencePayload: Database["public"]["Tables"]["correspondences"]["Insert"] = {
    booking_id: booking.id,
    channel: "email",
    kind: "voucher",
    subject,
    body_html: bodyHtml,
    status: sendResult.success ? "sent" : "failed",
    sent_at: sendResult.success ? nowIso : null,
    error: sendResult.error ?? null,
    provider_message_id: sendResult.providerMessageId ?? null,
  }

  const { error: correspondenceError } = await supabase
    .from("correspondences")
    .insert(correspondencePayload)

  if (correspondenceError) {
    console.error("voucher-send:correspondence-insert", correspondenceError)
    void logError({ severity: "Warning", source: "voucher-send", message: "Voucher sent but correspondence record failed to insert", details: { voucherId: voucher.id, error: correspondenceError.message } })
  }

  if (!sendResult.success) {
    await writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: user.id,
      entityType: "Booking",
      entityId: booking.id,
      action: "voucher_send_failed",
      meta: { voucher_id: voucher.id, error: sendResult.error ?? "unknown" },
    })
    return jsonError("Voucher email failed to send", 502, { reason: sendResult.error })
  }

  const { error: voucherUpdateError } = await supabase
    .from("vouchers")
    .update({ sent_at: nowIso })
    .eq("id", voucher.id)

  if (voucherUpdateError) return safeSupabaseError("voucher-send:update-voucher", voucherUpdateError)

  if (booking.stage !== "voucher_sent" && booking.stage !== "closed") {
    const { error: bookingUpdateError } = await supabase
      .from("bookings")
      .update({ stage: "voucher_sent", voucher_sent_at: nowIso })
      .eq("id", booking.id)

    if (bookingUpdateError) return safeSupabaseError("voucher-send:update-booking", bookingUpdateError)

    const { error: documentUpdateError } = await supabase
      .from("documents")
      .update({ status: "sent" })
      .eq("booking_id", booking.id)
      .eq("kind", "voucher_pdf")

    if (documentUpdateError) {
      console.error("voucher-send:document-status", documentUpdateError)
      void logError({ severity: "Warning", source: "voucher-send", message: "Voucher sent but document status update failed", details: { voucherId: voucher.id, bookingId: booking.id, error: documentUpdateError.message } })
    }

    if (booking.customer_id) {
      await updateCustomerTravelDates(supabase, booking.customer_id)
    }
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: booking.id,
    action: "voucher_sent",
    meta: {
      voucher_id: voucher.id,
      voucher_number: voucher.voucher_number,
      recipient: recipientEmail,
      provider: sendResult.provider,
    },
  })

  return Response.json({
    voucher: {
      id: voucher.id,
      voucherNumber: voucher.voucher_number,
      sentAt: nowIso,
    },
    email: {
      to: recipientEmail,
      subject,
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId,
    },
  })
}
