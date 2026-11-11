// @vitest-environment node
// jsdom breaks @react-pdf font subsetting; production renders run in the Node runtime.
import { describe, expect, it } from "vitest"
import { renderWorksheetPdf } from "../render-worksheet-pdf"
import { sampleWorksheetData } from "./sample-data"

const PAYMENT = {
  date: "2026-09-16",
  paidWith: "Credit Card",
  reference: "140926 Adams",
  amount: 84920,
}

async function pageTexts(buffer: Buffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "))
  }
  return pages
}

async function render(payments: (typeof PAYMENT)[]): Promise<string> {
  const buffer = await renderWorksheetPdf({ ...sampleWorksheetData(), brandLogo: null, payments })
  expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF")
  return (await pageTexts(buffer)).join(" ").toUpperCase()
}

// A real react-pdf render takes a few seconds and can overrun the 5 s default under a full run.
describe("WorksheetDocument payment table", { timeout: 30_000 }, () => {
  it("prints the Amounts Payable column beside Amounts Receivable, then Totals and Gross Profit", async () => {
    const text = await render([PAYMENT])
    // The service table carries one "Amounts Payable" header, the payment table the second.
    expect(text.match(/AMOUNTS PAYABLE/g)).toHaveLength(2)
    expect(text.match(/AMOUNTS RECEIVABLE/g)).toHaveLength(2)
    expect(text).toContain("TOTALS")
    expect(text).toContain("GROSS PROFIT")
  })

  it("still renders the table headers and summary rows when there are no payments", async () => {
    const text = await render([])
    expect(text.match(/AMOUNTS PAYABLE/g)).toHaveLength(2)
    expect(text).toContain("TOTALS")
    expect(text).toContain("GROSS PROFIT")
  })

  it("prints the payment details in the received columns", async () => {
    const text = await render([PAYMENT])
    expect(text).toContain("CREDIT CARD (140926 ADAMS)")
    expect(text).toContain("16-09-2026")
  })
})
