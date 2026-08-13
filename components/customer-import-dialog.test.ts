import { describe, expect, it } from "vitest"

import { describeRowIssues, getRowIssues, readCsvText } from "./customer-import-dialog"

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

// F05-6: a dropped row used to be identifiable only by a red cell border, with no
// message naming the row or the column that failed.
describe("getRowIssues", () => {
  const validRow = {
    first_name: "Clean",
    last_name: "Import",
    email: "clean@luxusqa.test",
    sourceLabel: "customers.csv row 2",
  }

  it("returns nothing for a valid row", () => {
    expect(getRowIssues(validRow)).toEqual([])
  })

  it("names a missing first name", () => {
    expect(getRowIssues({ ...validRow, first_name: "   " })).toEqual([
      { field: "first_name", message: "First name is required" },
    ])
  })

  it("names a missing last name", () => {
    expect(getRowIssues({ ...validRow, last_name: "" })).toEqual([
      { field: "last_name", message: "Last name is required" },
    ])
  })

  it("distinguishes a blank email from a malformed one", () => {
    expect(getRowIssues({ ...validRow, email: "" })).toEqual([
      { field: "email", message: "Email is required" },
    ])
    expect(getRowIssues({ ...validRow, email: "not-an-email" })).toEqual([
      { field: "email", message: 'Email "not-an-email" is not a valid address' },
    ])
  })

  it("reports every failing column on a short row", () => {
    const issues = getRowIssues({ ...validRow, last_name: "", email: "nope" })
    expect(issues.map((issue) => issue.field)).toEqual(["last_name", "email"])
  })
})

describe("describeRowIssues", () => {
  it("names the row and every problem with it", () => {
    expect(
      describeRowIssues({
        first_name: "",
        last_name: "Import",
        email: "bob@",
        sourceLabel: "customers.csv row 12",
      }),
    ).toBe('customers.csv row 12 — First name is required; Email "bob@" is not a valid address')
  })
})
