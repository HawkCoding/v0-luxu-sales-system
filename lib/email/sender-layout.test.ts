import { describe, expect, it } from "vitest"
import {
  renderSenderLayout,
  styleSignatureLinks,
  DEFAULT_SENDER_LAYOUT,
  SIGNATURE_TEXT_COLOR,
  type SenderLayoutFields,
} from "./sender-layout"

const LINK_STYLE = `style="color:${SIGNATURE_TEXT_COLOR};text-decoration:none"`

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
        `Email: <a href="mailto:reservations@sa-rail.co.za" ${LINK_STYLE}>reservations@sa-rail.co.za</a> | ` +
        `Web: <a href="https://www.sa-rail.co.za" ${LINK_STYLE}>www.sa-rail.co.za</a>`,
    )
  })

  it("styles the email and website links in the signature text colour, never the client's default blue", () => {
    const html = renderSenderLayout("", FULL)
    const anchors = html.match(/<a\b[^>]*>/g) ?? []
    expect(anchors).toHaveLength(2)
    for (const anchor of anchors) {
      expect(anchor).toContain("color:#3d3831")
      expect(anchor).toContain("text-decoration:none")
    }
    expect(html).not.toMatch(/blue|#0000ee|#1155cc/i)
  })

  it("styles links the admin authored in the layout too", () => {
    const html = renderSenderLayout('{{fullName}}<br><a href="https://luxus.example">Book online</a>', FULL)
    expect(html).toContain(`<a href="https://luxus.example" ${LINK_STYLE}>Book online</a>`)
  })

  it("gives a link inside a coloured span that span's colour", () => {
    const html = renderSenderLayout('<span style="color:#1f4e79">{{email}}</span>', FULL)
    expect(html).toBe(
      '<span style="color:#1f4e79"><a href="mailto:reservations@sa-rail.co.za" style="color:#1f4e79;text-decoration:none">' +
        "reservations@sa-rail.co.za</a></span>",
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
    expect(html).toBe(`<a href="https://www.sa-rail.co.za" ${LINK_STYLE}>https://www.sa-rail.co.za</a>`)
  })

  it("keeps a static segment with no tokens even when every field is empty", () => {
    const html = renderSenderLayout("<em>Team</em> | {{jobTitle}}", { ...FULL, jobTitle: null })
    expect(html).toBe("<em>Team</em>")
  })
})

describe("styleSignatureLinks", () => {
  const MUTED = "#6b6258"

  it("adds an inline colour and drops the underline on a bare link", () => {
    expect(styleSignatureLinks('Visit <a href="https://sa-rail.co.za">sa-rail.co.za</a>', MUTED)).toBe(
      'Visit <a href="https://sa-rail.co.za" style="color:#6b6258;text-decoration:none">sa-rail.co.za</a>',
    )
  })

  it("styles every link, including mailto and tel", () => {
    const html = styleSignatureLinks(
      '<a href="mailto:a@b.com">a@b.com</a> | <a href="tel:+27211003596">021 100 3596</a>',
      MUTED,
    )
    expect(html.match(/style="color:#6b6258;text-decoration:none"/g)).toHaveLength(2)
  })

  it("takes the colour of the nearest coloured span around the link", () => {
    const html = styleSignatureLinks(
      '<span style="font-size:12px;color:rgb(68, 80, 90)">Divisions: <span style="font-size:10px"><a href="https://x.example">X</a></span></span> <a href="https://y.example">Y</a>',
      MUTED,
    )
    expect(html).toContain('<a href="https://x.example" style="color:rgb(68, 80, 90);text-decoration:none">X</a>')
    // Outside the span again, the line colour applies.
    expect(html).toContain('<a href="https://y.example" style="color:#6b6258;text-decoration:none">Y</a>')
  })

  it("ignores background-color when looking for a span's colour", () => {
    const html = styleSignatureLinks(
      '<span style="background-color:#ffff00"><a href="https://x.example">X</a></span>',
      MUTED,
    )
    expect(html).toContain('style="color:#6b6258;text-decoration:none"')
  })

  it("keeps a colour or decoration the link already declares, and is idempotent", () => {
    const once = styleSignatureLinks('<a href="https://x.example" style="color:#123456">X</a>', MUTED)
    expect(once).toBe('<a href="https://x.example" style="text-decoration:none;color:#123456">X</a>')
    expect(styleSignatureLinks(once, MUTED)).toBe(once)
  })

  it("leaves non-link tags and text alone", () => {
    const html = "<strong>Bold</strong> <em>italic</em> <abbr>abbr</abbr>"
    expect(styleSignatureLinks(html, MUTED)).toBe(html)
  })
})
