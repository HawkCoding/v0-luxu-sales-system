import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import {
  findMissingQuotedLegs,
  resolveAcceptedQuoteScope,
  scopeLegIdsFilter,
} from "@/lib/quotes/accepted-quote-scope"
import { loadLegReferenceRows, missingLegReferenceLabels } from "@/lib/voucher/leg-references"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { buildSuiteTokens } from "@/lib/templates/suite-description"
import { loadSuiteSelections } from "@/lib/templates/suite-selections"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import { ensureItineraryPdf } from "@/lib/itinerary/ensure-itinerary-pdf"
import { clientInvoiceNumber } from "@/lib/invoices/invoice-status"

export const runtime = "nodejs"

// TODO(itinerary): Itinerary PDF attachment disabled 2026-08-24 per business decision —
// vouchers should go out without it for now. Generation code (lib/itinerary/*) is untouched
// and fully working. To re-enable: flip ITINERARY_ATTACHMENT_ENABLED back to true.
const ITINERARY_ATTACHMENT_ENABLED = false

interface RouteParams {
  params: Promise<{ id: string }>
}

type CustomerJoin = {
  first_name: string | null
  last_name: string | null
  email: string | null
}

type RouteJoin = {
  name: string | null
  direction_mode: string | null
  origin: { name: string | null } | { name: string | null }[] | null
  destination: { name: string | null } | { name: string | null }[] | null
}

type VoucherRow = {
  id: string
  voucher_number: string
  booking_id: string
  booking: {
    id: string
    booking_number: string
    customer_invoice_number: string | null
    stage: string | null
    invoice_balance: number | null
    departure_date: string | null
    consultant: string | null
    route_reversed: boolean | null
    assigned_salesperson_id: string | null
    customer: CustomerJoin | CustomerJoin[] | null
    route: RouteJoin | RouteJoin[] | null
  } | null
  document: { storage_path: string | null } | { storage_path: string | null }[] | null
}

function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Documents (unlike the supplier admin) always show the actual booked travel direction with
 * a one-way arrow, never the two-way `↔` glyph — see lib/routes/route-name.ts.
 */
function resolveBookingRouteName(route: RouteJoin | null, routeReversed: boolean | null): string | null {
  if (!route) return null
  const origin = firstRecord(route.origin)?.name
  const destination = firstRecord(route.destination)?.name
  if (route.direction_mode !== "round_trip" || !origin || !destination) return route.name
  return resolveDirectedRouteName(origin, destination, routeReversed ?? false)
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
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

  const { supabase, user } = auth.value

  const { data: voucherRaw, error: voucherError } = await supabase
    .from("vouchers")
    .select(
      `id, voucher_number, booking_id,
       booking:bookings(id, booking_number, customer_invoice_number, stage, invoice_balance, departure_date, consultant, route_reversed, assigned_salesperson_id,
         customer:customers(title, first_name, last_name, email),
         route:routes(name, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name))),
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

  // Same scoping rule the generate route applies: only services on the accepted quote count,
  // so the send gate cannot demand a reference for something the customer did not buy.
  let legReferenceRows: Awaited<ReturnType<typeof loadLegReferenceRows>> = []
  let missingQuotedLegLabels: string[] = []
  try {
    const quoteScope = await resolveAcceptedQuoteScope(supabase, booking.id)
    missingQuotedLegLabels = await findMissingQuotedLegs(supabase, booking.id, quoteScope)
    legReferenceRows = await loadLegReferenceRows(supabase, booking.id, {
      legIds: scopeLegIdsFilter(quoteScope),
    })
  } catch (error) {
    return safeSupabaseError("voucher-prepare-send:load-leg-references", error)
  }

  const readiness = checkVoucherReadiness({
    stage: booking.stage,
    invoiceBalance: booking.invoice_balance,
    departureDate: booking.departure_date,
    customerEmail: customer?.email ?? null,
    missingLegReferenceLabels: missingLegReferenceLabels(legReferenceRows),
    missingQuotedLegLabels,
  })
  if (!readiness.ready) {
    return jsonError("Voucher is not ready to send", 400, { failures: readiness.failures })
  }

  const voucherRef = parseStoragePath(voucherDocument?.storage_path ?? null)
  if (!voucherRef) {
    return jsonError("Voucher PDF is not available — generate it first", 400)
  }

  // Latest itinerary PDF for the booking — attached alongside the voucher when
  // ITINERARY_ATTACHMENT_ENABLED is on. Built silently here if it doesn't exist
  // yet; there's no customer-facing itinerary step anymore.
  let itineraryBlob: Blob | null = null

  if (ITINERARY_ATTACHMENT_ENABLED) {
    const { data: itineraryDoc, error: itineraryError } = await supabase
      .from("documents")
      .select("id, storage_path, created_at")
      .eq("booking_id", booking.id)
      .eq("kind", "itinerary_pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (itineraryError) return safeSupabaseError("voucher-prepare-send:itinerary", itineraryError)

    let itineraryRef = parseStoragePath(itineraryDoc?.storage_path ?? null)
    if (!itineraryRef) {
      try {
        const ensured = await ensureItineraryPdf(supabase, { bookingId: booking.id })
        itineraryRef = parseStoragePath(ensured.storagePath)
      } catch (error) {
        console.error("voucher-prepare-send:ensure-itinerary", error)
        return jsonError("Itinerary PDF could not be generated — voucher not sent", 500)
      }
    }
    if (!itineraryRef) {
      return jsonError("Itinerary PDF could not be generated — voucher not sent", 500)
    }

    const itineraryDownload = await supabase.storage.from(itineraryRef.bucket).download(itineraryRef.path)
    if (itineraryDownload.error || !itineraryDownload.data) {
      return jsonError("Itinerary PDF could not be retrieved from storage", 500)
    }
    itineraryBlob = itineraryDownload.data
  }

  const voucherDownload = await supabase.storage.from(voucherRef.bucket).download(voucherRef.path)
  if (voucherDownload.error || !voucherDownload.data) {
    return jsonError("Voucher PDF could not be retrieved from storage", 500)
  }

  const customerName = formatCustomerSalutation(customer)
  const suiteTokens = buildSuiteTokens(await loadSuiteSelections(supabase, booking.id))
  const shared = await resolveSharedEmailTokens(supabase, booking.id)
  const composed = await composeEmail(supabase, "voucher_email", {
    tokens: {
      ...shared.tokens,
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      direction: resolveBookingRouteName(route, booking.route_reversed) ?? "your journey",
      voucherNumber: voucher.voucher_number,
      departureDate: formatDisplayDateLong(booking.departure_date),
      consultantName: booking.consultant ?? "",
      ...suiteTokens,
    },
    blocks: shared.blocks,
    senderProfileId: booking.assigned_salesperson_id ?? user.id,
  })

  if (!composed) return jsonError("Voucher email template could not be resolved", 500)

  const voucherBase64 = Buffer.from(await voucherDownload.data.arrayBuffer()).toString("base64")
  const itineraryBase64 = itineraryBlob
    ? Buffer.from(await itineraryBlob.arrayBuffer()).toString("base64")
    : null

  const filenameNumber = sanitizeFilenamePart(clientInvoiceNumber(booking))

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
      signatureProfileId: composed.signatureProfileId,
      signatureBrandId: composed.signatureBrandId,
    },
    attachments: [
      {
        filename: `voucher-${filenameNumber}.pdf`,
        contentBase64: voucherBase64,
        contentType: "application/pdf",
      },
      ...(itineraryBase64
        ? [
            {
              filename: `itinerary-${filenameNumber}.pdf`,
              contentBase64: itineraryBase64,
              contentType: "application/pdf",
            },
          ]
        : []),
    ],
  })
}
