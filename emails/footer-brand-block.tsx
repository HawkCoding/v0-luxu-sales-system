import { Img, Section, Text } from "@react-email/components"
import {
  FOOTER_BRAND_ALT,
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import { EMAIL_COLORS } from "@/lib/email/email-chrome"
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
              <td className={BRAND_SEAL_CELL_CLASS} style={sealCell} width={SEAL_CELL_WIDTH}>
                <Img
                  alt={FOOTER_BRAND_ALT}
                  className={BRAND_SEAL_CLASS}
                  height="72"
                  src={logoUrl}
                  style={seal}
                  width="72"
                />
              </td>
            ) : null}
            <td className={BRAND_TEXT_CELL_CLASS} style={textCell}>
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

const SEAL_SIZE = 72
const SEAL_GAP = 18
const SEAL_CELL_WIDTH = SEAL_SIZE + SEAL_GAP
const HEADING_FONT_SIZE = 16

const BRAND_SEAL_CELL_CLASS = "luxus-brand-seal-cell"
const BRAND_SEAL_CLASS = "luxus-brand-seal"
const BRAND_TEXT_CELL_CLASS = "luxus-brand-text-cell"

/**
 * Head rule for BaseLayout: on a phone the seal stacks above the brand text so the heading gets
 * the strip's full width instead of the ~240px left beside the seal. Both cells turn into blocks
 * (a lone block cell would still sit beside the other one); the seal keeps its fixed 72px width
 * and is centred by margin. No `!important` (it would beat inline styles the head rules must not
 * touch): rather than cancel the inline right-hand gap, the rule mirrors it on the left so the
 * seal stays centred. Clients that ignore media queries (Outlook desktop, some webmail) keep the
 * side-by-side desktop layout, where the text cell simply wraps beside the full-size seal.
 */
export const FOOTER_BRAND_RESPONSIVE_CSS = `
@media only screen and (max-width: 480px) {
  .${BRAND_SEAL_CELL_CLASS}, .${BRAND_TEXT_CELL_CLASS} { display: block; }
  .${BRAND_SEAL_CELL_CLASS} { margin: 0 auto; padding-left: ${SEAL_GAP}px; padding-bottom: 10px; }
  .${BRAND_SEAL_CLASS} { margin: 0 auto; }
}`.trim()

// On a phone the long product line claims the row and the auto table layout squeezed the seal's
// cell — mail apps add `max-width: 100%` to images, so the seal shrank with it to a speck (client
// WhatsApp screenshots, 2026-10-07). A fixed cell width (attribute for Outlook, CSS for the rest)
// plus a min-width on the image keeps the seal at full size; the text cell wraps instead.
const sealCell = {
  // CSS width is the content box (the padding adds the gap); the attribute is the whole cell.
  width: `${SEAL_SIZE}px`,
  minWidth: `${SEAL_SIZE}px`,
  paddingRight: `${SEAL_GAP}px`,
  verticalAlign: "middle" as const,
}

const seal = {
  display: "block",
  width: `${SEAL_SIZE}px`,
  minWidth: `${SEAL_SIZE}px`,
  height: `${SEAL_SIZE}px`,
  objectFit: "contain" as const,
}

const textCell = {
  verticalAlign: "middle" as const,
  textAlign: "center" as const,
}

// The default 44-character heading wrapped "...KRUGER / SHALATI" at 19px (client, 2026-10-07).
// Room beside the seal on a desktop: 640px container - 2 x 24px strip padding - 90px seal cell =
// 502px. The heading's advance width is ~20.1em in Calibri, ~24.8em in Arial/Helvetica and ~26.1em
// in Verdana (the widest family on the allowlist), so at 16px it is ~321 / ~396 / ~418px — one line
// with 80px+ to spare in every family. No `nowrap`: a narrow pane or a phone must still wrap it.
const divisionLine = {
  margin: "0",
  color: "#3d3831",
  fontSize: `${HEADING_FONT_SIZE}px`,
  lineHeight: "22px",
  letterSpacing: "0",
}

const productLine = {
  margin: "4px 0 0",
  color: EMAIL_COLORS.mutedText,
  fontSize: "11px",
  lineHeight: "15px",
  letterSpacing: "1px",
}
