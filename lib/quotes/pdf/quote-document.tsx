import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import { QUOTE_REFERENCE_ENABLED, QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import { BrandBlock } from "@/lib/pdf/brand-block"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import {
  buildQuoteItineraryLines,
  collectQuoteExclusions,
  derivePerPersonRate,
  formatFlightCapLine,
  formatJourneyRange,
  formatPaxLabel,
  formatTotalLabel,
  VAT_INCLUSIVE_SUFFIX,
} from "@/lib/quotes/quote-presentation"
import type { BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"

export interface QuotePdfData {
  quoteNumber: string
  customerName: string
  quoteDate: string
  validUntil: string | null
  journeyStart: string | null
  journeyEnd: string | null
  adults: number
  children: number
  /** VAT-inclusive grand total (quotes.total). */
  total: number
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

function formatMoney(amount: number, currency = "ZAR"): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(value: string | null): string {
  return formatDisplayDate(value) || "To be confirmed"
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
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
    fontFamily: "Helvetica-Bold",
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
    fontFamily: "Helvetica-Bold",
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
    fontFamily: "Helvetica-Bold",
    color: "#312b24",
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
  grandTotalLine: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
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
  itineraryDate: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
  },
  itineraryText: {
    fontSize: 10,
    color: "#312b24",
    marginTop: 1,
    lineHeight: 1.4,
  },
  itineraryDetail: {
    fontSize: 9,
    color: "#554c42",
    marginTop: 2,
    paddingLeft: 10,
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
  quoteDate,
  validUntil,
  journeyStart,
  journeyEnd,
  adults,
  children,
  total,
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
  // The brand block is only shown when its copy is supplied; without it the
  // document keeps the plain wordmark masthead and no footer mark.
  const showBrandTop = brand !== undefined && brandPosition === "top"
  const showBrandBottom = brand !== undefined && brandPosition === "bottom"
  const pax = { adults, children }
  const paxLabel = formatPaxLabel(pax)
  const journeyRange = formatJourneyRange(journeyStart, journeyEnd)
  const perPersonRate = derivePerPersonRate(total, pax)
  const sortedBlocks = sortItineraryBlocksChronologically(itineraryBlocks)
  const flightCapBullet =
    flightCapPerPerson != null ? formatFlightCapLine((amount) => formatMoney(amount, currency), flightCapPerPerson) : null
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
          </View>
          <View>
            <Text style={styles.metaLabel}>Journey</Text>
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
                {line.bullets.map((bullet, bulletIndex) => (
                  <Text key={bulletIndex} style={styles.itineraryDetail}>
                    {`- ${bullet}`}
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

        {/* Total price renders last, after everything the quote covers. */}
        <View style={styles.pricingBox}>
          {perPersonRate !== null ? (
            <Text style={styles.perPersonLine}>
              {paxLabel} x {formatMoney(perPersonRate, currency)} per person
            </Text>
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
