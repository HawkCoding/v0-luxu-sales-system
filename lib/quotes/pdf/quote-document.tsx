import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import {
  derivePerPersonRate,
  formatJourneyRange,
  formatPaxLabel,
  formatTotalLabel,
  summarizeServiceBlock,
} from "@/lib/quotes/quote-presentation"

export interface QuotePdfInclusion {
  description: string
  supplierDescription?: string | null
  qty: number
  unit?: string | null
}

export interface QuotePdfData {
  quoteNumber: string
  bookingNumber: string
  customerName: string
  quoteDate: string
  validUntil: string | null
  journeyStart: string | null
  journeyEnd: string | null
  adults: number
  children: number
  /** VAT-inclusive grand total (quotes.total). */
  total: number
  inclusions: QuotePdfInclusion[]
  /** Package itinerary; empty array omits the section entirely. */
  itineraryBlocks: VoucherServiceBlock[]
  currency?: string
  title?: string
  statusLabel?: string
  footerText?: string
  packageIncludesHeading?: string
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
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    color: "#312b24",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 24,
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
    marginTop: 20,
    marginBottom: 16,
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
    padding: 12,
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
    padding: 14,
    marginBottom: 20,
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
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee6dc",
    paddingVertical: 7,
  },
  cellDesc: { flex: 1, paddingRight: 8 },
  descMain: { fontSize: 10, color: "#312b24" },
  descSub: { fontSize: 8, color: "#8a7f74", fontStyle: "italic", marginTop: 2 },
  cellQty: { width: 70, textAlign: "right", fontSize: 9, color: "#6f675d" },
  itinerarySection: {
    marginTop: 20,
  },
  itineraryItem: {
    marginBottom: 8,
  },
  itineraryDate: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
  },
  itineraryDetail: {
    fontSize: 9,
    color: "#554c42",
    marginTop: 2,
    paddingLeft: 10,
  },
  statusBadge: {
    fontSize: 8,
    color: "#8a7f74",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  footer: {
    marginTop: 36,
    borderTopWidth: 1,
    borderTopColor: "#e8dfd2",
    paddingTop: 12,
    fontSize: 8,
    color: "#8a7f74",
    textAlign: "center",
  },
})

const DEFAULT_FOOTER_TEXT =
  "This quotation is valid until {{validUntil}} and is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys."

const DEFAULT_INCLUDES_HEADING = "Your Package Includes"

function resolveFooterText(template: string, validUntil: string | null, currency: string): string {
  return template
    .replaceAll("{{validUntil}}", formatDate(validUntil))
    .replaceAll("{{currency}}", currency)
}

export function QuoteDocument({
  quoteNumber,
  bookingNumber,
  customerName,
  quoteDate,
  validUntil,
  journeyStart,
  journeyEnd,
  adults,
  children,
  total,
  inclusions,
  itineraryBlocks,
  currency = "ZAR",
  title = "PROVISIONAL QUOTATION",
  statusLabel = "Provisional",
  footerText = DEFAULT_FOOTER_TEXT,
  packageIncludesHeading = DEFAULT_INCLUDES_HEADING,
}: QuotePdfData) {
  const pax = { adults, children }
  const paxLabel = formatPaxLabel(pax)
  const journeyRange = formatJourneyRange(journeyStart, journeyEnd)
  const perPersonRate = derivePerPersonRate(total, pax)
  const itineraryLines = sortItineraryBlocksChronologically(itineraryBlocks).map(
    summarizeServiceBlock,
  )

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Quote ${quoteNumber}`}
      title={`Quote ${quoteNumber} — ${customerName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Luxus Travel & Tours</Text>
          <Text style={styles.brandSub}>Luxury Rail Journeys</Text>
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.docTitle}>{title}</Text>
            <Text style={styles.statusBadge}>STATUS: {statusLabel}</Text>
          </View>
          <View>
            <Text style={styles.quoteNumberBadge}>{quoteNumber}</Text>
            <Text style={[styles.quoteNumberBadge, { color: "#8a7f74", fontSize: 9 }]}>Ref: {bookingNumber}</Text>
          </View>
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
          <View>
            <Text style={styles.metaLabel}>Quote date</Text>
            <Text style={styles.metaValue}>{formatDate(quoteDate)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Valid until</Text>
            <Text style={styles.metaValue}>{formatDate(validUntil)}</Text>
          </View>
        </View>

        <View style={styles.pricingBox}>
          {perPersonRate !== null ? (
            <Text style={styles.perPersonLine}>
              {paxLabel} x {formatMoney(perPersonRate, currency)} per person
            </Text>
          ) : null}
          <Text style={styles.grandTotalLine}>
            {formatTotalLabel(pax)}: {formatMoney(total, currency)} (VAT inclusive)
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Your quotation includes</Text>
        {inclusions.map((item, index) => (
          <View key={index} style={styles.row}>
            <View style={styles.cellDesc}>
              <Text style={styles.descMain}>{item.description}</Text>
              {item.supplierDescription ? (
                <Text style={styles.descSub}>{item.supplierDescription}</Text>
              ) : null}
            </View>
            <Text style={styles.cellQty}>
              {item.unit ? `${item.qty} × ${item.unit}` : `${item.qty}`}
            </Text>
          </View>
        ))}

        {itineraryLines.length > 0 ? (
          <View style={styles.itinerarySection}>
            <Text style={styles.sectionHeading}>{packageIncludesHeading}</Text>
            {itineraryLines.map((line, index) => (
              <View key={index} style={styles.itineraryItem}>
                <Text style={styles.itineraryDate}>
                  {line.dateISO ? formatDisplayDateLong(line.dateISO) || "Date to be confirmed" : "Date to be confirmed"}
                  {" — "}
                  {line.title}
                </Text>
                {line.details.map((detail, detailIndex) => (
                  <Text key={detailIndex} style={styles.itineraryDetail}>
                    {detail}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>{resolveFooterText(footerText, validUntil, currency)}</Text>
      </Page>
    </Document>
  )
}
