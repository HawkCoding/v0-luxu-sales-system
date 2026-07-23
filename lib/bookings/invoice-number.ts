import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { writeAuditLog } from "@/lib/audit-write"

export interface UpdateInvoiceNumberInput {
  bookingId: string
  value: string | null
  actor: string
  actorUserId: string | null
}

export type UpdateInvoiceNumberResult =
  | { ok: true; before: string | null; after: string | null }
  | { ok: false; error: string; notFound?: boolean }

export async function updateInvoiceNumber(
  supabase: SupabaseClient<Database>,
  input: UpdateInvoiceNumberInput,
): Promise<UpdateInvoiceNumberResult> {
  const { bookingId, value, actor, actorUserId } = input
  const normalised = value === null ? null : value.trim().length === 0 ? null : value.trim()

  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("id, customer_invoice_number")
    .eq("id", bookingId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!existing) return { ok: false, error: "Booking not found", notFound: true }

  const before = (existing as { customer_invoice_number: string | null }).customer_invoice_number ?? null
  if (before === normalised) {
    return { ok: true, before, after: normalised }
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ customer_invoice_number: normalised, updated_at: new Date().toISOString() })
    .eq("id", bookingId)

  if (updateError) return { ok: false, error: updateError.message }

  await writeAuditLog(supabase, {
    actor,
    actorUserId,
    entityType: "Booking",
    entityId: bookingId,
    action: "invoice_number_captured",
    before: { customer_invoice_number: before },
    after: { customer_invoice_number: normalised },
  })

  return { ok: true, before, after: normalised }
}
