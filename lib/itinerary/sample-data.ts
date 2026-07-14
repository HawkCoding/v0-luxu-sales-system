import type { ItineraryData } from "@/lib/itinerary/build-itinerary"
import { sampleVoucherServiceBlocks } from "@/lib/voucher/pdf/sample-data"

// Sample itinerary fixture for the render smoke test and /api/pdf-preview.
export function sampleItineraryData(): ItineraryData {
  return {
    bookingNumber: "BT-2026-0001",
    tripTitle: "Cape Town to Pretoria — Anniversary Journey",
    tripNotes:
      "Please have your passports ready at check-in. Dress code on board is smart casual by day and formal for dinner.",
    guestNames: "Mr & Mrs Sample Guest — 2 adults",
    departure: "10 March 2026",
    consultantName: "Carmen de Jongh",
    serviceBlocks: sampleVoucherServiceBlocks(),
  }
}
