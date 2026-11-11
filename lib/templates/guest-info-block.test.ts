import { describe, expect, it } from "vitest"
import { buildGuestInfoBlock, childAgesForTravellers, type GuestInfoGuest } from "@/lib/templates/guest-info-block"
import { buildBookingPaxGroupsView, buildGuestHeadings } from "@/lib/pax-groups/booking-pax-groups"
import { CARMEN_DEPARTURE, carmenPaxGroupRows, carmenTravellers } from "@/lib/pax-groups/carmen-sample.fixtures"

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

  it("numbers a single-group booking's guests 1.1, 1.2 with no suite heading", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Shackley",
      customerEmail: null,
      guests: [
        { name: "Mr Duncan Shackley", dateOfBirth: "1954-08-20", countryCode: "UK", idNumber: "151261367" },
        { name: "Mrs Moira Shannon-Shackley", dateOfBirth: "1961-03-17", countryCode: "UK", idNumber: "123545329" },
      ],
      adults: 2,
      children: 0,
    })

    expect(html).toContain("1.1 Mr Duncan Shackley DOB: 20/08/1954 UK 151261367<br/>1.2 Mrs Moira Shannon-Shackley DOB: 17/03/1961 UK 123545329")
    expect(html).not.toContain("<strong")
  })

  it("numbers a lone guest 1.1", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr Smith",
      customerEmail: null,
      guests: [{ name: "Mr John Smith", dateOfBirth: null, countryCode: null, idNumber: "8001015800083" }],
      adults: 1,
      children: 0,
    })

    expect(html).toContain("1.1 Mr John Smith 8001015800083")
  })

  it("numbers a single group's guests 1.x whether or not the guests carry that group's id", () => {
    const one = { groups: [{ id: "g1", position: 1 }], headings: [{ groupId: "g1", heading: "Deluxe Suite 1" }] }
    const guests = [
      { name: "Mr A", dateOfBirth: null, countryCode: null, idNumber: "1", paxGroupId: "g1" },
      { name: "Mrs A", dateOfBirth: null, countryCode: null, idNumber: "2", paxGroupId: "g1" },
    ]
    const html = buildGuestInfoBlock({ customerName: "Mr A", customerEmail: null, guests, adults: 2, children: 0, paxGroups: one })

    expect(html).toContain("1.1 Mr A 1<br/>1.2 Mrs A 2")
    expect(html).not.toContain("Deluxe Suite 1")
  })

  it("leaves guests unnumbered when a split booking's groups failed to load", () => {
    const html = buildGuestInfoBlock({
      customerName: "Mr A",
      customerEmail: null,
      guests: [
        { name: "Mr A", dateOfBirth: null, countryCode: null, idNumber: "1", paxGroupId: "g1" },
        { name: "Mr B", dateOfBirth: null, countryCode: null, idNumber: "2", paxGroupId: "g2" },
      ],
      adults: 2,
      children: 0,
      paxGroups: null,
    })

    expect(html).not.toContain("1.1")
    expect(html).toContain("Mr A 1<br/>Mr B 2")
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

describe("buildGuestInfoBlock with pax groups", () => {
  const travellers = carmenTravellers()
  const { groupRows, services, primarySupplierId } = carmenPaxGroupRows()
  const view = buildBookingPaxGroupsView(groupRows, services, primarySupplierId)
  if (!view) throw new Error("the Carmen fixture must build a pax-group view")
  const paxGroups = { groups: view.groups, headings: buildGuestHeadings(view) }
  const ages = childAgesForTravellers(travellers, null, CARMEN_DEPARTURE)
  const guests: GuestInfoGuest[] = travellers.map((traveller, index) => ({
    name: [traveller.prefix, traveller.first_name, traveller.last_name].join(" "),
    dateOfBirth: traveller.date_of_birth,
    countryCode: traveller.residence,
    idNumber: traveller.id_passport,
    paxGroupId: traveller.pax_group_id,
    isChild: traveller.is_child,
    childAge: ages[index],
  }))
  const input = { customerName: "Mr Chen", customerEmail: null, adults: 8, children: 4 }

  /** The block as the plain-text email part reads it: one line per <br/>, a blank line per paragraph. */
  function asText(html: string): string {
    return html
      .replace(/<br\/>/g, "\n")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .trim()
  }

  it("heads every suite by its name and numbers each guest", () => {
    const text = asText(buildGuestInfoBlock({ ...input, guests, paxGroups }))

    expect(text).toBe(
      [
        "Deluxe Suite 1\n1.1 Mr Wei Lin ZA 660101 0000 088\n1.2 Mrs Mei Wang ZA 650101 0000 081",
        "Deluxe Suite 2\n2.1 Mr Jun Chen DOB: 15/01/1978 ZA A00000001\n2.2 Mrs Ling Tsai DOB: 20/02/1981 TW 300000002",
        "Deluxe Suite 3\n3.1 Mr Hao Chen DOB: 01/07/2018 TW 300000003 – CHD 8\n3.2 Ms Yun Chen DOB: 01/08/2016 TW 300000004 – CHD 10",
        "Deluxe Suite 4\n4.1 Mr Wei Lin DOB: 11/02/1980 TW 352118804\n4.2 Mrs Mei Lin DOB: 19/06/1982 ZA A10988231",
        "Deluxe Suite 5\n5.1 Master Hao Lin DOB: 02/05/2019 ZA A12773310 – CHD 7\n5.2 Miss Ling Lin DOB: 02/05/2019 ZA A12773311 – CHD 7",
        "Deluxe Suite 6\n6.1 Mr Johan van der Merwe DOB: 12/05/1970 ZA 700512 5088 083\n6.2 Mrs Anke van der Merwe DOB: 01/03/1972 ZA 720301 0177 084",
      ].join("\n\n"),
    )
  })

  it("sets each heading bold and smaller than its guests, one paragraph per suite", () => {
    const html = buildGuestInfoBlock({ ...input, guests, paxGroups })

    expect((html.match(/<strong /g) ?? []).length).toBe(6)
    expect((html.match(/<p /g) ?? []).length).toBe(6)
    expect(html).toContain('font-size:13px;line-height:19px;"><strong style="font-size:12px;">Deluxe Suite 2</strong><br/>2.1 ')
  })

  it("closes the last suite with a paragraph gap, so the template's next line never runs on", () => {
    const paragraphs = buildGuestInfoBlock({ ...input, guests, paxGroups }).match(/<p style="[^"]*"/g) ?? []

    expect(paragraphs).toHaveLength(6)
    expect(paragraphs.slice(0, -1).every((p) => p.includes("margin:0 0 4px;"))).toBe(true)
    expect(paragraphs[5]).toContain("margin:0 0 16px;")
    // The flat list is left as it was.
    expect(buildGuestInfoBlock({ ...input, guests: guests.map((guest) => ({ ...guest, paxGroupId: null })) })).not.toContain("16px")
  })

  it("lists guests not yet placed last, unnumbered, under Not yet placed", () => {
    const late = { name: "Mr Late Booker", dateOfBirth: null, countryCode: "ZA", idNumber: null, paxGroupId: null }
    const stale = { ...guests[0], name: "Mrs Old Suite", paxGroupId: "g-deleted" }
    const text = asText(buildGuestInfoBlock({ ...input, guests: [late, ...guests, stale], paxGroups }))

    expect(text.endsWith("Not yet placed\nMr Late Booker ZA Passport/ID not yet on file\nMrs Old Suite ZA 660101 0000 088")).toBe(true)
    expect(text.startsWith("Deluxe Suite 1\n1.1 Mr Wei Lin")).toBe(true)
  })

  it("prints the child marker without an age when none is known", () => {
    const child = { ...guests[4], childAge: null }
    const text = asText(buildGuestInfoBlock({ ...input, guests: [child, guests[5]], paxGroups }))

    expect(text).toContain("3.1 Mr Hao Chen DOB: 01/07/2018 TW 300000003 – CHD\n")
  })

  it("keeps an unnumbered flat list when a split booking has no guest placed in a suite yet", () => {
    const unplaced = guests.map((guest) => ({ ...guest, paxGroupId: null }))
    const flat = buildGuestInfoBlock({ ...input, guests: unplaced, paxGroups })

    expect(flat).not.toContain("1.1")
    expect(flat).not.toContain("CHD")
    expect(flat).toContain("Mr Hao Chen DOB: 01/07/2018 TW 300000003<br/>")
  })
})

describe("childAgesForTravellers", () => {
  it("reads a child's age at departure off their date of birth, else the booking's child ages in order", () => {
    expect(
      childAgesForTravellers(
        [
          { is_child: false, date_of_birth: "1980-01-01" },
          { is_child: true, date_of_birth: "2018-08-12" },
          { is_child: true, date_of_birth: null },
          { is_child: true, date_of_birth: null },
        ],
        [7, 9],
        "2026-08-11",
      ),
    ).toEqual([null, 7, 9, null])
  })

  it("turns a year older on the birthday itself", () => {
    expect(childAgesForTravellers([{ is_child: true, date_of_birth: "2018-08-11" }], null, "2026-08-11")).toEqual([8])
  })
})
