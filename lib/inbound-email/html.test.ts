import { describe, expect, it } from "vitest"
import { createRawEmailPreview, htmlToPlainText } from "@/lib/inbound-email/html"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"

const TABLE_EMAIL = `
<html>
  <head><style>td { color: #333 }</style></head>
  <body>
    <table>
      <tr><td style="font-weight:bold">Title</td><td>Mr</td></tr>
      <tr><td>First Name</td><td>John</td></tr>
      <tr><td>Surname</td><td>Smith</td></tr>
      <tr><td>Email</td><td>john.smith@gmail.com</td></tr>
      <tr><td>Country</td><td>South Africa</td></tr>
      <tr><td>Direction</td><td>Pretoria to Cape Town</td></tr>
      <tr><td>Departure Date</td><td>2026-09-15</td></tr>
      <tr><td>No of Adults</td><td>2</td></tr>
      <tr><td>No of Suites</td><td>1</td></tr>
      <tr><td>Suite Type</td><td>Deluxe Double Suite</td></tr>
    </table>
    <script>console.log("tracking")</script>
  </body>
</html>
`

describe("htmlToPlainText", () => {
  it("puts each table cell on its own line", () => {
    const text = htmlToPlainText("<tr><td>Country</td><td>South Africa</td></tr>")
    expect(text.split("\n").map((line) => line.trim()).filter(Boolean)).toEqual([
      "Country",
      "South Africa",
    ])
  })

  it("strips script and style content without leaking markup", () => {
    const text = htmlToPlainText(TABLE_EMAIL)
    expect(text).not.toContain("<")
    expect(text).not.toContain("tracking")
    expect(text).not.toContain("font-weight")
  })

  it("decodes the entities the parser would otherwise read as literal text", () => {
    expect(htmlToPlainText("<p>Tea &amp; Cake &quot;special&quot;</p>")).toBe('Tea & Cake "special"')
  })
})

describe("htmlToPlainText -> parseEmailDraft", () => {
  it("keeps every labelled field of an HTML-only enquiry", () => {
    // A whole row used to collapse onto one space-separated line, leaving no ':' or '|' for the
    // label splitter: 6 of the 9 required fields blanked, "Direction" was swallowed into its own
    // answer, and the suite phrase was invented as "of suites" from the collapsed count row.
    const draft = parseEmailDraft(htmlToPlainText(TABLE_EMAIL), {
      trainOperatorNames: ["The Blue Train", "Rovos Rail"],
    })

    expect(draft.customer.title).toBe("Mr")
    expect(draft.customer.firstName).toBe("John")
    expect(draft.customer.surname).toBe("Smith")
    expect(draft.customer.email).toBe("john.smith@gmail.com")
    expect(draft.customer.country).toBe("South Africa")
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-09-15")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suitePhrases).toEqual(["Deluxe Double Suite"])
  })
})

describe("createRawEmailPreview", () => {
  it("truncates past the cap and leaves shorter text alone", () => {
    expect(createRawEmailPreview("short body")).toBe("short body")
    expect(createRawEmailPreview("x".repeat(20), 10)).toBe(`${"x".repeat(10)}...`)
  })
})
