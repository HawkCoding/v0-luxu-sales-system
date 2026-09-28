import fs from "fs"
import path from "path"
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer"
import { DOCUMENT_FOOTER_BRAND_NAME } from "@/lib/assets/footer-brand"
import type { NestedBulletLine } from "@/lib/inclusions/bullet-lines"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { DESIGN_BODY_FAMILY, DESIGN_DISPLAY_FONT } from "@/lib/pdf/document-fonts"
import type { BankingSettings, DocumentBrand } from "@/lib/settings-access"

// Shared chrome for the SA-Rail document design (Figma "SA-Rail new Templates"): the patterned
// Angora page, the letterhead on the first page, the Swirl boxes, bullets and the company footer on
// the last page. Every measurement is in PDF points, read off the designer's exported PDFs.

export const DESIGN_COLORS = {
  /** Angora 500 — every page background. */
  page: "#e8e5df",
  /** Swirl 50 — every box. */
  box: "#fbfaf9",
  /** Body text and rules. */
  ink: "#1e1f22",
  /** Letterhead lines. */
  brand: "#252d32",
  /** Company footer. */
  footer: "#515865",
} as const

export const PAGE_WIDTH = 595.28
export const PAGE_HEIGHT = 841.89
export const BOX_RADIUS = 15.75
export const RULE_WIDTH = 0.75

/** Where every page after the first starts its content (the letterhead only prints on page 1). */
export const PAGE_TOP = 55
/** The lowest point content may reach on a page. */
export const PAGE_BOTTOM = 28

/** The letterhead's height from the top edge of the page — first-page content starts below it. */
export const HEADER_HEIGHT = 80

const FOOTER_FONT_SIZE = 6
const FOOTER_LINE_HEIGHT = 8.2
const FOOTER_BOTTOM = 20
const FOOTER_MAX_LINES = 6
const FOOTER_TOP = PAGE_HEIGHT - FOOTER_BOTTOM - FOOTER_MAX_LINES * FOOTER_LINE_HEIGHT
/** Room the last block keeps free beneath itself so it never runs into the footer. */
export const FOOTER_CLEARANCE = PAGE_HEIGHT - PAGE_BOTTOM - (FOOTER_TOP - 12)

export const BOLD = { fontFamily: DESIGN_BODY_FAMILY, fontWeight: 700 } as const
export const REGULAR = { fontFamily: DESIGN_BODY_FAMILY, fontWeight: 400 } as const

export interface DocumentImage {
  data: Buffer
  format: "png" | "jpg"
}

let backgroundCache: DocumentImage | null | undefined

/**
 * The page background — Angora 500 with the designer's track-pattern overlay, flattened to one
 * image at the exact crop the templates use. Read once per process; a missing file degrades to the
 * plain Angora fill the Page itself paints, never to a failed render.
 */
export function documentPageBackground(): DocumentImage | null {
  if (backgroundCache !== undefined) return backgroundCache
  try {
    const file = path.join(process.cwd(), "assets", "brand", "document-background.jpg")
    backgroundCache = { data: fs.readFileSync(file), format: "jpg" }
  } catch {
    backgroundCache = null
  }
  return backgroundCache
}

const styles = StyleSheet.create({
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
  backgroundImage: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
  logo: {
    position: "absolute",
    left: 36.4,
    top: 14.2,
    width: 67.5,
    height: 66,
    objectFit: "contain",
  },
  // The heading and sub-heading centre on the space right of the seal, as the templates set them.
  heading: {
    position: "absolute",
    left: 104,
    right: 26.3,
    top: 32.1,
    fontFamily: DESIGN_DISPLAY_FONT,
    fontSize: 17.37,
    color: DESIGN_COLORS.brand,
    textAlign: "center",
  },
  subheading: {
    position: "absolute",
    left: 104,
    right: 58.7,
    top: 55.8,
    ...REGULAR,
    fontSize: 8.78,
    color: DESIGN_COLORS.brand,
    textAlign: "center",
  },
  // Anchored by `bottom` with no lineHeight/height: react-pdf silently drops a dynamic (render-prop)
  // text that carries either. Manrope's natural 6pt line (8.2pt) is the template's 8pt pitch.
  footer: {
    position: "absolute",
    bottom: FOOTER_BOTTOM,
    left: 0,
    right: 0,
    ...REGULAR,
    fontSize: FOOTER_FONT_SIZE,
    color: DESIGN_COLORS.footer,
    textAlign: "center",
  },
  bulletRow: {
    flexDirection: "row",
  },
  dot: {
    width: 2.7,
    height: 2.7,
    borderRadius: 1.35,
    backgroundColor: DESIGN_COLORS.ink,
  },
  ring: {
    width: 3.2,
    height: 3.2,
    borderRadius: 1.6,
    borderWidth: 0.8,
    borderColor: DESIGN_COLORS.ink,
  },
})

/** Pattern + Angora fill behind every page. Must be the Page's first child so it paints beneath. */
export function PageBackground() {
  const image = documentPageBackground()
  return (
    <View fixed style={styles.background}>
      {image ? <Image src={image} style={styles.backgroundImage} /> : null}
    </View>
  )
}

export interface PagePadding {
  top: number
  left: number
  right: number
}

interface DocumentHeaderProps {
  brand: DocumentBrand
  logo: BrandLogoImage | null
  /** The Page's own padding, so the letterhead can sit at the page's true top-left. */
  padding: PagePadding
}

/**
 * The letterhead: seal top-left, the brand heading in Cormorant Garamond and the division line
 * beneath it. First page only — it sits in the normal flow, never `fixed`.
 */
export function DocumentHeader({ brand, logo, padding }: DocumentHeaderProps) {
  return (
    <View
      style={{
        marginTop: -padding.top,
        marginLeft: -padding.left,
        marginRight: -padding.right,
        height: HEADER_HEIGHT,
      }}
    >
      {logo ? <Image src={logo} style={styles.logo} /> : null}
      {brand.heading ? <Text style={styles.heading}>{brand.heading}</Text> : null}
      {brand.subheading ? <Text style={styles.subheading}>{brand.subheading}</Text> : null}
    </View>
  )
}

/**
 * The company footer, printed at the foot of the last page only (the templates' multipage rule).
 * `fixed` so react-pdf offers it to every page; the render prop blanks it on all but the last.
 */
export function DocumentFooter({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  const text = lines.slice(0, FOOTER_MAX_LINES).join("\n")
  return (
    <Text
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) => (pageNumber === totalPages ? text : "")}
    />
  )
}

/**
 * Empty space kept under the document's closing block. Wrap it with that block in one
 * `wrap={false}` View: if the pair cannot fit above the footer, both move to a fresh last page, so
 * the footer never prints over content.
 */
export function FooterClearance() {
  return <View style={{ height: FOOTER_CLEARANCE }} />
}

/** The company details the footer prints — the same fields the invoice has always carried. */
export interface DocumentFooterCompany {
  tel?: string | null
  cell?: string | null
  fax?: string | null
  email?: string | null
  website?: string | null
  regNumber?: string | null
  vatNumber?: string | null
}

export function footerCompanyFromBanking(banking: Partial<BankingSettings> | null | undefined): DocumentFooterCompany {
  return {
    tel: banking?.company_tel,
    cell: banking?.company_cell,
    fax: banking?.company_fax,
    email: banking?.company_email,
    website: banking?.company_website,
    regNumber: banking?.company_reg_number,
    vatNumber: banking?.company_vat_number,
  }
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

interface FooterLineOptions {
  /** The brand's division line, e.g. "A division of Luxus Travel & Tours". */
  division?: string | null
  /** Year printed after the copyright mark. */
  year: number
  /**
   * Adds the VAT number to the registration line. Only the invoice asks: the templates' footer has
   * no VAT number, but a tax invoice must still name the supplier's.
   */
  includeVatNumber?: boolean
}

/**
 * The templates' footer, line by line: "©SA Rail 2026", the division, contact numbers, e-mail,
 * website and company registration. The postal address is deliberately absent — the design brief
 * says the footer matches the itineraries and carries no address. Unset settings drop out.
 */
export function buildDocumentFooterLines(company: DocumentFooterCompany, options: FooterLineOptions): string[] {
  const numbers = [clean(company.tel), clean(company.cell)].filter(Boolean)
  const fax = clean(company.fax)
  const numbersLine = [...numbers, ...(fax ? [`Fax: ${fax}`] : [])].join(" | ")
  const reg = clean(company.regNumber)
  const vat = options.includeVatNumber ? clean(company.vatNumber) : ""
  const regLine = [reg ? `RSA Co Reg: ${reg}` : "", vat ? `VAT No: ${vat}` : ""].filter(Boolean).join(" | ")

  return [
    `©${DOCUMENT_FOOTER_BRAND_NAME} ${options.year}`,
    clean(options.division),
    numbersLine ? `Contact Numbers: ${numbersLine}` : "",
    clean(company.email) ? `Email: ${clean(company.email)}` : "",
    clean(company.website) ? `Website: ${clean(company.website)}` : "",
    regLine,
  ].filter(Boolean)
}

/**
 * Settings store document titles in capitals ("QUOTATION", "TRAVEL VOUCHERS"); the design sets
 * them in title case. An all-capitals value is converted; anything an admin typed in mixed case is
 * left exactly as typed.
 */
export function displayDocumentTitle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed !== trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) return trimmed
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`)
}

/** "Label" → "Label:" — every label in the design carries its colon. */
export function withColon(label: string): string {
  const trimmed = label.trim()
  return trimmed.endsWith(":") ? trimmed : `${trimmed}:`
}

/**
 * The template's wording for the shared voucher/invoice row labels (lib/voucher/service-block-rows.ts
 * keys its rows by the older wording, which the HTML preview and the invoice's row filters still
 * match on, so the rename happens only where the PDF prints them).
 */
const DESIGN_ROW_LABELS: Record<string, string> = {
  "Pick Up": "Pick up",
  "Drop-off": "Drop Off",
  "Check-In": "Check-in",
  "No of Guests": "Number of Guests",
  Infant: "Infants",
  Qty: "QTY",
}

export function designRowLabel(label: string): string {
  return withColon(DESIGN_ROW_LABELS[label.trim()] ?? label)
}

interface BulletRowProps {
  text: string
  /** Hollow ring for a second-level bullet, filled dot otherwise. */
  hollow?: boolean
  /** No mark at all — a label heading a group of bullets. */
  plain?: boolean
  bold?: boolean
  fontSize?: number
  /** Distance from the row's left edge to the bullet. */
  bulletLeft: number
  /** Distance from the row's left edge to the text. */
  textLeft: number
}

/**
 * A nested list (lib/inclusions/bullet-lines.ts nestBulletLines): dots at the column's edge, rings
 * one step in, group labels unbulleted and flush with the dots — the quote's Travel Package Details
 * and the itinerary's inclusions.
 */
export function NestedBulletList({ lines }: { lines: NestedBulletLine[] }) {
  return (
    <>
      {lines.map((line, index) =>
        line.level === 0 ? (
          <View key={index} style={index > 0 ? { marginTop: 3 } : undefined}>
            <BulletRow text={line.text} bold plain bulletLeft={0} textLeft={0} />
          </View>
        ) : (
          <BulletRow
            key={index}
            text={line.text}
            bold={line.bold}
            hollow={line.level === 2}
            bulletLeft={line.level === 2 ? 14.1 : 0}
            textLeft={line.level === 2 ? 23.9 : 10.3}
          />
        ),
      )}
    </>
  )
}

/** The template's bullet lists run on a 10.67pt pitch at 8pt (Manrope's own line is 10.93pt). */
const BULLET_LINE_HEIGHT = 10.67 / 8

/** One bulleted line: a small filled dot (or ring) centred on the first line's x-height. */
export function BulletRow({
  text,
  hollow = false,
  plain = false,
  bold = false,
  fontSize = 8,
  bulletLeft,
  textLeft,
}: BulletRowProps) {
  const markSize = hollow ? 3.2 : 2.7
  // Centre the mark on the lower-case letters of the first line.
  const markTop = fontSize * 0.72 - markSize / 2
  return (
    <View style={styles.bulletRow} wrap={false}>
      <View style={{ width: textLeft, paddingLeft: bulletLeft, paddingTop: markTop }}>
        {plain ? null : <View style={hollow ? styles.ring : styles.dot} />}
      </View>
      <Text
        style={{ ...(bold ? BOLD : REGULAR), flex: 1, fontSize, lineHeight: BULLET_LINE_HEIGHT, color: DESIGN_COLORS.ink }}
      >
        {text}
      </Text>
    </View>
  )
}
