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

/**
 * Reserves `count` consecutive booking numbers in a single round trip.
 *
 * Bulk import allocates one number per row; doing that one RPC at a time costs
 * a round trip per row, which pushes a 1000-row file past the serverless
 * function timeout on hosted Supabase. The block RPC increments the same
 * counter by `count` atomically, so concurrent callers still cannot overlap.
 */
export async function allocateJobNumberBlock(
  supabase: SupabaseServerClient,
  count: number,
  prefix: JobNumberPrefix = JOB_NUMBER_PREFIX,
  createdAt: Date = new Date(),
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Invalid booking number block size: ${count}`)
  }

  const year = getNumberYear(createdAt)
  const { data, error } = await supabase.rpc("next_booking_number_block", {
    p_product_code: prefix,
    p_count: count,
    p_year: year,
  })

  if (error || !data) {
    throw new Error(error?.message || "Failed to allocate job number block")
  }

  const lastNumber = data
  const firstNumber = lastNumber - count + 1
  return Array.from({ length: count }, (_, index) => formatBookingNumber(prefix, year, firstNumber + index))
}

export async function allocateJobNumberForBooking(
  supabase: SupabaseServerClient,
  createdAt: Date = new Date(),
): Promise<JobNumberAllocation> {
  return { bookingNumber: await allocateJobNumber(supabase, JOB_NUMBER_PREFIX, createdAt) }
}
