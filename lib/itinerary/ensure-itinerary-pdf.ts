import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildItineraryData } from "@/lib/itinerary/build-itinerary"
import { renderItineraryPdf } from "@/lib/itinerary/render-pdf"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { getDocumentBrandSettings, getDocumentTextSettings, resolveDocumentBrand } from "@/lib/settings-access"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import { buildDefaultTripTitle } from "@/lib/itinerary/default-trip-title"
import { resolveConsultant } from "@/lib/consultant/resolve-consultant"
import { VOUCHER_TEMPLATE_DEFAULTS, type VoucherTemplate } from "@/lib/types"
import { firstRecord } from "@/lib/utils"

export const ITINERARY_BUCKET = "vouchers"

type CustomerRecord = {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
}

type RouteRecord = {
  name: string | null
  direction_mode: string | null
  origin: { name: string | null } | { name: string | null }[] | null
  destination: { name: string | null } | { name: string | null }[] | null
}

type BookingRecord = {
  id: string
  booking_number: string
  consultant: string | null
  assigned_salesperson_id: string | null
  departure_date: string | null
  no_of_adults: number
  no_of_children: number
  route_reversed: boolean | null
  customer: CustomerRecord | CustomerRecord[] | null
  route: RouteRecord | RouteRecord[] | null
}

type VoucherTemplateRow = VoucherTemplate & { id?: string }

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "itinerary"
}

function buildGuestNames(
  customer: CustomerRecord | null,
  noOfAdults: number,
  noOfChildren: number,
): string {
  const name = formatCustomerSalutation(customer)
  if (!name) return "Guests"
  const parts = [name]
  if (noOfAdults > 0) parts.push(`${noOfAdults} adult${noOfAdults === 1 ? "" : "s"}`)
  if (noOfChildren > 0) parts.push(`${noOfChildren} child${noOfChildren === 1 ? "" : "ren"}`)
  return parts.join(" — ")
}

function normalizeTemplate(t: VoucherTemplateRow | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...t }
}

function resolveRouteName(route: RouteRecord | null, routeReversed: boolean | null): string | null {
  if (!route) return null
  const origin = firstRecord(route.origin)?.name
  const destination = firstRecord(route.destination)?.name
  if (route.direction_mode !== "round_trip" || !origin || !destination) return route.name
  return resolveDirectedRouteName(origin, destination, routeReversed ?? false)
}

export interface EnsuredItineraryPdf {
  documentId: string
  bookingId: string
  itineraryId: string
  /** documents.storage_path, prefixed with the bucket. */
  storagePath: string
  regenerated: boolean
}

/**
 * Guarantee a stored itinerary PDF exists for a booking. Trip title/notes are
 * auto-derived (or reused from an existing itineraries row) — there is no
 * customer-facing generate step anymore, this only runs silently from behind
 * the voucher-send flow so a voucher email never goes out without its
 * itinerary attachment. Throws on load/render/storage failures.
 */
export async function ensureItineraryPdf(
  supabase: SupabaseClient<Database>,
  { bookingId, force = false }: { bookingId: string; force?: boolean },
): Promise<EnsuredItineraryPdf> {
  if (!force) {
    const { data: existingDocument } = await supabase
      .from("documents")
      .select("id, booking_id, storage_path")
      .eq("booking_id", bookingId)
      .eq("kind", "itinerary_pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingDocument?.storage_path) {
      const { data: itineraryRow } = await supabase
        .from("itineraries")
        .select("id")
        .eq("booking_id", bookingId)
        .maybeSingle()

      if (itineraryRow) {
        return {
          documentId: existingDocument.id,
          bookingId: existingDocument.booking_id,
          itineraryId: itineraryRow.id,
          storagePath: existingDocument.storage_path,
          regenerated: false,
        }
      }
    }
  }

  const [
    { data: bookingRaw, error: bookingError },
    { data: templateRaw },
    { data: existingItinerary },
    documentText,
    documentBrandSettings,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_number, consultant, assigned_salesperson_id, departure_date, no_of_adults, no_of_children, route_reversed,
         customer:customers(first_name, last_name, email, phone, title),
         route:routes(name, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name))`,
      )
      .eq("id", bookingId)
      .single(),
    supabase
      .from("voucher_template")
      .select("id, logo_url, banner_url, header_text, product_line, accent_colour, section_bg, font_family, section_order, hidden_sections, footer_company, footer_phone, footer_email, guidance_text")
      .limit(1)
      .maybeSingle(),
    supabase.from("itineraries").select("id, name, notes").eq("booking_id", bookingId).maybeSingle(),
    getDocumentTextSettings(supabase),
    getDocumentBrandSettings(supabase),
  ])
  const { brand } = resolveDocumentBrand(documentBrandSettings)

  if (bookingError || !bookingRaw) throw new Error("Booking not found")

  const booking = bookingRaw as unknown as BookingRecord
  const customer = firstRecord(booking.customer)
  const route = firstRecord(booking.route)

  const consultant = await resolveConsultant(supabase, {
    consultant: booking.consultant,
    assigned_salesperson_id: booking.assigned_salesperson_id,
  })
  const guestNames = buildGuestNames(customer, booking.no_of_adults, booking.no_of_children)
  const departure = formatDisplayDateLong(booking.departure_date)
  const template = normalizeTemplate(templateRaw as VoucherTemplateRow | null)

  const routeName = resolveRouteName(route, booking.route_reversed)
  const tripTitle =
    existingItinerary?.name || buildDefaultTripTitle(routeName, customer?.last_name ?? null) || "Your Journey"
  const tripNotes = existingItinerary?.notes ?? ""

  const itineraryData = await buildItineraryData(supabase, {
    bookingId: booking.id,
    bookingNumber: booking.booking_number,
    tripTitle,
    tripNotes,
    guestNames,
    departure,
    consultantName: consultant?.name ?? "",
  })

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderItineraryPdf({
      data: itineraryData,
      template,
      journeyHeading: documentText.itinerary_doc_journey_heading,
      introText: documentText.itinerary_doc_intro_text,
      brand,
    })
  } catch (error) {
    console.error("itinerary:render-pdf", error)
    throw new Error("Itinerary PDF could not be rendered")
  }

  const filename = `itinerary-${sanitizePathPart(booking.booking_number)}.pdf`
  const objectPath = `${sanitizePathPart(booking.booking_number)}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(ITINERARY_BUCKET)
    .upload(objectPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) throw new Error("Itinerary PDF could not be stored")

  const itineraryWrite = existingItinerary
    ? await supabase
        .from("itineraries")
        .update({ name: tripTitle, notes: tripNotes, updated_at: new Date().toISOString() })
        .eq("id", existingItinerary.id)
        .select("id")
        .single()
    : await supabase
        .from("itineraries")
        .insert({ booking_id: bookingId, name: tripTitle, notes: tripNotes })
        .select("id")
        .single()

  if (itineraryWrite.error || !itineraryWrite.data) {
    await supabase.storage.from(ITINERARY_BUCKET).remove([objectPath]).catch(() => undefined)
    throw new Error("Itinerary could not be stored")
  }

  const { data: existingDocumentRow } = await supabase
    .from("documents")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", "itinerary_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const documentPath = `${ITINERARY_BUCKET}/${objectPath}`
  const documentPayload = {
    booking_id: bookingId,
    kind: "itinerary_pdf" as const,
    status: "generated" as const,
    storage_path: documentPath,
  }

  const documentWrite = existingDocumentRow
    ? await supabase
        .from("documents")
        .update(documentPayload)
        .eq("id", existingDocumentRow.id)
        .select("id, booking_id, storage_path, created_at")
        .single()
    : await supabase
        .from("documents")
        .insert(documentPayload)
        .select("id, booking_id, storage_path, created_at")
        .single()

  if (documentWrite.error || !documentWrite.data) {
    await supabase.storage.from(ITINERARY_BUCKET).remove([objectPath]).catch(() => undefined)
    throw new Error("Itinerary PDF document record could not be written")
  }

  return {
    documentId: documentWrite.data.id,
    bookingId: documentWrite.data.booking_id,
    itineraryId: itineraryWrite.data.id,
    storagePath: documentPath,
    regenerated: true,
  }
}
