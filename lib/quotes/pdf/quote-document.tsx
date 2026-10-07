import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import { QUOTE_REFERENCE_ENABLED, QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import { formatMoney } from "@/lib/money"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { registerDocumentFonts } from "@/lib/pdf/document-fonts"
import {
  BOLD,
  BOX_RADIUS,
  BulletRow,
  DESIGN_COLORS,
  DocumentFooter,
  DocumentHeader,
  FooterClearance,
  NestedBulletList,
  PAGE_BOTTOM,
  PAGE_TOP,
  PageBackground,
  REGULAR,
  RULE_WIDTH,
  buildDocumentFooterLines,
  displayDocumentTitle,
  withColon,
  type DocumentFooterCompany,
  type PagePadding,
} from "@/lib/pdf/sarail-design"
import {
  buildQuoteDetailSections,
  uniqueDetailLines,
  withoutTrailingColon,
  type QuoteDetailBullet,
} from "@/lib/quotes/pdf/quote-details"
import { quoteJourneyHeading, type QuoteJourneyDetails } from "@/lib/quotes/pdf/quote-journey-details"
import {
  AGENT_COMMISSION_LABEL,
  buildQuoteSummaryDays,
  collectQuoteExclusions,
  DISCOUNT_LABEL,
  formatAgentCommission,
  formatDiscount,
  formatFlightCapLine,
  formatJourneyRange,
  formatPaxLabel,
  formatPreparedForContact,
  formatQuoteGrandTotalLabel,
  type QuoteSummaryItem,
} from "@/lib/quotes/quote-presentation"
import type { PerPersonTotals } from "@/lib/invoices/per-person-totals"
import type { BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"

export interface QuotePdfData {
  quoteNumber: string
  customerName: string
  /** Printed under "Client details"; blank omits the row. */
  customerPhone?: string | null
  /** Printed under "Client details"; blank omits the row. */
  customerEmail?: string | null
  quoteDate: string
  validUntil: string | null
  journeyStart: string | null
  journeyEnd: string | null
  /** The booking's own counts (bookings.no_of_adults / no_of_children, infants included) — the
   *  "Guests:" row, as the quote e-mail, invoice and voucher print them. */
  adults: number
  children: number
  /** Adults and paying children as the supplier's age buckets price them (resolvePayingPax: infants
   *  out, over-age children as adults) — the grand-total label and the per-person rows, so the label
   *  counts the people the per-person figures divide by. Absent falls back to adults/children. */
  payingPax?: { adults: number; children: number } | null
  /** The booking's main product for the "Train Journey details" box; null omits its product rows. */
  journeyDetails?: QuoteJourneyDetails | null
  /** VAT-inclusive grand total (quotes.total) — already net of agentCommission. */
  total: number
  /** "Total per Adult" / "Total per Child" — the invoice's own figures (derivePerPersonTotals in
   *  lib/invoices/per-person-totals.ts); a null side omits its line, absent prints neither. */
  perPersonTotals?: PerPersonTotals | null
  /** Gross travel price before the agency discount (quotes.subtotal). Only shown when a
   *  commission or visible discount is deducted from it. */
  subtotal?: number
  /** Flat discount given to a booking agency (quotes.agent_commission). Zero/absent renders the
   *  pricing box exactly as it did before this field existed. */
  agentCommission?: number
  /** Client-facing Discount (quotes.discount_amount). Only rendered when discountVisible is true. */
  discount?: number
  /** quotes.discount_visible — the total is net of the discount either way; this only controls
   *  whether the line prints. Defaults to true so a caller that never sets it still shows a
   *  nonzero discount. */
  discountVisible?: boolean
  /** Package itinerary; empty array omits the section entirely. */
  itineraryBlocks: VoucherServiceBlock[]
  currency?: string
  title?: string
  footerText?: string
  packageIncludesHeading?: string
  packageExcludesHeading?: string
  /** Standing exclusion appended after the suppliers' own; empty omits it. */
  packageExcludesDefault?: string
  /** Highest priced adult flight fare on the quote; null/absent omits the capped-fare bullet. */
  flightCapPerPerson?: number | null
  /** SARAIL brand block copy + logo. Omitted falls back to the fixed constants. */
  brand?: DocumentBrand
  /** "hidden" drops the letterhead; the design has no bottom slot, so "bottom" prints it on top. */
  brandPosition?: BrandBlockPosition
  brandLogo?: BrandLogoImage | null
  /** Company details for the last page's footer. */
  company?: DocumentFooterCompany
}

function formatDate(value: string | null): string {
  return formatDisplayDate(value) || "To be confirmed"
}

const DEFAULT_FOOTER_TEXT = QUOTE_VALIDITY_ENABLED
  ? "This quotation is valid until {{validUntil}} and is subject to availability. Prices are quoted in {{currency}}."
  : "This quotation is subject to availability. Prices are quoted in {{currency}}."

const DEFAULT_INCLUDES_HEADING = "Travel Package Includes"
/** The second page sets its headings without colons (client markup, 2026-10-06); the first page's
 *  labels keep theirs. */
const DETAILS_HEADING = "Travel Package Details"
const DEFAULT_EXCLUDES_HEADING = "Your Package Excludes"

function resolveFooterText(template: string, validUntil: string | null, currency: string): string {
  return template
    .replaceAll("{{validUntil}}", formatDate(validUntil))
    .replaceAll("{{currency}}", currency)
}

// Layout, in points, from the designer's quote template (A4).
const PADDING: PagePadding = { top: PAGE_TOP, left: 30.4, right: 30.28 }
const BOX_INSET = 24.3
/** The Travel Package sections run x 51.7 → 550.2. */
const SECTION_LEFT = 21.3
const SECTION_RIGHT = 14.8
/** Box columns: labels at 54.7 / 329.1, values at 155.1 / 408.8. */
const BOX_RIGHT_COLUMN = 274.4
const LEFT_LABEL = 100.4
const RIGHT_LABEL = 79.7
/** Date / title column of both package tables (51.7 → 187.5). */
const DATE_COLUMN = 135.8
/** Minimum gap a details title keeps before the bullet column; a longer title wraps instead. */
const DETAIL_TITLE_GAP = 10
/** The pricing box starts where the includes list's bullets do (187.5). */
const TOTALS_LEFT = SECTION_LEFT + DATE_COLUMN
const SMALL_LINE = 10.65 / 8
const RIGHT_LINE = 9.9 / 8
/** The details page runs x 48.5 → 547. */
const DETAILS_LEFT = 18.1
const DETAILS_RIGHT = 18

const styles = StyleSheet.create({
  page: {
    ...REGULAR,
    fontSize: 10,
    color: DESIGN_COLORS.ink,
    backgroundColor: DESIGN_COLORS.page,
    paddingTop: PADDING.top,
    paddingLeft: PADDING.left,
    paddingRight: PADDING.right,
    paddingBottom: PAGE_BOTTOM,
  },

  titleRow: {
    flexDirection: "row",
    marginTop: 8.5,
    marginLeft: BOX_INSET,
  },
  title: { ...BOLD, fontSize: 21.66, width: BOX_RIGHT_COLUMN },
  preparedFor: { flex: 1, paddingTop: 2.8 },
  row: { flexDirection: "row" },
  preparedLabel: { ...BOLD, fontSize: 10, lineHeight: 1.15, width: LEFT_LABEL },
  preparedValue: { fontSize: 10, lineHeight: 1.15, flex: 1 },

  box: {
    marginTop: 8.5,
    backgroundColor: DESIGN_COLORS.box,
    borderRadius: BOX_RADIUS,
    paddingTop: 9.6,
    paddingBottom: 12.7,
    paddingLeft: BOX_INSET,
    paddingRight: BOX_INSET,
    flexDirection: "row",
  },
  boxLeft: { width: BOX_RIGHT_COLUMN, paddingRight: 8 },
  boxRight: { flex: 1 },
  boxHeading: { ...BOLD, fontSize: 10 },
  leftLabel: { ...BOLD, fontSize: 8, lineHeight: SMALL_LINE, width: LEFT_LABEL },
  // The journey column sets its rows a little tighter (9.9pt) than the client column, as drawn.
  rightLabel: { ...BOLD, fontSize: 8, lineHeight: RIGHT_LINE, width: RIGHT_LABEL },
  rightValue: { fontSize: 8, lineHeight: RIGHT_LINE, flex: 1 },
  smallValue: { fontSize: 8, lineHeight: SMALL_LINE, flex: 1 },

  section: {
    marginLeft: SECTION_LEFT,
    marginRight: SECTION_RIGHT,
  },
  sectionHeading: {
    ...BOLD,
    fontSize: 12,
    paddingBottom: 5.3,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  sectionBody: {
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  day: {
    flexDirection: "row",
    marginTop: 6.6,
  },
  dayDate: { fontSize: 10, width: DATE_COLUMN },
  // The details page leaves a little more air between suppliers than the includes list does per day.
  detailRow: {
    flexDirection: "row",
    marginTop: 9.5,
  },
  dayItems: { flex: 1 },
  detailTitle: { width: DATE_COLUMN },
  // Titles wrap at 125.8pt (was the designer's 95), so "Ivory Manor Boutique Hotel" (124.1pt at
  // 10pt Manrope) and "Your Package Excludes" (under 107.8pt) each set on one line (client markup).
  detailTitleLine: { fontSize: 10, width: DATE_COLUMN - DETAIL_TITLE_GAP },

  totals: {
    marginTop: 20.9,
    // Lined up with the includes list's bullet column (was 287.9, under "Prepared for"), so the
    // grand-total label "Total for 4 Adults & 1 Child incl. VAT" fits on one line.
    marginLeft: TOTALS_LEFT,
    marginRight: SECTION_RIGHT,
    paddingBottom: 4.65,
    rowGap: 5.65,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  totalsRow: {
    flexDirection: "row",
    paddingLeft: 6.3,
    paddingRight: 4.8,
  },
  totalsLabel: { fontSize: 10, flex: 1, paddingRight: 8 },
  totalsValue: { fontSize: 10, textAlign: "right" },

  disclaimer: {
    fontSize: 10,
    marginTop: 14.2,
    textAlign: "center",
  },
})

/** A supplier's details row stays whole unless it could never fit a page on its own. */
const DETAIL_ROW_MAX_HEIGHT = 650
/** Roughly how many 8pt Manrope characters fit the details page's bullet column (~352pt). */
const DETAIL_CHARS_PER_LINE = 88

/** The row's printed height, estimated from its bullets' lengths (react-pdf gives no measurement
 * before layout). */
function estimatedDetailHeight(bullets: QuoteDetailBullet[]): number {
  return bullets.reduce(
    (sum, bullet) => sum + Math.max(1, Math.ceil(bullet.text.length / DETAIL_CHARS_PER_LINE)) * 10.67,
    0,
  )
}

function BoxRow({ label, value, right = false }: { label: string; value: string; right?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={right ? styles.rightLabel : styles.leftLabel}>{label}</Text>
      <Text style={right ? styles.rightValue : styles.smallValue}>{value}</Text>
    </View>
  )
}

/** Text inset of the includes list, past its bullet. */
const SUMMARY_TEXT_LEFT = 10.2

/** One service of the includes list: a single bullet, its extra lines indented beneath it unbulleted. */
function SummaryService({ item }: { item: QuoteSummaryItem }) {
  return (
    <>
      <BulletRow text={item.text} bulletLeft={0} textLeft={SUMMARY_TEXT_LEFT} />
      {item.details.map((detail, index) => (
        <BulletRow key={index} text={detail} plain bulletLeft={0} textLeft={SUMMARY_TEXT_LEFT} />
      ))}
    </>
  )
}

function TotalsRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={bold ? [styles.totalsLabel, BOLD] : styles.totalsLabel}>{label}</Text>
      <Text style={styles.totalsValue}>{value}</Text>
    </View>
  )
}

export function QuoteDocument({
  quoteNumber,
  customerName,
  customerPhone,
  customerEmail,
  quoteDate,
  validUntil,
  journeyStart,
  journeyEnd,
  adults,
  children,
  payingPax,
  journeyDetails,
  total,
  perPersonTotals,
  subtotal,
  agentCommission = 0,
  discount = 0,
  discountVisible = true,
  itineraryBlocks,
  currency = "ZAR",
  title = "Quotation",
  footerText = DEFAULT_FOOTER_TEXT,
  packageIncludesHeading = DEFAULT_INCLUDES_HEADING,
  packageExcludesHeading = DEFAULT_EXCLUDES_HEADING,
  packageExcludesDefault,
  flightCapPerPerson,
  brand,
  brandPosition = "top",
  brandLogo = null,
  company,
}: QuotePdfData) {
  registerDocumentFonts()

  const resolvedBrand: DocumentBrand = brand ?? {
    heading: FOOTER_BRAND_PRODUCT_LINE,
    subheading: FOOTER_BRAND_DIVISION_LINE,
    logoUrl: null,
  }
  const showBrand = brandPosition !== "hidden"
  const money = (value: number) => formatMoney(value, currency)

  const paxLabel = formatPaxLabel({ adults, children })
  const paying = payingPax ?? { adults, children }
  const journeyRange = formatJourneyRange(journeyStart, journeyEnd)
  const [phone, email] = [customerPhone?.trim() || null, customerEmail?.trim() || null]
  const hasContact = formatPreparedForContact({ phone, email }).length > 0
  const hasAgentCommission = agentCommission > 0
  const hasVisibleDiscount = discountVisible && discount > 0
  const hasDeduction = hasAgentCommission || hasVisibleDiscount

  const sortedBlocks = sortItineraryBlocksChronologically(itineraryBlocks)
  const flightCapBullet =
    flightCapPerPerson != null
      ? formatFlightCapLine((amount) => formatMoney(amount, currency, { decimals: false }), flightCapPerPerson)
      : null
  const summaryDays = buildQuoteSummaryDays(sortedBlocks, flightCapBullet)
  const detailSections = buildQuoteDetailSections(sortedBlocks)
  // The details page's lines carry no closing colon (see withoutTrailingColon).
  const exclusions = uniqueDetailLines(collectQuoteExclusions(sortedBlocks, packageExcludesDefault))
  const excludesTitle = withoutTrailingColon(packageExcludesHeading) || DEFAULT_EXCLUDES_HEADING
  const hasDetails = detailSections.length > 0 || exclusions.length > 0

  const journeyRows: Array<{ label: string; value: string }> = [
    { label: "Travel dates:", value: journeyRange ?? "To be confirmed" },
    ...(paxLabel ? [{ label: "Guests:", value: paxLabel }] : []),
    ...(journeyDetails?.productName
      ? [{ label: withColon(journeyDetails.productLabel), value: journeyDetails.productName }]
      : []),
    ...(journeyDetails?.tourName ? [{ label: "Tour:", value: journeyDetails.tourName }] : []),
    ...(journeyDetails?.route ? [{ label: "Route:", value: journeyDetails.route }] : []),
  ]

  const footerLines = buildDocumentFooterLines(company ?? {}, {
    division: resolvedBrand.subheading,
    year: Number((quoteDate || new Date().toISOString()).slice(0, 4)),
  })
  const disclaimer = resolveFooterText(footerText, validUntil, currency)

  const closing = (
    <View wrap={false}>
      {disclaimer ? <Text style={styles.disclaimer}>{disclaimer}</Text> : null}
      <FooterClearance />
    </View>
  )

  return (
    <Document
      author="Luxus Travel & Tours"
      // Document metadata shows in the PDF viewer's title bar, so it follows the
      // same rule as the visible document.
      subject={QUOTE_REFERENCE_ENABLED ? `Quote ${quoteNumber}` : "Quotation"}
      title={
        QUOTE_REFERENCE_ENABLED
          ? `Quote ${quoteNumber} — ${customerName}`
          : `Quotation — ${customerName}`
      }
    >
      <Page size="A4" style={styles.page}>
        <PageBackground />
        {showBrand ? (
          <DocumentHeader brand={resolvedBrand} logo={brandLogo} padding={PADDING} />
        ) : (
          <View style={{ marginTop: -PADDING.top, height: 80 }} />
        )}

        {/* Section one: dates, brief journey details and pricing — may flow across pages. */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{displayDocumentTitle(title) || "Quotation"}</Text>
          <View style={styles.preparedFor}>
            <View style={styles.row}>
              <Text style={styles.preparedLabel}>Prepared for:</Text>
              <Text style={styles.preparedValue}>{customerName || "Valued Guest"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.preparedLabel}>Date:</Text>
              <Text style={styles.preparedValue}>{formatDisplayDateLong(quoteDate) || formatDate(quoteDate)}</Text>
            </View>
            {QUOTE_REFERENCE_ENABLED ? (
              <View style={styles.row}>
                <Text style={styles.preparedLabel}>Quote No:</Text>
                <Text style={styles.preparedValue}>{quoteNumber}</Text>
              </View>
            ) : null}
            {QUOTE_VALIDITY_ENABLED ? (
              <View style={styles.row}>
                <Text style={styles.preparedLabel}>Valid until:</Text>
                <Text style={styles.preparedValue}>{formatDate(validUntil)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.box} wrap={false}>
          <View style={styles.boxLeft}>
            <Text style={styles.boxHeading}>Client details:</Text>
            {phone ? <BoxRow label="Phone:" value={phone} /> : null}
            {email ? <BoxRow label="E-mail:" value={email} /> : null}
            {/* The client's postal address is deliberately not printed (client markup, 2026-09-29). */}
            {!hasContact ? <BoxRow label="Phone:" value="–" /> : null}
          </View>
          <View style={styles.boxRight}>
            <Text style={styles.boxHeading}>{quoteJourneyHeading(journeyDetails?.serviceType)}</Text>
            {journeyRows.map((row) => (
              <BoxRow key={row.label} label={row.label} value={row.value} right />
            ))}
          </View>
        </View>

        {summaryDays.length > 0 ? (
          <View style={[styles.section, { marginTop: 11.1 }]}>
            <Text style={styles.sectionHeading} minPresenceAhead={60}>
              {withColon(packageIncludesHeading)}
            </Text>
            <View style={[styles.sectionBody, { paddingTop: 0.5, paddingBottom: 14 }]}>
              {summaryDays.map((day, index) => (
                <View key={index} style={styles.day} wrap={false}>
                  <Text style={styles.dayDate}>
                    {day.dateISO ? formatDisplayDateLong(day.dateISO) || "Date to be confirmed" : "Date to be confirmed"}
                  </Text>
                  <View style={styles.dayItems}>
                    {day.items.map((item, itemIndex) => (
                      <SummaryService key={itemIndex} item={item} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Pricing closes section one. Never split across a page: a total stranded on its own
            page reads as a separate document. */}
        <View style={styles.totals} wrap={false}>
          {/* The per-person rows head the block, above Sub Total or the grand total (client markup). */}
          {perPersonTotals?.perAdult != null ? (
            <TotalsRow label="Total per Adult:" value={money(perPersonTotals.perAdult)} />
          ) : null}
          {perPersonTotals?.perChild != null && paying.children > 0 ? (
            <TotalsRow label="Total per Child:" value={money(perPersonTotals.perChild)} />
          ) : null}
          {hasDeduction ? (
            <TotalsRow label="Sub Total incl. VAT:" value={money(subtotal ?? total)} bold />
          ) : null}
          {hasAgentCommission ? (
            <TotalsRow
              label={withColon(AGENT_COMMISSION_LABEL)}
              value={formatAgentCommission(agentCommission, money)}
            />
          ) : null}
          {hasVisibleDiscount ? (
            <TotalsRow label={withColon(DISCOUNT_LABEL)} value={formatDiscount(discount, money)} />
          ) : null}
          <TotalsRow label={withColon(formatQuoteGrandTotalLabel(paying))} value={money(total)} bold />
        </View>

        {hasDetails ? (
          // Section two always starts on a new page.
          <View break style={{ marginLeft: DETAILS_LEFT, marginRight: DETAILS_RIGHT, marginTop: 3.3 }}>
            <Text style={styles.sectionHeading} minPresenceAhead={60}>
              {DETAILS_HEADING}
            </Text>
            <View style={[styles.sectionBody, { paddingTop: 2.5, paddingBottom: 8.1 }]}>
              {detailSections.map((section, index) => (
                <View key={index} style={styles.detailRow} wrap={estimatedDetailHeight(section.bullets) > DETAIL_ROW_MAX_HEIGHT}>
                  <View style={styles.detailTitle}>
                    {section.title.map((line, lineIndex) => (
                      <Text key={lineIndex} style={styles.detailTitleLine}>
                        {line}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.dayItems}>
                    <NestedBulletList lines={section.bullets} />
                  </View>
                </View>
              ))}
              {exclusions.length > 0 ? (
                <View style={styles.detailRow} wrap={false}>
                  <View style={styles.detailTitle}>
                    <Text style={styles.detailTitleLine}>{excludesTitle}</Text>
                  </View>
                  <View style={styles.dayItems}>
                    {exclusions.map((item, index) => (
                      <BulletRow key={index} text={item} bulletLeft={0} textLeft={10.3} />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
            {closing}
          </View>
        ) : (
          closing
        )}

        <DocumentFooter lines={footerLines} />
      </Page>
    </Document>
  )
}
