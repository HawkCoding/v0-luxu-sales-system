import { describe, expect, it } from "vitest"
import { buildGuestInfoBlock } from "@/lib/templates/guest-info-block"

describe("buildGuestInfoBlock", () => {
  it("lists named travellers when captured", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: "smith@example.test",
      guestNames: ["Mr John Smith", "Mrs Jane Smith"],
      adults: 2,
      children: 0,
    })

    expect(html).toContain("Mr Smith")
    expect(html).toContain("smith@example.test")
    expect(html).toContain("Mr John Smith, Mrs Jane Smith")
    expect(html).toContain('data-label="Guest Information"')
  })

  it("falls back to adult/child counts when no travellers are captured yet", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: null,
      guestNames: [],
      adults: 2,
      children: 1,
    })

    expect(html).toContain("2 Adults, 1 Child")
    expect(html).not.toContain("(")
  })

  it("escapes HTML in names", () => {
    const html = buildGuestInfoBlock({
      customerName: "<script>alert(1)</script>",
      customerEmail: null,
      guestNames: [],
      adults: 0,
      children: 0,
    })

    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
