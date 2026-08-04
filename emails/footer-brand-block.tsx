import { Img, Section, Text } from "@react-email/components"
import {
  FOOTER_BRAND_ALT,
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import type { DocumentBrand } from "@/lib/settings-access"

interface FooterBrandBlockProps {
  /** Resolved brand copy + absolute logo URL. Omitted falls back to constants. */
  brand?: DocumentBrand
}

/**
 * SARAIL brand chrome in the email footer. Not wrapped in the `.luxus-content`
 * class — the sender's font settings scale their message body, not the mark.
 */
export function FooterBrandBlock({ brand }: FooterBrandBlockProps) {
  const heading = brand?.heading ?? FOOTER_BRAND_PRODUCT_LINE
  const subheading = brand?.subheading ?? FOOTER_BRAND_DIVISION_LINE
  const logoUrl = brand?.logoUrl ?? null

  return (
    <Section style={block}>
      <table align="center" role="presentation" cellPadding={0} cellSpacing={0} style={table}>
        <tbody>
          <tr>
            {logoUrl ? (
              <td style={sealCell}>
                <Img alt={FOOTER_BRAND_ALT} height="72" src={logoUrl} style={seal} width="72" />
              </td>
            ) : null}
            <td style={textCell}>
              <Text style={divisionLine}>{heading}</Text>
              <Text style={productLine}>{subheading}</Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

const block = {
  textAlign: "center" as const,
}

const table = {
  margin: "0 auto",
}

const sealCell = {
  paddingRight: "18px",
  verticalAlign: "middle" as const,
}

const seal = {
  display: "block",
  objectFit: "contain" as const,
}

const textCell = {
  verticalAlign: "middle" as const,
  textAlign: "center" as const,
}

const divisionLine = {
  margin: "0",
  color: "#3d3831",
  fontSize: "19px",
  lineHeight: "26px",
}

const productLine = {
  margin: "4px 0 0",
  color: "#8a7f74",
  fontSize: "11px",
  lineHeight: "15px",
  letterSpacing: "1px",
}
