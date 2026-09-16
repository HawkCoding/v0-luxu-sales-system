import { describe, expect, it } from "vitest"
import { renderSenderLayout, DEFAULT_SENDER_LAYOUT, type SenderLayoutFields } from "./sender-layout"

const FULL: SenderLayoutFields = {
  fullName: "Leonie Burke",
  jobTitle: "Tour Operating Consultant",
  tel: "+27 (0)21 100 3596",
  cell: "+27 (0)81 580 6471",
  fax: "+27 (0)86 598 0812",
  email: "reservations@sa-rail.co.za",
  website: "www.sa-rail.co.za",
}

describe("renderSenderLayout", () => {
  it("reproduces the pre-feature hard-coded markup shape for a fully populated sender", () => {
    const html = renderSenderLayout("", FULL)
    expect(html).toBe(
      "<strong>Leonie Burke</strong> | <em>Tour Operating Consultant</em><br>" +
        'Tel: +27 (0)21 100 3596 | Cell: +27 (0)81 580 6471 | Fax: +27 (0)86 598 0812<br>' +
        'Email: <a href="mailto:reservations@sa-rail.co.za">reservations@sa-rail.co.za</a> | ' +
        'Web: <a href="https://www.sa-rail.co.za">www.sa-rail.co.za</a>',
    )
  })

  it("falls back to DEFAULT_SENDER_LAYOUT when the layout is blank", () => {
    expect(renderSenderLayout("   ", FULL)).toBe(renderSenderLayout(DEFAULT_SENDER_LAYOUT, FULL))
  })

  it("drops the Fax segment when fax is empty, keeping Tel and Cell", () => {
    const html = renderSenderLayout("", { ...FULL, fax: null })
    expect(html).not.toContain("Fax")
    expect(html).toContain("Tel:")
    expect(html).toContain("Cell:")
  })

  it("drops the whole contact line when tel, cell and fax are all empty", () => {
    const html = renderSenderLayout("", { ...FULL, tel: null, cell: null, fax: null })
    expect(html).not.toContain("Tel:")
    expect(html).not.toContain("Cell:")
    expect(html).not.toContain("Fax:")
    // Name line and email/web line remain, joined by a single <br>.
    expect(html.match(/<br>/g)).toHaveLength(1)
  })

  it("drops the job title segment (and its leading '|') when job title is empty", () => {
    const html = renderSenderLayout("", { ...FULL, jobTitle: null })
    expect(html).toMatch(/^<strong>Leonie Burke<\/strong><br>/)
    expect(html).not.toContain("|  |")
  })

  it("drops the website segment but keeps email when website is empty", () => {
    const html = renderSenderLayout("", { ...FULL, website: null })
    expect(html).toContain("Email:")
    expect(html).not.toContain("Web:")
  })

  it("renders no line at all (not even a bare 'Email: | Web:') when every contact field is empty", () => {
    const html = renderSenderLayout("", { ...FULL, tel: null, cell: null, fax: null, email: null, website: null })
    expect(html).toBe("<strong>Leonie Burke</strong> | <em>Tour Operating Consultant</em>")
  })

  it("HTML-escapes field values", () => {
    const html = renderSenderLayout("<p>{{fullName}}</p>", { ...FULL, fullName: "<script>bad</script>" })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("strips an existing https:// prefix from website before re-adding it", () => {
    const html = renderSenderLayout("{{website}}", { ...FULL, website: "https://www.sa-rail.co.za" })
    expect(html).toBe('<a href="https://www.sa-rail.co.za">https://www.sa-rail.co.za</a>')
  })

  it("keeps a static segment with no tokens even when every field is empty", () => {
    const html = renderSenderLayout("<em>Team</em> | {{jobTitle}}", { ...FULL, jobTitle: null })
    expect(html).toBe("<em>Team</em>")
  })
})
