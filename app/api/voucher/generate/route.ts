import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong } from "@/lib/date-format"
import type { VoucherData } from "@/lib/generate-voucher"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import { renderVoucherEmail } from "@/lib/voucher/render-voucher-email"
import { renderVoucherPdf } from "@/lib/voucher/render-pdf"
import { CONSULTANTS, VOUCHER_TEMPLATE_DEFAULTS, type ConsultantAbbreviation, type VoucherTemplate } from "@/lib/types"

export const runtime = "nodejs"

const VOUCHER_BUCKET = "vouchers"

const generateVoucherSchema = z.object({
  jobId: z.string().uuid(),
})

type CustomerRecord = {
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  title: string | null
}

type SupplierRecord = {
  name: string | null
  description: string | null
}

type BookingVoucherRecord = {
  id: string
  booking_number: string
  stage: string | null
  invoice_balance: number | null
  consultant: string | null
  departure_date: string | null
  no_of_suites: number
  no_of_adults: number
  no_of_children: number
  additional_services_details: string | null
  customer: CustomerRecord | CustomerRecord[] | null
  route: { name: string | null; supplier: SupplierRecord | SupplierRecord[] | null } | null
}

type VoucherTemplateRow = VoucherTemplate & { id?: string }

function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "voucher"
}

function resolveConsultant(value: string | null): { key: ConsultantAbbreviation; name: string } {
  const consultant = CONSULTANTS.find((item) => item.key === value)
  return consultant ?? { key: "LB", name: "Leonie" }
}

function buildGuestNames(customer: CustomerRecord | null, travellers: { prefix: string | null; first_name: string; last_name: string }[]): string {
  const travellerNames = travellers
    .map((traveller) => [traveller.prefix, traveller.first_name, traveller.last_name].filter(Boolean).join(" ").trim())
    .filter(Boolean)

  if (travellerNames.length > 0) return travellerNames.join(", ")

  return [customer?.title, customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
}

function normalizeTemplate(template: VoucherTemplateRow | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...template }
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

  const parsed = generateVoucherSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user } = auth.value

  const [
    { data: bookingRaw, error: bookingError },
    { data: suites, error: suitesError },
    { data: travellers, error: travellersError },
    { data: templateRaw },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_number, stage, invoice_balance, consultant, departure_date, no_of_suites, no_of_adults, no_of_children, additional_services_details, customer:customers(first_name, last_name, email, phone, title), route:routes(name, supplier:suppliers(name, description))",
      )
      .eq("id", parsed.data.jobId)
      .single(),
    supabase
      .from("booking_suites")
      .select("suite_type_name")
      .eq("booking_id", parsed.data.jobId)
      .order("suite_number"),
    supabase
      .from("travellers")
      .select("prefix, first_name, last_name, is_child, sort_order")
      .eq("booking_id", parsed.data.jobId)
      .order("sort_order"),
    supabase
      .from("voucher_template")
      .select("id, logo_url, banner_url, header_text, product_line, accent_colour, section_bg, font_family, section_order, hidden_sections, footer_company, footer_phone, footer_email, guidance_text")
      .limit(1)
      .maybeSingle(),
  ])

  if (bookingError || !bookingRaw) return jsonError("Booking not found", 404)
  if (suitesError) return safeSupabaseError("voucher:suites", suitesError)
  if (travellersError) return safeSupabaseError("voucher:travellers", travellersError)

  const booking = bookingRaw as unknown as BookingVoucherRecord
  const customer = firstRecord(booking.customer)

  const readiness = checkVoucherReadiness({
    stage: booking.stage,
    invoiceBalance: booking.invoice_balance,
    departureDate: booking.departure_date,
    customerEmail: customer?.email ?? null,
  })
  if (!readiness.ready) {
    return jsonError(readiness.failures[0]?.message ?? "Booking is not ready for voucher generation", 422)
  }

  if (!customer) {
    return jsonError("Customer data is missing from booking", 422)
  }

  const consultant = resolveConsultant(booking.consultant)
  const route = booking.route?.name ?? ""
  const supplierRecord = firstRecord(booking.route?.supplier)
  const supplier = supplierRecord?.name ?? "Service provider"
  const supplierDescription = supplierRecord?.description ?? null
  const suiteType = suites?.map((suite) => suite.suite_type_name).filter(Boolean).join(", ") || "Suite"
  const adultTravellers = (travellers ?? []).filter((traveller) => !traveller.is_child)
  const template = normalizeTemplate(templateRaw as VoucherTemplateRow | null)

  const voucherData: VoucherData = {
    voucherNumber: booking.booking_number,
    guestNames: buildGuestNames(customer, adultTravellers),
    consultantName: consultant.name,
    supplierName: supplier,
    supplierDescription,
    route,
    departure: formatDisplayDateLong(booking.departure_date),
    arrival: "",
    suiteType,
    numberOfGuests: booking.no_of_adults + booking.no_of_children,
    specialRequests: booking.additional_services_details ?? "",
    customerEmail: customer.email,
    customerPhone: customer.phone ?? "",
    enquiry: {
      id: booking.id,
      jobId: booking.id,
      source: "email",
      purpose: "reservation",
      title: customer.title ?? "",
      name: customer.first_name ?? "",
      surname: customer.last_name ?? "",
      contactNumber: customer.phone ?? "",
      email: customer.email,
      country: "",
      direction: route,
      departureDate: booking.departure_date ?? "",
      noOfSuites: booking.no_of_suites,
      noOfAdults: booking.no_of_adults,
      noOfChildren: booking.no_of_children,
      suiteTypes: suiteType ? [suiteType] : [],
      termsAccepted: true,
      createdAt: new Date().toISOString(),
    },
    consultant: consultant.key,
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderVoucherPdf({ data: voucherData, template })
  } catch (error) {
    console.error("voucher:render-pdf", error)
    return jsonError("Voucher PDF could not be rendered", 500)
  }

  const filename = `voucher-${sanitizePathPart(booking.booking_number)}.pdf`
  const storagePath = `${sanitizePathPart(booking.booking_number)}/${filename}`
  const { error: uploadError } = await supabase.storage
    .from(VOUCHER_BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) return safeSupabaseError("voucher:storage-upload", uploadError)

  const { data: existingDocument, error: existingDocumentError } = await supabase
    .from("documents")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("kind", "voucher_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingDocumentError) return safeSupabaseError("voucher:document-existing", existingDocumentError)

  const documentPayload = {
    booking_id: booking.id,
    kind: "voucher_pdf" as const,
    status: "generated" as const,
    storage_path: `${VOUCHER_BUCKET}/${storagePath}`,
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
    return safeSupabaseError("voucher:document-write", documentWrite.error)
  }

  await supabase.from("audit_logs").insert({
    actor: auth.value.profile.actorName,
    actor_user_id: user.id,
    entity_type: "Booking",
    entity_id: booking.id,
    action: existingDocument ? "voucher_pdf_regenerated" : "voucher_pdf_generated",
    meta_json: { document_id: documentWrite.data.id, storage_path: documentPayload.storage_path },
  })

  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()
  const bodyHtml = await renderVoucherEmail({
    customerName,
    bookingNumber: booking.booking_number,
    route,
    departure: voucherData.departure,
    consultantName: consultant.name,
  })

  return Response.json({
    document: {
      id: documentWrite.data.id,
      jobId: documentWrite.data.booking_id,
      kind: documentWrite.data.kind,
      status: documentWrite.data.status,
      storagePath: documentWrite.data.storage_path,
      generatedAt: documentWrite.data.created_at,
    },
    voucher: {
      filename,
      contentType: "application/pdf",
      contentBase64: pdfBuffer.toString("base64"),
      dataUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    },
    email: {
      to: customer.email,
      subject: `Travel voucher ${booking.booking_number}`,
      bodyHtml,
    },
  })
}
