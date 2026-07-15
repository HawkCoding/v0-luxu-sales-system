import { describe, expect, it } from "vitest"
import { renderTemplate } from "./render"

describe("renderTemplate", () => {
  it("substitutes scalar tokens in subject and body", () => {
    const result = renderTemplate({
      subject: "Your Quote — {{jobNumber}}",
      bodyHtml: "<p>Dear {{customerName}}, ref {{jobNumber}}.</p>",
      tokens: { jobNumber: "BT-2026-0001", customerName: "Jane Smith" },
    })

    expect(result.subject).toBe("Your Quote — BT-2026-0001")
    expect(result.bodyHtml).toBe("<p>Dear Jane Smith, ref BT-2026-0001.</p>")
    expect(result.warnings).toEqual([])
  })

  it("HTML-escapes scalar values in the body but not the subject", () => {
    const result = renderTemplate({
      subject: "Hello {{customerName}}",
      bodyHtml: "<p>{{customerName}}</p>",
      tokens: { customerName: `<script>alert("x")</script> & 'co'` },
    })

    expect(result.bodyHtml).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;co&#39;</p>",
    )
    expect(result.bodyHtml).not.toContain("<script>")
    expect(result.subject).toBe(`Hello <script>alert("x")</script> & 'co'`)
  })

  it("inserts block tokens raw into the body only", () => {
    const block = "<table><tr><td>Bank: Example</td></tr></table>"
    const result = renderTemplate({
      subject: "Invoice {{bankingDetails}}",
      bodyHtml: "<p>Pay here:</p>{{bankingDetails}}",
      tokens: {},
      blocks: { bankingDetails: block },
    })

    expect(result.bodyHtml).toBe(`<p>Pay here:</p>${block}`)
    // Block tokens are never substituted into subjects — left visible + warned.
    expect(result.subject).toBe("Invoice {{bankingDetails}}")
    expect(result.warnings).toEqual(["Unreplaced token: {{bankingDetails}}"])
  })

  it("leaves unknown tokens visible and reports each once", () => {
    const result = renderTemplate({
      subject: "{{missing}}",
      bodyHtml: "<p>{{missing}} and {{alsoMissing}}</p>",
      tokens: {},
    })

    expect(result.subject).toBe("{{missing}}")
    expect(result.bodyHtml).toBe("<p>{{missing}} and {{alsoMissing}}</p>")
    expect(result.warnings).toEqual([
      "Unreplaced token: {{alsoMissing}}",
      "Unreplaced token: {{missing}}",
    ])
  })

  it("tolerates whitespace inside braces", () => {
    const result = renderTemplate({
      subject: "{{ jobNumber }}",
      bodyHtml: "<p>{{  customerName  }}</p>",
      tokens: { jobNumber: "BT-1", customerName: "Jane" },
    })

    expect(result.subject).toBe("BT-1")
    expect(result.bodyHtml).toBe("<p>Jane</p>")
  })

  it("replaces repeated occurrences of the same token", () => {
    const result = renderTemplate({
      subject: "{{jobNumber}}",
      bodyHtml: "<p>{{jobNumber}} / {{jobNumber}}</p>",
      tokens: { jobNumber: "BT-1" },
    })

    expect(result.bodyHtml).toBe("<p>BT-1 / BT-1</p>")
  })
})
