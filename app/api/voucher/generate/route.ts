import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { formatDisplayDateLong } from "@/lib/date-format"
import type { VoucherData } from "@/lib/generate-voucher"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import { loadLegReferenceRows, missingLegReferenceLabels } from "@/lib/voucher/leg-references"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { buildSuiteTokens } from "@/lib/templates/suite-description"
import { loadSuiteSelections } from "@/lib/templates/suite-selections"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { renderVoucherPdf } from "@/lib/voucher/render-pdf"
import { getDocumentBrandSettings, getDocumentTextSettings, resolveDocumentBrand } from "@/lib/settings-access"
import { buildSpecialRequestsText } from "@/lib/reservation-details/format-special-requests"
import { resolveConsultant } from "@/lib/consultant/resolve-consultant"
import { VOUCHER_TEMPLATE_DEFAULTS, type VoucherTemplate } from "@/lib/types"
import type { Database, Json } from "@/lib/supabase/types"

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
  assigned_salesperson_id: string | null
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

function buildGuestNames(customer: CustomerRecord | null, travellers: { prefix: string | null; first_name: string; last_name: string }[]): string {
  const travellerNames = travellers
    .map((traveller) => [traveller.prefix, traveller.first_name, traveller.last_name].filter(Boolean).join(" ").trim())
    .filter(Boolean)

  if (travellerNames.length > 0) return travellerNames.join(", ")

  return formatCustomerSalutation(customer)
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
    { data: reservationDetails },
    { data: templateRaw },
    documentText,
    documentBrandSettings,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_number, stage, invoice_balance, consultant, assigned_salesperson_id, departure_date, no_of_suites, no_of_adults, no_of_children, additional_services_details, customer:customers(first_name, last_name, email, phone, title), route:routes(name, supplier:suppliers(name, description))",
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
      .from("booking_reservation_details")
      .select("dietary, medical, occasion, smoking_preference, meal_seating")
      .eq("booking_id", parsed.data.jobId)
      .maybeSingle(),
    supabase
      .from("voucher_template")
      .select("id, logo_url, banner_url, header_text, product_line, accent_colour, section_bg, font_family, section_order, hidden_sections, footer_company, footer_phone, footer_email, guidance_text")
      .limit(1)
      .maybeSingle(),
    getDocumentTextSettings(supabase),
    getDocumentBrandSettings(supabase),
  ])
  const { brand } = resolveDocumentBrand(documentBrandSettings)

  if (bookingError || !bookingRaw) return jsonError("Booking not found", 404)
  if (suitesError) return safeSupabaseError("voucher:suites", suitesError)
  if (travellersError) return safeSupabaseError("voucher:travellers", travellersError)

  const booking = bookingRaw as unknown as BookingVoucherRecord
  const customer = firstRecord(booking.customer)

  let legReferenceRows: Awaited<ReturnType<typeof loadLegReferenceRows>> = []
  try {
    legReferenceRows = await loadLegReferenceRows(supabase, booking.id)
  } catch (error) {
    return safeSupabaseError("voucher:load-leg-references", error)
  }

  const readiness = checkVoucherReadiness({
    stage: booking.stage,
    invoiceBalance: booking.invoice_balance,
    departureDate: booking.departure_date,
    customerEmail: customer?.email ?? null,
    missingLegReferenceLabels: missingLegReferenceLabels(legReferenceRows),
  })
  if (!readiness.ready) {
    return jsonError(readiness.failures[0]?.message ?? "Booking is not ready for voucher generation", 422)
  }

  if (!customer) {
    return jsonError("Customer data is missing from booking", 422)
  }

  const consultant = await resolveConsultant(supabase, {
    consultant: booking.consultant,
    assigned_salesperson_id: booking.assigned_salesperson_id,
  })
  const route = booking.route?.name ?? ""
  const supplierRecord = firstRecord(booking.route?.supplier)
  const supplier = supplierRecord?.name ?? "Service provider"
  const supplierDescription = supplierRecord?.description ?? null
  const suiteType = suites?.map((suite) => suite.suite_type_name).filter(Boolean).join(", ") || "Suite"
  // Names include every traveller, adult and child alike — the adjacent "Number of Guests"
  // row already counts both, and previously filtering to adults-only silently dropped
  // children from the printed guest list while still counting them.
  const allTravellers = travellers ?? []
  const template = normalizeTemplate(templateRaw as VoucherTemplateRow | null)

  let serviceBlocks: Awaited<ReturnType<typeof buildVoucherServiceBlocks>>["blocks"] = []
  try {
    const built = await buildVoucherServiceBlocks(supabase, {
      bookingId: booking.id,
      supplierReferenceFallback: booking.booking_number,
      additionalServicesDetails: booking.additional_services_details ?? null,
    })
    serviceBlocks = built.blocks
  } catch (error) {
    return safeSupabaseError("voucher:build-service-blocks", error)
  }

  const voucherData: VoucherData = {
    voucherNumber: booking.booking_number,
    guestNames: buildGuestNames(customer, allTravellers),
    consultantName: consultant?.name ?? "",
    supplierName: supplier,
    supplierDescription,
    route,
    departure: formatDisplayDateLong(booking.departure_date),
    arrival: "",
    suiteType,
    numberOfGuests: booking.no_of_adults + booking.no_of_children,
    specialRequests: buildSpecialRequestsText(booking.additional_services_details, {
      dietary: reservationDetails?.dietary,
      medical: reservationDetails?.medical,
      occasion: reservationDetails?.occasion,
      smokingPreference: reservationDetails?.smoking_preference as "smoking" | "non_smoking" | null,
      mealSeating: reservationDetails?.meal_seating as "first" | "second" | null,
    }),
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
    consultant: consultant?.key ?? "",
    serviceBlocks,
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderVoucherPdf({
      data: voucherData,
      template,
      docTitle: documentText.voucher_doc_title,
      brand,
    })
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

  const { data: existingVoucher, error: existingVoucherError } = await supabase
    .from("vouchers")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle()

  if (existingVoucherError) return safeSupabaseError("voucher:existing-voucher", existingVoucherError)

  const nowIso = new Date().toISOString()
  const voucherPayload: Database["public"]["Tables"]["vouchers"]["Insert"] = {
    booking_id: booking.id,
    voucher_number: booking.booking_number,
    pdf_document_id: documentWrite.data.id,
    generated_at: nowIso,
    created_by: user.id,
  }

  const voucherWrite = existingVoucher
    ? await supabase
        .from("vouchers")
        .update({
          pdf_document_id: documentWrite.data.id,
          generated_at: nowIso,
          voucher_number: booking.booking_number,
        })
        .eq("id", existingVoucher.id)
        .select("id, sent_at, generated_at")
        .single()
    : await supabase
        .from("vouchers")
        .insert(voucherPayload)
        .select("id, sent_at, generated_at")
        .single()

  if (voucherWrite.error || !voucherWrite.data) {
    return safeSupabaseError("voucher:voucher-write", voucherWrite.error)
  }

  const voucherId = voucherWrite.data.id

  const { error: deleteBlocksError } = await supabase
    .from("voucher_service_blocks")
    .delete()
    .eq("voucher_id", voucherId)

  if (deleteBlocksError) return safeSupabaseError("voucher:clear-service-blocks", deleteBlocksError)

  if (serviceBlocks.length > 0) {
    const blockRows: Database["public"]["Tables"]["voucher_service_blocks"]["Insert"][] = serviceBlocks.map(
      (block) => ({
        voucher_id: voucherId,
        service_type: block.serviceType,
        supplier_id: null,
        title: block.title,
        supplier_reference: block.supplierReference ?? null,
        contact_details: block.contactDetails as unknown as Json,
        service_data: block.serviceData as unknown as Json,
        display_order: block.displayOrder,
      }),
    )

    const { error: insertBlocksError } = await supabase
      .from("voucher_service_blocks")
      .insert(blockRows)

    if (insertBlocksError) return safeSupabaseError("voucher:insert-service-blocks", insertBlocksError)
  }

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: booking.id,
    action: existingVoucher ? "voucher_regenerated" : "voucher_generated",
    meta: {
      voucher_id: voucherId,
      voucher_number: booking.booking_number,
      document_id: documentWrite.data.id,
      service_block_count: serviceBlocks.length,
    },
  })

  const customerName = formatCustomerSalutation(customer)
  const shared = await resolveSharedEmailTokens(supabase, booking.id)
  const composed = await composeEmail(supabase, "voucher_email", {
    tokens: {
      ...shared.tokens,
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      direction: route,
      voucherNumber: booking.booking_number,
      departureDate: voucherData.departure,
      consultantName: consultant?.name ?? "",
      ...buildSuiteTokens(await loadSuiteSelections(supabase, booking.id)),
    },
    blocks: shared.blocks,
    senderProfileId: booking.assigned_salesperson_id ?? user.id,
  })
  if (!composed) return jsonError("Voucher email template could not be resolved", 500)

  return Response.json({
    document: {
      id: documentWrite.data.id,
      jobId: documentWrite.data.booking_id,
      kind: documentWrite.data.kind,
      status: documentWrite.data.status,
      storagePath: documentWrite.data.storage_path,
      generatedAt: documentWrite.data.created_at,
    },
    voucherRecord: {
      id: voucherId,
      voucherNumber: booking.booking_number,
      generatedAt: voucherWrite.data.generated_at,
      sentAt: voucherWrite.data.sent_at,
      serviceBlockCount: serviceBlocks.length,
    },
    voucher: {
      filename,
      contentType: "application/pdf",
      contentBase64: pdfBuffer.toString("base64"),
      dataUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    },
    email: {
      to: customer.email,
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
      bodyContentHtml: composed.bodyContentHtml,
      warnings: composed.warnings,
    },
  })
}
