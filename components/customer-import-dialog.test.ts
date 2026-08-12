import { describe, expect, it } from "vitest"

import { readCsvText } from "./customer-import-dialog"

const HEADER_ROW = "title,first_name,last_name,email,phone,country\n"
const DATA_ROW = "Mr,Clean,Import,clean@luxusqa.test,+27 82 100 0003,South Africa\n"
const CSV = `${HEADER_ROW}${DATA_ROW}`

function toFile(bytes: Uint8Array, name = "customers.csv"): File {
  return new File([bytes], name, { type: "text/csv" })
}

function utf16le(text: string, withBom: boolean): Uint8Array {
  const characters = Array.from(text)
  const bytes = new Uint8Array((characters.length + (withBom ? 1 : 0)) * 2)
  const view = new DataView(bytes.buffer)
  let offset = 0
  if (withBom) {
    view.setUint16(offset, 0xfeff, true)
    offset += 2
  }
  for (const character of characters) {
    view.setUint16(offset, character.charCodeAt(0), true)
    offset += 2
  }
  return bytes
}

describe("readCsvText", () => {
  it("reads a plain UTF-8 file", async () => {
    const text = await readCsvText(toFile(new TextEncoder().encode(CSV)))
    expect(text).toBe(CSV)
  })

  it("strips a UTF-8 BOM so the first header still matches", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(CSV)])
    const text = await readCsvText(toFile(bytes))
    expect(text.startsWith("title,")).toBe(true)
  })

  // F05-5: Excel on Windows writes UTF-16, which file.text() decoded as UTF-8
  // and turned into NUL-interleaved garbage — surfacing as "missing headers".
  it("decodes a UTF-16LE file written by Excel", async () => {
    const text = await readCsvText(toFile(utf16le(CSV, true)))
    expect(text).toBe(CSV)
  })

  it("names the file when it is not UTF-8 and carries no BOM", async () => {
    await expect(readCsvText(toFile(utf16le(CSV, false), "supplier-leads.csv"))).rejects.toThrow(
      /supplier-leads\.csv is not a UTF-8 CSV/,
    )
  })
})
