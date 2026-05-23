import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { writeAuditLog } from "@/lib/audit-write"

export interface UpdateSupplierReferenceInput {
  bookingId: string
  value: string | null
  actor: string
  actorUserId: string | null
}

export type UpdateSupplierReferenceResult =
  | { ok: true; before: string | null; after: string | null }
  | { ok: false; error: string; notFound?: boolean }

export async function updateSupplierReference(
  supabase: SupabaseClient<Database>,
  input: UpdateSupplierReferenceInput,
): Promise<UpdateSupplierReferenceResult> {
  const { bookingId, value, actor, actorUserId } = input
  const normalised = value === null ? null : value.trim().length === 0 ? null : value.trim()

  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("id, supplier_reference")
    .eq("id", bookingId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!existing) return { ok: false, error: "Booking not found", notFound: true }

  const before = (existing as { supplier_reference: string | null }).supplier_reference ?? null
  if (before === normalised) {
    return { ok: true, before, after: normalised }
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ supplier_reference: normalised, updated_at: new Date().toISOString() })
    .eq("id", bookingId)

  if (updateError) return { ok: false, error: updateError.message }

  await writeAuditLog(supabase, {
    actor,
    actorUserId,
    entityType: "Booking",
    entityId: bookingId,
    action: "supplier_reference_captured",
    before: { supplier_reference: before },
    after: { supplier_reference: normalised },
  })

  return { ok: true, before, after: normalised }
}
