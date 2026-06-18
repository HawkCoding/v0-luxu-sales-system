const CONFIRMED_STAGES = new Set([
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "closed",
])

export interface ItineraryReadinessResult {
  ready: boolean
  message: string | null
}

export function checkItineraryReadiness(input: {
  stage: string | null
  customerEmail: string | null
}): ItineraryReadinessResult {
  if (!CONFIRMED_STAGES.has(input.stage ?? "")) {
    return {
      ready: false,
      message: "The booking must be confirmed (deposit paid) before generating an itinerary.",
    }
  }
  if (!input.customerEmail?.trim()) {
    return {
      ready: false,
      message: "Customer email is required before generating an itinerary.",
    }
  }
  return { ready: true, message: null }
}
