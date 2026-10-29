import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import type { Database } from "@/lib/supabase/types"

export interface ClaimUnassignedBookingInput {
  bookingId: string
  userId: string
  actorName: string
}

export type ClaimUnassignedBookingResult =
  | { ok: true; claimed: boolean; assignedSalespersonId: string | null }
  | { ok: false; error: { message: string } }

/**
 * An enquiry nobody has been assigned to belongs to whoever starts working it: the first quote
 * create/edit or send by a salesperson stamps them as `assigned_salesperson_id`. Without it every
 * outbound email resolves "no-salesperson" and has no mailbox to leave from.
 *
 * The update is conditional on the column still being null, so two people opening the same
 * enquiry at once cannot overwrite each other, and an existing assignment is never changed —
 * reassigning stays an explicit action on the booking.
 */
export async function claimUnassignedBooking(
  supabase: SupabaseClient<Database>,
  input: ClaimUnassignedBookingInput,
): Promise<ClaimUnassignedBookingResult> {
  const { data: claimedRows, error } = await supabase
    .from("bookings")
    .update({ assigned_salesperson_id: input.userId })
    .eq("id", input.bookingId)
    .is("assigned_salesperson_id", null)
    .select("id")

  if (error) return { ok: false, error }

  if ((claimedRows ?? []).length > 0) {
    const auditResult = await writeAuditLog(supabase, {
      actor: input.actorName,
      actorUserId: input.userId,
      entityType: "Booking",
      entityId: input.bookingId,
      action: "salesperson_auto_assigned",
      before: { assigned_salesperson_id: null },
      after: { assigned_salesperson_id: input.userId },
    })
    if (auditResult.error) {
      const message = (auditResult.error as { message?: string }).message ?? "Audit log write failed"
      return { ok: false, error: { message } }
    }
    return { ok: true, claimed: true, assignedSalespersonId: input.userId }
  }

  const { data: booking, error: loadError } = await supabase
    .from("bookings")
    .select("assigned_salesperson_id")
    .eq("id", input.bookingId)
    .maybeSingle()

  if (loadError) return { ok: false, error: loadError }
  return { ok: true, claimed: false, assignedSalespersonId: booking?.assigned_salesperson_id ?? null }
}
