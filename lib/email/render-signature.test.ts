import { describe, expect, it } from "vitest"
import { renderSignatureFragment } from "./render-signature"
import type { ResolvedEmailSignature } from "./signature"

const BASE: ResolvedEmailSignature = {
  profileId: "profile-1",
  brandId: "brand-1",
  fullName: "Leonie Burke",
  jobTitle: "Tour Operating Consultant",
  tel: "+27 (0)21 100 3596",
  cell: "+27 (0)81 580 6471",
  fax: null,
  email: "reservations2@sa-rail.co.za",
  website: "www.sa-rail.co.za",
  brand: {
    id: "brand-1",
    slug: "sa-rail",
    name: "SA Rail",
    bannerUrl: "https://cdn.example.com/banner.png",
    bannerWidth: 480,
    bannerHeight: 120,
    badges: [],
    companyLine: "SA-Rail is a division of Luxus Travel & Tours.",
    registrationLine: "Registered in South Africa CK2007/049324/23",
    tradingHours: "Trading Hours: Mon – Fri 08h30 to 16h00",
    divisionsLine: "DIVISIONS OF LUXUS TRAVEL & TOURS",
    confidentiality: "CONFIDENTIALITY CAUTION: ...",
    officeAddress: null,
  },
}

describe("renderSignatureFragment", () => {
  it("never renders a 'Kind regards' sign-off — that stays in the template body", async () => {
    const html = await renderSignatureFragment(BASE)
    expect(html).not.toContain("Kind regards")
  })

  it("omits the Fax line when fax is null", async () => {
    const html = await renderSignatureFragment(BASE)
    expect(html).not.toContain("Fax:")
    expect(html).toContain("Tel:")
    expect(html).toContain("Cell:")
  })

  it("omits the contact paragraph entirely when all three phones are null", async () => {
    const html = await renderSignatureFragment({ ...BASE, tel: null, cell: null, fax: null })
    expect(html).not.toContain("Tel:")
    expect(html).not.toContain("Cell:")
    expect(html).not.toContain("Fax:")
  })

  it("italicizes only the job title, not the '|' separator before it", async () => {
    const html = await renderSignatureFragment(BASE)
    expect(html).toMatch(/<strong>Leonie Burke<\/strong>\s*\|\s*<span[^>]*font-style:italic[^>]*>Tour Operating Consultant<\/span>/)
  })

  it("drops the leading '|' when registrationLine is null", async () => {
    const html = await renderSignatureFragment({
      ...BASE,
      brand: { ...BASE.brand, registrationLine: null },
    })
    expect(html).not.toMatch(/\|\s*Trading Hours/)
    expect(html).toContain("Trading Hours")
  })

  it("renders the office address only when set", async () => {
    const withoutAddress = await renderSignatureFragment(BASE)
    expect(withoutAddress).not.toContain("Rovos Rail House")

    const withAddress = await renderSignatureFragment({
      ...BASE,
      brand: { ...BASE.brand, officeAddress: "Rovos Rail House, Pretoria" },
    })
    expect(withAddress).toContain("Rovos Rail House")
  })

  it("renders no badge table when badges is empty", async () => {
    // <Section> itself renders as a <table>, so assert no *additional* table
    // (the badge row) is emitted, rather than no <table> at all.
    const withoutBadges = await renderSignatureFragment(BASE)
    const withBadges = await renderSignatureFragment({
      ...BASE,
      brand: {
        ...BASE.brand,
        badges: [{ url: "https://cdn.example.com/badge.png", alt: "IATA", href: null, width: 40, height: 40 }],
      },
    })
    const countTables = (html: string) => (html.match(/<table/g) ?? []).length
    expect(countTables(withBadges)).toBe(countTables(withoutBadges) + 1)
  })

  it("gives every img a width, height, alt and max-width", async () => {
    const html = await renderSignatureFragment({
      ...BASE,
      brand: {
        ...BASE.brand,
        badges: [
          {
            url: "https://cdn.example.com/badge.png",
            alt: "IATA",
            href: "https://iata.org",
            width: 60,
            height: 30,
          },
        ],
      },
    })
    const imgs = html.match(/<img[^>]*>/g) ?? []
    expect(imgs.length).toBeGreaterThanOrEqual(2)
    for (const img of imgs) {
      expect(img).toMatch(/width="/)
      expect(img).toMatch(/height="/)
      expect(img).toMatch(/alt="/)
      expect(img).toMatch(/max-width/)
    }
  })

  it("wraps a badge with an href in an <a> link", async () => {
    const html = await renderSignatureFragment({
      ...BASE,
      brand: {
        ...BASE.brand,
        badges: [
          {
            url: "https://cdn.example.com/badge.png",
            alt: "IATA",
            href: "https://iata.org",
            width: 60,
            height: 30,
          },
        ],
      },
    })
    expect(html).toMatch(/<a[^>]*href="https:\/\/iata\.org"[^>]*>\s*<img/)
  })

  it("never leaves the react-email default 24px line-height on the sender lines", async () => {
    const html = await renderSignatureFragment(BASE)
    expect(html).not.toContain("line-height:24px")
  })

  it("stacks name, contact, and email/web in a single paragraph joined by <br>", async () => {
    const html = await renderSignatureFragment(BASE)
    const senderBlock = html.slice(0, html.indexOf("<img"))
    expect(senderBlock.match(/<p/g)?.length).toBe(1)
    expect(senderBlock.match(/<br/g)?.length).toBe(2)
  })

  it("renders no leading <br> when there are no phone numbers", async () => {
    const html = await renderSignatureFragment({ ...BASE, tel: null, cell: null, fax: null })
    const senderBlock = html.slice(0, html.indexOf("<img"))
    expect(senderBlock.match(/<br/g)?.length).toBe(1)
  })

  it("renders zero <br> for a name-only signature", async () => {
    const html = await renderSignatureFragment({
      ...BASE,
      tel: null,
      cell: null,
      fax: null,
      email: null,
      website: null,
    })
    const senderBlock = html.slice(0, html.indexOf("<img"))
    expect(senderBlock).not.toContain("<br")
  })
})
