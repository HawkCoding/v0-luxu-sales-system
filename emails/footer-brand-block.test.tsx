import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { DocumentBrand } from "@/lib/settings-access"
import { BaseLayout } from "./base-layout"
import { FOOTER_BRAND_RESPONSIVE_CSS, FooterBrandBlock } from "./footer-brand-block"

const BRAND: DocumentBrand = {
  heading: "THE BLUE TRAIN - ROVOS RAIL - KRUGER SHALATI",
  subheading: "A division of Luxus Travel & Tours",
  logoUrl: "https://example.com/seal.png",
}

function headingStyle(html: string): string {
  return html.match(/<p[^>]*style="([^"]*)"[^>]*>THE BLUE TRAIN/)?.[1] ?? ""
}

describe("FooterBrandBlock", () => {
  it("pins the seal's cell and image to full size so a phone can't squeeze it", () => {
    const html = renderToStaticMarkup(<FooterBrandBlock brand={BRAND} />)
    const cell = html.match(/<td[^>]*>\s*<img[^>]*>/)?.[0] ?? ""

    expect(cell).toContain('width="90"')
    expect(cell).toMatch(/<td[^>]*min-width:\s*72px/)
    expect(cell).toMatch(/<img[^>]*min-width:\s*72px/)
    expect(cell).toMatch(/<img[^>]*width="72"/)
  })

  it("renders no seal cell without a logo", () => {
    const html = renderToStaticMarkup(<FooterBrandBlock brand={{ ...BRAND, logoUrl: null }} />)
    expect(html).not.toContain("<img")
    expect(html).toContain("KRUGER SHALATI")
  })

  it("sizes the heading to fit one line beside the seal on a desktop", () => {
    const style = headingStyle(renderToStaticMarkup(<FooterBrandBlock brand={BRAND} />))

    expect(style).toMatch(/font-size:\s*16px/)
    expect(style).toMatch(/line-height:\s*22px/)
    expect(style).toMatch(/letter-spacing:\s*0/)
    // No forced single line: a narrow pane or a phone has to be able to wrap it.
    expect(style).not.toContain("nowrap")
  })

  it("tags the cells so the phone rule can stack them", () => {
    const html = renderToStaticMarkup(<FooterBrandBlock brand={BRAND} />)

    expect(html).toMatch(/<td[^>]*class="luxus-brand-seal-cell"/)
    expect(html).toMatch(/<img[^>]*class="luxus-brand-seal"/)
    expect(html).toMatch(/<td[^>]*class="luxus-brand-text-cell"/)
  })
})

describe("FOOTER_BRAND_RESPONSIVE_CSS", () => {
  it("stacks the seal above the text on phones only", () => {
    expect(FOOTER_BRAND_RESPONSIVE_CSS).toMatch(/^@media only screen and \(max-width: 480px\) \{/)
    expect(FOOTER_BRAND_RESPONSIVE_CSS).toContain(
      ".luxus-brand-seal-cell, .luxus-brand-text-cell { display: block; }",
    )
    // Mirrors the inline 18px right-hand gap so the stacked seal stays centred.
    expect(FOOTER_BRAND_RESPONSIVE_CSS).toContain("padding-left: 18px; padding-bottom: 10px;")
    expect(FOOTER_BRAND_RESPONSIVE_CSS).not.toContain("!important")
  })

  it("never shrinks the seal when stacked", () => {
    const rules = FOOTER_BRAND_RESPONSIVE_CSS.replace(/^@media[^{]*\{/, "")
    expect(rules).not.toMatch(/width|font-size/)
  })

  it("ships in the email head", () => {
    const html = renderToStaticMarkup(
      <BaseLayout brand={BRAND} preview="Hi">
        <p>Body</p>
      </BaseLayout>,
    )
    const head = html.split("</style>")[0]

    expect(head).toContain(FOOTER_BRAND_RESPONSIVE_CSS)
  })
})
