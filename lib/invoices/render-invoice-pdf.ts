import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { InvoiceDocument, type InvoicePdfData } from "./pdf/invoice-document"

export type { InvoicePdfData } from "./pdf/invoice-document"

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(
    createElement(InvoiceDocument, data) as unknown as Parameters<typeof renderToBuffer>[0],
  )
}
