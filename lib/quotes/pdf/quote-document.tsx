import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand"

export interface QuotePdfLineItem {
  description: string
  supplierDescription?: string | null
  qty: number
  unitPrice: number
  total: number
}

export interface QuotePdfData {
  quoteNumber: string
  bookingNumber: string
  customerName: string
  quoteDate: string
  validUntil: string | null
  lineItems: QuotePdfLineItem[]
  subtotal: number
  vat: number
  total: number
  currency?: string
  title?: string
  statusLabel?: string
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
  if (!value) return "To be confirmed"
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
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
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
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
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d8cdbc",
    paddingBottom: 6,
    marginBottom: 4,
  },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "right" },
  colUnit: { width: 80, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  headerCell: {
    fontSize: 8,
    color: "#6f675d",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee6dc",
    paddingVertical: 7,
  },
  cellDesc: { flex: 3, paddingRight: 8 },
  descMain: { fontSize: 10, color: "#312b24" },
  descSub: { fontSize: 8, color: "#8a7f74", fontStyle: "italic", marginTop: 2 },
  cellRight: { fontSize: 10, textAlign: "right", color: "#312b24" },
  totalsBox: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 3,
  },
  totalLabel: {
    fontSize: 10,
    color: "#6f675d",
    width: 80,
    textAlign: "right",
    marginRight: 12,
  },
  totalValue: {
    fontSize: 10,
    color: "#312b24",
    width: 80,
    textAlign: "right",
  },
  grandTotalLine: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#d8cdbc",
    paddingTop: 6,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
    width: 80,
    textAlign: "right",
    marginRight: 12,
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
    width: 80,
    textAlign: "right",
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

export function QuoteDocument({ quoteNumber, bookingNumber, customerName, quoteDate, validUntil, lineItems, subtotal, vat, total, currency = "ZAR", title = "PROVISIONAL QUOTATION", statusLabel = "Provisional" }: QuotePdfData) {
  return (
    <Document
      author={BRAND_NAME}
      subject={`Quote ${quoteNumber}`}
      title={`Quote ${quoteNumber} — ${customerName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>{BRAND_NAME}</Text>
          <Text style={styles.brandSub}>{BRAND_TAGLINE}</Text>
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
            <Text style={styles.metaLabel}>Quote date</Text>
            <Text style={styles.metaValue}>{formatDate(quoteDate)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Valid until</Text>
            <Text style={styles.metaValue}>{formatDate(validUntil)}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <View style={styles.colDesc}>
            <Text style={styles.headerCell}>Description</Text>
          </View>
          <View style={styles.colQty}>
            <Text style={styles.headerCell}>Qty</Text>
          </View>
          <View style={styles.colUnit}>
            <Text style={styles.headerCell}>Unit price</Text>
          </View>
          <View style={styles.colTotal}>
            <Text style={styles.headerCell}>Total</Text>
          </View>
        </View>

        {lineItems.map((item, index) => (
          <View key={index} style={styles.row}>
            <View style={styles.cellDesc}>
              <Text style={styles.descMain}>{item.description}</Text>
              {item.supplierDescription ? (
                <Text style={styles.descSub}>{item.supplierDescription}</Text>
              ) : null}
            </View>
            <View style={styles.colQty}>
              <Text style={styles.cellRight}>{item.qty}</Text>
            </View>
            <View style={styles.colUnit}>
              <Text style={styles.cellRight}>
                {item.unitPrice === 0 ? "Incl." : formatMoney(item.unitPrice, currency)}
              </Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={styles.cellRight}>
                {item.total === 0 ? "—" : formatMoney(item.total, currency)}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatMoney(subtotal, currency)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>VAT (15%)</Text>
            <Text style={styles.totalValue}>{formatMoney(vat, currency)}</Text>
          </View>
          <View style={styles.grandTotalLine}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatMoney(total, currency)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          This quotation is valid until {formatDate(validUntil)} and is subject to availability. Prices are quoted in {currency}. {BRAND_NAME} — {BRAND_TAGLINE}.
        </Text>
      </Page>
    </Document>
  )
}
