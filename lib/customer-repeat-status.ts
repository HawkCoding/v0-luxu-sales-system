import type { PipelineStage } from "@/lib/types"

export const COMPLETED_REPEAT_BOOKING_STAGES = [
  "voucher_sent",
  "trip_active",
  "closed",
] satisfies PipelineStage[]

const completedRepeatBookingStageSet = new Set<string>(COMPLETED_REPEAT_BOOKING_STAGES)

export function isCompletedRepeatBookingStage(stage: string | null | undefined): boolean {
  return typeof stage === "string" && completedRepeatBookingStageSet.has(stage)
}

export function buildRepeatCustomerIdSet(
  bookings: Array<{ customer_id?: string | null; customerId?: string | null; stage: string | null }>,
): Set<string> {
  return new Set(
    bookings
      .filter((booking) => isCompletedRepeatBookingStage(booking.stage))
      .map((booking) => booking.customer_id ?? booking.customerId ?? null)
      .filter((customerId): customerId is string => Boolean(customerId)),
  )
}
