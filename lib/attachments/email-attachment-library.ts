import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export const ATTACHMENTS_BUCKET = "attachments"
export const LIBRARY_STORAGE_PREFIX = "library"

/**
 * Correspondence kinds a library file can be pre-selected for. Values match
 * the `kind` sent to POST /api/correspondence by each send dialog.
 */
export const EMAIL_ATTACHMENT_KINDS = [
  { value: "quote", label: "Quote email" },
  { value: "reservation_received", label: "Reservation acknowledgement" },
  { value: "invoice", label: "Confirmation invoice" },
  { value: "payment_received", label: "Payment confirmation" },
  { value: "payment_reminder", label: "Payment reminder" },
  { value: "voucher", label: "Voucher / final documents" },
  { value: "itinerary", label: "Itinerary" },
] as const

export type EmailAttachmentKind = (typeof EMAIL_ATTACHMENT_KINDS)[number]["value"]

export const EMAIL_ATTACHMENT_KIND_VALUES = EMAIL_ATTACHMENT_KINDS.map(
  (option) => option.value,
) as EmailAttachmentKind[]

/**
 * Supplier categories a library file can be scoped to. Values match the
 * `SupplierKind` enum in lib/types.ts. Mutually exclusive with a specific
 * supplier: a file targets all bookings, one category, or one supplier.
 */
export const EMAIL_ATTACHMENT_SUPPLIER_KINDS = [
  "train_operator",
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "airline",
] as const

export type EmailAttachmentSupplierKind =
  (typeof EMAIL_ATTACHMENT_SUPPLIER_KINDS)[number]

export interface LibraryAttachmentOption {
  id: string
  name: string
  fileName: string
  supplierId: string | null
  supplierName: string | null
  /** Supplier category the file is scoped to, or null. Exclusive with supplierId. */
  supplierKind: string | null
  /** Route the file is pinned to, or null. Only ever set alongside supplierId. */
  routeId: string | null
  routeName: string | null
  emailKinds: string[]
  /** True when the file's email_kinds contains the kind being sent. */
  defaultSelected: boolean
}

export interface LoadedLibraryAttachment {
  filename: string
  contentBase64: string
  contentType: string
}

/**
 * Download the selected library files so they can be attached to an outgoing
 * email. Throws with a user-safe message when a file is missing or cannot be
 * downloaded — callers must not send the email in that case.
 */
export async function loadLibraryAttachments(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<LoadedLibraryAttachment[]> {
  if (ids.length === 0) return []

  const { data: rows, error } = await supabase
    .from("email_attachment_library")
    .select("id, file_name, storage_path, content_type")
    .in("id", ids)

  if (error || !rows || rows.length !== ids.length) {
    throw new Error("Selected attachments could not be found — email not sent")
  }

  const loaded: LoadedLibraryAttachment[] = []
  for (const row of rows) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .download(row.storage_path)

    if (downloadError || !blob) {
      throw new Error(`Attachment "${row.file_name}" could not be loaded — email not sent`)
    }

    const arrayBuffer = await blob.arrayBuffer()
    loaded.push({
      filename: row.file_name,
      contentBase64: Buffer.from(arrayBuffer).toString("base64"),
      contentType: row.content_type,
    })
  }

  return loaded
}
