import type { PipelineStage } from "@/lib/types"

export interface BookingVisibilityInput {
  stage: PipelineStage | string
}

export const BOOKING_LIST_STAGES: PipelineStage[] = [
  "quote_sent",
  "quoted",
  "accepted",
  "form_done",
  "deposit_requested",
  "payment_schedule",
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "trip_active",
  "closed",
]

export function isVisibleInEnquiries(booking: BookingVisibilityInput): boolean {
  return booking.stage === "enquiry"
}

export function isVisibleInBookings(booking: BookingVisibilityInput): boolean {
  return BOOKING_LIST_STAGES.includes(booking.stage as PipelineStage)
}
