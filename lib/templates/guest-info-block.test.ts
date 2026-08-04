import { describe, expect, it } from "vitest"
import { buildGuestInfoBlock } from "@/lib/templates/guest-info-block"

describe("buildGuestInfoBlock", () => {
  it("lists each named traveller with their ID number", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: "smith@example.test",
      guests: [
        { name: "Mr John Smith", idNumber: "8001015800083" },
        { name: "Mrs Jane Smith", idNumber: "8203125800084" },
      ],
      adults: 2,
      children: 0,
    })

    expect(html).not.toContain("Booking contact")
    expect(html).not.toContain("smith@example.test")
    expect(html).toContain("Mr John Smith ID: 8001015800083")
    expect(html).toContain("Mrs Jane Smith ID: 8203125800084")
    expect(html).not.toContain("<strong>Guests:</strong>")
  })

  it("flags a guest with no ID number on file instead of omitting them", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: null,
      guests: [
        { name: "Mr John Smith", idNumber: "8001015800083" },
        { name: "Miss Amy Smith", idNumber: null },
      ],
      adults: 1,
      children: 1,
    })

    expect(html).toContain("Mr John Smith ID: 8001015800083")
    expect(html).toContain("Miss Amy Smith ID not yet on file")
  })

  it("falls back to adult/child counts when no travellers are captured yet", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: null,
      guests: [],
      adults: 2,
      children: 1,
    })

    expect(html).toContain("2 Adults, 1 Child")
    expect(html).not.toContain("ID:")
  })

  it("escapes HTML in names and ID numbers", () => {
    const html = buildGuestInfoBlock({
      customerName: "<script>alert(1)</script>",
      customerEmail: null,
      guests: [{ name: "<b>Evil</b>", idNumber: "<img src=x>" }],
      adults: 0,
      children: 0,
    })

    expect(html).not.toContain("<b>Evil</b>")
    expect(html).not.toContain("<img src=x>")
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;")
  })
})
