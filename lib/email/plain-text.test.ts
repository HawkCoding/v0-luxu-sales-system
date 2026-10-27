import { describe, expect, it } from "vitest"
import { brandedEmailToPlainText } from "@/lib/email/plain-text"
import { CONTENT_SLOT_END, CONTENT_SLOT_START } from "@/lib/templates/content-slot"
import { SIGNATURE_SLOT_END, SIGNATURE_SLOT_START } from "@/lib/templates/signature-slot"

function branded(content: string, signature = ""): string {
  return `<html><head><style>p { color: red; }</style></head><body><div>logo</div>${CONTENT_SLOT_START}${content}${CONTENT_SLOT_END}${SIGNATURE_SLOT_START}${signature}${SIGNATURE_SLOT_END}</body></html>`
}

describe("brandedEmailToPlainText", () => {
  it("turns <br> into a line break and keeps paragraphs apart", () => {
    const text = brandedEmailToPlainText(
      branded(
        "<p>Dear Mr Monyeki</p><p><strong>Availability</strong><br>On the <strong>Pretoria → Cape Town</strong> departure, we can assist.</p>",
      ),
    )
    expect(text).toBe("Dear Mr Monyeki\n\nAvailability\nOn the Pretoria → Cape Town departure, we can assist.")
  })

  it("does not break a sentence that sits in one paragraph", () => {
    const sentence =
      "Please find your travel quotation attached. Should you have any questions or wish to make changes, feel free to get in touch."
    expect(brandedEmailToPlainText(branded(`<p>${sentence}</p>`))).toBe(sentence)
  })

  it("decodes entities, including numeric ones", () => {
    const text = brandedEmailToPlainText(branded("<p>Luxus Travel &amp; Tours&nbsp;&#8211; it&#39;s &lt;ready&gt;</p>"))
    expect(text).toBe("Luxus Travel & Tours – it's <ready>")
  })

  it("lists items on their own lines", () => {
    const text = brandedEmailToPlainText(branded("<p>Includes:</p><ul><li>Meals</li><li>Transfers</li></ul>"))
    expect(text).toBe("Includes:\n\n- Meals\n- Transfers")
  })

  it("appends the signature after a blank line and leaves out the head CSS and masthead", () => {
    const text = brandedEmailToPlainText(
      branded("<p>Kind regards</p>", "<table><tbody><tr><td>Leonie</td></tr><tr><td>Sales</td></tr></tbody></table>"),
    )
    expect(text).toBe("Kind regards\n\nLeonie\nSales")
    expect(text).not.toContain("color: red")
    expect(text).not.toContain("logo")
  })

  it("falls back to the whole body, minus the head, when the slots are missing", () => {
    const text = brandedEmailToPlainText("<html><head><style>p{}</style></head><body><p>One</p><p>Two</p></body></html>")
    expect(text).toBe("One\n\nTwo")
  })
})
