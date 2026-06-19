import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import type { ItineraryData } from "@/lib/itinerary/build-itinerary"
import type { VoucherTemplate } from "@/lib/types"
import { ItineraryDocument } from "./pdf/itinerary-document"

export interface RenderItineraryPdfInput {
  data: ItineraryData
  template?: VoucherTemplate | null
}

const SLOW_RENDER_THRESHOLD_MS = 2_000

export async function renderItineraryPdf(input: RenderItineraryPdfInput): Promise<Buffer> {
  const startedAt = performance.now()
  const buffer = await renderToBuffer(
    createElement(ItineraryDocument, input) as unknown as Parameters<typeof renderToBuffer>[0],
  )
  const elapsedMs = performance.now() - startedAt
  if (elapsedMs >= SLOW_RENDER_THRESHOLD_MS) {
    console.warn(
      `[itinerary-pdf] slow render: booking=${input.data.bookingNumber} duration=${elapsedMs.toFixed(0)}ms`,
    )
  } else {
    console.log(`[itinerary-pdf] rendered booking=${input.data.bookingNumber} duration=${elapsedMs.toFixed(0)}ms`)
  }
  return buffer
}
