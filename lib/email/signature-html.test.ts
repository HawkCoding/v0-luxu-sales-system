import { describe, expect, it } from "vitest"
import { sanitizeSignatureHtml, toInlineSignatureHtml, isBlankSignatureHtml } from "./signature-html"

describe("sanitizeSignatureHtml", () => {
  it("keeps plain text unchanged", () => {
    expect(sanitizeSignatureHtml("Registered in South Africa CK2007/049324/23")).toBe(
      "Registered in South Africa CK2007/049324/23",
    )
  })

  it("keeps the small inline formatting tags", () => {
    const html = "<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <s>Strike</s></p>"
    expect(sanitizeSignatureHtml(html)).toBe(html)
  })

  it("strips script tags entirely, including their content", () => {
    expect(sanitizeSignatureHtml('<p>hi</p><script>alert("x")</script>')).toBe("<p>hi</p>")
  })

  it("strips event handler attributes", () => {
    expect(sanitizeSignatureHtml('<p onclick="alert(1)">hi</p>')).toBe("<p>hi</p>")
  })

  it("strips a javascript: href but keeps the (now inert) anchor's text", () => {
    const html = sanitizeSignatureHtml('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toContain("javascript:")
    expect(html).toContain("click")
  })

  it("keeps https/mailto/tel links", () => {
    expect(sanitizeSignatureHtml('<a href="https://example.com">site</a>')).toBe(
      '<a href="https://example.com">site</a>',
    )
    expect(sanitizeSignatureHtml('<a href="mailto:a@b.com">a@b.com</a>')).toBe(
      '<a href="mailto:a@b.com">a@b.com</a>',
    )
  })

  it("keeps a span whose style is exactly one allowlisted font-size", () => {
    const html = '<span style="font-size:18px">big</span>'
    expect(sanitizeSignatureHtml(html)).toBe(html)
  })

  it("keeps a span combining every allowlisted property", () => {
    const html = '<span style="font-size:18px;color:#b42318;background-color:#dcfce7;font-family:Georgia, serif">x</span>'
    expect(sanitizeSignatureHtml(html)).toBe(html)
  })

  it("drops an unrecognised style property but keeps allowlisted ones on the same span", () => {
    const html = sanitizeSignatureHtml('<span style="font-size:18px;text-decoration:blink">x</span>')
    expect(html).toBe('<span style="font-size:18px">x</span>')
  })

  it("unwraps a span whose style has no allowlisted declarations", () => {
    expect(sanitizeSignatureHtml('<span style="text-decoration:blink">x</span>')).toBe("x")
  })

  it("keeps a custom hex color outside the swatch presets — the toolbar allows a typed-in hex", () => {
    const html = '<span style="color:#123456">x</span>'
    expect(sanitizeSignatureHtml(html)).toBe(html)
  })

  it("drops a non-hex color keyword", () => {
    expect(sanitizeSignatureHtml('<span style="color:red">x</span>')).toBe("x")
  })

  it("drops disallowed tags but keeps their text", () => {
    expect(sanitizeSignatureHtml("<div><table><tr><td>x</td></tr></table></div>")).toBe("x")
  })

  it("is idempotent", () => {
    const once = sanitizeSignatureHtml('<p><strong>Bold</strong></p><script>bad()</script>')
    expect(sanitizeSignatureHtml(once)).toBe(once)
  })
})

describe("toInlineSignatureHtml", () => {
  it("turns two paragraphs into a single <br>-joined run", () => {
    expect(toInlineSignatureHtml("<p>a</p><p>b</p>")).toBe("a<br>b")
  })

  it("drops the outer paragraph tags of a single paragraph", () => {
    expect(toInlineSignatureHtml("<p>a</p>")).toBe("a")
  })

  it("passes through content with no paragraph wrapper", () => {
    expect(toInlineSignatureHtml("a<br>b")).toBe("a<br>b")
  })
})

describe("isBlankSignatureHtml", () => {
  it("is true for null, undefined and empty string", () => {
    expect(isBlankSignatureHtml(null)).toBe(true)
    expect(isBlankSignatureHtml(undefined)).toBe(true)
    expect(isBlankSignatureHtml("")).toBe(true)
  })

  it("is true for an empty paragraph", () => {
    expect(isBlankSignatureHtml("<p></p>")).toBe(true)
  })

  it("is true for whitespace-only content, including &nbsp;", () => {
    expect(isBlankSignatureHtml("<p>&nbsp; </p>")).toBe(true)
  })

  it("is false when there is visible text", () => {
    expect(isBlankSignatureHtml("<p>hi</p>")).toBe(false)
  })
})
