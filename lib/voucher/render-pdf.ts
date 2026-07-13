import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import type { VoucherData } from "@/lib/generate-voucher"
import type { VoucherTemplate } from "@/lib/types"
import { VoucherDocument } from "./pdf/voucher-document"

export interface RenderVoucherPdfInput {
  data: VoucherData
  template?: VoucherTemplate | null
  docTitle?: string
}

const SLOW_RENDER_THRESHOLD_MS = 2_000

export async function renderVoucherPdf(input: RenderVoucherPdfInput): Promise<Buffer> {
  const startedAt = performance.now()
  const buffer = await renderToBuffer(
    createElement(VoucherDocument, input) as unknown as Parameters<typeof renderToBuffer>[0],
  )
  const elapsedMs = performance.now() - startedAt
  const voucherNumber = input.data?.voucherNumber ?? "unknown"
  if (elapsedMs >= SLOW_RENDER_THRESHOLD_MS) {
    console.warn(
      `[voucher-pdf] slow render: voucher=${voucherNumber} duration=${elapsedMs.toFixed(0)}ms threshold=${SLOW_RENDER_THRESHOLD_MS}ms`,
    )
  } else {
    console.log(`[voucher-pdf] rendered voucher=${voucherNumber} duration=${elapsedMs.toFixed(0)}ms`)
  }
  return buffer
}
