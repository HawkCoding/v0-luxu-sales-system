import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { WorksheetDocument, type WorksheetPdfData } from "./pdf/worksheet-document"

export type { WorksheetPdfData } from "./pdf/worksheet-document"

export async function renderWorksheetPdf(data: WorksheetPdfData): Promise<Buffer> {
  return renderToBuffer(
    createElement(WorksheetDocument, data) as unknown as Parameters<typeof renderToBuffer>[0],
  )
}
