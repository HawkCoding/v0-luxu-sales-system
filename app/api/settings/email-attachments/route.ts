import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import {
  getAttachmentAllowedMimeTypes,
  getAttachmentMaxSizeMb,
  requireSettingsWrite,
} from "@/lib/settings-access"
import {
  ATTACHMENTS_BUCKET,
  EMAIL_ATTACHMENT_KIND_VALUES,
  EMAIL_ATTACHMENT_SUPPLIER_KINDS,
  LIBRARY_STORAGE_PREFIX,
  type LibraryAttachmentOption,
} from "@/lib/attachments/email-attachment-library"

export const runtime = "nodejs"

const getQuerySchema = z.object({
  bookingId: z.string().uuid().optional(),
  kind: z.string().trim().min(1).max(80).optional(),
})

interface LibraryRow {
  id: string
  name: string
  file_name: string
  supplier_id: string | null
  supplier_kind: string | null
  email_kinds: string[]
  supplier: { name: string } | { name: string }[] | null
}

function supplierNameOf(row: LibraryRow): string | null {
  if (!row.supplier) return null
  return Array.isArray(row.supplier) ? row.supplier[0]?.name ?? null : row.supplier.name
}

export async function GET(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const parsed = getQuerySchema.safeParse({
    bookingId: url.searchParams.get("bookingId") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
  })
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase } = auth.value
  const { bookingId, kind } = parsed.data

  // A booking-scoped request filters supplier-specific files down to the
  // booking's train (via route → supplier); files scoped to a supplier category
  // apply when that supplier is of the same kind; unscoped files always apply.
  let bookingSupplierId: string | null = null
  let bookingSupplierKind: string | null = null
  if (bookingId) {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, route:routes(supplier:suppliers(id, kind))")
      .eq("id", bookingId)
      .maybeSingle()

    if (bookingError) return safeSupabaseError("email-attachments:booking", bookingError)
    if (!booking) return jsonError("Booking not found", 404)

    const route = Array.isArray(booking.route) ? booking.route[0] : booking.route
    const supplier = route
      ? Array.isArray(route.supplier)
        ? route.supplier[0]
        : route.supplier
      : null
    bookingSupplierId = supplier?.id ?? null
    bookingSupplierKind = supplier?.kind ?? null
  }

  const { data: rows, error } = await supabase
    .from("email_attachment_library")
    .select("id, name, file_name, supplier_id, supplier_kind, email_kinds, supplier:suppliers(name)")
    .order("name", { ascending: true })

  if (error) return safeSupabaseError("email-attachments:list", error)

  const attachments: LibraryAttachmentOption[] = ((rows ?? []) as LibraryRow[])
    .filter((row) => {
      if (!bookingId) return true
      // Unscoped files always apply; otherwise match on supplier or category.
      if (row.supplier_id === null && row.supplier_kind === null) return true
      if (row.supplier_id !== null) return row.supplier_id === bookingSupplierId
      return row.supplier_kind === bookingSupplierKind
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      fileName: row.file_name,
      supplierId: row.supplier_id,
      supplierName: supplierNameOf(row),
      supplierKind: row.supplier_kind,
      emailKinds: row.email_kinds ?? [],
      defaultSelected: kind ? (row.email_kinds ?? []).includes(kind) : false,
    }))

  return Response.json({ attachments })
}

function sanitiseFileName(name: string): string {
  const trimmed = name.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "")
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "file"
}

const emailKindsSchema = z.array(z.enum(EMAIL_ATTACHMENT_KIND_VALUES as [string, ...string[]])).max(10)
const supplierKindSchema = z.enum(
  EMAIL_ATTACHMENT_SUPPLIER_KINDS as unknown as [string, ...string[]],
)

export async function POST(req: Request) {
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError("Invalid multipart form data", 400)
  }

  // Not `instanceof File`: the runtime's FormData can hand back a File from a
  // different realm (undici vs global), which fails instanceof.
  const file = formData.get("file")
  if (!file || typeof file === "string") return jsonError("file is required", 400)

  const fileName = file.name?.trim()
  if (!fileName) return jsonError("file name is required", 400)

  const rawName = formData.get("name")
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim().slice(0, 120) : fileName

  const rawSupplierId = formData.get("supplierId")
  const supplierId =
    typeof rawSupplierId === "string" && rawSupplierId.trim() ? rawSupplierId.trim() : null
  if (supplierId && !z.string().uuid().safeParse(supplierId).success) {
    return jsonError("supplierId must be a UUID", 400)
  }

  const rawSupplierKind = formData.get("supplierKind")
  const supplierKind =
    typeof rawSupplierKind === "string" && rawSupplierKind.trim() ? rawSupplierKind.trim() : null
  if (supplierKind && !supplierKindSchema.safeParse(supplierKind).success) {
    return jsonError("supplierKind is not a valid supplier category", 400)
  }
  if (supplierId && supplierKind) {
    return jsonError("A file can be scoped to a supplier or a category, not both", 400)
  }

  let emailKinds: string[] = []
  const rawKinds = formData.get("emailKinds")
  if (typeof rawKinds === "string" && rawKinds.trim()) {
    let parsedKinds: unknown
    try {
      parsedKinds = JSON.parse(rawKinds)
    } catch {
      return jsonError("emailKinds must be a JSON array", 400)
    }
    const kindsResult = emailKindsSchema.safeParse(parsedKinds)
    if (!kindsResult.success) return jsonZodError(kindsResult.error)
    emailKinds = kindsResult.data
  }

  const [maxSizeMb, allowedMimes] = await Promise.all([
    getAttachmentMaxSizeMb(supabase),
    getAttachmentAllowedMimeTypes(supabase),
  ])

  if (file.size > maxSizeMb * 1024 * 1024) {
    return jsonError(`File exceeds maximum allowed size of ${maxSizeMb} MB`, 400)
  }
  if (!allowedMimes.includes(file.type)) {
    return jsonError(
      `Unsupported file type '${file.type}'. Allowed: ${allowedMimes.join(", ")}`,
      400,
      { allowedMimeTypes: allowedMimes },
    )
  }

  const storagePath = `${LIBRARY_STORAGE_PREFIX}/${crypto.randomUUID()}-${sanitiseFileName(fileName)}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return safeSupabaseError("email-attachments:upload", uploadError)

  const { data: inserted, error: insertError } = await supabase
    .from("email_attachment_library")
    .insert({
      name,
      file_name: fileName,
      storage_path: storagePath,
      content_type: file.type,
      file_size: file.size,
      supplier_id: supplierId,
      supplier_kind: supplierKind,
      email_kinds: emailKinds,
    })
    .select("id, name, file_name, supplier_id, supplier_kind, email_kinds")
    .single()

  if (insertError || !inserted) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => undefined)
    return safeSupabaseError("email-attachments:insert", insertError)
  }

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "email-attachments",
    action: "attachment_library_uploaded",
    meta: {
      library_id: inserted.id,
      file_name: fileName,
      file_size: file.size,
      supplier_id: supplierId,
      supplier_kind: supplierKind,
      email_kinds: emailKinds,
    },
  })

  return Response.json({
    id: inserted.id,
    name: inserted.name,
    fileName: inserted.file_name,
    supplierId: inserted.supplier_id,
    supplierKind: inserted.supplier_kind,
    emailKinds: inserted.email_kinds ?? [],
  })
}
