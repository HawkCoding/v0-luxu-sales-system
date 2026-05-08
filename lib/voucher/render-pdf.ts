import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import type { VoucherData } from "@/lib/generate-voucher"
import type { VoucherTemplate } from "@/lib/types"
import { VoucherDocument } from "./pdf/voucher-document"

export interface RenderVoucherPdfInput {
  data: VoucherData
  template?: VoucherTemplate | null
}

export async function renderVoucherPdf(input: RenderVoucherPdfInput): Promise<Buffer> {
  return renderToBuffer(createElement(VoucherDocument, input) as unknown as Parameters<typeof renderToBuffer>[0])
}
