import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { QuoteDocument, type QuotePdfData } from "./pdf/quote-document"

export type { QuotePdfData } from "./pdf/quote-document"

export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return renderToBuffer(
    createElement(QuoteDocument, data) as unknown as Parameters<typeof renderToBuffer>[0],
  )
}
