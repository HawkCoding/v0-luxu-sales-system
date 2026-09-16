import { describe, expect, it } from "vitest"
import { buildGuestInfoBlock } from "@/lib/templates/guest-info-block"

describe("buildGuestInfoBlock", () => {
  it("lists each named traveller with DOB, country code and ID number", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Adams",
      customerEmail: "adams@example.test",
      guests: [
        { name: "Mr John Adams", dateOfBirth: "1959-09-27", countryCode: "UK", idNumber: "155510783" },
        { name: "Mrs Caron Adams", dateOfBirth: "1963-01-30", countryCode: "UK", idNumber: "128860381" },
      ],
      adults: 2,
      children: 0,
    })

    expect(html).not.toContain("Booking contact")
    expect(html).not.toContain("adams@example.test")
    expect(html).toContain("Mr John Adams DOB: 27/09/1959 UK 155510783")
    expect(html).toContain("Mrs Caron Adams DOB: 30/01/1963 UK 128860381")
    expect(html).not.toContain("<strong>Guests:</strong>")
  })

  it("flags a guest with no passport/ID number on file instead of omitting them", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: null,
      guests: [
        { name: "Mr John Smith", dateOfBirth: "1980-01-01", countryCode: "ZA", idNumber: "8001015800083" },
        { name: "Miss Amy Smith", dateOfBirth: null, countryCode: null, idNumber: null },
      ],
      adults: 1,
      children: 1,
    })

    expect(html).toContain("Mr John Smith DOB: 01/01/1980 ZA 8001015800083")
    expect(html).toContain("Miss Amy Smith Passport/ID not yet on file")
  })

  it("omits DOB and country when not captured, without dropping the ID number", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: null,
      guests: [{ name: "Mr John Smith", dateOfBirth: null, countryCode: null, idNumber: "8001015800083" }],
      adults: 1,
      children: 0,
    })

    expect(html).toContain("Mr John Smith 8001015800083")
    expect(html).not.toContain("DOB:")
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
    expect(html).not.toContain("DOB:")
  })

  it("escapes HTML in names, country codes and ID numbers", () => {
    const html = buildGuestInfoBlock({
      customerName: "<script>alert(1)</script>",
      customerEmail: null,
      guests: [
        { name: "<b>Evil</b>", dateOfBirth: null, countryCode: "<i>ZZ</i>", idNumber: "<img src=x>" },
      ],
      adults: 0,
      children: 0,
    })

    expect(html).not.toContain("<b>Evil</b>")
    expect(html).not.toContain("<img src=x>")
    expect(html).not.toContain("<i>ZZ</i>")
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;")
  })
})
