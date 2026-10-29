import fs from "fs"
import path from "path"
import { Fragment } from "react"
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer"
import type { NestedBulletLine } from "@/lib/inclusions/bullet-lines"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { DESIGN_BODY_FAMILY, DESIGN_DISPLAY_FONT } from "@/lib/pdf/document-fonts"
import type { BankingSettings, DocumentBrand } from "@/lib/settings-access"

// Shared chrome for the SA-Rail document design (Figma "SA-Rail new Templates"): the patterned
// Angora page, the letterhead and the company footer on the first page, the Swirl boxes and
// bullets. Every measurement is in PDF points, read off the designer's exported PDFs.

export const DESIGN_COLORS = {
  /** Angora 500 — every page background. */
  page: "#e8e5df",
  /** Swirl 50 — every box. */
  box: "#fbfaf9",
  /** Body text, rules and the company footer. */
  ink: "#1e1f22",
  /** Letterhead lines. */
  brand: "#252d32",
} as const

export const PAGE_WIDTH = 595.28
export const PAGE_HEIGHT = 841.89
export const BOX_RADIUS = 15.75
export const RULE_WIDTH = 0.75

/** Where every page after the first starts its content (the letterhead only prints on page 1). */
export const PAGE_TOP = 55

/** The letterhead's height from the top edge of the page — first-page content starts below it. */
export const HEADER_HEIGHT = 80

const FOOTER_FONT_SIZE = 7
/** Manrope's natural line at 7pt. */
const FOOTER_LINE_HEIGHT = 9.6
const FOOTER_BOTTOM = 20
/** Address, contacts, registration. */
const FOOTER_MAX_LINES = 3
const FOOTER_GAP = 10

/**
 * The lowest point content may reach on a page: clear of the company footer on page 1. Content
 * flows from page to page, so every page keeps the same margin — a page can't know in advance
 * whether it will be the first.
 */
export const PAGE_BOTTOM = FOOTER_BOTTOM + FOOTER_MAX_LINES * FOOTER_LINE_HEIGHT + FOOTER_GAP

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
  // Anchored by `bottom` with no lineHeight/height: react-pdf silently drops dynamic (render-prop)
  // content that carries either, so the lines keep Manrope's natural line.
  footer: {
    position: "absolute",
    bottom: FOOTER_BOTTOM,
    left: 0,
    right: 0,
  },
  footerLine: {
    ...REGULAR,
    fontSize: FOOTER_FONT_SIZE,
    color: DESIGN_COLORS.ink,
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

/** One run of a footer line: a bold label ("Tel:") and the value after it. */
export interface FooterSegment {
  label?: string
  value: string
}

/** A footer line's runs and what separates them ("Tel: … • Cell: …"). */
export interface FooterLine {
  segments: FooterSegment[]
  separator: string
}

/**
 * The company footer, printed at the foot of the first page only (client request 2026-10-07 —
 * it used to sit on the last). `fixed` so react-pdf offers it to every page; the render prop
 * leaves it out on all but page 1. PAGE_BOTTOM keeps every page's content clear of it.
 */
export function DocumentFooter({ lines }: { lines: FooterLine[] }) {
  if (lines.length === 0) return null
  const content = (
    <View>
      {lines.slice(0, FOOTER_MAX_LINES).map((line, lineIndex) => (
        <Text key={lineIndex} style={styles.footerLine}>
          {line.segments.map((segment, index) => (
            <Fragment key={index}>
              {index > 0 ? line.separator : ""}
              {segment.label ? <Text style={BOLD}>{`${segment.label} `}</Text> : null}
              {segment.value}
            </Fragment>
          ))}
        </Text>
      ))}
    </View>
  )
  return <View fixed style={styles.footer} render={({ pageNumber }) => (pageNumber === 1 ? content : null)} />
}

/** The company details the footer prints — the payment method's company fields. */
export interface DocumentFooterCompany {
  /** Multi-line in Settings; printed on one line, its lines joined with commas. */
  address?: string | null
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
    address: banking?.company_address,
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

function segment(label: string, value: string | null | undefined): FooterSegment[] {
  const text = clean(value)
  return text ? [{ label, value: text }] : []
}

/**
 * The footer the client specified on 2026-10-07, the same on every document:
 *
 *   Address: No 6 Oostewal Business Centre, …, South Africa 7357
 *   Tel: … • Cell: … • Email: … • Web: sa-rail.co.za • Web: luxustravel.co.za
 *   Company Registration CK2007/049324/23 | VAT number 4580275016
 *
 * The website field may hold several sites (comma- or space-separated), one "Web:" each. Unset
 * settings drop out, and so does a line left with nothing on it.
 */
export function buildDocumentFooterLines(company: DocumentFooterCompany): FooterLine[] {
  const address = clean(company.address)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")
  const websites = clean(company.website).split(/[\s,;]+/).filter(Boolean)

  const lines: FooterLine[] = [
    { segments: segment("Address:", address), separator: "" },
    {
      segments: [
        ...segment("Tel:", company.tel),
        ...segment("Cell:", company.cell),
        ...segment("Fax:", company.fax),
        ...segment("Email:", company.email),
        ...websites.flatMap((site) => segment("Web:", site)),
      ],
      separator: " • ",
    },
    {
      segments: [
        ...segment("Company Registration", company.regNumber),
        ...segment("VAT number", company.vatNumber),
      ],
      separator: " | ",
    },
  ]
  return lines.filter((line) => line.segments.length > 0)
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
