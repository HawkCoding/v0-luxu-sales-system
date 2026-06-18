import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { formatDisplayDateLong } from "@/lib/date-format"
import { buildItineraryData } from "@/lib/itinerary/build-itinerary"
import { checkItineraryReadiness } from "@/lib/itinerary/check-readiness"
import { renderItineraryPdf } from "@/lib/itinerary/render-pdf"
import { renderItineraryEmail } from "@/lib/itinerary/render-itinerary-email"
import { CONSULTANTS, VOUCHER_TEMPLATE_DEFAULTS, type ConsultantAbbreviation, type VoucherTemplate } from "@/lib/types"

export const runtime = "nodejs"

const ITINERARY_BUCKET = "vouchers"

const generateItinerarySchema = z.object({
  jobId: z.string().uuid(),
  tripTitle: z.string().trim().min(1, "Trip title is required"),
  tripNotes: z.string().trim().optional().default(""),
})

type CustomerRecord = {
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  title: string | null
}

type BookingRecord = {
  id: string
  booking_number: string
  stage: string | null
  consultant: string | null
  assigned_salesperson_id: string | null
  owner_user_id: string | null
  departure_date: string | null
  no_of_adults: number
  no_of_children: number
  customer: CustomerRecord | CustomerRecord[] | null
}

type VoucherTemplateRow = VoucherTemplate & { id?: string }

function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "itinerary"
}

function resolveConsultant(value: string | null): { key: ConsultantAbbreviation; name: string } {
  return CONSULTANTS.find((c) => c.key === value) ?? { key: "LB", name: "Leonie" }
}

function buildGuestNames(
  customer: CustomerRecord | null,
  noOfAdults: number,
  noOfChildren: number,
): string {
  const name = [customer?.title, customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  if (!name) return "Guests"
  const parts = [name]
  if (noOfAdults > 0) parts.push(`${noOfAdults} adult${noOfAdults === 1 ? "" : "s"}`)
  if (noOfChildren > 0) parts.push(`${noOfChildren} child${noOfChildren === 1 ? "" : "ren"}`)
  return parts.join(" — ")
}

function normalizeTemplate(t: VoucherTemplateRow | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...t }
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

  const parsed = generateItinerarySchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user } = auth.value
  const { jobId, tripTitle, tripNotes } = parsed.data

  const [
    { data: bookingRaw, error: bookingError },
    { data: templateRaw },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_number, stage, consultant, assigned_salesperson_id, owner_user_id, departure_date, no_of_adults, no_of_children, customer:customers(first_name, last_name, email, phone, title)",
      )
      .eq("id", jobId)
      .single(),
    supabase
      .from("voucher_template")
      .select("id, logo_url, banner_url, header_text, product_line, accent_colour, section_bg, font_family, section_order, hidden_sections, footer_company, footer_phone, footer_email, guidance_text")
      .limit(1)
      .maybeSingle(),
  ])

  if (bookingError || !bookingRaw) return jsonError("Booking not found", 404)

  const booking = bookingRaw as unknown as BookingRecord
  const customer = firstRecord(booking.customer)

  const actorRole = auth.value.profile.clearanceLevel
  if (actorRole === "consultant") {
    const isOwner =
      booking.assigned_salesperson_id === user.id ||
      booking.owner_user_id === user.id
    if (!isOwner) {
      return jsonError("You do not have access to this booking", 403)
    }
  }

  const readiness = checkItineraryReadiness({
    stage: booking.stage,
    customerEmail: customer?.email ?? null,
  })
  if (!readiness.ready) {
    return jsonError(readiness.message ?? "Booking is not ready for itinerary generation", 422)
  }

  if (!customer) return jsonError("Customer data is missing from booking", 422)

  const consultant = resolveConsultant(booking.consultant)
  const guestNames = buildGuestNames(customer, booking.no_of_adults, booking.no_of_children)
  const departure = formatDisplayDateLong(booking.departure_date)
  const template = normalizeTemplate(templateRaw as VoucherTemplateRow | null)

  let itineraryData: Awaited<ReturnType<typeof buildItineraryData>>
  try {
    itineraryData = await buildItineraryData(supabase, {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      tripTitle,
      tripNotes,
      guestNames,
      departure,
      consultantName: consultant.name,
    })
  } catch (error) {
    return safeSupabaseError("itinerary:build-data", error)
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderItineraryPdf({ data: itineraryData, template })
  } catch (error) {
    console.error("itinerary:render-pdf", error)
    return jsonError("Itinerary PDF could not be rendered", 500)
  }

  const filename = `itinerary-${sanitizePathPart(booking.booking_number)}.pdf`
  const storagePath = `${sanitizePathPart(booking.booking_number)}/${filename}`

  // DB writes first — storage upload happens after so a DB failure never orphans a file.

  // Upsert the itineraries row for this booking (title + notes stored here)
  const { data: existingItinerary } = await supabase
    .from("itineraries")
    .select("id")
    .eq("booking_id", jobId)
    .maybeSingle()

  const itineraryWrite = existingItinerary
    ? await supabase
        .from("itineraries")
        .update({ name: tripTitle, notes: tripNotes, updated_at: new Date().toISOString() })
        .eq("id", existingItinerary.id)
        .select("id")
        .single()
    : await supabase
        .from("itineraries")
        .insert({ booking_id: jobId, name: tripTitle, notes: tripNotes })
        .select("id")
        .single()

  if (itineraryWrite.error || !itineraryWrite.data) {
    return safeSupabaseError("itinerary:upsert-itinerary", itineraryWrite.error)
  }

  // Upsert document record
  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("booking_id", jobId)
    .eq("kind", "itinerary_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const documentPayload = {
    booking_id: jobId,
    kind: "itinerary_pdf" as const,
    status: "generated" as const,
    storage_path: `${ITINERARY_BUCKET}/${storagePath}`,
  }

  const documentWrite = existingDocument
    ? await supabase
        .from("documents")
        .update(documentPayload)
        .eq("id", existingDocument.id)
        .select("id, booking_id, kind, status, storage_path, created_at")
        .single()
    : await supabase
        .from("documents")
        .insert(documentPayload)
        .select("id, booking_id, kind, status, storage_path, created_at")
        .single()

  if (documentWrite.error || !documentWrite.data) {
    return safeSupabaseError("itinerary:document-write", documentWrite.error)
  }

  const { error: uploadError } = await supabase.storage
    .from(ITINERARY_BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) return safeSupabaseError("itinerary:storage-upload", uploadError)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: jobId,
    action: existingDocument ? "itinerary_regenerated" : "itinerary_generated",
    meta: {
      document_id: documentWrite.data.id,
      trip_title: tripTitle,
    },
  })

  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()
  const bodyHtml = await renderItineraryEmail({
    customerName,
    bookingNumber: booking.booking_number,
    tripTitle,
    departure,
    consultantName: consultant.name,
  })

  const pdfBase64 = pdfBuffer.toString("base64")

  return Response.json({
    document: {
      id: documentWrite.data.id,
      jobId: documentWrite.data.booking_id,
      kind: documentWrite.data.kind,
      status: documentWrite.data.status,
      storagePath: documentWrite.data.storage_path,
      generatedAt: documentWrite.data.created_at,
    },
    itinerary: {
      id: itineraryWrite.data.id,
      tripTitle,
    },
    file: {
      filename,
      contentType: "application/pdf",
      contentBase64: pdfBase64,
      dataUrl: `data:application/pdf;base64,${pdfBase64}`,
    },
    email: {
      to: customer.email,
      subject: `Your travel itinerary — ${tripTitle || booking.booking_number}`,
      bodyHtml,
    },
  })
}
