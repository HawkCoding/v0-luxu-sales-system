import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import { QUOTE_REFERENCE_ENABLED, QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import { BrandBlock } from "@/lib/pdf/brand-block"
import { formatMoney } from "@/lib/money"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { DOCUMENT_FONT_FAMILY, registerDocumentFonts } from "@/lib/pdf/document-fonts"
import {
  AGENT_COMMISSION_COLOR,
  AGENT_COMMISSION_LABEL,
  buildQuoteItineraryLines,
  collectQuoteExclusions,
  derivePerPersonRate,
  DISCOUNT_COLOR,
  DISCOUNT_LABEL,
  formatAgentCommission,
  formatDiscount,
  formatFlightCapLine,
  formatJourneyRange,
  formatPaxLabel,
  formatPreparedForContact,
  formatTotalLabel,
  TRAVEL_DATES_LABEL,
  VAT_INCLUSIVE_SUFFIX,
  WARNING_TEXT_COLOR,
} from "@/lib/quotes/quote-presentation"
import type { BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"

export interface QuotePdfData {
  quoteNumber: string
  customerName: string
  /** Printed under the name in "Prepared for"; blank omits the line. */
  customerPhone?: string | null
  /** Printed under the phone in "Prepared for"; blank omits the line. */
  customerEmail?: string | null
  quoteDate: string
  validUntil: string | null
  journeyStart: string | null
  journeyEnd: string | null
  adults: number
  children: number
  /** VAT-inclusive grand total (quotes.total) — already net of agentCommission. */
  total: number
  /** Gross travel price before the agency discount (quotes.subtotal). Only shown, and only used
   *  to derive the per-person rate, when agentCommission is greater than zero. */
  subtotal?: number
  /** Flat discount given to a booking agency (quotes.agent_commission). Zero/absent renders the
   *  pricing box exactly as it did before this field existed. */
  agentCommission?: number
  /** Client-facing Discount (quotes.discount_amount). Only rendered when discountVisible is true. */
  discount?: number
  /** quotes.discount_visible — the total is net of the discount either way; this only controls
   *  whether the red line prints. Defaults to true so a caller that never sets it (there are none
   *  left after this field's introduction) still shows a nonzero discount. */
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
  /** SARAIL brand block copy + logo. Omitted falls back to the plain wordmark. */
  brand?: DocumentBrand
  brandPosition?: BrandBlockPosition
  brandLogo?: BrandLogoImage | null
}

function formatDate(value: string | null): string {
  return formatDisplayDate(value) || "To be confirmed"
}

const styles = StyleSheet.create({
  page: {
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: "#312b24",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#8b5a2b",
    paddingBottom: 12,
  },
  brand: {
    fontSize: 18,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#172018",
    marginBottom: 2,
  },
  brandSub: {
    fontSize: 9,
    color: "#8a7f74",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    marginBottom: 12,
  },
  docTitle: {
    fontSize: 22,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#172018",
  },
  quoteNumberBadge: {
    fontSize: 10,
    color: "#6f675d",
    textAlign: "right",
  },
  metaBox: {
    backgroundColor: "#fbf8f3",
    borderWidth: 1,
    borderColor: "#e8dfd2",
    padding: 9,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  metaLabel: {
    fontSize: 9,
    color: "#8a7f74",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#312b24",
  },
  metaContact: {
    fontSize: 9,
    color: "#554c42",
    marginTop: 1,
  },
  pricingBox: {
    backgroundColor: "#f4efe6",
    borderWidth: 1,
    borderColor: "#d8cdbc",
    padding: 11,
    marginTop: 14,
  },
  perPersonLine: {
    fontSize: 11,
    color: "#554c42",
    marginBottom: 6,
  },
  subtotalLine: {
    fontSize: 11,
    color: "#554c42",
    marginBottom: 4,
  },
  agentCommissionLine: {
    fontSize: 11,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: AGENT_COMMISSION_COLOR,
    marginBottom: 4,
  },
  discountLine: {
    fontSize: 11,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: DISCOUNT_COLOR,
    marginBottom: 4,
  },
  pricingDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#d8cdbc",
    marginBottom: 6,
  },
  grandTotalLine: {
    fontSize: 13,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#172018",
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#172018",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: "#d8cdbc",
    paddingBottom: 5,
    marginBottom: 6,
  },
  itinerarySection: {
    marginTop: 14,
  },
  itineraryItem: {
    marginBottom: 6,
  },
  // The itinerary reads a size smaller than the 10pt body, its bullets smaller again. The bullet
  // tier is 8.5pt, not 8: Carlito's x-height is ~9% below Helvetica's, and its taller built-in
  // leading is why the bullets' marginTop is 1 rather than 2 — together they keep the old rhythm.
  itineraryDate: {
    fontSize: 9,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#172018",
  },
  itineraryText: {
    fontSize: 9,
    color: "#312b24",
    marginTop: 1,
    lineHeight: 1.4,
  },
  itineraryDetail: {
    fontSize: 8.5,
    color: "#554c42",
    marginTop: 1,
    paddingLeft: 10,
  },
  // A subheading inside the bullet list: bold and undashed, with extra air above it so it reads
  // as a section break rather than another inclusion.
  itineraryDetailHeading: {
    fontSize: 8.5,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontWeight: 700,
    color: "#312b24",
    marginTop: 6,
    paddingLeft: 10,
  },
  // A caveat the client must not miss ("Train arrival times cannot be guaranteed").
  itineraryDetailWarning: {
    fontSize: 8.5,
    color: WARNING_TEXT_COLOR,
    marginTop: 1,
    paddingLeft: 10,
  },
  // A hotel's own description, in place of its facility bullets, set in the regular-weight italic
  // (Carlito has no bold-italic, so this must never gain fontWeight: 700).
  itineraryDescription: {
    fontSize: 8.5,
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontStyle: "italic",
    color: "#554c42",
    marginTop: 1,
    paddingLeft: 10,
    lineHeight: 1.4,
  },
  excludesSection: {
    marginTop: 14,
  },
  excludesItem: {
    fontSize: 9,
    color: "#554c42",
    marginBottom: 3,
    lineHeight: 1.4,
  },
  footer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e8dfd2",
    paddingTop: 12,
    fontSize: 8,
    color: "#8a7f74",
    textAlign: "center",
  },
})

const DEFAULT_FOOTER_TEXT = QUOTE_VALIDITY_ENABLED
  ? "This quotation is valid until {{validUntil}} and is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys."
  : "This quotation is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys."

const DEFAULT_INCLUDES_HEADING = "Your Package Includes"
const DEFAULT_EXCLUDES_HEADING = "Your Package Excludes"

function resolveFooterText(template: string, validUntil: string | null, currency: string): string {
  return template
    .replaceAll("{{validUntil}}", formatDate(validUntil))
    .replaceAll("{{currency}}", currency)
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
  total,
  subtotal,
  agentCommission = 0,
  discount = 0,
  discountVisible = true,
  itineraryBlocks,
  currency = "ZAR",
  title = "QUOTATION",
  footerText = DEFAULT_FOOTER_TEXT,
  packageIncludesHeading = DEFAULT_INCLUDES_HEADING,
  packageExcludesHeading = DEFAULT_EXCLUDES_HEADING,
  packageExcludesDefault,
  flightCapPerPerson,
  brand,
  brandPosition = "bottom",
  brandLogo = null,
}: QuotePdfData) {
  // The whole quote, BrandBlock included, is set in the embedded Carlito (Calibri clone).
  registerDocumentFonts()

  // The brand block is only shown when its copy is supplied; without it the
  // document keeps the plain wordmark masthead and no footer mark.
  const showBrandTop = brand !== undefined && brandPosition === "top"
  const showBrandBottom = brand !== undefined && brandPosition === "bottom"
  const pax = { adults, children }
  const paxLabel = formatPaxLabel(pax)
  const journeyRange = formatJourneyRange(journeyStart, journeyEnd)
  const contactLines = formatPreparedForContact({ phone: customerPhone, email: customerEmail })
  const hasAgentCommission = agentCommission > 0
  const hasVisibleDiscount = discountVisible && discount > 0
  const showSubtotal = hasAgentCommission || hasVisibleDiscount
  // Per-person rate is always the gross rate — the discount is the agency's cut, not the
  // traveller's. Falls back to `total` when no subtotal is supplied (pre-existing callers).
  const perPersonRate = derivePerPersonRate(showSubtotal ? (subtotal ?? total) : total, pax)
  const sortedBlocks = sortItineraryBlocksChronologically(itineraryBlocks)
  const flightCapBullet =
    flightCapPerPerson != null
      ? formatFlightCapLine((amount) => formatMoney(amount, currency, { decimals: false }), flightCapPerPerson)
      : null
  const itineraryLines = buildQuoteItineraryLines(sortedBlocks, flightCapBullet)
  const exclusions = collectQuoteExclusions(sortedBlocks, packageExcludesDefault)

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
        {showBrandTop && brand ? (
          <BrandBlock brand={brand} logoImage={brandLogo} placement="top" />
        ) : (
          <View style={styles.header}>
            <Text style={styles.brand}>Luxus Travel & Tours</Text>
            <Text style={styles.brandSub}>Luxury Rail Journeys</Text>
          </View>
        )}

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.docTitle}>{title}</Text>
          </View>
          {QUOTE_REFERENCE_ENABLED ? (
            <View>
              <Text style={styles.quoteNumberBadge}>{quoteNumber}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaBox}>
          <View>
            <Text style={styles.metaLabel}>Prepared for</Text>
            <Text style={styles.metaValue}>{customerName || "Valued Guest"}</Text>
            {contactLines.map((contactLine) => (
              <Text key={contactLine} style={styles.metaContact}>
                {contactLine}
              </Text>
            ))}
          </View>
          <View>
            <Text style={styles.metaLabel}>{TRAVEL_DATES_LABEL}</Text>
            <Text style={styles.metaValue}>{journeyRange ?? "To be confirmed"}</Text>
          </View>
          {paxLabel ? (
            <View>
              <Text style={styles.metaLabel}>Guests</Text>
              <Text style={styles.metaValue}>{paxLabel}</Text>
            </View>
          ) : null}
          {QUOTE_REFERENCE_ENABLED ? (
            <View>
              <Text style={styles.metaLabel}>Quote date</Text>
              <Text style={styles.metaValue}>{formatDate(quoteDate)}</Text>
            </View>
          ) : null}
          {QUOTE_VALIDITY_ENABLED ? (
            <View>
              <Text style={styles.metaLabel}>Valid until</Text>
              <Text style={styles.metaValue}>{formatDate(validUntil)}</Text>
            </View>
          ) : null}
        </View>

        {itineraryLines.length > 0 ? (
          <View style={styles.itinerarySection}>
            <Text style={styles.sectionHeading}>{packageIncludesHeading}</Text>
            {itineraryLines.map((line, index) => (
              <View key={index} style={styles.itineraryItem} wrap={false}>
                <Text style={styles.itineraryDate}>
                  {line.dateISO
                    ? formatDisplayDateLong(line.dateISO) || "Date to be confirmed"
                    : "Date to be confirmed"}
                </Text>
                <Text style={styles.itineraryText}>{line.text}</Text>
                {line.description ? (
                  <Text style={styles.itineraryDescription}>{line.description}</Text>
                ) : null}
                {line.bullets.map((bullet, bulletIndex) => (
                  <Text
                    key={bulletIndex}
                    style={
                      bullet.kind === "heading"
                        ? styles.itineraryDetailHeading
                        : bullet.kind === "warning"
                          ? styles.itineraryDetailWarning
                          : styles.itineraryDetail
                    }
                  >
                    {bullet.kind === "heading" ? bullet.text : `- ${bullet.text}`}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {exclusions.length > 0 ? (
          <View style={styles.excludesSection}>
            <Text style={styles.sectionHeading}>{packageExcludesHeading}</Text>
            {exclusions.map((item, index) => (
              <Text key={index} style={styles.excludesItem}>
                {`- ${item}`}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Total price renders last, after everything the quote covers. Never split across a page:
            a total stranded on its own page reads as a separate document. */}
        <View style={styles.pricingBox} wrap={false}>
          {perPersonRate !== null ? (
            <Text style={styles.perPersonLine}>
              {paxLabel} x {formatMoney(perPersonRate, currency)} per person
            </Text>
          ) : null}
          {showSubtotal ? (
            <>
              <Text style={styles.subtotalLine}>Subtotal: {formatMoney(subtotal ?? total, currency)}</Text>
              {hasAgentCommission ? (
                <Text style={styles.agentCommissionLine}>
                  {AGENT_COMMISSION_LABEL}: {formatAgentCommission(agentCommission, (v) => formatMoney(v, currency))}
                </Text>
              ) : null}
              {hasVisibleDiscount ? (
                <Text style={styles.discountLine}>
                  {DISCOUNT_LABEL}: {formatDiscount(discount, (v) => formatMoney(v, currency))}
                </Text>
              ) : null}
              <View style={styles.pricingDivider} />
            </>
          ) : null}
          <Text style={styles.grandTotalLine}>
            {formatTotalLabel(pax)}: {formatMoney(total, currency)} {VAT_INCLUSIVE_SUFFIX}
          </Text>
        </View>

        <Text style={styles.footer}>{resolveFooterText(footerText, validUntil, currency)}</Text>
        {showBrandBottom && brand ? (
          <BrandBlock brand={brand} logoImage={brandLogo} placement="bottom" />
        ) : null}
      </Page>
    </Document>
  )
}
