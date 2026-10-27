import type { SupabaseClient } from "@supabase/supabase-js"
import { payingPaxSupplierId, resolvePayingPax, type BookingPaxRow } from "@/lib/invoices/booking-pax"
import { allocatePerGuest, type GuestShare, type PerGuestLine } from "@/lib/quotes/per-guest-allocation"
import type { Database } from "@/lib/supabase/types"

interface ResolveQuotePerGuestRowsInput {
  booking: (BookingPaxRow & { primary_supplier_id?: string | null }) | null | undefined
  /** loadQuoteConfig's primarySupplierId — the same supplier the quote PDF divides by. */
  quotePrimarySupplierId: string | null | undefined
  lines: readonly PerGuestLine[]
  /** The figure the rows add up to: the gross subtotal, matching the quote PDF. */
  target: number
}

/**
 * The quote email's per-guest rows, resolved the way the quote PDF resolves them (paying pax through
 * the primary supplier's age buckets, then allocatePerGuest). Null keeps the email's existing
 * per-person line — including when the paying headcount can't be looked up, since the email must
 * never fail to build over a nicety.
 */
export async function resolveQuotePerGuestRows(
  supabase: SupabaseClient<Database>,
  { booking, quotePrimarySupplierId, lines, target }: ResolveQuotePerGuestRowsInput,
): Promise<GuestShare[] | null> {
  if (!booking) return null
  try {
    const pax = await resolvePayingPax(
      supabase,
      booking,
      payingPaxSupplierId(quotePrimarySupplierId, booking.primary_supplier_id),
    )
    return allocatePerGuest({
      lines,
      adults: pax.adults,
      children: pax.children,
      childAges: pax.childAges,
      target,
    })
  } catch {
    return null
  }
}
