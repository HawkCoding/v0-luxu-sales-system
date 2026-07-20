import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// Booking numbers are identity only — they make no claim about which train was
// booked. The product a job belongs to is resolved from the booked supplier on
// its route (see lib/quotes/resolve-primary-route.ts), which stays correct when
// the salesperson changes the package.
export type JobNumberPrefix = "LTT"

export const JOB_NUMBER_PREFIX: JobNumberPrefix = "LTT"

export interface JobNumberAllocation {
  bookingNumber: string
}

type SupabaseServerClient = SupabaseClient<Database>

function getNumberYear(createdAt: Date = new Date()): number {
  return Number.isFinite(createdAt.getTime()) ? createdAt.getUTCFullYear() : new Date().getUTCFullYear()
}

export function formatBookingNumber(prefix: JobNumberPrefix, year: number, sequenceNumber: number): string {
  return `${prefix}-${year}-${String(sequenceNumber).padStart(4, "0")}`
}

export async function allocateJobNumber(
  supabase: SupabaseServerClient,
  prefix: JobNumberPrefix = JOB_NUMBER_PREFIX,
  createdAt: Date = new Date(),
): Promise<string> {
  const year = getNumberYear(createdAt)
  const { data, error } = await supabase.rpc("next_booking_number", {
    p_product_code: prefix,
    p_year: year,
  })

  if (error || !data) {
    throw new Error(error?.message || "Failed to allocate job number")
  }

  return formatBookingNumber(prefix, year, data)
}

export async function allocateJobNumberForBooking(
  supabase: SupabaseServerClient,
  createdAt: Date = new Date(),
): Promise<JobNumberAllocation> {
  return { bookingNumber: await allocateJobNumber(supabase, JOB_NUMBER_PREFIX, createdAt) }
}
