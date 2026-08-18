import { describe, expect, it } from "vitest"
import { getMessageBody } from "./sync"

// Unlike sync.test.ts, this file does NOT mock lib/import/parseEmailDraft -- getMessageBody's
// scoring is the thing under test, so it needs the real parser and the real
// countRequiredComplete().
describe("getMessageBody", () => {
  it("returns the text/plain part unchanged when there is no HTML alternative", () => {
    const selection = getMessageBody("Hello, please quote us for Cape Town.", false)
    expect(selection).toEqual({ body: "Hello, please quote us for Cape Town.", part: "text", altBody: "" })
  })

  it("flattens and returns the HTML part when there is no text/plain alternative", () => {
    const selection = getMessageBody(false, "<tr><td>Country</td><td>South Africa</td></tr>")
    expect(selection.part).toBe("html")
    expect(selection.body).toContain("Country")
    expect(selection.body).toContain("South Africa")
    expect(selection.altBody).toBe("")
  })

  it("returns an empty, 'none' selection when neither part is usable", () => {
    expect(getMessageBody(false, undefined)).toEqual({ body: "", part: "none", altBody: "" })
    expect(getMessageBody("   ", "  ")).toEqual({ body: "", part: "none", altBody: "" })
  })

  it("keeps the text/plain part on a tie, so a message with a good text part is unaffected", () => {
    // Same required fields on both sides (Country only) -- the HTML branch must not win a tie.
    const text = "Country\nSouth Africa"
    const html = "<tr><td>Country</td><td>South Africa</td></tr>"
    const selection = getMessageBody(text, html)
    expect(selection.part).toBe("text")
    expect(selection.body).toBe(text)
    expect(selection.altBody).toContain("South Africa")
  })

  it("falls back to the flattened HTML when the text/plain part is flowed into unstructured paragraphs", () => {
    // Reproduces the production incident: mailbox switched to info@sarail.co.za, whose
    // text/plain alternative arrives hard-wrapped with no label owning its own line, while the
    // text/html alternative in the same message is still the intact Gravity Forms table.
    const flowedText =
      "Please indicate the purpose of your request Quote Contact Information Title Mr\n" +
      "Name Thabo Surname Mokoena Contact Number 0721234567 Email\n" +
      "thabo.mokoena@example.com [thabo.mokoena@example.com] Country South Africa\n" +
      "Province Western Cape Blue Train Information Direction Pretoria to Cape Town\n" +
      "Departure Date 26 October 2026 No. of Adults 2 No of Suites 1 Suite Type 1\n" +
      "Deluxe Double with 3/4 bath"
    const intactHtml = `
      <table>
        <tr><td>Title</td><td>Mr</td></tr>
        <tr><td>Name</td><td>Thabo</td></tr>
        <tr><td>Surname</td><td>Mokoena</td></tr>
        <tr><td>Contact Number</td><td>0721234567</td></tr>
        <tr><td>Email</td><td>thabo.mokoena@example.com</td></tr>
        <tr><td>Country</td><td>South Africa</td></tr>
        <tr><td>Province</td><td>Western Cape</td></tr>
        <tr><td>Direction</td><td>Pretoria to Cape Town</td></tr>
        <tr><td>Departure Date</td><td>26 October 2026</td></tr>
        <tr><td>No. of Adults</td><td>2</td></tr>
        <tr><td>No of Suites</td><td>1</td></tr>
        <tr><td>Suite Type 1</td><td>Deluxe Double with 3/4 bath</td></tr>
      </table>
    `

    const selection = getMessageBody(flowedText, intactHtml)

    expect(selection.part).toBe("html")
    expect(selection.body).toContain("Thabo")
    expect(selection.body).toContain("Mokoena")
    expect(selection.altBody).toBe(flowedText)
  })

  it("threads trainOperatorNames into both candidates' scoring", () => {
    // A custom operator name only findable in the HTML row (not the shorter default list) must
    // still count toward the HTML side's score.
    const text = "Country\nSouth Africa"
    const html = "<tr><td>Country</td><td>South Africa</td></tr><tr><td>Operator</td><td>Premier Rail Co</td></tr>"
    const selection = getMessageBody(text, html, { trainOperatorNames: ["Premier Rail Co"] })
    expect(selection.part).toBe("html")
  })
})
