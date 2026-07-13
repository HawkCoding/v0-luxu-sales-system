import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong } from "@/lib/date-format"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import { composeEmail } from "@/lib/templates/compose-email"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

type CustomerJoin = {
  first_name: string | null
  last_name: string | null
  email: string | null
}

type VoucherRow = {
  id: string
  voucher_number: string
  booking_id: string
  booking: {
    id: string
    booking_number: string
    stage: string | null
    invoice_balance: number | null
    departure_date: string | null
    consultant: string | null
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

/**
 * Prepare the voucher email: one email carrying BOTH the voucher PDF and the
 * latest itinerary PDF, composed from the voucher_email template. The client
 * shows an editable preview and sends via /api/correspondence with
 * kind=voucher + moveStage=voucher_sent + voucherId, so the stage change goes
 * through the applyTransition choke point.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return jsonError("Invalid voucher id", 400)
  }

  const { supabase } = auth.value

  const { data: voucherRaw, error: voucherError } = await supabase
    .from("vouchers")
    .select(
      `id, voucher_number, booking_id,
       booking:bookings(id, booking_number, stage, invoice_balance, departure_date, consultant,
         customer:customers(first_name, last_name, email),
         route:routes(name)),
       document:documents!pdf_document_id(storage_path)`,
    )
    .eq("id", id)
    .maybeSingle()

  if (voucherError) return safeSupabaseError("voucher-prepare-send:load", voucherError)
  if (!voucherRaw) return jsonError("Voucher not found", 404)

  const voucher = voucherRaw as unknown as VoucherRow
  const booking = voucher.booking
  if (!booking) return jsonError("Voucher booking missing", 422)

  const customer = firstRecord(booking.customer)
  const route = firstRecord(booking.route)
  const voucherDocument = firstRecord(voucher.document)

  const readiness = checkVoucherReadiness({
    stage: booking.stage,
    invoiceBalance: booking.invoice_balance,
    departureDate: booking.departure_date,
    customerEmail: customer?.email ?? null,
  })
  if (!readiness.ready) {
    return jsonError("Voucher is not ready to send", 400, { failures: readiness.failures })
  }

  const voucherRef = parseStoragePath(voucherDocument?.storage_path ?? null)
  if (!voucherRef) {
    return jsonError("Voucher PDF is not available — generate it first", 400)
  }

  // Latest itinerary PDF for the booking — required so the customer receives
  // voucher + itinerary in one email.
  const { data: itineraryDoc, error: itineraryError } = await supabase
    .from("documents")
    .select("id, storage_path, created_at")
    .eq("booking_id", booking.id)
    .eq("kind", "itinerary_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (itineraryError) return safeSupabaseError("voucher-prepare-send:itinerary", itineraryError)

  const itineraryRef = parseStoragePath(itineraryDoc?.storage_path ?? null)
  if (!itineraryRef) {
    return jsonError("Generate the itinerary before sending the voucher", 422, {
      missingItinerary: true,
    })
  }

  const [voucherDownload, itineraryDownload] = await Promise.all([
    supabase.storage.from(voucherRef.bucket).download(voucherRef.path),
    supabase.storage.from(itineraryRef.bucket).download(itineraryRef.path),
  ])

  if (voucherDownload.error || !voucherDownload.data) {
    return jsonError("Voucher PDF could not be retrieved from storage", 500)
  }
  if (itineraryDownload.error || !itineraryDownload.data) {
    return jsonError("Itinerary PDF could not be retrieved from storage", 500)
  }

  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
  const composed = await composeEmail(supabase, "voucher_email", {
    tokens: {
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      direction: route?.name ?? "your journey",
      voucherNumber: voucher.voucher_number,
      departureDate: formatDisplayDateLong(booking.departure_date),
      consultantName: booking.consultant ?? "",
    },
  })

  if (!composed) return jsonError("Voucher email template could not be resolved", 500)

  const voucherBase64 = Buffer.from(await voucherDownload.data.arrayBuffer()).toString("base64")
  const itineraryBase64 = Buffer.from(await itineraryDownload.data.arrayBuffer()).toString("base64")

  return Response.json({
    voucher: {
      id: voucher.id,
      voucherNumber: voucher.voucher_number,
      jobId: booking.id,
    },
    email: {
      to: customer?.email ?? "",
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
      bodyContentHtml: composed.bodyContentHtml,
      warnings: composed.warnings,
    },
    attachments: [
      {
        filename: `voucher-${booking.booking_number}.pdf`,
        contentBase64: voucherBase64,
        contentType: "application/pdf",
      },
      {
        filename: `itinerary-${booking.booking_number}.pdf`,
        contentBase64: itineraryBase64,
        contentType: "application/pdf",
      },
    ],
  })
}
